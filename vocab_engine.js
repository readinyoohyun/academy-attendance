/* 어휘 확인 학습 엔진 (UI 없음, 순수 로직)
 * 문제 구성(10문제 고정):
 *  - ① 뜻 고르기 (mean)
 *  - ② 어휘 고르기 (word)
 *  - ③ 빈칸 채우기 - 책 속 예문 (blank, 기초~3레벨)
 *  - ④ 초성 쓰기 - 뜻과 ㅂㄷㄹ 초성 힌트 직접 입력 (choseong, 전체)
 *  - ⑤ 비슷한말 고르기 (similar, 4~6레벨 유의어 보유 어휘)
 *  - ⑥ 4~6레벨 뜻 중심 문제 (mean / word / choseong)
 *  - ⑦ 짝짓기 1문제 (match, 어휘 4개 ↔ 뜻 4개 연결)
 *  => 총 10문제 고정 (개별 9문제 + 마지막 짝짓기 1문제)
 * 정답률: '처음 푼 정답 개수'만 반영. 틀린 문제는 모두 맞힐 때까지 다시 풀지만 정답률에는 영향 없음.
 */
(function (root) {
  'use strict';
  const E = {};
  E.rng = Math.random;

  const CHOSEONG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function toChoseong(str) {
    return String(str || '').split('').map(ch => {
      const code = ch.charCodeAt(0) - 0xAC00;
      if (code >= 0 && code <= 11171) {
        return CHOSEONG_LIST[Math.floor(code / 588)];
      }
      return ch;
    }).join('');
  }
  E.toChoseong = toChoseong;

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(E.rng() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
  E.shuffle = shuffle;

  const hasBlank = w => /\(\s*\)/.test(w.e || '') && !!(w.f || w.w);
  const hasSimilar = w => !!(w && ((w.s && String(w.s).trim()) || (Array.isArray(w.r) && w.r.length)));
  function getSimilarText(w) {
    if (!w) return '';
    if (w.s && String(w.s).trim()) return String(w.s).trim();
    if (Array.isArray(w.r) && w.r.length) {
      const sim = w.r.find(x => x.kind === 'similar') || w.r[0];
      if (sim && Array.isArray(sim.words) && sim.words.length) return sim.words.join(', ');
    }
    return '';
  }

  /** 도서(레벨) 안내: 이 책으로 학습 가능한지 */
  E.bookByBooksDbId = (db, id) => {
    const vid = db.map && db.map[id];
    return vid ? db.books.find(b => b.id === vid) : null;
  };
  E.booksOfLevel = (db, level) => db.books.filter(b => b.level === level);

  // 오답 보기 후보 풀: 같은 레벨 다른 책 → 부족하면 전체
  function poolFor(db, book) {
    let pool = db.books.filter(b => b !== book && b.level === book.level).flatMap(b => b.words);
    if (pool.length < 12) pool = db.books.filter(b => b !== book).flatMap(b => b.words);
    return pool;
  }

  function pick(cands, n, used) {
    const out = [];
    for (const c of shuffle(cands)) {
      if (!c || used.has(c)) continue;
      used.add(c);
      out.push(c);
      if (out.length === n) break;
    }
    return out;
  }

  /** 하나의 문제 생성 (재도전 때 보기 순서를 새로 섞기 위해 매번 호출) */
  E.makeQuestion = function (spec, book, pool) {
    const words = book.words;
    if (spec.type === 'match') {
      const ws = spec.wordIds.map(i => words[i]);
      return {
        type: 'match',
        left: ws.map((w, i) => ({ id: i, text: w.w })),
        right: shuffle(ws.map((w, i) => ({ id: i, text: w.m }))),
      };
    }
    const w = words[spec.wordIndex];
    const others = words.filter((x, i) => i !== spec.wordIndex);
    let answer, opts = [], extra = {};

    if (spec.type === 'choseong') {
      answer = w.w;
      const hint = toChoseong(w.w);
      const used = new Set([answer]);
      const d = pick(others.concat(pool).map(x => x.w).filter(x => x && x !== answer), 3, used);
      opts = [answer, ...d];
      const options = shuffle(opts).map(t => ({ text: t, correct: t === answer }));
      return {
        type: 'choseong',
        prompt: '뜻과 초성 힌트를 보고 알맞은 어휘를 직접 입력해 보세요.',
        meaning: w.m,
        hint: hint,
        answer: answer,
        options: options
      };
    }

    if (spec.type === 'similar' && hasSimilar(w)) {
      answer = getSimilarText(w);
      const used = new Set([answer]);
      const simPool = others.concat(pool).map(getSimilarText).filter(Boolean);
      const d = pick(simPool, 3, used);
      if (d.length < 3) {
        d.push(...pick(others.concat(pool).map(x => x.w).filter(x => x && x !== w.w), 3 - d.length, used));
      }
      opts = [answer, ...d];
      extra = { prompt: '다음 어휘와 뜻이 비슷한 말로 알맞은 것은?', big: w.w, subMeaning: w.m };
    } else if (spec.type === 'mean') {
      answer = w.m;
      const used = new Set([answer]);
      const d = pick(others.concat(pool).map(x => x.m).filter(m => m && m !== answer), 3, used);
      opts = [answer, ...d];
      extra = { prompt: '다음 어휘의 뜻으로 알맞은 것은?', big: w.w };
    } else if (spec.type === 'word') {
      answer = w.w;
      const used = new Set([answer]);
      const d = pick(others.concat(pool).map(x => x.w).filter(x => x !== answer), 3, used);
      opts = [answer, ...d];
      extra = { prompt: '다음 뜻에 알맞은 어휘는?', big: w.m, small: true };
    } else { // blank (③ 빈칸 채우기 - 책 속 예문)
      answer = w.f || w.w;
      const used = new Set([answer]);
      // 같은 책의 다른 어휘를 우선 사용해 같은 이야기 안에서 고르게 함
      const d = pick(others.map(x => x.f || x.w), 3, used);
      if (d.length < 3) d.push(...pick(pool.map(x => x.f || x.w).filter(x => x !== answer), 3 - d.length, used));
      opts = [answer, ...d];
      extra = { prompt: '책 속 예문의 빈칸 ( )에 들어갈 알맞은 말은?', sentence: (w.e || '').replace(/\(\s*\)/, '( )'), hint: w.m };
    }
    const options = shuffle(opts).map(t => ({ text: t, correct: t === answer }));
    return Object.assign({ type: spec.type, options }, extra);
  };

  /** 세션 만들기: 항상 총 10문제 (개별 9문제 + 마지막 짝짓기 1문제) */
  E.createSession = function (book, db) {
    const words = book.words || [];
    const TARGET_TOTAL = 10;
    const hasMatch = words.length >= 4;
    const indivTarget = hasMatch ? (TARGET_TOTAL - 1) : TARGET_TOTAL; // 9문제

    // 1. 개별 9문제에 배정할 단어 인덱스 선정
    let wordIndices = [];
    if (words.length >= indivTarget) {
      // 단어가 9개 이상(예: 10~12개)이면 앞의 9개를 개별 문제로 출제하고, 나머지 단어는 짝짓기에 반드시 포함
      wordIndices = Array.from({ length: indivTarget }, (_, i) => i);
    } else if (words.length > 0) {
      // 단어가 8개(기초~3레벨 등)이면 8개 모두 출제 + 9번째 문제는 예문/초성 복습용으로 1개 추가해 총 9문제 구성
      wordIndices = words.map((_, i) => i);
      let extraIdx = 0;
      while (wordIndices.length < indivTarget) {
        wordIndices.push(extraIdx % words.length);
        extraIdx++;
      }
    }

    // 2. 문제 유형 순환 배정:
    // - 예문이 있는 도서(기초~3레벨): 빈칸 채우기(예문) -> 뜻 고르기 -> 어휘 고르기 -> 빈칸 채우기 -> 초성 쓰기 -> 뜻 고르기 -> 빈칸 채우기 -> 어휘 고르기 -> 초성 쓰기
    // - 예문이 없는 도서(4~6레벨, 필수어휘): 비슷한말(해당 시) + 뜻 고르기 -> 어휘 고르기 -> 초성 쓰기 순환
    const patternWithBlank = ['blank', 'mean', 'word', 'blank', 'choseong', 'mean', 'blank', 'word', 'choseong'];
    const patternNoBlank = ['mean', 'word', 'choseong', 'mean', 'word', 'choseong', 'mean', 'word', 'choseong'];
    const anyBlank = words.some(hasBlank);
    const basePattern = anyBlank ? patternWithBlank : patternNoBlank;

    const usedTypeByWord = {};
    const specs = wordIndices.map((wIdx, slotIdx) => {
      const w = words[wIdx];
      let t = basePattern[slotIdx % basePattern.length];

      // ⑤ 비슷한말 데이터가 있는 어휘(4~6레벨)는 첫 출제 시 비슷한말 유형 우선 배정
      if (hasSimilar(w) && !usedTypeByWord[wIdx]) {
        t = 'similar';
      }
      // ③ 빈칸 채우기 순서인데 해당 단어에 예문이 없으면 초성/뜻/어휘로 대체
      if (t === 'blank' && !hasBlank(w)) {
        t = (slotIdx % 3 === 0) ? 'choseong' : (slotIdx % 2 === 0 ? 'mean' : 'word');
      }
      // 같은 단어가 9번째 보충 문제로 한 번 더 나올 때는 앞선 유형과 다른 유형으로 출제
      if (usedTypeByWord[wIdx] === t) {
        const alt = hasBlank(w) ? ['choseong', 'blank', 'word', 'mean'] : ['choseong', 'word', 'mean'];
        t = alt.find(x => x !== usedTypeByWord[wIdx]) || 'choseong';
      }
      usedTypeByWord[wIdx] = t;
      return { type: t, wordIndex: wIdx };
    });

    // 3. 10번째 마지막 문제: ⑦ 짝짓기 (어휘 4개 ↔ 뜻 4개)
    if (hasMatch) {
      // 개별 문제에 안 나온 나머지 단어(예: 10번째 단어)가 있으면 우선 포함
      const unused = words.map((_, i) => i).filter(i => !wordIndices.includes(i));
      const rest = shuffle(wordIndices.filter((v, i, a) => a.indexOf(v) === i));
      const matchIds = unused.concat(rest).slice(0, 4);
      specs.push({ type: 'match', wordIds: matchIds });
    }

    const pool = poolFor(db, book);
    const s = {
      book, pool, specs,
      queue: specs.map((_, i) => i),
      retry: [],
      attempted: new Set(),
      firstCorrect: 0,
      wrongFirst: new Set(),   // 처음에 틀린 spec 인덱스
      wrongDetail: {},         // 처음에 틀린 문제의 스냅샷(오답 복습지 출력용)
      phase: 'first',          // first | retry
      retryRound: 0,
      answers: 0,
      cur: null,
    };
    return s;
  };

  E.total = s => s.specs.length;
  E.done = s => s.queue.length === 0 && s.retry.length === 0;
  E.remaining = s => s.queue.length;

  /** 현재 문제 (없으면 null). 큐가 비어 재도전이 필요하면 자동으로 재도전 라운드 시작 */
  E.current = function (s) {
    if (s.queue.length === 0 && s.retry.length) {
      s.queue = s.retry;
      s.retry = [];
      s.phase = 'retry';
      s.retryRound++;
      s.cur = null;
    }
    if (!s.queue.length) return null;
    const si = s.queue[0];
    if (!s.cur || s.cur.si !== si) s.cur = { si, q: E.makeQuestion(s.specs[si], s.book, s.pool) };
    return { index: si, question: s.cur.q, phase: s.phase };
  };

  /** 정답 제출. correct: boolean (객관식은 options[i].correct, 초성은 문자열 일치, 짝짓기는 실수 없음) */
  E.submit = function (s, correct) {
    const si = s.queue[0];
    s.answers++;
    if (!s.attempted.has(si)) {
      s.attempted.add(si);
      if (correct) s.firstCorrect++;
      else {
        s.wrongFirst.add(si);
        if (s.cur && s.cur.si === si) s.wrongDetail[si] = E.snapshot(s, si, s.cur.q);
      }
    }
    s.queue.shift();
    if (!correct) s.retry.push(si);   // 재도전 대상
    s.cur = null;
    return correct;
  };

  /** 처음에 틀린 문제를 나중에 그대로 다시 출제할 수 있게 저장하는 기록 */
  E.snapshot = function (s, si, q) {
    const sp = s.specs[si];
    const b = s.book;
    const lvStr = b.level === 0 ? '기초' : (typeof b.level === 'number' ? b.level + '레벨' : String(b.level));
    const label = b.label || (lvStr + ' 『' + b.title + '』');
    const base = { source: b.source || 'book', bookId: b.id, bookTitle: b.title, level: b.level, label, type: sp.type, at: Date.now() };
    if (sp.type === 'match') {
      const pairs = q.left.map(l => ({ word: l.text, meaning: q.right.find(r => r.id === l.id).text }));
      return Object.assign(base, { key: b.id + '|match', pairs });
    }
    const w = b.words[sp.wordIndex];
    return Object.assign(base, {
      key: b.id + '|' + w.w + '|' + sp.type,
      word: w.w, meaning: w.m,
      prompt: q.prompt, big: q.big || '', small: !!q.small, sentence: q.sentence || '',
      hint: q.hint || '',
      options: (q.options || []).map(o => o.text),
      answer: q.answer || ((q.options || []).find(o => o.correct) || {}).text || w.w,
    });
  };

  E.result = function (s) {
    const total = s.specs.length;
    const wrongWords = [];
    s.wrongFirst.forEach(si => {
      const sp = s.specs[si];
      if (sp.type === 'match') wrongWords.push('짝짓기');
      else wrongWords.push(s.book.words[sp.wordIndex].w);
    });
    const wrongCount = s.wrongFirst.size;
    const retryCount = Math.max(0, s.answers - s.attempted.size);
    return {
      bookId: s.book.id, title: s.book.title, level: s.book.level,
      total, firstCorrect: s.firstCorrect,
      wrongCount, retryCount,
      rate: total ? Math.round(s.firstCorrect / total * 100) : 0,
      wrongWords, retryRounds: s.retryRound, answers: s.answers,
      wrongRecords: Object.keys(s.wrongDetail).map(k => s.wrongDetail[k]),
      at: Date.now(),
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.VocabEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
