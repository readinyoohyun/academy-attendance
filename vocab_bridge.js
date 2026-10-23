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

  function levelLabel(lv) { return (lv === 0 || lv === '0' || lv === '기초') ? '기초' : (typeof lv === 'number' ? lv + '레벨' : String(lv)); }
  function localIndexItems() {
    if (!root.VOCAB_DB || !Array.isArray(root.VOCAB_DB.books)) return null;
    return root.VOCAB_DB.books.map(function (b) { return { t: b.title, l: levelLabel(b.level), n: (b.words || []).length }; });
  }
  function localLevelData(level) {
    if (!root.VOCAB_DB || !Array.isArray(root.VOCAB_DB.books)) return null;
    var books = root.VOCAB_DB.books.filter(function (b) { return levelLabel(b.level) === level; });
    if (!books.length) return null;
    return { type: 'vocabLevel', version: 'local', level: level, books: books.map(function (b) { return { level: level, title: b.title, words: b.words }; }) };
  }
  var byTitleMap = null;
  var sheetVocabReady = false;
  function populateIndex(items) {
    if (!items || !items.length) return null;
    indexMap = indexMap || {};
    byTitleMap = byTitleMap || {};
    items.forEach(function (it) {
      var nt = norm(it.t);
      indexMap[it.l + '|' + nt] = it;
      if (!byTitleMap[nt]) byTitleMap[nt] = it;
    });
    return indexMap;
  }

  // ---------- 어휘 목록(색인) ----------
  B.ensureIndex = function () {
    // 1) 내장 어휘 DB(vocab_db.js)가 있으면 즉시 색인을 먼저 구성하여 Apps Script 미배포 상태에서도 버튼이 바로 노출되도록 보장
    var localItems = localIndexItems();
    if (localItems) populateIndex(localItems);

    var url = gasUrl();
    if (!url) return Promise.resolve(indexMap);
    var done = function (data) {
      if (!data || data.type !== 'vocabIndex' || !data.items || !data.items.length) return indexMap;
      sheetVocabReady = true;
      indexMap = {};
      byTitleMap = {};
      if (localItems) populateIndex(localItems);
      return populateIndex(data.items);
    };
    var cached = readCache(INDEX_KEY);
    if (cached) return Promise.resolve(done(cached));
    return fetchJson(withParams(url, 'action=getVocabIndex')).then(function (data) {
      if (data && data.type === 'vocabIndex' && data.items && data.items.length) writeCache(INDEX_KEY, data);
      return done(data);
    }).catch(function () { return indexMap; });
  };

  function findEntry(b) {
    if (!indexMap) {
      var localItems = localIndexItems();
      if (localItems) populateIndex(localItems);
    }
    if (!b || !indexMap) return null;
    var nt = norm(b.title);
    return indexMap[levelLabel(b.level) + '|' + nt] || (byTitleMap ? byTitleMap[nt] : null);
  }
  B.hasVocab = function (b) { return !!(b && findEntry(b)); };

  B.formatResult = function (r) {
    if (!r) return '';
    var gradeBand = r.gradeBand || ((/^(초|중)/.test(String(r.level || ''))) ? r.level : defaultGradeBand());
    var wrongCnt = r.wrongCount != null ? r.wrongCount : Math.max(0, (r.total || 0) - (r.firstCorrect || 0));
    var retryCnt = r.retryCount != null ? r.retryCount : wrongCnt;
    return gradeBand + '/학습' + r.total + '개/오답' + wrongCnt + '개/재학습' + retryCnt + '개/';
  };

  B.renderBanner = function () {
    try {
      var list = (state && state.missions && state.missions.vocabResults) || [];
      var banner = document.getElementById('vocabCompletedBanner');
      if (banner) {
        if (list.length) {
          banner.innerHTML = '<div class="flex flex-col gap-1.5">' +
            '<div class="text-xs font-extrabold text-rose-800 flex items-center gap-1.5"><span>✅</span><span>오늘 완료한 어휘 학습</span></div>' +
            list.map(function (r) {
              var fmt = B.formatResult(r);
              return '<div class="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-rose-200">' +
                '<span class="font-black text-rose-700 text-xs sm:text-sm">' + fmt + '</span>' +
                '<span class="text-xs font-bold text-slate-600">『' + r.title + '』 (' + r.rate + '%)</span>' +
              '</div>';
            }).join('') +
            '</div>';
          banner.classList.remove('hidden');
        } else {
          banner.innerHTML = '';
          banner.classList.add('hidden');
        }
      }
      var gradeBtnBadge = document.getElementById('gradeVocabBtnBadge');
      if (gradeBtnBadge) {
        var gradeDone = list.filter(function (r) { return String(r.bookId || '').indexOf('grade_') === 0; });
        if (gradeDone.length) {
          var lastG = gradeDone[gradeDone.length - 1];
          gradeBtnBadge.textContent = '✔ ' + B.formatResult(lastG);
          gradeBtnBadge.classList.remove('hidden');
        } else {
          gradeBtnBadge.textContent = '';
          gradeBtnBadge.classList.add('hidden');
        }
      }
    } catch (e) { /* 무시 */ }
  };

  B.buttonHtml = function (b) {
    if (!B.hasVocab(b)) return '';
    var res = null;
    try {
      var list = (state.missions.vocabResults || []).filter(function (r) { return r.bookId === b.id; });
      if (list.length) res = list[list.length - 1];
    } catch (e) { /* 무시 */ }
    var badge = res ? ' <span class="text-emerald-700">✔ ' + B.formatResult(res) + '</span>' : '';
    return '<button type="button" onclick="VocabBridge.start(\'' + b.id + '\')" ' +
      'class="px-2.5 py-1 rounded-xl border text-xs sm:text-sm transition-all active:scale-95 flex items-center gap-1 ' +
      'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 font-extrabold shadow-sm"><span>어휘 퀴즈 ▶</span>' + badge + '</button>';
  };

  // ---------- 퀴즈 열기 (내장 DB 즉시 반환 → 0초 로딩, 시트 연결 시 백그라운드 갱신) ----------
  function loadLevel(level) {
    var cached = readCache(LEVEL_KEY + level);
    if (cached) return Promise.resolve(cached);
    var loc = localLevelData(level);
    var url = gasUrl();
    if (loc) {
      if (url && sheetVocabReady) {
        fetchJson(withParams(url, 'action=getVocab&level=' + encodeURIComponent(level))).then(function (data) {
          if (data && data.type === 'vocabLevel' && Array.isArray(data.books) && data.books.length) {
            writeCache(LEVEL_KEY + level, data);
          }
        }).catch(function () {});
      }
      return Promise.resolve(loc);
    }
    if (!url) return Promise.reject(new Error('no vocab source'));
    return fetchJson(withParams(url, 'action=getVocab&level=' + encodeURIComponent(level))).then(function (data) {
      if (data && data.type === 'vocabLevel' && Array.isArray(data.books) && data.books.length) {
        writeCache(LEVEL_KEY + level, data);
        return data;
      }
      throw new Error('bad vocab response');
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
    if (!silent) {
      try { if (typeof renderBookList === 'function') renderBookList(); } catch (e) { /* 무시 */ }
      try { B.renderBanner(); } catch (e) { /* 무시 */ }
      try { if (typeof updateProgress === 'function') updateProgress(500); } catch (e) { /* 무시 */ }
    }
  }

  B.start = function (bookId) {
    var b = (state.missions.books || []).filter(function (x) { return x.id === bookId; })[0];
    if (!b) return;
    var entry = findEntry(b);
    var targetLv = (entry && entry.l) ? entry.l : levelLabel(b.level);
    var box = openOverlay();
    loadLevel(targetLv).then(function (data) {
      var lv = levelNum(targetLv);
      var books = data.books.map(function (x, i) { return { id: 'V' + i, level: isNaN(lv) ? targetLv : lv, title: x.title, source: x.source, words: x.words }; });
      var target = books.filter(function (x) { return norm(x.title) === norm(b.title); })[0];
      if (!target) throw new Error('book not in sheet');
      root.VocabUI.mount(box, {
        book: target, db: { books: books, map: {} },
        gradeBand: defaultGradeBand(),
        onFinish: function (r) {
          b.vocabDone = true;
          onFinish(b, target, r, defaultGradeBand());
        },
        onExit: function () { closeOverlay(); },
        onRestart: function () { B.start(bookId); }
      });
    }).catch(function () {
      closeOverlay();
      alert('어휘 자료를 불러오지 못했어요 😢\n인터넷 연결을 확인하고 다시 눌러 주세요.');
    });
  };

  // ---------- 레벨별 도서 어휘 + 국립국어원 학년별 필수 어휘 통합 선택 및 학습 ----------
  function defaultGradeBand() {
    var g = String((state && state.currentStudent && state.currentStudent.grade) || '');
    if (/유치|초.*(1|2)/.test(g)) return '초1~2';
    if (/초.*(3|4)/.test(g)) return '초3~4';
    if (/초.*(5|6)/.test(g)) return '초5~6';
    if (/중|고/.test(g)) return '중1~3';
    return '초3~4';
  }

  function defaultBookLevel() {
    try {
      var books = (state && state.missions && state.missions.books) || [];
      for (var i = 0; i < books.length; i++) {
        var e = findEntry(books[i]);
        if (e && e.l) return e.l;
      }
    } catch (e) {}
    return '1레벨';
  }

  B.openLevelPicker = function (lv) {
    B.openGradePicker(lv || defaultBookLevel());
  };

  B.filterPickerCards = function (q) {
    var kw = norm(q || '');
    var cards = document.querySelectorAll('#vocabPickerGrid > button');
    for (var i = 0; i < cards.length; i++) {
      var t = cards[i].getAttribute('data-norm') || '';
      cards[i].style.display = (!kw || t.indexOf(kw) >= 0) ? 'flex' : 'none';
    }
  };

  B.openGradePicker = function (selectedTab) {
    var tab = selectedTab || defaultGradeBand();
    var bookLevels = ['기초', '1레벨', '2레벨', '3레벨', '4레벨', '5레벨', '6레벨'];
    var grades = ['초1~2', '초3~4', '초5~6', '중1~3'];
    var isGradeTab = grades.indexOf(tab) >= 0;
    var box = openOverlay();
    loadLevel(tab).then(function (data) {
      var sessions = (data && data.books) || [];
      var results = (state && state.missions && state.missions.vocabResults) || [];
      var levelTabsHtml = bookLevels.map(function (lv) {
        var on = lv === tab;
        return '<button type="button" onclick="VocabBridge.openGradePicker(\'' + lv + '\')" style="padding:8px 12px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;border:1px solid ' + (on ? '#059669' : '#cbd5e1') + ';background:' + (on ? '#059669' : '#fff') + ';color:' + (on ? '#fff' : '#334155') + '">' + lv + '</button>';
      }).join(' ');
      var gradeTabsHtml = grades.map(function (g) {
        var on = g === tab;
        return '<button type="button" onclick="VocabBridge.openGradePicker(\'' + g + '\')" style="padding:8px 12px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;border:1px solid ' + (on ? '#4f46e5' : '#cbd5e1') + ';background:' + (on ? '#4f46e5' : '#fff') + ';color:' + (on ? '#fff' : '#334155') + '">' + g + '</button>';
      }).join(' ');

      var searchHtml = isGradeTab ? '' :
        '<div style="margin-bottom:12px"><input type="text" placeholder="🔍 ' + tab + ' 도서 제목 검색 (예: 만점짜리 도시락)" oninput="VocabBridge.filterPickerCards(this.value)" style="width:100%;padding:10px 14px;border-radius:12px;border:2px solid #10b981;font-size:14px;font-weight:700;outline:none" /></div>';

      var cardsHtml = sessions.map(function (s, idx) {
        var sid = 'grade_' + tab + '_' + (idx + 1);
        var doneList = results.filter(function (r) { return r.bookId === sid || norm(r.title) === norm(s.title); });
        var last = doneList.length ? doneList[doneList.length - 1] : null;
        var badge = last ? '<span style="color:#be123c;font-weight:800;font-size:11px">✔ ' + B.formatResult(last) + '</span>' : '<span style="color:' + (isGradeTab ? '#6366f1' : '#059669') + ';font-weight:700;font-size:12px">' + (s.words || []).length + '어휘 ▶</span>';
        var sampleWords = (s.words || []).slice(0, 4).map(function (w) { return w.w; }).join(', ');
        var cardTitle = isGradeTab ? ((idx + 1) + '회차') : s.title;
        return '<button type="button" data-norm="' + norm(s.title) + '" onclick="VocabBridge.startGrade(\'' + tab + '\',' + idx + ')" style="text-align:left;padding:12px 14px;border-radius:14px;border:1px solid ' + (last ? '#fda4af' : '#e2e8f0') + ';background:' + (last ? '#fff1f2' : '#fff') + ';cursor:pointer;display:flex;flex-direction:column;gap:4px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-weight:800;font-size:14px;color:#0f172a">' + cardTitle + '</span>' + badge + '</div>' +
          '<div style="font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sampleWords + ' 등</div></button>';
      }).join('');
      box.innerHTML = '<div style="max-width:600px;margin:0 auto;padding:20px 16px 90px;font-family:Pretendard,system-ui,sans-serif">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div><div style="font-size:18px;font-weight:900;color:#0f172a">📚 레벨별 도서 어휘 & 🎓 학년별 필수 어휘</div>' +
        '<div style="font-size:12px;color:#64748b">구글 시트 + 앱 내장 어휘 총 9,250개 (도서 8,250개 · 국립국어원 1,000개)</div></div>' +
        '<button type="button" onclick="VocabBridge.close()" style="padding:8px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-weight:700;cursor:pointer">닫기 ✕</button></div>' +
        '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:10px 12px;margin-bottom:10px">' +
          '<div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:6px">📖 레벨별 도서 어휘 (기초 ~ 6레벨 · 879권)</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' + levelTabsHtml + '</div>' +
        '</div>' +
        '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;padding:10px 12px;margin-bottom:14px">' +
          '<div style="font-size:12px;font-weight:900;color:#3730a3;margin-bottom:6px">🎓 국립국어원 학년별 필수 어휘 (초1 ~ 중3 · 100회차)</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' + gradeTabsHtml + '</div>' +
        '</div>' +
        searchHtml +
        '<div id="vocabPickerGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">' + cardsHtml + '</div>' +
        (isGradeTab ? '<div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center">출처: 국립국어원 「국어 기초 어휘 선정 및 어휘 등급화 목록」(공공누리 제1유형)</div>' : '') +
        '</div>';
    }).catch(function () {
      closeOverlay();
      alert('어휘 자료를 불러오지 못했어요.');
    });
  };

  B.close = function () { closeOverlay(); };

  B.startGrade = function (grade, idx) {
    var box = openOverlay();
    var isGrade = /^(초|중)/.test(String(grade || ''));
    loadLevel(grade).then(function (data) {
      var books = (data.books || []).map(function (x, i) { return { id: 'G' + i, level: grade, title: x.title, source: isGrade ? '국립국어원' : '어휘지', words: x.words }; });
      var target = books[idx];
      if (!target) throw new Error('no grade session');
      // 만약 오늘 등록된 도서 중 같은 제목의 책이 있으면 그 도서 카드와도 자동 연동!
      var matchedBook = ((state && state.missions && state.missions.books) || []).filter(function (b) { return norm(b.title) === norm(target.title); })[0];
      var pseudoBook = matchedBook || { id: 'grade_' + grade + '_' + (idx + 1), level: grade, title: target.title };
      var gb = isGrade ? grade : defaultGradeBand();
      root.VocabUI.mount(box, {
        book: target, db: { books: books, map: {} },
        gradeBand: gb,
        onFinish: function (r) {
          if (matchedBook) matchedBook.vocabDone = true;
          onFinish(pseudoBook, target, r, gb);
        },
        onExit: function () { B.openGradePicker(grade); },
        onRestart: function () { B.startGrade(grade, idx); }
      });
    });
  };

  // ---------- 결과 저장 ----------
  function onFinish(b, target, r, gradeBand) {
    var name = cleanName(state.currentStudent);
    var date = today();
    if (!state.missions.vocabResults) state.missions.vocabResults = [];
    var wrongCnt = r.wrongCount != null ? r.wrongCount : Math.max(0, (r.total || 0) - (r.firstCorrect || 0));
    var retryCnt = r.retryCount != null ? r.retryCount : wrongCnt;
    var gb = gradeBand || ((/^(초|중)/.test(String(b.level || ''))) ? b.level : defaultGradeBand());
    var entry = {
      bookId: b.id, title: target.title, level: b.level, gradeBand: gb,
      total: r.total, firstCorrect: r.firstCorrect, wrongCount: wrongCnt, retryCount: retryCnt,
      rate: r.rate, wrongWords: r.wrongWords
    };
    state.missions.vocabResults = state.missions.vocabResults.filter(function (x) { return x.bookId !== b.id; });
    state.missions.vocabResults.push(entry);
    try { B.renderBanner(); } catch (e) { /* 무시 */ }
    try { if (typeof updateProgress === 'function') updateProgress(500); else if (typeof saveActiveSession === 'function') saveActiveSession(); } catch (e) { /* 무시 */ }
    var quizId = name + '|' + date + '|quiz|' + b.id + '|' + r.at;
    var records = [{
      id: quizId, date: date, type: '어휘퀴즈', level: b.level, book: target.title,
      total: r.total, firstCorrect: r.firstCorrect, rate: r.rate,
      wrongWords: (r.wrongWords || []).join(', '),
      json: JSON.stringify({ gradeBand: gb, wrongCount: wrongCnt, retryCount: retryCnt, retryRounds: r.retryRounds, answers: r.answers })
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
      var s = '[어휘] ' + B.formatResult(r) + ' 『' + r.title + '』';
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
    var localItems = localIndexItems();
    if (localItems) populateIndex(localItems);
    try { if (typeof renderBookList === 'function' && state.currentStudent) renderBookList(); } catch (e) { /* 무시 */ }
    try { B.renderBanner(); } catch (e) { /* 무시 */ }
    B.ensureIndex().then(function () {
      try { if (typeof renderBookList === 'function' && state.currentStudent) renderBookList(); } catch (e) { /* 무시 */ }
      try { B.renderBanner(); } catch (e) { /* 무시 */ }
      try { if (typeof updateProgress === 'function' && state.currentStudent) updateProgress(0); } catch (e) { /* 무시 */ }
    });
  };
  B._test = { norm: norm, today: today };

  root.VocabBridge = B;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', B.init);
  else setTimeout(B.init, 0);
})(window);
