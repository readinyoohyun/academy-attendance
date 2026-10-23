/* 어휘 확인 학습 엔진 (UI 없음, 순수 로직)
 * 문제 구성(A안): 어휘 1개당 1문제(뜻 고르기 / 어휘 고르기 / 빈칸 채우기 순환) + 마지막 짝짓기 1문제
 * 정답률: '처음 푼 정답 개수'만 반영. 틀린 문제는 모두 맞힐 때까지 다시 풀지만 정답률에는 영향 없음.
 */
(function (root) {
  'use strict';
  const E = {};
  E.rng = Math.random;

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(E.rng() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
  E.shuffle = shuffle;

  const hasBlank = w => /\(\s*\)/.test(w.e || '') && !!w.f;

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
      if (used.has(c)) continue;
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
    let answer, opts, extra = {};
    if (spec.type === 'mean') {
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
    } else { // blank
      answer = w.f;
      const used = new Set([answer]);
      // 같은 책의 다른 어휘를 우선 사용해 같은 이야기 안에서 고르게 함
      const d = pick(others.map(x => x.f), 3, used);
      if (d.length < 3) d.push(...pick(pool.map(x => x.f).filter(x => x !== answer), 3 - d.length, used));
      opts = [answer, ...d];
      extra = { prompt: '빈칸에 알맞은 말은?', sentence: w.e.replace(/\(\s*\)/, '( )'), hint: w.m };
    }
    const options = shuffle(opts).map(t => ({ text: t, correct: t === answer }));
    return Object.assign({ type: spec.type, options }, extra);
  };

  /** 세션 만들기 */
  E.createSession = function (book, db) {
    const words = book.words;
    const order = ['mean', 'blank', 'word'];
    const specs = words.map((w, i) => {
      let t = order[i % 3];
      if (t === 'blank' && !hasBlank(w)) t = i % 2 ? 'mean' : 'word';
      return { type: t, wordIndex: i };
    });
    if (words.length >= 4) {
      const idx = shuffle(words.map((_, i) => i)).slice(0, 4);
      specs.push({ type: 'match', wordIds: idx });
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

  /** 정답 제출. correct: boolean (객관식은 options[i].correct, 짝짓기는 실수 없음) */
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
    const label = b.label || ((b.level === 0 ? '기초' : b.level + '레벨') + ' 『' + b.title + '』');
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
      options: q.options.map(o => o.text),
      answer: q.options.find(o => o.correct).text,
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
    return {
      bookId: s.book.id, title: s.book.title, level: s.book.level,
      total, firstCorrect: s.firstCorrect,
      rate: total ? Math.round(s.firstCorrect / total * 100) : 0,
      wrongWords, retryRounds: s.retryRound, answers: s.answers,
      wrongRecords: Object.keys(s.wrongDetail).map(k => s.wrongDetail[k]),
      at: Date.now(),
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.VocabEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);

