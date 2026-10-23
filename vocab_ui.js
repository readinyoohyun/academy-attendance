/* 어휘 확인 학습 화면 (순수 JS, 의존성 없음 – 기존 앱 어디에나 붙일 수 있음)
 * 사용: VocabUI.mount(containerEl, { book, db, onFinish(result), onExit(), onRestart() })
 * 문제 유형: 뜻 고르기 / 어휘 고르기 / 빈칸 채우기 / 짝짓기 + 오답 재도전, 정답률은 처음 정답 기준
 */
(function (root) {
  'use strict';
  const E = root.VocabEngine;
  const CSS = `
.vq{max-width:480px;margin:0 auto;padding:16px 16px 110px;font-family:Pretendard,system-ui,sans-serif;color:#1f2937}
.vq *{box-sizing:border-box}
.vq-top{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#6b7280;margin-bottom:6px;gap:8px}
.vq-bar{height:6px;border-radius:99px;background:#e5e7eb;margin-bottom:14px;overflow:hidden}
.vq-bar>i{display:block;height:100%;background:#4f46e5;transition:width .2s}
.vq-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:12px}
.vq-tag{font-size:12px;color:#6b7280}
.vq-ask{font-size:14px;margin:8px 0}
.vq-big{font-size:28px;font-weight:700;line-height:1.4;word-break:keep-all}
.vq-big.s{font-size:17px;font-weight:600}
.vq-sent{font-size:18px;line-height:1.9;word-break:keep-all}
.vq-blank{display:inline-block;min-width:64px;border-bottom:3px solid #4f46e5;text-align:center;font-weight:700;padding:0 6px}
.vq-opt{display:block;width:100%;text-align:left;padding:13px 14px;margin-bottom:8px;border-radius:12px;border:1px solid #d1d5db;background:#fff;font-size:15px;line-height:1.5;cursor:pointer;word-break:keep-all}
.vq-opt:active{background:#eef2ff}
.vq-opt.ok{background:#bbf7d0;border-color:#22c55e;color:#14532d}
.vq-opt.no{background:#fecaca;border-color:#ef4444;color:#7f1d1d}
.vq-opt.sel{border:2px solid #4f46e5}
.vq-opt[disabled]{cursor:default}
.vq-btn{display:block;width:100%;padding:14px;border:0;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px}
.vq-btn.sub{background:#fff;color:#4f46e5;border:1px solid #4f46e5}
.vq-note{padding:12px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;line-height:1.6;margin-top:8px}
.vq-banner{padding:10px 12px;border-radius:12px;background:#fef3c7;color:#92400e;font-size:13px;margin-bottom:10px}
.vq-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
.vq-rate{font-size:48px;font-weight:800;color:#4f46e5;text-align:center;margin:8px 0}
.vq-chips span{display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;border-radius:99px;background:#fee2e2;color:#991b1b;font-size:13px}
`;
  function injectCss() {
    if (document.getElementById('vq-css')) return;
    const st = document.createElement('style');
    st.id = 'vq-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TYPE = { mean: '뜻 고르기', word: '어휘 고르기', blank: '빈칸 채우기', match: '짝짓기' };
  const lvName = l => (l === 0 ? '기초' : (typeof l === 'number' ? l + '레벨' : String(l)));
  const creditHtml = b => (b && b.source === '국립국어원') ? '<div style="margin-top:14px;font-size:11px;color:#6b7280;text-align:center">출처: 국립국어원 「국어 기초 어휘 선정 및 어휘 등급화 목록」(공공누리 제1유형)</div>' : '';
const newMp = () => ({ sel: null, pairs: {}, bad: null, mistakes: 0 });

  function mount(el, opt) {
    injectCss();
    const { book, db } = opt;
    const s = E.createSession(book, db);
    let cur = null, picked = null, view = 'question', mp = newMp(), introRound = 0, reported = false;

    function top(label) {
      const total = E.total(s);
      const done = total - s.queue.length - s.retry.length;
      return `<div class="vq-top"><span>${esc(book.title)} · ${lvName(book.level)}</span><span>${label}</span></div>
        <div class="vq-bar"><i style="width:${Math.max(4, done / total * 100)}%"></i></div>`;
    }
    const exitBtn = '<button class="vq-btn sub" data-act="exit" style="margin-top:20px">그만하기</button>';
    const nextLabel = () => (E.done(s) ? '결과 보기' : '다음 ›');

    function advance() {
      cur = E.current(s);
      picked = null; mp = newMp();
      if (!cur) view = 'result';
      else if (cur.phase === 'retry' && introRound !== s.retryRound) { introRound = s.retryRound; view = 'intro'; }
      else view = 'question';
      draw();
    }

    function draw() {
      if (view === 'result') return drawResult();
      const label = cur.phase === 'retry' ? '틀린 문제 다시 풀기' : TYPE[cur.question.type];
      let h = '<div class="vq">' + top(label);
      if (view === 'intro') {
        h += `<div class="vq-card"><div class="vq-ask"><b>틀린 문제가 ${s.queue.length}개 있어요.</b><br>다시 풀어 볼까요? (정답률에는 영향이 없어요)</div>
          <button class="vq-btn" data-act="go">다시 풀기</button></div></div>`;
        el.innerHTML = h; return;
      }
      if (cur.phase === 'retry') h += `<div class="vq-banner">다시 풀기 · ${s.queue.length}개 남음</div>`;
      h += cur.question.type === 'match' ? matchHtml(cur.question) : choiceHtml(cur.question);
      h += exitBtn + creditHtml(book) + '</div>';
      el.innerHTML = h;
    }

    function choiceHtml(q) {
      let body;
      if (q.type === 'blank') {
        const filled = picked == null ? '&nbsp;' : esc(q.options[picked].text);
        body = `<div class="vq-ask">${q.prompt}</div><div class="vq-sent">${esc(q.sentence).replace('( )', `<span class="vq-blank">${filled}</span>`)}</div>`;
      } else {
        body = `<div class="vq-ask">${q.prompt}</div><div class="vq-big ${q.small ? 's' : ''}">${esc(q.big)}</div>`;
      }
      let h = `<div class="vq-card"><div class="vq-tag">${esc(book.title)}</div>${body}</div>`;
      h += q.options.map((o, i) => {
        let c = 'vq-opt';
        if (picked != null) c += o.correct ? ' ok' : (i === picked ? ' no' : '');
        return `<button class="${c}" data-act="pick" data-i="${i}" ${picked != null ? 'disabled' : ''}>${'①②③④'[i]} ${esc(o.text)}</button>`;
      }).join('');
      if (picked != null) {
        const ok = q.options[picked].correct;
        const w = book.words[s.specs[cur.index].wordIndex];
        h += `<div class="vq-note"><b>${ok ? '정답이에요! 👏' : '아쉬워요 😢 (나중에 다시 풀어요)'}</b><br><b>${esc(w.w)}</b>: ${esc(w.m)}</div>
          <button class="vq-btn" data-act="next">${nextLabel()}</button>`;
      }
      return h;
    }

    function matchHtml(q) {
      const solved = Object.keys(mp.pairs).length === q.left.length;
      let h = `<div class="vq-card"><div class="vq-tag">${esc(book.title)}</div>
        <div class="vq-ask">어휘를 먼저 누르고, 알맞은 뜻을 누르세요.</div><div class="vq-grid"><div>`;
      h += q.left.map(l => {
        const done = mp.pairs[l.id] != null;
        return `<button class="vq-opt ${done ? 'ok' : ''} ${mp.sel === l.id ? 'sel' : ''}" data-act="mw" data-id="${l.id}" ${done ? 'disabled' : ''}><b>${esc(l.text)}</b></button>`;
      }).join('') + '</div><div>';
      h += q.right.map(r => {
        const done = Object.values(mp.pairs).includes(r.id);
        return `<button class="vq-opt ${done ? 'ok' : ''} ${mp.bad === r.id ? 'no' : ''}" style="font-size:13px" data-act="mm" data-id="${r.id}" ${done ? 'disabled' : ''}>${esc(r.text)}</button>`;
      }).join('') + '</div></div></div>';
      if (solved) {
        h += `<div class="vq-note"><b>${mp.mistakes ? '모두 연결했어요! (틀린 연결이 있어서 나중에 다시 풀어요)' : '모두 맞혔어요! 🎉'}</b></div>
          <button class="vq-btn" data-act="mdone">${(E.remaining(s) <= 1 && !s.retry.length && !mp.mistakes) ? '결과 보기' : '다음 ›'}</button>`;
      }
      return h;
    }

    function drawResult() {
      const r = E.result(s);
      const wrongCnt = r.wrongCount != null ? r.wrongCount : (r.total - r.firstCorrect);
      const retryCnt = r.retryCount != null ? r.retryCount : wrongCnt;
      const gradeBand = opt.gradeBand || lvName(book.level);
      const summaryLine = `${gradeBand}/학습${r.total}개/오답${wrongCnt}개/재학습${retryCnt}개/`;
      let h = `<div class="vq"><div class="vq-top"><span>${esc(book.title)} · ${lvName(book.level)}</span><span>결과</span></div>
        <div class="vq-card"><div class="vq-ask" style="text-align:center">어휘 학습 결과</div>
        <div class="vq-rate">${r.rate}%</div>
        <div style="text-align:center;font-size:15px;font-weight:800;color:#be123c;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:8px 10px;margin-top:8px">${esc(summaryLine)}</div></div>`;
      if (r.wrongWords.length) h += `<div class="vq-card"><div class="vq-ask"><b>처음에 틀린 어휘</b> (다시 풀어서 모두 맞혔어요)</div><div class="vq-chips">${r.wrongWords.map(w => `<span>${esc(w)}</span>`).join('')}</div></div>`;
      else h += '<div class="vq-note"><b>모두 한 번에 맞혔어요! 🎉</b></div>';
      h += '<button class="vq-btn" data-act="again">처음부터 다시 풀기</button><button class="vq-btn sub" data-act="exit">닫기</button>' + creditHtml(book) + '</div>';
      el.innerHTML = h;
      if (!reported) { reported = true; if (opt.onFinish) opt.onFinish(r); }
    }

    el.onclick = function (ev) {
      const b = ev.target.closest('[data-act]');
      if (!b || !cur && b.dataset.act !== 'again' && b.dataset.act !== 'exit') return;
      const act = b.dataset.act;
      if (act === 'pick') {
        if (picked != null) return;
        picked = Number(b.dataset.i);
        E.submit(s, cur.question.options[picked].correct);
        view = 'feedback'; draw();
      } else if (act === 'next') advance();
      else if (act === 'mw') { mp.sel = Number(b.dataset.id); mp.bad = null; draw(); }
      else if (act === 'mm') {
        if (mp.sel == null) return;
        const id = Number(b.dataset.id);
        if (mp.sel === id) { mp.pairs[id] = id; mp.sel = null; mp.bad = null; }
        else { mp.bad = id; mp.mistakes++; }
        draw();
      } else if (act === 'mdone') { E.submit(s, mp.mistakes === 0); advance(); }
      else if (act === 'go') { view = 'question'; draw(); }
      else if (act === 'again') { if (opt.onRestart) opt.onRestart(); else mount(el, opt); }
      else if (act === 'exit') { if (opt.onExit) opt.onExit(); }
    };

    advance();
  }
  root.VocabUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);

