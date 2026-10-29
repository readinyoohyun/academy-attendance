// api.js - SheetAPI Class to handle Google Sheets communication

// Proxy Google Apps Script calls through Vercel serverless function on non-file protocols
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.__directFetch = originalFetch.bind(window);
  window.fetch = function(input, init) {
    if (typeof input === 'string' && input.indexOf('https://script.google.com') === 0 && window.location.protocol !== 'file:') {
      const proxyUrl = `/api/sync?url=${encodeURIComponent(input)}`;
      return originalFetch(proxyUrl, init);
    }
    return originalFetch(input, init);
  };
}

class SheetAPI {
  constructor(app) {
    this.app = app;
    setTimeout(() => {
      if (!this.gasWebhookUrl) {
        this.updateDiagnosticWidget('error', '구글 Apps Script URL이 설정되지 않았습니다. [연동 가이드] 또는 [패키지 설정] 탭에서 입력해 주세요.');
      } else {
        this.updateDiagnosticWidget('error', '대기 중: 첫 동기화를 시도하고 있습니다.');
      }
    }, 500);
  }

  updateDiagnosticWidget(status, detail, gasVer = '') {
    const dot = document.getElementById("diagnosticStatusDot");
    const txt = document.getElementById("diagnosticStatusText");
    const widget = document.getElementById("diagnosticWidget");
    if (!widget) return;

    const APP_VERSION = "v2.4.0";
    const REQUIRED_GAS_VERSION = "2026.10.29-v2";
    const isGasOutdated = status === 'success' && gasVer !== REQUIRED_GAS_VERSION;

    widget.onclick = () => {
      alert(`📊 [구글 시트 연동 실시간 진단]\n\n` +
            `• 프로그램 버전: ${APP_VERSION}\n` +
            `• 시트 스크립트 버전: ${gasVer || '구버전 (업데이트 필요 ⚠️)'} (권장: ${REQUIRED_GAS_VERSION})\n` +
            `• 상태: ${status === 'success' ? (isGasOutdated ? '연결됨 (시트 스크립트 업데이트 필요 ⚠️)' : '정상 연결됨 🟢') : status === 'timeout' ? '연결 시간 초과 🟡' : '연동 실패/설정 오류 🔴'}\n` +
            `• 웹앱 URL: ${this.gasWebhookUrl || '미설정됨'}\n` +
            `• 상세 정보: ${detail}\n` +
            `• 마지막 동기화 시도: ${new Date().toLocaleTimeString()}\n\n` +
            (isGasOutdated
              ? `⚠️ [중요 안내] 구글 시트의 Apps Script가 구버전입니다!\n[실제 구글 시트 연동 가이드] 탭에서 최신 코드를 복사하여 구글 시트 [확장 프로그램 > Apps Script]에 붙여넣고 [새 배포]를 진행해 주시면 출석부 자동 생성 및 학습기록 열 정렬이 완벽히 작동합니다.`
              : `💡 팁: 무한 대기가 발생하거나 빨간색 표시가 뜨면 [연동 가이드] 탭의 지침에 따라 구글 시트의 최신 웹앱 URL을 복사하여 [패키지 설정]에 저장해 주세요.`));
    };

    if (status === 'success') {
      if (isGasOutdated) {
        if (dot) { dot.style.background = "#f59e0b"; }
        if (txt) { txt.innerText = `시트 스크립트 업데이트 필요 (${APP_VERSION})`; txt.style.color = "#fde68a"; }
      } else {
        if (dot) { dot.style.background = "#10b981"; }
        if (txt) { txt.innerText = `정상 연결됨 (${APP_VERSION})`; txt.style.color = "#cbd5e1"; }
      }
    } else if (status === 'timeout') {
      if (dot) { dot.style.background = "#eab308"; }
      if (txt) { txt.innerText = `연동 시간 초과 (15초) (${APP_VERSION})`; txt.style.color = "#fef08a"; }
    } else {
      if (dot) { dot.style.background = "#ef4444"; }
      if (txt) { txt.innerText = `연동 실패 / 오류 (${APP_VERSION})`; txt.style.color = "#fecaca"; }
    }
  }

