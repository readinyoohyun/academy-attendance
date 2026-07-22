// api.js - SheetAPI Class to handle Google Sheets communication

// Proxy Google Apps Script calls through Vercel serverless function on non-file protocols
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
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
  }
  
  get gasWebhookUrl() {
    return this.app.gasWebhookUrl;
  }
  
  fetchFromGoogleSheets(isManual = false) {
    if (!this.gasWebhookUrl) {
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
    const originalText = loadBtn ? loadBtn.innerHTML : "구글시트 불러오기";
    if (loadBtn) {
      loadBtn.innerHTML = "⏱️ 동기화 중...";
      loadBtn.disabled = true;
    }

    const separator = this.gasWebhookUrl.indexOf("?") !== -1 ? "&" : "?";
    const cacheBusterUrl = this.gasWebhookUrl + separator + "_t=" + Date.now();

    fetch(cacheBusterUrl)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object') {
          let incomingStudents = [];
          let incomingDailyLogs = [];
          let incomingTextbooks = [];
          let incomingConsultations = [];
          let incomingMemberAnalysis = [];
          let incomingAttendanceLogs = [];
          let incomingAccumulatedLogs = [];

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
          }

          // Compare data to see if anything actually changed
          const oldDataStr = JSON.stringify({
            students: this.app.state.students || [],
            dailyLogs: this.app.state.dailyLogs || [],
            textbooks: this.app.state.textbooks || [],
            consultations: this.app.state.consultations || [],
            memberAnalysis: this.app.state.memberAnalysis || [],
            attendanceLogs: this.app.state.attendanceLogs || [],
            accumulatedLogs: this.app.state.accumulatedLogs || []
          });

          const newDataStr = JSON.stringify({
            students: incomingStudents,
            dailyLogs: incomingDailyLogs,
            textbooks: incomingTextbooks,
            consultations: incomingConsultations,
            memberAnalysis: incomingMemberAnalysis,
            attendanceLogs: incomingAttendanceLogs,
            accumulatedLogs: incomingAccumulatedLogs
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
          
          if (isManual) {
            alert(`성공적으로 구글 시트에서 전체 데이터를 동기화했습니다!`);
          }
        } else {
          if (isManual) {
            alert("시트에서 데이터를 읽어오지 못했습니다. 스프레드시트 탭 이름을 확인해 주세요.");
          }
        }
      })
      .catch(err => {
        console.error("Fetch Google Sheets Error: ", err);
        if (isManual) {
          alert("구글 시트 데이터를 가져오는데 실패했습니다. 웹 앱 배포 권한을 다시 한번 확인해 주세요.");
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

  updateFieldInGoogleSheets(row, field, value, datasetKey = "students") {
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
        value: value
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
    fetch(this.gasWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addConsultation",
        grade: evalObj.grade || "",
        name: evalObj.name,
        period: evalObj.period,
        author: evalObj.author,
        content: evalObj.content,
        needs: evalObj.needs
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
}
