// api.js - SheetAPI Class to handle Google Sheets communication
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
          if (Array.isArray(data)) {
            // Backward compatibility
            this.app.state.students = data;
            this.app.students = data;
          } else {
            this.app.state.students = data.students || [];
            this.app.state.dailyLogs = data.dailyLogs || [];
            this.app.state.textbooks = data.textbooks || [];
            this.app.state.consultations = data.consultations || [];
            this.app.state.memberAnalysis = data.memberAnalysis || [];
            this.app.state.attendanceLogs = data.attendanceLogs || [];
            this.app.state.accumulatedLogs = data.accumulatedLogs || [];
            this.app.students = this.app.state.students;
          }
          
          this.app.saveState();
          this.app.sheetSim.setData(this.app.state);
          this.app.dashboardManager.updateDashboard();
          this.app.dashboardManager.updateQuickSchedules();
          
          if (this.app.crmManager.currentCrmStudentName) {
            this.app.crmManager.loadCrmStudent(this.app.crmManager.currentCrmStudentName);
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
