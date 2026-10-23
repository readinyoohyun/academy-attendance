/* 어휘 확인 학습 화면 (순수 JS, 의존성 없음 – 기존 앱 어디에나 붙일 수 있음)
 * 사용: VocabUI.mount(containerEl, { book, db, onFinish(result), onExit(), onRestart() })
 * 문제 유형(총 10문제):
 *  ① 뜻 고르기 / ② 어휘 고르기 / ③ 빈칸 채우기(예문) / ④ 초성 쓰기 / ⑤ 비슷한말 고르기 / ⑥ 4~6레벨 뜻 고르기 / ⑦ 짝짓기
 */
(function (root) {
  'use strict';
  const E = root.VocabEngine;
  const CSS = `
.vq{max-width:480px;margin:0 auto;padding:16px 16px 110px;font-family:Pretendard,system-ui,sans-serif;color:#1f2937}
.vq *{box-sizing:border-box}
.vq-top{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#6b7280;margin-bottom:6px;gap:8px;font-weight:700}
.vq-bar{height:6px;border-radius:99px;background:#e5e7eb;margin-bottom:14px;overflow:hidden}
.vq-bar>i{display:block;height:100%;background:#4f46e5;transition:width .2s}
.vq-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:12px}
.vq-tag{font-size:12px;color:#6b7280;display:flex;justify-content:space-between;align-items:center;gap:6px}
.vq-type-pill{display:inline-block;padding:2px 8px;border-radius:99px;background:#eef2ff;color:#4338ca;font-weight:800;font-size:11px}
.vq-ask{font-size:14px;margin:8px 0;color:#374151;font-weight:600}
.vq-big{font-size:28px;font-weight:700;line-height:1.4;word-break:keep-all}
.vq-big.s{font-size:17px;font-weight:600}
.vq-sent{font-size:18px;line-height:1.85;word-break:keep-all;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-top:6px;font-weight:700;color:#0f172a}
.vq-hint{font-size:13px;color:#475569;margin-top:8px;padding:8px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;line-height:1.45}
.vq-blank{display:inline-block;min-width:64px;border-bottom:3px solid #4f46e5;text-align:center;font-weight:800;padding:0 6px;color:#4f46e5}
.vq-cho-box{display:flex;justify-content:center;gap:8px;margin:12px 0 6px;flex-wrap:wrap}
.vq-cho-char{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:#eef2ff;border:2px solid #6366f1;color:#312e81;font-size:22px;font-weight:900}
.vq-input-row{display:flex;gap:8px;margin-bottom:10px}
.vq-input{flex:1;padding:13px 14px;border-radius:12px;border:2px solid #cbd5e1;font-size:16px;font-weight:700;outline:none}
.vq-input:focus{border-color:#4f46e5}
.vq-opt{display:block;width:100%;text-align:left;padding:13px 14px;margin-bottom:8px;border-radius:12px;border:1px solid #d1d5db;background:#fff;font-size:15px;line-height:1.5;cursor:pointer;word-break:keep-all}
.vq-opt:active{background:#eef2ff}
.vq-opt.ok{background:#bbf7d0;border-color:#22c55e;color:#14532d;font-weight:700}
.vq-opt.no{background:#fecaca;border-color:#ef4444;color:#7f1d1d}
.vq-opt.sel{border:2px solid #4f46e5}
.vq-opt[disabled]{cursor:default}
.vq-btn{display:block;width:100%;padding:14px;border:0;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px}
.vq-btn.sub{background:#fff;color:#4f46e5;border:1px solid #4f46e5}
.vq-note{padding:12px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;line-height:1.6;margin-top:8px}
.vq-banner{padding:10px 12px;border-radius:12px;background:#fef3c7;color:#92400e;font-size:13px;margin-bottom:10px;font-weight:700}
.vq-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
.vq-rate{font-size:48px;font-weight:800;color:#4f46e5;text-align:center;margin:8px 0}
.vq-chips span{display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;border-radius:99px;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:700}
`;
  function injectCss() {
    const old = document.getElementById('vq-css');
    if (old) old.textContent = CSS;
    else {
      const st = document.createElement('style');
      st.id = 'vq-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TYPE = {
    mean: '① 뜻 고르기',
    word: '② 어휘 고르기',
    blank: '③ 빈칸 채우기 (예문)',
    choseong: '④ 초성 쓰기',
    similar: '⑤ 비슷한말 고르기',
    match: '⑦ 짝짓기'
  };
  const lvName = l => (l === 0 || l === '0' || l === '기초' ? '기초' : (typeof l === 'number' ? l + '레벨' : String(l)));
  const creditHtml = b => (b && b.source === '국립국어원') ? '<div style="margin-top:14px;font-size:11px;color:#6b7280;text-align:center">출처: 국립국어원 「국어 기초 어휘 선정 및 어휘 등급화 목록」(공공누리 제1유형)</div>' : '';
  const newMp = () => ({ sel: null, pairs: {}, bad: null, mistakes: 0 });

  function mount(el, opt) {
    injectCss();
    const { book, db } = opt;
    const s = E.createSession(book, db);
    let cur = null, picked = null, typedText = null, typedOk = null, view = 'question', mp = newMp(), introRound = 0, reported = false;

    function top(label) {
      const total = E.total(s);
      const done = total - s.queue.length - s.retry.length;
      const stepNum = Math.min(total, done + 1);
      const posTxt = cur && cur.phase === 'retry' ? '재학습' : `${stepNum} / ${total}문제`;
      return `<div class="vq-top"><span>${esc(book.title)} · ${lvName(book.level)}</span><span>${posTxt} · ${label}</span></div>
        <div class="vq-bar"><i style="width:${Math.max(6, done / total * 100)}%"></i></div>`;
    }
    const exitBtn = '<button class="vq-btn sub" data-act="exit" style="margin-top:20px">그만하기</button>';
    const nextLabel = () => (E.done(s) ? '결과 보기' : '다음 ›');

    function advance() {
      cur = E.current(s);
      picked = null; typedText = null; typedOk = null; mp = newMp();
      if (!cur) view = 'result';
      else if (cur.phase === 'retry' && introRound !== s.retryRound) { introRound = s.retryRound; view = 'intro'; }
      else view = 'question';
      draw();
    }

    function draw() {
      if (view === 'result') return drawResult();
      const label = cur.phase === 'retry' ? '틀린 문제 다시 풀기' : (TYPE[cur.question.type] || '어휘 문제');
      let h = '<div class="vq">' + top(label);
      if (view === 'intro') {
        h += `<div class="vq-card"><div class="vq-ask"><b>틀린 문제가 ${s.queue.length}개 있어요.</b><br>다시 풀어 볼까요? (정답률에는 영향이 없어요)</div>
          <button class="vq-btn" data-act="go">다시 풀기</button></div></div>`;
        el.innerHTML = h; return;
      }
      if (cur.phase === 'retry') h += `<div class="vq-banner">다시 풀기 · ${s.queue.length}개 남음</div>`;
      if (cur.question.type === 'match') h += matchHtml(cur.question);
      else if (cur.question.type === 'choseong') h += choseongHtml(cur.question);
      else h += choiceHtml(cur.question);
      h += exitBtn + creditHtml(book) + '</div>';
      el.innerHTML = h;

      if (cur.question.type === 'choseong' && typedOk === null) {
        const inp = el.querySelector('#vqChoseongInput');
        if (inp) {
          setTimeout(() => { try { inp.focus(); } catch (e) {} }, 40);
          inp.onkeydown = function (ev) {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              submitChoseong(inp.value);
            }
          };
        }
      }
    }

    function exampleFeedbackHtml(w) {
      if (!w || !w.e) return '';
      const filled = String(w.e).replace(/\(\s*\)/, `<b>[${esc(w.f || w.w)}]</b>`);
      return `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #cbd5e1;color:#334155;font-size:13px">📖 <b>책 속 예문:</b> ${filled}</div>`;
    }

    function choseongHtml(q) {
      const chars = String(q.hint || '').split('').map(c =>
        c === ' ' ? '<span style="width:12px"></span>' : `<span class="vq-cho-char">${esc(c)}</span>`
      ).join('');
      const w = book.words[s.specs[cur.index].wordIndex];
      let h = `<div class="vq-card">
        <div class="vq-tag"><span>${esc(book.title)}</span><span class="vq-type-pill">${TYPE.choseong}</span></div>
        <div class="vq-ask">${esc(q.prompt)}</div>
        <div class="vq-big s" style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0">${esc(q.meaning)}</div>
        <div class="vq-cho-box">${chars}</div>
      </div>`;
      if (typedOk === null) {
        h += `<div class="vq-input-row">
          <input id="vqChoseongInput" type="text" class="vq-input" placeholder="초성(${esc(q.hint)})에 알맞은 어휘 입력" autocomplete="off" />
          <button type="button" class="vq-btn" data-act="check-cho" style="width:auto;margin-top:0;padding:0 20px;white-space:nowrap">확인</button>
        </div>`;
      } else {
        h += `<div class="vq-note" style="border-color:${typedOk ? '#22c55e' : '#ef4444'};background:${typedOk ? '#f0fdf4' : '#fef2f2'}">
          <b>${typedOk ? '정답이에요! 👏' : `아쉬워요 😢 (입력: ${esc(typedText || '빈칸')} → 정답: ${esc(q.answer)})`}</b><br>
          <b>${esc(w.w)}</b>: ${esc(w.m)}
          ${exampleFeedbackHtml(w)}
        </div>
        <button class="vq-btn" data-act="next">${nextLabel()}</button>`;
      }
      return h;
    }

    function submitChoseong(rawVal) {
      if (typedOk !== null) return;
      const val = String(rawVal || '').trim();
      if (!val) {
        const inp = el.querySelector('#vqChoseongInput');
        if (inp) inp.focus();
        return;
      }
      typedText = val;
      const cleanInput = val.replace(/\s+/g, '');
      const cleanAns = String(cur.question.answer || '').replace(/\s+/g, '');
      typedOk = (cleanInput === cleanAns);
      E.submit(s, typedOk);
      view = 'feedback';
      draw();
    }

    function choiceHtml(q) {
      let body;
      const typeLabel = TYPE[q.type] || '어휘 문제';
      if (q.type === 'blank') {
        const filled = picked == null ? '&nbsp;&nbsp;&nbsp;' : esc(q.options[picked].text);
        body = `<div class="vq-ask">${esc(q.prompt)}</div>
          <div class="vq-sent">${esc(q.sentence).replace('( )', `<span class="vq-blank">${filled}</span>`)}</div>
          ${q.hint ? `<div class="vq-hint">💡 <b>뜻 힌트:</b> ${esc(q.hint)}</div>` : ''}`;
      } else if (q.type === 'similar') {
        body = `<div class="vq-ask">${esc(q.prompt)}</div>
          <div class="vq-big">${esc(q.big)}</div>
          ${q.subMeaning ? `<div class="vq-hint">💡 <b>뜻:</b> ${esc(q.subMeaning)}</div>` : ''}`;
      } else {
        body = `<div class="vq-ask">${esc(q.prompt)}</div><div class="vq-big ${q.small ? 's' : ''}">${esc(q.big)}</div>`;
      }
      let h = `<div class="vq-card"><div class="vq-tag"><span>${esc(book.title)}</span><span class="vq-type-pill">${typeLabel}</span></div>${body}</div>`;
      h += q.options.map((o, i) => {
        let c = 'vq-opt';
        if (picked != null) c += o.correct ? ' ok' : (i === picked ? ' no' : '');
        return `<button class="${c}" data-act="pick" data-i="${i}" ${picked != null ? 'disabled' : ''}>${'①②③④'[i]} ${esc(o.text)}</button>`;
      }).join('');
      if (picked != null) {
        const ok = q.options[picked].correct;
        const w = book.words[s.specs[cur.index].wordIndex];
        h += `<div class="vq-note"><b>${ok ? '정답이에요! 👏' : '아쉬워요 😢 (나중에 다시 풀어요)'}</b><br><b>${esc(w.w)}</b>: ${esc(w.m)}${exampleFeedbackHtml(w)}</div>
          <button class="vq-btn" data-act="next">${nextLabel()}</button>`;
      }
      return h;
    }

    function matchHtml(q) {
      const solved = Object.keys(mp.pairs).length === q.left.length;
      let h = `<div class="vq-card"><div class="vq-tag"><span>${esc(book.title)}</span><span class="vq-type-pill">${TYPE.match}</span></div>
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
        <div class="vq-card"><div class="vq-ask" style="text-align:center">어휘 확인 학습 결과</div>
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
      } else if (act === 'check-cho') {
        const inp = el.querySelector('#vqChoseongInput');
        submitChoseong(inp ? inp.value : '');
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