  sanitizeLearningRecordsClientSide(records) {
    if (!Array.isArray(records)) return [];
    const VALID_TYPES = [
      '읽기트레이닝', '문해력트레이닝', '독해트레이닝', '어휘트레이닝',
      '학교공부트레이닝', '듣기트레이닝', '오답수정+선지분석'
    ];
    return records.map(rec => {
      if (!rec || typeof rec !== 'object') return rec;
      const r = Object.assign({}, rec);
      Object.keys(r).forEach(k => {
        if (String(r[k]).trim() === '-') r[k] = '';
      });
      let tr = String(r.training || '').trim();
      let dt = String(r.detail || '').trim();
      if (tr && !VALID_TYPES.includes(tr)) {
        let inferred = '문해력트레이닝';
        if (tr.indexOf('읽기트레이닝') === 0 || tr.indexOf('읽트') === 0 || /^\d+\s*권/.test(tr)) {
          inferred = '읽기트레이닝';
        } else if (tr.indexOf('독해트레이닝') === 0 || tr.indexOf('독해밀도') !== -1) {
          inferred = '독해트레이닝';
        } else if (tr.indexOf('어휘트레이닝') === 0) {
          inferred = '어휘트레이닝';
        } else if (tr.indexOf('학교공부') === 0 || tr.indexOf('내신') === 0) {
          inferred = '학교공부트레이닝';
        } else if (tr.indexOf('듣기') === 0) {
          inferred = '듣기트레이닝';
        } else if (tr.indexOf('오답') === 0 || tr.indexOf('선지') !== -1) {
          inferred = '오답수정+선지분석';
        }
        const stripped = tr.replace(/^(읽기트레이닝|문해력트레이닝|독해트레이닝|어휘트레이닝|학교공부트레이닝|듣기트레이닝|오답수정\+선지분석|읽트)\s*/, '').trim();
        if (!dt || dt === tr) {
          dt = stripped || tr;
        }
        tr = inferred;
      }
      const sm = dt.match(/\(독해\s*(\d+)\s*\/\s*(\d+)(?:\s*[·,\s]\s*어휘\s*(\d+)\s*\/\s*(\d+))?(?:\s*[·,\s]\s*(\d+(?:\.\d+)?)%)?\)/);
      if (sm) {
        if (r.readTotal === '' || r.readTotal === undefined) r.readTotal = Number(sm[1]);
        if (r.readWrong === '' || r.readWrong === undefined) r.readWrong = Number(sm[2]);
        if (sm[3] !== undefined && (r.vocabTotal === '' || r.vocabTotal === undefined)) r.vocabTotal = Number(sm[3]);
        if (sm[4] !== undefined && (r.vocabWrong === '' || r.vocabWrong === undefined)) r.vocabWrong = Number(sm[4]);
        if (sm[5] !== undefined && (r.totalAccuracy === '' || r.totalAccuracy === undefined)) r.totalAccuracy = Number(sm[5]) + '%';
        dt = dt.replace(sm[0], '').trim();
      }
      r.training = tr;
      r.detail = dt;
      return r;
    });
  }
  
  get gasWebhookUrl() {
    return this.app.gasWebhookUrl;
  }
  
