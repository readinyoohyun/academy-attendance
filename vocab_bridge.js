/* 학생 독서 기록앱(student.html) ↔ 어휘 확인 학습 연결
 *  - 어휘 자료: 구글 시트 [어휘] (Apps Script: ?action=getVocabIndex / getVocab&level=1레벨)
 *  - 퀴즈 화면: vocab_engine.js + vocab_ui.js
 *  - 결과: [학습기록] 시트 (Apps Script: action=addLearningRecord) + 수업내용(K열) 요약 한 줄
 *  - student.html 에서는 VocabBridge.buttonHtml / summaryText / checkout 세 곳만 호출한다.
 */
(function (root) {
  'use strict';
  var INDEX_KEY = 'vocab_index_v3';
  var LEVEL_KEY = 'vocab_level_v3_';
  var PENDING_KEY = 'vocab_pending_v1';
  var TTL = 12 * 60 * 60 * 1000;   // 어휘 사본을 기기에 저장해 두는 시간 (시트 수정은 '어휘 갱신' 후 최대 12시간 내 반영)
  var B = {};
  var indexMap = null;

  function gasUrl() {
    try {
      if (typeof state !== 'undefined' && state && state.config && state.config.gasWebhookUrl) {
        return state.config.gasWebhookUrl;
      }
      return localStorage.getItem('gas_webhook_url') || '';
    } catch (e) {
      return '';
    }
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

  function levelLabel(lv) {
    if (lv === 0 || lv === '0' || /^기초/.test(String(lv || ''))) return '기초';
    if (typeof lv === 'number') return lv + '레벨';
    var s = String(lv || '').trim();
    var m = s.match(/^(\d+)(?:-\d+|\s*레벨)?$/);
    if (m) return m[1] + '레벨';
    return s;
  }
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
    var isGradeSession = /^grade_(초|중)/.test(String(r.bookId || '')) || /^(초|중)/.test(String(r.level || '')) || /^(초|중).*필수\s*어휘/.test(String(r.title || ''));
    var label = '';
    if (isGradeSession) {
      label = r.gradeBand || r.level || defaultGradeBand();
    } else {
      var entry = findEntry({ title: r.title, level: r.level });
      label = (entry && entry.l) ? entry.l : (r.level ? levelLabel(r.level) : (r.gradeBand || defaultBookLevel()));
    }
    var wrongCnt = r.wrongCount != null ? r.wrongCount : Math.max(0, (r.total || 0) - (r.firstCorrect || 0));
    var retryCnt = r.retryCount != null ? r.retryCount : wrongCnt;
    return label + '/학습' + r.total + '개/오답' + wrongCnt + '개/재학습' + retryCnt + '개/';
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
      'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 font-extrabold shadow-sm"><span>어휘 확인 학습 ▶</span>' + badge + '</button>';
  };

  // ---------- 퀴즈 열기 (내장 DB 즉시 반환 → 0초 로딩, 시트 연결 시 백그라운드 갱신 + 내장 예문/유의어 자동 보강) ----------
  function mergeWithLocal(sheetData, locData) {
    if (!sheetData || !Array.isArray(sheetData.books)) return locData || sheetData;
    if (!locData || !Array.isArray(locData.books)) return sheetData;
    var locBookMap = {};
    locData.books.forEach(function (lb) {
      locBookMap[norm(lb.title)] = lb;
    });
    sheetData.books.forEach(function (sb) {
      var lb = locBookMap[norm(sb.title)];
      if (!lb || !Array.isArray(lb.words) || !Array.isArray(sb.words)) return;
      var locWordMap = {};
      lb.words.forEach(function (lw) { locWordMap[lw.w] = lw; });
      sb.words.forEach(function (sw) {
        var lw = locWordMap[sw.w];
        if (!lw) return;
        if (!sw.e && lw.e) sw.e = lw.e;
        if (!sw.f && lw.f) sw.f = lw.f;
        if (!sw.s && lw.s) sw.s = lw.s;
      });
    });
    return sheetData;
  }

  function loadLevel(level) {
    var loc = localLevelData(level);
    var cached = readCache(LEVEL_KEY + level);
    if (cached) return Promise.resolve(mergeWithLocal(cached, loc));
    var url = gasUrl();
    if (loc) {
      if (url && sheetVocabReady) {
        fetchJson(withParams(url, 'action=getVocab&level=' + encodeURIComponent(level))).then(function (data) {
          if (data && data.type === 'vocabLevel' && Array.isArray(data.books) && data.books.length) {
            writeCache(LEVEL_KEY + level, mergeWithLocal(data, loc));
          }
        }).catch(function () {});
      }
      return Promise.resolve(loc);
    }
    if (!url) return Promise.reject(new Error('no vocab source'));
    return fetchJson(withParams(url, 'action=getVocab&level=' + encodeURIComponent(level))).then(function (data) {
      if (data && data.type === 'vocabLevel' && Array.isArray(data.books) && data.books.length) {
        var merged = mergeWithLocal(data, loc);
        writeCache(LEVEL_KEY + level, merged);
        return merged;
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
        gradeBand: targetLv,
        onFinish: function (r) {
          b.vocabDone = true;
          onFinish(b, target, r, targetLv);
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
      var gb = grade || (matchedBook ? levelLabel(matchedBook.level) : defaultBookLevel());
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

  // ---------- 오답 개수 정밀 파싱 ('10/2' -> 2, '10문제 중 1개' -> 1, '10080' 문자열 결합 버그 원천 차단) ----------
  function parseErrorCount(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    // '10/2' 또는 '15 / 3' 형태 (총문항/오답개수)인 경우 슬래시 뒤 숫자를 오답 개수로 추출
    var slashMatch = s.match(/^\s*(\d+)\s*\/\s*(\d+)/);
    if (slashMatch) {
      var n1 = parseInt(slashMatch[1], 10);
      var n2 = parseInt(slashMatch[2], 10);
      if (n2 <= n1 && n2 < 50) return n2;
      return n1 < 50 ? n1 : 0;
    }
    // '10문제 중 2개' 또는 '오답 3' 형태인 경우 마지막 작은 숫자를 추출
    var jungMatch = s.match(/중\s*(\d+)/);
    if (jungMatch) return parseInt(jungMatch[1], 10) || 0;
    // 일반 숫자 추출 (첫 번째 독립 숫자만 추출하여 숫자들이 이어붙는 현상 방지)
    var numMatch = s.match(/(\d+)/);
    if (!numMatch) return 0;
    var val = parseInt(numMatch[1], 10);
    return (isNaN(val) || val > 200) ? 0 : val;
  }

  function normalizeHwStatus(hw) {
    var s = String(hw || '').trim().replace(/\s+/g, '');
    if (s === '완료' || s === '숙제완료') return '숙제완료';
    if (s === '미완료' || s === '미완' || s === '숙제미완료' || s === '숙제미완') return '숙제미완';
    if (s === '미지참' || s === '교재미지참') return '미지참';
    if (s === '학원에서풀기' || s === '학원풀이') return '학원에서풀기';
    return String(hw || '').trim();
  }

  function normalizeUnderstanding(u) {
    var s = String(u || '').trim();
    if (s === '어려웠어요' || s === '헷갈려요') return '아직 헷갈려요';
    return s;
  }

  // ---------- 결과 저장 (어휘오답 도배 줄 생성 중단, 어휘퀴즈 1줄에 틀린어휘 통합) ----------
  function onFinish(b, target, r, gradeBand) {
    var name = cleanName(state.currentStudent);
    var date = today();
    if (!state.missions.vocabResults) state.missions.vocabResults = [];
    var wrongCnt = r.wrongCount != null ? r.wrongCount : Math.max(0, (r.total || 0) - (r.firstCorrect || 0));
    var retryCnt = r.retryCount != null ? r.retryCount : wrongCnt;
    var gb = gradeBand || ((/^(초|중)/.test(String(b.level || ''))) ? b.level : levelLabel(b.level));
    var cleanedWrong = (r.wrongWords || []).filter(function (w) {
      var s = String(w || '').trim();
      return s && s !== '짝짓기' && s !== '(짝짓기)';
    });
    var entry = {
      bookId: b.id, title: target.title, level: b.level, gradeBand: gb,
      total: r.total, firstCorrect: r.firstCorrect, wrongCount: wrongCnt, retryCount: retryCnt,
      rate: r.rate, wrongWords: cleanedWrong
    };
    state.missions.vocabResults = state.missions.vocabResults.filter(function (x) { return x.bookId !== b.id; });
    state.missions.vocabResults.push(entry);
    try { B.renderBanner(); } catch (e) { /* 무시 */ }
    try { if (typeof updateProgress === 'function') updateProgress(500); else if (typeof saveActiveSession === 'function') saveActiveSession(); } catch (e) { /* 무시 */ }
    var hwStatus = normalizeHwStatus(state.missions.hwStatus);
    var step1Memo = String(state.missions.step1Memo || '').trim();
    var records = [{
      date: date,
      type: '어휘퀴즈',
      hwStatus: hwStatus,
      step1Memo: step1Memo,
      level: gb,
      book: target.title,
      total: r.total,
      firstCorrect: r.firstCorrect,
      rate: r.rate,
      wrongWords: cleanedWrong.join(', ')
    }];
    send(name, records);
  }

  // 수업내용(K열)에 남길 요약 한 줄
  B.summaryText = function () {
    var list = (state.missions && state.missions.vocabResults) || [];
    if (!list.length) return '';
    return list.map(function (r) {
      var s = '[어휘] ' + B.formatResult(r) + ' 『' + r.title + '』';
      if (r.wrongWords && r.wrongWords.length) s += ' 오답:' + r.wrongWords.slice(0, 3).join(', ') + (r.wrongWords.length > 3 ? ' 외 ' + (r.wrongWords.length - 3) : '');
      return s;
    }).join(' / ');
  };

  // ---------- 하원 시: 23열 방식 1(첫 줄 가로 병합 + 추가 활동 시 2·3번째 줄 확장) 전체 데이터 구성 ----------
  B.buildCheckoutRecords = function (student, missions, date) {
    date = date || today();
    var name = cleanName(student);
    var out = [];
    if (!missions) return out;

    var hwStatus = normalizeHwStatus(missions.hwStatus);
    var hwBook = String(missions.hwBook || '').trim();
    var rawStep1 = String(missions.step1Memo || '').trim();
    var step1Memo = hwBook ? ('[' + hwBook + '] ' + rawStep1).trim() : rawStep1;
    var step2Memo = String(missions.step2Memo || '').trim();
    var step3Memo = String(missions.step3Memo || '').trim();
    var step4Memo = String(missions.step4Memo || '').trim();
    var literacyMemo = [step3Memo, step4Memo].filter(Boolean).join(' / ');
    var reflection = String(missions.studentReflection || '').trim();

    // 1) 당일 기본 메타(숙제현황, 성실발자국, 독서발자국, 문해력발자국, 나의 시간 나의 기록) 레코드
    if (hwStatus || step1Memo || step2Memo || literacyMemo || reflection) {
      out.push({
        date: date,
        type: '일일요약',
        hwStatus: hwStatus,
        step1Memo: step1Memo,
        step2Memo: step2Memo,
        literacyMemo: literacyMemo,
        reflection: reflection
      });
    }

    // 2) 어휘퀴즈 결과 (혹시 중간 전송이 누락되었더라도 하원 시 가로 병합 보장)
    (missions.vocabResults || []).forEach(function (vr) {
      out.push({
        date: date,
        type: '어휘퀴즈',
        level: vr.gradeBand || levelLabel(vr.level),
        book: vr.title,
        total: vr.total,
        firstCorrect: vr.firstCorrect,
        rate: vr.rate,
        wrongWords: (vr.wrongWords || []).join(', ')
      });
    });

    // 3) 2단계 도서 및 진단점수 (도서별 메모 포함, 같은 도서명이면 어휘퀴즈와 같은 줄에 자동 매칭됨)
    (missions.books || []).forEach(function (b) {
      var title = String(b.title || '').trim();
      var score = String(b.score == null ? '' : b.score).trim();
      var status = String(b.status || '').trim();
      var bMemo = String(b.memo || '').trim();
      if (!title && !score && !bMemo) return;
      var bookNoteParts = [];
      if (status && status !== '진단완료') bookNoteParts.push('[' + status + ']');
      if (bMemo) bookNoteParts.push(bMemo);
      if (step2Memo) bookNoteParts.push(step2Memo);
      out.push({
        date: date,
        type: '진단',
        level: levelLabel(b.level || b.course || ''),
        book: title,
        score: score,
        step2Memo: bookNoteParts.join(' ')
      });
    });

    // 4) 3단계 집중 트레이닝 (문해력트레이닝 내 비문학·문학·문법 등 다중 항목도 각각 1건씩 분리하여 통계 오류 0% 보장)
    var VALID_TRAINING_TYPES = ['읽기트레이닝', '독해트레이닝', '듣기트레이닝', '문해력트레이닝', '오답수정+선지분석', '독해밀도', '개념밀도'];
    function normalizeTrainingTypeName(rawT) {
      var s = String(rawT || '').trim();
      if (VALID_TRAINING_TYPES.indexOf(s) !== -1) return s;
      if (s === '듣트' || /^(듣기|문학교훈|시사상식|인물역사|고사성어)/.test(s)) return '듣기트레이닝';
      if (s === '문해력' || /^(복합|비문학|문학|문법|어휘|음독)/.test(s)) return '문해력트레이닝';
      if (s === '읽트' || /^(\d+권|읽기|정독)/.test(s)) return '읽기트레이닝';
      if (s === '독트' || /^독해/.test(s)) return '독해트레이닝';
      if (/오답수정|선지분석/.test(s)) return '오답수정+선지분석';
      return '문해력트레이닝';
    }

    var details = missions.trainingDetails || {};
    (missions.trainingTypes || []).forEach(function (rawT) {
      var d = details[rawT] || {};
      var t = normalizeTrainingTypeName(rawT);
      var under = normalizeUnderstanding(d.understanding || missions.trainingUnderstanding || '');
      if (t === '문해력트레이닝') {
        var items = Array.isArray(d.items) ? d.items.slice() : [];
        var hasDraftSession = String(d.session || '').trim() !== '';
        var hasDraftScore = (d.errors !== undefined && String(d.errors).trim() !== '') ||
                            (d.readTotal !== undefined && String(d.readTotal).trim() !== '') ||
                            (d.litVocabTotal !== undefined && String(d.litVocabTotal).trim() !== '');
        // [재발방지] 차시(session)가 입력되었거나, 확정 목록(items)이 비어있는데 문항/오답 점수가 입력된 경우에만 드래프트 항목 합류 (기본값 '비문학 1단계' 유령 합류 및 드롭다운 변경 중 파편화 원천 차단)
        if ((hasDraftSession || (items.length === 0 && hasDraftScore)) &&
            !items.some(function (it) { return it.field === d.field && it.vol === d.vol && String(it.session || '').trim() === String(d.session || '').trim(); })) {
          items.push({
            field: d.field || '비문학',
            vol: d.vol || '1단계',
            session: d.session,
            errors: d.errors,
            readTotal: d.readTotal,
            readWrong: d.readWrong,
            litVocabTotal: d.litVocabTotal,
            litVocabWrong: d.litVocabWrong,
            litAccuracy: d.litAccuracy,
            isCompleted: d.isCompleted
          });
        }
        // 미완성 중간 파편(차시도 없고 점수도 없는 단순 드롭다운 변경값) 필터링
        items = items.filter(function (it) {
          var s = String(it.session || '').trim();
          var hasSc = (it.errors !== undefined && String(it.errors).trim() !== '') ||
                      (it.readTotal !== undefined && String(it.readTotal).trim() !== '') ||
                      (it.litVocabTotal !== undefined && String(it.litVocabTotal).trim() !== '');
          return s !== '' || hasSc;
        });
        if (!items.length) {
          if (under || literacyMemo) {
            out.push({ date: date, type: '트레이닝', training: t, detail: '', errors: 0, understanding: under, literacyMemo: literacyMemo });
          }
        } else {
          // 중복 누적 방지: 종목+교재별로 최종 확정된 레코드로 정제
          var litMap = {};
          items.forEach(function (it) {
            var k = (it.field || '복합') + '_' + (it.vol || '');
            litMap[k] = it;
          });
          var uniqueItems = Object.keys(litMap).map(function(k) { return litMap[k]; });
          uniqueItems.forEach(function (it) {
            var rawSess = String(it.session || "").trim();
            var sessPart = "";
            if (rawSess) {
              sessPart = (rawSess.indexOf("차시") !== -1 || rawSess.indexOf("일차") !== -1 || rawSess.indexOf("강") !== -1) ? rawSess : (rawSess + "차시");
            }
            var det = [it.field, it.vol, sessPart].filter(Boolean).join(' ');
            var rT = (it.readTotal !== undefined && it.readTotal !== "") ? Number(it.readTotal) : "";
            var rW = (it.readWrong !== undefined && it.readWrong !== "") ? Number(it.readWrong) : "";
            var vT = (it.litVocabTotal !== undefined && it.litVocabTotal !== "") ? Number(it.litVocabTotal) : "";
            var vW = (it.litVocabWrong !== undefined && it.litVocabWrong !== "") ? Number(it.litVocabWrong) : "";
            var totalQ = (Number(rT) || 0) + (Number(vT) || 0);
            var totalW = (rW !== "" || vW !== "") ? ((Number(rW) || 0) + (Number(vW) || 0)) : parseErrorCount(it.errors);
            var acc = (it.litAccuracy !== undefined && it.litAccuracy !== "")
              ? Number(it.litAccuracy)
              : (totalQ > 0 ? Math.round(((totalQ - totalW) / totalQ) * 100) : "");
            out.push({
              date: date,
              type: '트레이닝',
              training: t,
              detail: det,
              textbookTitle: it.vol || '',
              category: it.field || '비문학',
              session: rawSess,
              errors: totalW,
              readTotal: rT,
              readWrong: rW,
              litVocabTotal: vT,
              litVocabWrong: vW,
              litAccuracy: acc,
              isCompleted: !!it.isCompleted,
              understanding: under,
              literacyMemo: literacyMemo
            });
          });
        }
      } else if (t === '오답수정+선지분석') {
        var its = Array.isArray(d.items) ? d.items.slice() : [];
        var hasFixInput = String(d.errors || '').trim() !== '' || String(d.fixed || '').trim() !== '';
        if (hasFixInput && !its.some(function (it) { return it.field === d.field && it.errors === d.errors && it.fixed === d.fixed; })) {
          its.push({ field: d.field || '복합', errors: d.errors, fixed: d.fixed });
        }
        if (!its.length) {
          if (under || literacyMemo) {
            out.push({ date: date, type: '트레이닝', training: t, detail: '', errors: 0, understanding: under, literacyMemo: literacyMemo });
          }
        } else {
          var fixMap = {};
          its.forEach(function (it) {
            var k = it.field || '복합';
            fixMap[k] = it;
          });
          var uniqueFixItems = Object.keys(fixMap).map(function(k) { return fixMap[k]; });
          uniqueFixItems.forEach(function (it) {
            var det = [it.field, it.fixed ? '수정:' + it.fixed : ''].filter(Boolean).join(' ');
            out.push({
              date: date,
              type: '트레이닝',
              training: t,
              detail: det,
              errors: parseErrorCount(it.errors),
              understanding: under,
              literacyMemo: literacyMemo
            });
          });
        }
      } else {
        var rawSess2 = String(d.session || "").trim();
        var sessPart2 = "";
        if (rawSess2) {
          sessPart2 = (rawSess2.indexOf("차시") !== -1 || rawSess2.indexOf("일차") !== -1) ? rawSess2 : (rawSess2 + "차시");
        }
        var detailStr = [d.vol, sessPart2].filter(Boolean).join(' ');
        // 권수(vol)만 고르고 아직 차시(session)를 입력하지 않은 중간 상태에서는 불필요한 파편 전송 방지
        if (d.vol && !rawSess2 && !d.errors && !under) {
          return;
        }
        out.push({
          date: date,
          type: '트레이닝',
          training: t,
          detail: detailStr,
          errors: parseErrorCount(d.errors),
          understanding: under,
          literacyMemo: literacyMemo
        });
      }
    });

    return out;
  };

  // 독해밀도·개념밀도 등 외부 서랍 모듈에서 학습기록 시트로 즉시 전송할 수 있는 공용 함수
  B.sendCustomRecord = function (recordObj) {
    if (!recordObj) return Promise.resolve();
    var studentName = recordObj.name || cleanName(state && state.currentStudent);
    if (!studentName) return Promise.resolve();
    var rec = Object.assign({ date: today() }, recordObj);
    return send(studentName, [rec]);
  };

  B.checkout = function (student, missions) {
    var recs = B.buildCheckoutRecords(student, missions, today());
    if (recs.length) return send(cleanName(student), recs);
    return Promise.resolve();
  };

  B.queuePendingRecords = function (studentName, records) {
    if (!studentName || !Array.isArray(records) || !records.length) return;
    var p = loadPending();
    p.push({ name: String(studentName).replace(/\s+/g, ''), records: records });
    savePending(p);
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

  function sessionIsoDate(parsed) {
    if (parsed && parsed.savedAt) {
      var d = new Date(Number(parsed.savedAt));
      if (!isNaN(d.getTime())) {
        var m = d.getMonth() + 1, day = d.getDate();
        return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
      }
    }
    if (parsed && parsed.date) {
      var mMd = String(parsed.date).match(/(\d{1,2})[\/\.](\d{1,2})/);
      if (mMd) {
        var yr = new Date().getFullYear();
        var mm = parseInt(mMd[1], 10), dd = parseInt(mMd[2], 10);
        return yr + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd);
      }
    }
    return today();
  }

  function flushSavedBrowserSessions() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k === 'active_student_session' || k.indexOf('last_completed_session_') === 0) {
          var raw = localStorage.getItem(k);
          if (!raw) continue;
          var parsed = JSON.parse(raw);
          if (parsed && parsed.student && parsed.missions && !parsed.vocabFlushed) {
            var iso = sessionIsoDate(parsed);
            var recs = B.buildCheckoutRecords(parsed.student, parsed.missions, iso);
            if (recs.length) {
              send(cleanName(parsed.student), recs);
              if (k.indexOf('last_completed_session_') === 0) {
                parsed.vocabFlushed = true;
                try { localStorage.setItem(k, JSON.stringify(parsed)); } catch (e) {}
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  B.init = function () {
    B.flushPending();
    setTimeout(flushSavedBrowserSessions, 800);
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
