/* 학생 독서 기록앱(student.html) ↔ 어휘 확인 학습 연결
 *  - 어휘 자료: 구글 시트 [어휘] (Apps Script: ?action=getVocabIndex / getVocab&level=1레벨)
 *  - 퀴즈 화면: vocab_engine.js + vocab_ui.js
 *  - 결과: [학습기록] 시트 (Apps Script: action=addLearningRecord) + 수업내용(K열) 요약 한 줄
 *  - student.html 에서는 VocabBridge.buttonHtml / summaryText / checkout 세 곳만 호출한다.
 */
(function (root) {
  'use strict';
  var INDEX_KEY = 'vocab_index_v1';
  var LEVEL_KEY = 'vocab_level_v1_';
  var PENDING_KEY = 'vocab_pending_v1';
  var TTL = 12 * 60 * 60 * 1000;   // 어휘 사본을 기기에 저장해 두는 시간 (시트 수정은 '어휘 갱신' 후 최대 12시간 내 반영)
  var B = {};
  var indexMap = null;

  function gasUrl() {
    try { return (state && state.config && state.config.gasWebhookUrl) || ''; } catch (e) { return ''; }
  }
  function withParams(url, qs) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs; }
  // 책 제목 비교용 정리: [개정] 같은 대괄호, 끝의 (연도) 표기, 공백·기호 제거
  function norm(s) {
    return String(s || '').replace(/\[[^\]]*\]/g, '').replace(/\((\d+|\d{4}\.\d{1,2})\)$/g, '')
      .replace(/([가-힣])p$/, '$1').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
  }
  B.norm = norm;
  function today() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function cleanName(student) { return String((student && student.name) || '').replace(/\s+/g, ''); }
  function levelNum(level) { return level === '기초' ? 0 : parseInt(level, 10); }

  function readCache(key) {
    try {
      var c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && c.ts && (Date.now() - c.ts) < TTL) return c.data;
    } catch (e) { /* 무시 */ }
    return null;
  }
  function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) { /* 저장 공간 부족 등은 무시 */ }
  }
  function fetchJson(url) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json();
    });
  }

  // ---------- 어휘 목록(색인) ----------
  B.ensureIndex = function () {
    var url = gasUrl();
    if (!url) return Promise.resolve(null);
    var done = function (data) {
      if (!data || data.type !== 'vocabIndex' || !data.items) return null;   // 아직 Apps Script 를 갱신하지 않은 경우 등 → 기능 숨김
      indexMap = {};
      data.items.forEach(function (it) { indexMap[it.l + '|' + norm(it.t)] = it; });
      return indexMap;
    };
    var cached = readCache(INDEX_KEY);
    if (cached) return Promise.resolve(done(cached));
    return fetchJson(withParams(url, 'action=getVocabIndex')).then(function (data) {
      if (data && data.type === 'vocabIndex') writeCache(INDEX_KEY, data);
      return done(data);
    }).catch(function () { return null; });
  };

  function findEntry(b) { return indexMap ? indexMap[b.level + '|' + norm(b.title)] : null; }
  B.hasVocab = function (b) { return !!(b && findEntry(b)); };

  B.buttonHtml = function (b) {
    if (!B.hasVocab(b)) return '';
    var res = null;
    try {
      var list = (state.missions.vocabResults || []).filter(function (r) { return r.bookId === b.id; });
      if (list.length) res = list[list.length - 1];
    } catch (e) { /* 무시 */ }
    var badge = res ? ' <span class="text-emerald-700">✔ ' + res.rate + '%</span>' : '';
    return '<button type="button" onclick="VocabBridge.start(\'' + b.id + '\')" ' +
      'class="px-2.5 py-1 rounded-xl border text-xs sm:text-sm transition-all active:scale-95 flex items-center gap-1 ' +
      'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 font-extrabold shadow-sm"><span>어휘 퀴즈 ▶</span>' + badge + '</button>';
  };

  // ---------- 퀴즈 열기 ----------
  function loadLevel(level) {
    var cached = readCache(LEVEL_KEY + level);
    if (cached) return Promise.resolve(cached);
    return fetchJson(withParams(gasUrl(), 'action=getVocab&level=' + encodeURIComponent(level))).then(function (data) {
      if (!data || data.type !== 'vocabLevel') throw new Error('bad vocab response');
      writeCache(LEVEL_KEY + level, data);
      return data;
    });
  }

  function openOverlay() {
    closeOverlay(true);
    var o = document.createElement('div');
    o.id = 'vocabOverlay';
    o.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;background:#f3f4f6;overflow-y:auto;-webkit-overflow-scrolling:touch';
    o.innerHTML = '<div id="vocabBox"><div style="padding:60px 20px;text-align:center;font-size:15px;color:#475569">어휘를 불러오는 중... 📖</div></div>';
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    return o.querySelector('#vocabBox');
  }
  function closeOverlay(silent) {
    var o = document.getElementById('vocabOverlay');
    if (o) o.parentNode.removeChild(o);
    document.body.style.overflow = '';
    if (!silent) { try { if (typeof renderBookList === 'function') renderBookList(); } catch (e) { /* 무시 */ } }
  }

  B.start = function (bookId) {
    var b = (state.missions.books || []).filter(function (x) { return x.id === bookId; })[0];
    if (!b) return;
    var box = openOverlay();
    loadLevel(b.level).then(function (data) {
      var lv = levelNum(b.level);
      var books = data.books.map(function (x, i) { return { id: 'V' + i, level: lv, title: x.title, words: x.words }; });
      var target = books.filter(function (x) { return norm(x.title) === norm(b.title); })[0];
      if (!target) throw new Error('book not in sheet');
      root.VocabUI.mount(box, {
        book: target, db: { books: books, map: {} },
        onFinish: function (r) { onFinish(b, target, r); },
        onExit: function () { closeOverlay(); },
        onRestart: function () { B.start(bookId); }
      });
    }).catch(function () {
      closeOverlay();
      alert('어휘 자료를 불러오지 못했어요 😢\n인터넷 연결을 확인하고 다시 눌러 주세요.');
    });
  };

  // ---------- 결과 저장 ----------
  function onFinish(b, target, r) {
    var name = cleanName(state.currentStudent);
    var date = today();
    if (!state.missions.vocabResults) state.missions.vocabResults = [];
    state.missions.vocabResults.push({ bookId: b.id, title: target.title, level: b.level, total: r.total, firstCorrect: r.firstCorrect, rate: r.rate, wrongWords: r.wrongWords });
    try { if (typeof saveActiveSession === 'function') saveActiveSession(); } catch (e) { /* 무시 */ }
    var quizId = name + '|' + date + '|quiz|' + b.id + '|' + r.at;
    var records = [{
      id: quizId, date: date, type: '어휘퀴즈', level: b.level, book: target.title,
      total: r.total, firstCorrect: r.firstCorrect, rate: r.rate,
      wrongWords: (r.wrongWords || []).join(', '),
      json: JSON.stringify({ retryRounds: r.retryRounds, answers: r.answers })
    }];
    (r.wrongRecords || []).forEach(function (w) {
      records.push({
        id: quizId + '|' + w.key, date: date, type: '어휘오답', level: b.level, book: target.title,
        wrongWords: w.type === 'match' ? '(짝짓기)' : w.word, json: JSON.stringify(w)
      });
    });
    send(name, records);
  }

  // 수업내용(K열)에 남길 요약 한 줄  →  회원분석 '학생 특이사항'에 날짜와 함께 쌓임
  B.summaryText = function () {
    var list = (state.missions && state.missions.vocabResults) || [];
    if (!list.length) return '';
    return list.map(function (r) {
      var s = '[어휘] 『' + r.title + '』 ' + r.firstCorrect + '/' + r.total + '(' + r.rate + '%)';
      if (r.wrongWords && r.wrongWords.length) s += ' 오답:' + r.wrongWords.slice(0, 3).join(', ') + (r.wrongWords.length > 3 ? ' 외 ' + (r.wrongWords.length - 3) : '');
      return s;
    }).join(' / ');
  };

  // ---------- 하원 시: 진단 점수 + 4단계 트레이닝(이해도·오답 개수) 전송 ----------
  function toNum(v) { var n = parseInt(String(v == null ? '' : v).replace(/[^0-9-]/g, ''), 10); return isNaN(n) ? 0 : n; }

  B.buildCheckoutRecords = function (student, missions, date) {
    var name = cleanName(student);
    var out = [];
    (missions.books || []).forEach(function (b) {
      var score = String(b.score == null ? '' : b.score).trim();
      if (!score) return;
      out.push({ id: name + '|' + date + '|diag|' + b.id, date: date, type: '진단', level: b.level, book: b.title, score: score });
    });
    var details = missions.trainingDetails || {};
    (missions.trainingTypes || []).forEach(function (t) {
      var d = details[t] || {};
      var detail = '', errors = 0;
      if (t === '문해력트레이닝') {
        var items = Array.isArray(d.items) ? d.items.slice() : [];
        if ((d.session || d.errors) && !items.some(function (it) { return it.session === d.session && it.errors === d.errors; })) {
          items.push({ field: d.field || '복합', vol: d.vol || '1단계', session: d.session, errors: d.errors });
        }
        detail = items.map(function (it) { return [it.field, it.vol, it.session ? it.session + '차시' : ''].filter(Boolean).join(' '); }).join('; ');
        items.forEach(function (it) { errors += toNum(it.errors); });
      } else if (t === '오답수정+선지분석') {
        var its = Array.isArray(d.items) ? d.items.slice() : [];
        if ((d.errors || d.fixed) && !its.some(function (it) { return it.field === d.field && it.errors === d.errors && it.fixed === d.fixed; })) {
          its.push({ field: d.field || '복합', errors: d.errors, fixed: d.fixed });
        }
        detail = its.map(function (it) { return [it.field, it.errors ? '오답:' + it.errors : '', it.fixed ? '수정:' + it.fixed : ''].filter(Boolean).join(' '); }).join('; ');
        its.forEach(function (it) { errors += toNum(it.errors); });
      } else {
        detail = [d.vol, d.session ? d.session + '차시' : ''].filter(Boolean).join(' ');
        errors = toNum(d.errors);
      }
      out.push({ id: name + '|' + date + '|train|' + t, date: date, type: '트레이닝', training: t, detail: detail, errors: errors, understanding: d.understanding || '' });
    });
    return out;
  };

  B.checkout = function (student, missions) {
    var recs = B.buildCheckoutRecords(student, missions, today());
    if (recs.length) send(cleanName(student), recs);
  };

  // ---------- 전송 (no-cors: 응답을 읽을 수 없으므로 네트워크 오류일 때만 보관해 두었다가 다시 보냄) ----------
  function post(name, records) {
    var url = gasUrl();
    if (!url) return Promise.reject(new Error('no url'));
    return fetch(url, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addLearningRecord', name: name, records: records })
    });
  }
  function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; } }
  function savePending(p) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ } }
  function send(name, records) {
    return post(name, records).catch(function () {
      var p = loadPending(); p.push({ name: name, records: records }); savePending(p);
    });
  }
  B.flushPending = function () {
    var p = loadPending();
    if (!p.length) return Promise.resolve();
    savePending([]);
    return Promise.all(p.map(function (x) { return send(x.name, x.records); }));
  };

  B.init = function () {
    B.flushPending();
    B.ensureIndex().then(function () {
      try { if (typeof renderBookList === 'function' && state.currentStudent) renderBookList(); } catch (e) { /* 무시 */ }
    });
  };
  B._test = { norm: norm, today: today };

  root.VocabBridge = B;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', B.init);
  else setTimeout(B.init, 0);
})(window);