  fetchFromGoogleSheets(isManual = false) {
    if (!this.gasWebhookUrl) {
      this.updateDiagnosticWidget('error', '구글 Apps Script URL이 설정되지 않았습니다.');
      if (isManual) {
        alert("구글 Apps Script URL이 설정되지 않았습니다. [실제 구글 시트 연동 가이드] 탭에서 입력해 주세요.");
      }
      return;
    }
    
    console.log("Fetching datasets from Google Sheets...");
    
    const syncIndicator = document.getElementById("syncStatusIndicator");
    if (syncIndicator) {
      syncIndicator.style.display = "inline-flex";
    }
    
    const loadBtn = document.getElementById("btnSyncGoogleSheets");
    if (loadBtn && loadBtn.disabled) {
      console.log("Sync already in progress. Skipping duplicate fetch call.");
      return;
    }
    const originalText = (loadBtn && loadBtn.innerHTML && !loadBtn.innerHTML.includes("동기화")) ? loadBtn.innerHTML : "구글시트 불러오기";
    if (loadBtn) {
      loadBtn.innerHTML = "⏱️ 동기화 중...";
      loadBtn.disabled = true;
    }

    const separator = this.gasWebhookUrl.indexOf("?") !== -1 ? "&" : "?";
    const cacheBusterUrl = this.gasWebhookUrl + separator + "_t=" + Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    fetch(cacheBusterUrl, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId);
        if (data && typeof data === 'object') {
          let incomingStudents = [];
          let incomingDailyLogs = [];
          let incomingTextbooks = [];
          let incomingConsultations = [];
          let incomingMemberAnalysis = [];
          let incomingAttendanceLogs = [];
          let incomingAccumulatedLogs = [];
          let incomingBriefings = [];
          let incomingLearningRecords = [];

          if (Array.isArray(data)) {
            incomingStudents = data;
          } else {
            incomingStudents = data.students || [];
            incomingDailyLogs = data.dailyLogs || [];
            incomingTextbooks = data.textbooks || [];
            incomingConsultations = data.consultations || [];
            incomingMemberAnalysis = data.memberAnalysis || [];
            incomingAttendanceLogs = data.attendanceLogs || [];
            incomingAccumulatedLogs = data.accumulatedLogs || [];
            incomingBriefings = data.briefings || [];
            incomingLearningRecords = this.sanitizeLearningRecordsClientSide(data.learningRecords || []);
          }

          // Compare data to see if anything actually changed
          const oldDataStr = JSON.stringify({
            students: this.app.state.students || [],
            dailyLogs: this.app.state.dailyLogs || [],
            textbooks: this.app.state.textbooks || [],
            consultations: this.app.state.consultations || [],
            memberAnalysis: this.app.state.memberAnalysis || [],
            attendanceLogs: this.app.state.attendanceLogs || [],
            accumulatedLogs: this.app.state.accumulatedLogs || [],
            briefings: this.app.state.briefings || [],
            learningRecords: this.app.state.learningRecords || []
          });

          const newDataStr = JSON.stringify({
            students: incomingStudents,
            dailyLogs: incomingDailyLogs,
            textbooks: incomingTextbooks,
            consultations: incomingConsultations,
            memberAnalysis: incomingMemberAnalysis,
            attendanceLogs: incomingAttendanceLogs,
            accumulatedLogs: incomingAccumulatedLogs,
            briefings: incomingBriefings,
            learningRecords: incomingLearningRecords
          });

          if (oldDataStr !== newDataStr) {
            console.log("Data changed. Re-rendering dashboard and sheet...");
            this.app.state.students = incomingStudents;
            this.app.state.dailyLogs = incomingDailyLogs;
            this.app.state.textbooks = incomingTextbooks;
            this.app.state.consultations = incomingConsultations;
            this.app.state.memberAnalysis = incomingMemberAnalysis;
            this.app.state.attendanceLogs = incomingAttendanceLogs;
            this.app.state.accumulatedLogs = incomingAccumulatedLogs;
            this.app.state.briefings = incomingBriefings;
            this.app.state.learningRecords = incomingLearningRecords;
            this.app.students = this.app.state.students;

            this.app.saveState();
            this.app.sheetSim.setData(this.app.state);
            this.app.dashboardManager.updateDashboard();
            this.app.dashboardManager.updateQuickSchedules();
            
            if (this.app.crmManager.currentCrmStudentName) {
              this.app.crmManager.loadCrmStudent(this.app.crmManager.currentCrmStudentName);
            }
          } else {
            console.log("No data change detected. Skipping re-render.");
          }
          
          const remoteGasVersion = (data && !Array.isArray(data) && data.gasVersion) ? String(data.gasVersion) : '';
          this.updateDiagnosticWidget('success', '구글 시트와 정상적으로 동기화가 이루어졌습니다.', remoteGasVersion);

          // [자가복구] 오전 6시~오후 5시 59분 사이에 오늘 출석부 날짜가 이전 날짜(어제 등)로 멈춰 있으면 자동으로 누적 백업 및 오늘 출석부 생성 실행
          try {
            const nowKr = new Date();
            const krHour = nowKr.getHours();
            const isSunday = nowKr.getDay() === 0;
            if (krHour >= 6 && krHour < 18 && !isSunday) {
              const todayM = nowKr.getMonth() + 1;
              const todayD = nowKr.getDate();
              const todayKey = `${todayM}/${todayD}`;
              let isStaleDailySheet = false;
              if (!incomingDailyLogs || incomingDailyLogs.length === 0) {
                isStaleDailySheet = (incomingStudents && incomingStudents.length > 0);
              } else {
                const firstDateStr = String(incomingDailyLogs[0].date || '').trim();
                const dm = firstDateStr.match(/(\d+)[\/\.](\d+)/);
                if (dm) {
                  const logM = parseInt(dm[1], 10);
                  const logD = parseInt(dm[2], 10);
                  if (logM !== todayM || logD !== todayD) {
                    isStaleDailySheet = true;
                  }
                }
              }
              if (isStaleDailySheet && this._autoRolloverTriggeredDate !== todayKey) {
                this._autoRolloverTriggeredDate = todayKey;
                console.log(`[Auto-Rollover] Stale dailyLogs detected (${incomingDailyLogs[0] && incomingDailyLogs[0].date} != ${todayKey}). Triggering generateDailyAttendance...`);
                this.app.showToast("🔄 이전 출석부를 누적 관리 시트로 백업하고 오늘 출석부를 자동 생성합니다...");
                this.forceGenerateDailyAttendance(true);
              }
            }
          } catch (autoRollErr) {
            console.warn("Auto rollover check error:", autoRollErr);
          }

          if (isManual) {
            alert(`성공적으로 구글 시트에서 전체 데이터를 동기화했습니다!`);
          }
        } else {
          this.updateDiagnosticWidget('error', '구글 시트로부터 빈 데이터 또는 유효하지 않은 응답을 받았습니다.');
          if (isManual) {
            alert("시트에서 데이터를 읽어오지 못했습니다. 스프레드시트 탭 이름을 확인해 주세요.");
          }
        }
      })
      .catch(err => {
        if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
        console.error("Fetch Google Sheets Error: ", err);
        if (err.name === 'AbortError') {
          this.updateDiagnosticWidget('timeout', '구글 시트 웹앱이 15초 동안 응답하지 않아 연동 시간 초과 처리되었습니다. 배포 시 액세스 권한을 [Anyone](모든 사람)으로 지정했는지 확인해 주세요.');
          if (isManual) {
            alert("구글 시트 연동 시간이 초과되었습니다. 웹 앱 배포 권한이나 URL 주소를 확인해 주세요. (15초 제한)");
          }
        } else {
          this.updateDiagnosticWidget('error', '네트워크 연결 오류 또는 CORS 제한으로 데이터 로드에 실패했습니다. 에러내용: ' + err.message);
          if (isManual) {
            alert("구글 시트 데이터를 가져오는데 실패했습니다. 웹 앱 배포 권한을 다시 한번 확인해 주세요.");
          }
        }
      })
      .finally(() => {
        if (loadBtn) {
          loadBtn.innerHTML = originalText;
          loadBtn.disabled = false;
        }
        const syncIndicator = document.getElementById("syncStatusIndicator");
        if (syncIndicator) {
          syncIndicator.style.display = "none";
        }
      });
  }

  updateFieldInGoogleSheets(row, field, value, datasetKey = "students", name = "", date = "", time = "") {
    if (!this.gasWebhookUrl) return;

    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "update",
        tab: datasetKey,
        row: row,
        field: field,
        value: value,
        name: name,
        date: date,
        time: time
      })
    })
    .then(() => {
      console.log(`Google Sheets update sent: Tab ${datasetKey}, Row ${row}, ${field} = ${value}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Update sheet failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  updateBatchInGoogleSheets(updates) {
    if (!this.gasWebhookUrl || !updates || updates.length === 0) return;

    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "batchUpdate",
        updates: updates
      })
    })
    .then(() => {
      console.log(`Google Sheets batch update sent: ${updates.length} updates`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Batch update sheet failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  addStudentToGoogleSheets(student) {
    if (!this.gasWebhookUrl) return;

    let day = "월요일";
    let startTime = "";
    Object.keys(student.times).forEach(d => {
      if (student.times[d]) {
        day = d;
        startTime = student.times[d];
      }
    });

    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "add",
        name: student.name,
        grade: student.grade,
        classes: student.classes,
        day: day,
        startTime: startTime,
        makeupDate: student.makeupDate || ""
      })
    })
    .then(() => {
      console.log(`Google Sheets student add request sent: ${student.name}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Add student failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  addDailyLogToGoogleSheets(log) {
    if (!this.gasWebhookUrl) return;

    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "addDailyLog",
        date: log.date,
        time: log.time,
        name: log.name,
        notes: log.notes || "",
        status: log.status || "대기",
        inTime: log.inTime || "",
        reason: log.reason || "",
        number: log.number || "",
        event: log.event || "",
        grammarDone: log.grammarDone || "",
        contents: log.contents || ""
      })
    })
    .then(() => {
      console.log(`Google Sheets daily log add request sent: ${log.name}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Add daily log failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  addTextbookToGoogleSheets(book) {
    if (!this.gasWebhookUrl) return;
    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addTextbook",
        name: book.name,
        grade: book.grade,
        category: book.category,
        title: book.title,
        startDate: book.startDate,
        endDate: book.endDate || "",
        accuracy: book.accuracy || ""
      })
    })
    .then(() => {
      console.log(`Google Sheets textbook add sent: ${book.title}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Add textbook failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  addConsultationToGoogleSheets(evalObj) {
    if (!this.gasWebhookUrl) return;
    const dateObj = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = String(dateObj.getFullYear());
    const mm = String(dateObj.getMonth() + 1);
    const dd = pad(dateObj.getDate());
    const dateStr = evalObj.date || `${yyyy}.${pad(mm)}.${dd}`;

    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addConsultation",
        grade: evalObj.grade || "",
        name: evalObj.name,
        date: dateStr,
        period: evalObj.period || dateStr,
        author: evalObj.author || "",
        content: evalObj.content,
        needs: evalObj.needs || "",
        year: evalObj.year || yyyy,
        month: evalObj.month || mm
      })
    })
    .then(() => {
      console.log(`Google Sheets consultation add sent: ${evalObj.name}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Add consultation failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  addMemberAnalysisToGoogleSheets(member) {
    if (!this.gasWebhookUrl) return;
    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addMemberAnalysis",
        num: member.num || "",
        name: member.name,
        grade: member.grade || "",
        regDate: member.regDate || "",
        consultation: member.consultation || "",
        notes: member.notes || "",
        progress: member.progress || "",
        levelUp: member.levelUp || "",
        levelChange: member.levelChange || "",
        grammarDone: member.grammarDone || "",
        readingTest: member.readingTest || "",
        bookPlan: member.bookPlan || "",
        analysisSent: member.analysisSent || "",
        readMethod: member.readMethod || "",
        studentId: member.studentId || "",
        phone: member.phone || ""
      })
    })
    .then(() => {
      console.log(`Google Sheets memberAnalysis add sent: ${member.name}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Add memberAnalysis failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  deleteFieldInGoogleSheets(row, tabName) {
    if (!this.gasWebhookUrl) return;
    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteRow",
        tab: tabName,
        row: row
      })
    })
    .then(() => {
      console.log(`Google Sheets delete sent: Tab ${tabName}, Row ${row}`);
      this.app.showToast("구글 시트 저장 완료");
    })
    .catch(err => {
      console.error("Delete row failed:", err);
      this.app.showToast("구글 시트 저장 실패", true);
    });
  }

  forceGenerateDailyAttendance(isAuto = false) {
    if (!this.gasWebhookUrl) {
      if (!isAuto) alert("구글 Apps Script URL이 설정되지 않았습니다.");
      return;
    }
    
    const loadBtn = document.getElementById("btnForceGenerateAttendance");
    const originalText = loadBtn ? loadBtn.innerHTML : "오늘 출석부 생성";
    if (loadBtn) {
      loadBtn.innerHTML = "⏱️ 생성 중...";
      loadBtn.disabled = true;
    }

    const directFetch = (typeof window !== 'undefined' && window.__directFetch) ? window.__directFetch : fetch;

    directFetch(this.gasWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "generateDailyAttendance"
      })
    })
    .then(async (res) => {
      try { await res.text(); } catch (e) {}
      this.app.showToast("✔️ 출석부 누적 백업 및 오늘 출석부 생성 완료!");
      this.fetchFromGoogleSheets(false);
      if (!isAuto) {
        alert("구글 시트에 이전 출석부 누적 백업 및 오늘자 출석부 생성이 완료되었습니다!");
      }
    })
    .catch(err => {
      console.error("Force generate attendance failed:", err);
      if (!isAuto) {
        alert("출석부 생성 요청 전송에 실패했습니다: " + err.message);
      }
    })
    .finally(() => {
      if (loadBtn) {
        loadBtn.innerHTML = originalText;
        loadBtn.disabled = false;
      }
    });
  }
}
