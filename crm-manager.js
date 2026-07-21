// crm-manager.js - CRMManager Class to handle student profiles (CRM) & accordions
class CRMManager {
  constructor(app) {
    this.app = app;
    this.crmInitialized = false;
    this.currentCrmStudentName = "";
  }

  escapeHtml(str) {
    return this.app.escapeHtml(str);
  }

  matchKo(text, search) {
    if (!search) return true;
    text = text.toLowerCase();
    search = search.toLowerCase();
    
    const CHO = [
      'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    ];
    
    const isChoOnly = [...search].every(c => CHO.includes(c));
    if (!isChoOnly) {
      return text.includes(search);
    }
    
    let choStr = "";
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i) - 44032;
      if (code >= 0 && code <= 11172) {
        const choIdx = Math.floor(code / 588);
        choStr += CHO[choIdx];
      } else {
        choStr += text.charAt(i);
      }
    }
    
    return choStr.includes(search);
  }

  parseFlexibleDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    // Match YY.MM.DD or YYYY.MM.DD (e.g. 26.06.04 or 2026.06.04 or 26.6.4)
    const m = s.match(/^(\d{2,4})[\./\-](\d{1,2})[\./\-](\d{1,2})/);
    if (m) {
      let year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      if (year < 100) {
        year = 2000 + year; // Convert 26 -> 2026
      }
      return new Date(year, month, day);
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      if (d.getFullYear() < 2000) {
        d.setFullYear(d.getFullYear() + 100);
      }
      return d;
    }
    return null;
  }

  getLastConsultationDays(name) {
    const studentAnal = (this.app.state.consultations || []).filter(a => a && a.name && a.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    let latestDate = null;
    
    studentAnal.forEach(anal => {
      if (anal.period) {
        const d = this.parseFlexibleDate(anal.period);
        if (d && !isNaN(d.getTime())) {
          if (!latestDate || d > latestDate) {
            latestDate = d;
          }
        }
      }
    });

    // Fallback to registration date (등록일) from memberAnalysis if no consultation date
    if (!latestDate) {
      const memberRec = (this.app.state.memberAnalysis || []).find(m => m && m.name && m.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
      if (memberRec && memberRec.regDate) {
        const d = this.parseFlexibleDate(memberRec.regDate);
        if (d && !isNaN(d.getTime())) {
          latestDate = d;
        }
      }
    }
    
    if (!latestDate) return Infinity;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    latestDate.setHours(0, 0, 0, 0);
    
    const diffTime = today - latestDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  initCrmView() {
    const searchInput = document.getElementById("crmSearchInput");
    const autocompleteList = document.getElementById("crmAutocompleteList");
    const btnSearch = document.getElementById("btnCrmSearch");

    if (!searchInput) return;

    // Build autocomplete
    const showAutocomplete = (val) => {
      autocompleteList.innerHTML = "";
      if (!val) {
        autocompleteList.style.display = "none";
        return;
      }

      const matched = this.app.state.students.filter(st => this.matchKo(st.name, val));
      if (matched.length === 0) {
        autocompleteList.style.display = "none";
        return;
      }

      matched.forEach(st => {
        const item = document.createElement("div");
        item.innerHTML = `<strong>${this.escapeHtml(st.name)}</strong> <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:0.3rem;">(${st.grade})</span>`;
        item.onclick = () => {
          searchInput.value = st.name;
          autocompleteList.style.display = "none";
          this.loadCrmStudent(st.name);
        };
        autocompleteList.appendChild(item);
      });
      autocompleteList.style.display = "block";
    };

    searchInput.addEventListener("input", (e) => showAutocomplete(e.target.value.trim()));
    
    // Close autocompletes when clicking outside
    document.addEventListener("click", (e) => {
      if (e.target !== searchInput) autocompleteList.style.display = "none";
    });

    btnSearch.onclick = () => {
      const val = searchInput.value.trim();
      if (val) this.loadCrmStudent(val);
    };

    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const val = searchInput.value.trim();
        if (val) this.loadCrmStudent(val);
      }
    });
    
    this.setupCrmButtons();
  }

  setupCrmButtons() {
    if (this.crmInitialized) return;
    this.crmInitialized = true;

    // Add Textbook
    document.getElementById("btnCrmAddTextbook").onclick = () => {
      const name = this.currentCrmStudentName;
      if (!name) return;
      document.getElementById("textbookStudentName").value = name;
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      document.getElementById("inputTextbookStartDate").value = todayStr;
      document.getElementById("modalAddTextbook").classList.add("active");
    };

    // Add Evaluation
    document.getElementById("btnCrmAddEvaluation").onclick = () => {
      const name = this.currentCrmStudentName;
      if (!name) return;
      document.getElementById("evaluationStudentName").value = name;
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      document.getElementById("inputEvaluationDate").value = todayStr;
      document.getElementById("modalAddEvaluation").classList.add("active");
    };

    // Add Makeup
    document.getElementById("btnCrmAddMakeup").onclick = () => {
      const name = this.currentCrmStudentName;
      if (!name) return;
      document.getElementById("crmAttendanceStudentName").value = name;
      document.getElementById("crmAttendanceType").value = "makeup";
      document.getElementById("crmAttendanceModalTitle").innerText = "📅 보강 일정 등록";
      document.getElementById("crmAttendanceDateLabel").innerText = "보강 날짜";
      document.getElementById("crmAttendanceTimeGroup").style.display = "block";
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      document.getElementById("inputCrmAttendanceDate").value = todayStr;
      document.getElementById("modalAddCrmAttendance").classList.add("active");
    };

    // Mark Absent
    document.getElementById("btnCrmMarkAbsent").onclick = () => {
      const name = this.currentCrmStudentName;
      if (!name) return;
      document.getElementById("crmAttendanceStudentName").value = name;
      document.getElementById("crmAttendanceType").value = "absence";
      document.getElementById("crmAttendanceModalTitle").innerText = "📅 결석 일자 등록";
      document.getElementById("crmAttendanceDateLabel").innerText = "결석 날짜";
      document.getElementById("crmAttendanceTimeGroup").style.display = "none";
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      document.getElementById("inputCrmAttendanceDate").value = todayStr;
      document.getElementById("modalAddCrmAttendance").classList.add("active");
    };

    // Mark Check-in
    const btnCrmMarkCheckIn = document.getElementById("btnCrmMarkCheckIn");
    if (btnCrmMarkCheckIn) {
      btnCrmMarkCheckIn.onclick = () => {
        const name = this.currentCrmStudentName;
        if (!name) return;
        
        const confirmCheckIn = confirm(`${name} 학생을 오늘 등원("수업중") 처리하시겠습니까?`);
        if (confirmCheckIn) {
          this.markStudentCheckInFromCrm(name);
        }
      };
    }

    // Save Member Analysis
    const saveBtn = document.getElementById("btnCrmSaveMemberAnalysis");
    if (saveBtn) {
      saveBtn.onclick = () => {
        const name = this.currentCrmStudentName;
        if (!name) return;
        
        const student = this.app.state.students.find(s => s.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
        if (!student) return;

        let memberRec = this.app.state.memberAnalysis.find(m => m.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
        const fields = {
          notes: document.getElementById("crmMemberNotes").value,
          progress: document.getElementById("crmMemberProgress").value,
          regDate: document.getElementById("crmMemberRegDate").value,
          consultation: document.getElementById("crmMemberConsultation").value,
          levelUp: document.getElementById("crmMemberLevelUp").value,
          levelChange: document.getElementById("crmMemberLevelChange").value,
          grammarDone: document.getElementById("crmMemberGrammarDone").value,
          readingTest: document.getElementById("crmMemberReadingTest").value,
          bookPlan: document.getElementById("crmMemberBookPlan").value,
          analysisSent: document.getElementById("crmMemberAnalysisSent").value,
          readMethod: document.getElementById("crmMemberReadMethod").value,
          studentId: document.getElementById("crmMemberStudentId").value,
          phone: document.getElementById("crmMemberPhone").value
        };

        if (memberRec) {
          const updates = [];
          Object.keys(fields).forEach(f => {
            memberRec[f] = fields[f];
            updates.push({ tab: "memberAnalysis", row: memberRec.row, field: f, value: fields[f] });
          });
          this.app.api.updateBatchInGoogleSheets(updates);
        } else {
          // 신규 등록
          const nextRow = this.app.state.memberAnalysis.length > 0 ? Math.max(...this.app.state.memberAnalysis.map(m => m.row)) + 1 : 2;
          memberRec = {
            id: 'member_' + nextRow,
            row: nextRow,
            num: String(this.app.state.memberAnalysis.length + 1),
            name: name,
            grade: student.grade || "",
            notes: fields.notes,
            progress: fields.progress,
            regDate: fields.regDate,
            consultation: fields.consultation,
            levelUp: fields.levelUp,
            levelChange: fields.levelChange,
            grammarDone: fields.grammarDone,
            readingTest: fields.readingTest,
            bookPlan: fields.bookPlan,
            analysisSent: fields.analysisSent,
            readMethod: fields.readMethod,
            studentId: fields.studentId,
            phone: fields.phone
          };
          this.app.state.memberAnalysis.push(memberRec);
          this.app.api.addMemberAnalysisToGoogleSheets(memberRec);
        }
        
        this.app.saveState();
        this.app.sheetSim.setData(this.app.state);
        this.loadCrmStudent(name);
        alert("회원 종합 분석 정보가 저장되었고 구글 시트와 연동되었습니다!");
      };
    }

    // Modal closes
    document.getElementById("btnCloseTextbookModal").onclick = () => document.getElementById("modalAddTextbook").classList.remove("active");
    document.getElementById("btnCancelTextbookModal").onclick = () => document.getElementById("modalAddTextbook").classList.remove("active");
    
    document.getElementById("btnCloseEvaluationModal").onclick = () => document.getElementById("modalAddEvaluation").classList.remove("active");
    document.getElementById("btnCancelEvaluationModal").onclick = () => document.getElementById("modalAddEvaluation").classList.remove("active");

    document.getElementById("btnCloseCrmAttendanceModal").onclick = () => document.getElementById("modalAddCrmAttendance").classList.remove("active");
    document.getElementById("btnCancelCrmAttendanceModal").onclick = () => document.getElementById("modalAddCrmAttendance").classList.remove("active");

    // Modal Submits
    document.getElementById("formAddTextbook").onsubmit = (e) => {
      e.preventDefault();
      const name = this.currentCrmStudentName;
      if (!name) return;
      const cat = document.getElementById("selectTextbookCategory").value;
      const title = document.getElementById("inputTextbookTitle").value.trim();
      const accuracy = document.getElementById("inputTextbookAccuracy").value.trim();
      const startDate = document.getElementById("inputTextbookStartDate").value;
      
      const student = this.app.state.students.find(s => s.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
      
      let studentRow = this.app.state.textbooks.find(t => t.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
      const categoryFieldMap = {
        "비문학": { title: "nonfictionTitle", start: "nonfictionStart", end: "nonfictionEnd", accuracy: "nonfictionAccuracy" },
        "문학": { title: "literatureTitle", start: "literatureStart", end: "literatureEnd", accuracy: "literatureAccuracy" },
        "어휘": { title: "vocabTitle", start: "vocabStart", end: "vocabEnd", accuracy: "vocabAccuracy" },
        "복합": { title: "complexTitle", start: "complexStart", end: "complexEnd", accuracy: "complexAccuracy" },
        "음독": { title: "readaloudTitle", start: "readaloudStart", end: "readaloudEnd", accuracy: "readaloudAccuracy" }
      };
      
      const fields = categoryFieldMap[cat];
      
      if (studentRow) {
        if (fields) {
          studentRow[fields.title] = title;
          studentRow[fields.start] = startDate;
          studentRow[fields.end] = "";
          studentRow[fields.accuracy] = accuracy;

          const updates = [
            { tab: "textbooks", row: studentRow.row, field: fields.title, value: title },
            { tab: "textbooks", row: studentRow.row, field: fields.start, value: startDate },
            { tab: "textbooks", row: studentRow.row, field: fields.end, value: "" },
            { tab: "textbooks", row: studentRow.row, field: fields.accuracy, value: accuracy }
          ];
          this.app.api.updateBatchInGoogleSheets(updates);
        }
        this.app.saveState();
        this.app.sheetSim.setData(this.app.state);
        this.loadCrmStudent(name);
      } else {
        const nextRow = this.app.state.textbooks.length > 0 ? Math.max(...this.app.state.textbooks.map(t => t.row)) + 1 : 2;
        studentRow = {
          id: 'textbook_' + nextRow,
          row: nextRow,
          name: name,
          grade: student ? student.grade : '',
          nonfictionTitle: '', nonfictionStart: '', nonfictionEnd: '', nonfictionAccuracy: '',
          literatureTitle: '', literatureStart: '', literatureEnd: '', literatureAccuracy: '',
          vocabTitle: '', vocabStart: '', vocabEnd: '', vocabAccuracy: '',
          complexTitle: '', complexStart: '', complexEnd: '', complexAccuracy: '',
          readaloudTitle: '', readaloudStart: '', readaloudEnd: '', readaloudAccuracy: ''
        };
        if (fields) {
          studentRow[fields.title] = title;
          studentRow[fields.start] = startDate;
          studentRow[fields.end] = "";
          studentRow[fields.accuracy] = accuracy;
        }
        this.app.state.textbooks.push(studentRow);
        this.app.saveState();
        this.app.sheetSim.setData(this.app.state);
        this.loadCrmStudent(name);
        
        this.app.api.addTextbookToGoogleSheets({
          name: name,
          grade: studentRow.grade,
          category: cat,
          title: title,
          startDate: startDate,
          endDate: "",
          accuracy: accuracy
        });
      }
      
      document.getElementById("modalAddTextbook").classList.remove("active");
      document.getElementById("formAddTextbook").reset();
    };

    document.getElementById("formAddEvaluation").onsubmit = (e) => {
      e.preventDefault();
      const name = this.currentCrmStudentName;
      if (!name) return;
      const period = document.getElementById("inputEvaluationPeriod").value.trim();
      const author = document.getElementById("inputEvaluationAuthor").value.trim();
      const content = document.getElementById("inputEvaluationContent").value.trim();
      const needs = document.getElementById("inputEvaluationPrevContent").value.trim();
      
      const student = this.app.state.students.find(s => s.name === name);
      const grade = student ? student.grade : "";
      
      const nextRow = this.app.state.consultations.length > 0 ? Math.max(...this.app.state.consultations.map(c => c.row)) + 1 : 2;
      
      const newConsult = {
        id: 'consultation_' + nextRow,
        row: nextRow,
        grade: grade,
        name: name,
        period: period,
        author: author,
        content: content,
        needs: needs
      };

      this.app.state.consultations.push(newConsult);
      this.app.saveState();
      this.app.sheetSim.setData(this.app.state);
      this.loadCrmStudent(name);
      
      this.app.api.addConsultationToGoogleSheets(newConsult);
      
      document.getElementById("modalAddEvaluation").classList.remove("active");
      document.getElementById("formAddEvaluation").reset();
    };

    document.getElementById("formAddCrmAttendance").onsubmit = (e) => {
      e.preventDefault();
      const name = this.currentCrmStudentName;
      if (!name) return;
      const attType = document.getElementById("crmAttendanceType").value;
      const dateInput = document.getElementById("inputCrmAttendanceDate").value;
      const timeSelect = document.getElementById("inputCrmAttendanceTime").value;

      const student = this.app.state.students.find(s => s.name === name);
      if (!student) return;

      const dateParts = dateInput.split('-');
      const yy = parseInt(dateParts[0], 10);
      const mm = parseInt(dateParts[1], 10) - 1;
      const dd = parseInt(dateParts[2], 10);
      const dateObj = new Date(yy, mm, dd);
      
      const m = dateObj.getMonth() + 1;
      const d = dateObj.getDate();
      const slashFormat = `${m}/${d}`;

      const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      const dateDayName = weekdays[dateObj.getDay()];
      const shortDay = dateDayName.substring(0, 1);
      const dailyLogDateStr = `${slashFormat}${shortDay}`;

      if (attType === "makeup") {
        const newMakeupStr = `${m}/${d}(${shortDay}) ${timeSelect}`;
        let makeupList = student.makeupDate ? student.makeupDate.split(/[\n,\r]+/).map(x => x.trim()).filter(Boolean) : [];
        if (!makeupList.includes(newMakeupStr)) {
          makeupList.push(newMakeupStr);
        }
        student.makeupDate = makeupList.join(', ');
        student.makeupCompleted = "대기";
        
        this.app.dashboardManager.logAttendanceEvent(name, "보강대기", timeSelect);
        let datesList = student.absentDates ? student.absentDates.split(',').map(x => x.trim()).filter(Boolean) : [];
        const hasAbsent = datesList.some(item => {
          const pure = parseAbsentDatePure(item);
          return pure && (pure.slashFormat === slashFormat || pure.dotFormat === slashFormat);
        });
        if (!hasAbsent) {
          datesList.push(`${slashFormat}(${shortDay})`);
        }
        student.absentDates = datesList.join(', ');
        
        const activeTime = student.times ? Object.values(student.times).find(t => t) || '15:00' : '15:00';
        this.app.dashboardManager.logAttendanceEvent(name, "결석", activeTime);

        let dailyLog = this.app.state.dailyLogs.find(log => 
          log.name.trim() === name.trim() && 
          (log.date || '').trim() === dailyLogDateStr.trim()
        );

        const makeupUpdates = [
          { tab: "students", row: student.row, field: "makeupDate", value: student.makeupDate },
          { tab: "students", row: student.row, field: "makeupCompleted", value: "대기" },
          { tab: "students", row: student.row, field: "absentDates", value: student.absentDates }
        ];

        if (dailyLog) {
          dailyLog.status = "결석";
          dailyLog.inTime = "";
          makeupUpdates.push({ tab: "dailyLogs", row: dailyLog.row, field: "status", value: "결석" });
          makeupUpdates.push({ tab: "dailyLogs", row: dailyLog.row, field: "inTime", value: "" });
          this.app.api.updateBatchInGoogleSheets(makeupUpdates);
        } else {
          this.app.api.updateBatchInGoogleSheets(makeupUpdates);
          const nextRow = this.app.state.dailyLogs.length > 0 ? Math.max(...this.app.state.dailyLogs.map(l => l.row)) + 1 : 2;
          dailyLog = {
            id: 'daily_' + nextRow,
            row: nextRow,
            date: dailyLogDateStr,
            time: activeTime,
            name: name,
            notes: student.notes || "",
            status: "결석",
            inTime: "",
            reason: "정규 결석",
            number: "",
            event: "",
            grammarDone: "",
            specialClass: "",
            contents: ""
          };
          this.app.state.dailyLogs.push(dailyLog);
          this.app.api.addDailyLogToGoogleSheets(dailyLog);
        }
      } else if (attType === "absence") {
        let datesList = student.absentDates ? student.absentDates.split(',').map(x => x.trim()).filter(Boolean) : [];
        const hasAbsent = datesList.some(item => {
          const pure = parseAbsentDatePure(item);
          return pure && (pure.slashFormat === slashFormat || pure.dotFormat === slashFormat);
        });
        if (!hasAbsent) {
          datesList.push(`${slashFormat}(${shortDay})`);
        }
        student.absentDates = datesList.join(', ');
        
        const activeTime = student.times ? student.times[this.app.selectedDay] || this.app.selectedTime : this.app.selectedTime;
        this.app.dashboardManager.logAttendanceEvent(name, "결석", activeTime);

        let dailyLog = this.app.state.dailyLogs.find(log => 
          log.name.trim() === name.trim() && 
          (log.date || '').trim() === dailyLogDateStr.trim()
        );

        const absenceUpdates = [
          { tab: "students", row: student.row, field: "absentDates", value: student.absentDates }
        ];

        if (dailyLog) {
          dailyLog.status = "결석";
          dailyLog.inTime = "";
          absenceUpdates.push({ tab: "dailyLogs", row: dailyLog.row, field: "status", value: "결석" });
          absenceUpdates.push({ tab: "dailyLogs", row: dailyLog.row, field: "inTime", value: "" });
          this.app.api.updateBatchInGoogleSheets(absenceUpdates);
        } else {
          this.app.api.updateBatchInGoogleSheets(absenceUpdates);
          const nextRow = this.app.state.dailyLogs.length > 0 ? Math.max(...this.app.state.dailyLogs.map(l => l.row)) + 1 : 2;
          dailyLog = {
            id: 'daily_' + nextRow,
            row: nextRow,
            date: dailyLogDateStr,
            time: activeTime,
            name: name,
            notes: student.notes || "",
            status: "결석",
            inTime: "",
            reason: "정규 결석",
            number: "",
            event: "",
            grammarDone: "",
            specialClass: "",
            contents: ""
          };
          this.app.state.dailyLogs.push(dailyLog);
          this.app.api.addDailyLogToGoogleSheets(dailyLog);
        }
      }

      this.app.saveState();
      this.app.sheetSim.setData(this.app.state);
      this.app.dashboardManager.updateDashboard();
      this.app.dashboardManager.updateQuickSchedules();
      this.loadCrmStudent(name);

      document.getElementById("modalAddCrmAttendance").classList.remove("active");
      document.getElementById("formAddCrmAttendance").reset();
    };
    // Close edit textbook modals
    const closeEditCrmTextbook = () => document.getElementById("modalEditCrmTextbook").classList.remove("active");
    const elCloseModal = document.getElementById("btnCloseEditCrmTextbookModal");
    if (elCloseModal) elCloseModal.onclick = closeEditCrmTextbook;
    const elCancelModal = document.getElementById("btnCancelEditCrmTextbookModal");
    if (elCancelModal) elCancelModal.onclick = closeEditCrmTextbook;

    // Submit edit textbook
    const formEditTextbook = document.getElementById("formEditCrmTextbook");
    if (formEditTextbook) {
      formEditTextbook.onsubmit = (e) => {
        e.preventDefault();
        const rowNum = parseInt(document.getElementById("editCrmTextbookRow").value);
        const key = document.getElementById("editCrmTextbookKey").value;
        const title = document.getElementById("editCrmTextbookTitle").value.trim();
        const startDate = document.getElementById("editCrmTextbookStartDate").value;
        const endDate = document.getElementById("editCrmTextbookEndDate").value;
        const accuracy = document.getElementById("editCrmTextbookAccuracy").value.trim();

        const studentRow = this.app.state.textbooks.find(b => b.row === rowNum) || 
                           this.app.state.textbooks.find(b => b.name.replace(/\s+/g, '') === this.currentCrmStudentName.replace(/\s+/g, ''));
        if (studentRow) {
          studentRow[`${key}Title`] = title;
          studentRow[`${key}Start`] = startDate;
          studentRow[`${key}End`] = endDate;
          studentRow[`${key}Accuracy`] = accuracy;

          // Update spreadsheet
          const updates = [
            { tab: "textbooks", row: studentRow.row, field: `${key}Title`, value: title },
            { tab: "textbooks", row: studentRow.row, field: `${key}Start`, value: startDate },
            { tab: "textbooks", row: studentRow.row, field: `${key}End`, value: endDate },
            { tab: "textbooks", row: studentRow.row, field: `${key}Accuracy`, value: accuracy }
          ];
          this.app.api.updateBatchInGoogleSheets(updates);

          this.app.saveState();
          this.app.sheetSim.setData(this.app.state);
          this.loadCrmStudent(this.currentCrmStudentName);
        }
        closeEditCrmTextbook();
      };
    }

    this.initCrmAccordions();
  }

  loadCrmStudent(name) {
    const student = this.app.state.students.find(st => st.name === name);
    if (!student) {
      document.getElementById("crmPlaceholder").style.display = "flex";
      document.getElementById("crmDashboard").style.display = "none";
      return;
    }

    const today = new Date();
    if (this.currentCrmStudentName !== name) {
      this.crmCalendarYear = today.getFullYear();
      this.crmCalendarMonth = today.getMonth() + 1;
    }

    this.currentCrmStudentName = name;
    
    document.getElementById("crmPlaceholder").style.display = "none";
    document.getElementById("crmDashboard").style.display = "block";

    const days = this.getLastConsultationDays(student.name);
    let badgeHtml = "";
    if (days === Infinity) {
      badgeHtml = ` <span class="badge-consultation" style="font-size: 0.75rem; font-weight: bold; background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2); padding: 0.2rem 0.5rem; border-radius: 4px; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">⚠️ 상담 기록 없음</span>`;
    } else if (days > 30) {
      badgeHtml = ` <span class="badge-consultation" style="font-size: 0.75rem; font-weight: bold; background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.2rem 0.5rem; border-radius: 4px; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">⚠️ 상담 필요 (${days}일 경과)</span>`;
    }

    document.getElementById("crmStudentName").innerHTML = `${this.escapeHtml(student.name)} <span id="crmStudentGrade" style="font-size: 0.95rem; font-weight: 400; background: rgba(255, 255, 255, 0.1); padding: 0.2rem 0.6rem; border-radius: 20px; color: var(--text-primary);">${student.grade}</span>${badgeHtml}`;
    
    const schedulesList = [];
    if (student.times) {
      Object.keys(student.times).forEach(day => {
        if (student.times[day]) {
          schedulesList.push(`${day.substring(0, 2)} ${student.times[day]}`);
        }
      });
    }
    const scheduleStr = schedulesList.length > 0 ? schedulesList.join(", ") : "지정된 정규 일정 없음";
    const classesStr = student.classes || "과정 미지정";
    document.getElementById("crmStudentSchedule").innerText = `정규 일정: ${scheduleStr} | 시수/과정: ${classesStr}`;

    const studentAccumLogs = (this.app.state.accumulatedLogs || []).filter(log => log && log.name && log.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    const studentDailyLogs = (this.app.state.dailyLogs || []).filter(log => log && log.name && log.name.replace(/\s+/g, '') === name.replace(/\s+/g, '') && log.status !== '대기' && log.status !== '보강대기' && log.status !== '수업중');
    const studentLogs = [...studentAccumLogs, ...studentDailyLogs];
    const presentCount = studentLogs.filter(log => log.status === '출석' || log.status === '수업완료' || log.status === '보강완료').length;
    const absentCount = studentLogs.filter(log => log.status === '결석').length;
    const makeupCount = studentLogs.filter(log => log.status === '보강완료').length;
    
    let attRate = 100;
    if (presentCount + absentCount > 0) {
      attRate = Math.round((presentCount / (presentCount + absentCount)) * 100);
    }
    
    const rateText = document.getElementById("crmAttendanceRateText");
    rateText.innerText = `${attRate}%`;
    if (attRate >= 90) {
      rateText.style.color = "var(--color-regular)";
    } else if (attRate >= 75) {
      rateText.style.color = "var(--warning)";
    } else {
      rateText.style.color = "var(--danger)";
    }
    
    const studentRow = this.app.state.textbooks.find(b => b && b.name && b.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    const activeBooks = [];
    const allStudentBooks = [];

    if (studentRow) {
      const categories = [
        { key: 'nonfiction', label: '비문학', title: studentRow.nonfictionTitle, start: studentRow.nonfictionStart, end: studentRow.nonfictionEnd, accuracy: studentRow.nonfictionAccuracy },
        { key: 'literature', label: '문학', title: studentRow.literatureTitle, start: studentRow.literatureStart, end: studentRow.literatureEnd, accuracy: studentRow.literatureAccuracy },
        { key: 'vocab', label: '어휘', title: studentRow.vocabTitle, start: studentRow.vocabStart, end: studentRow.vocabEnd, accuracy: studentRow.vocabAccuracy },
        { key: 'complex', label: '복합', title: studentRow.complexTitle, start: studentRow.complexStart, end: studentRow.complexEnd, accuracy: studentRow.complexAccuracy },
        { key: 'readaloud', label: '음독', title: studentRow.readaloudTitle, start: studentRow.readaloudStart, end: studentRow.readaloudEnd, accuracy: studentRow.readaloudAccuracy }
      ];

      categories.forEach(cat => {
        if (cat.title && cat.title.trim() !== "") {
          const isCompleted = cat.end && cat.end.trim() !== "";
          const bookObj = {
            category: cat.label,
            title: cat.title,
            startDate: cat.start,
            endDate: cat.end,
            accuracy: cat.accuracy,
            status: isCompleted ? '완료' : '학습중',
            row: studentRow.row,
            key: cat.key
          };
          allStudentBooks.push(bookObj);
          if (!isCompleted) {
            activeBooks.push(bookObj);
          }
        }
      });
    }
    
    document.getElementById("crmActiveTextbookCount").innerText = `${activeBooks.length}과목 / 총 ${allStudentBooks.length}과목`;

    const studentAnal = this.app.state.consultations.filter(a => a && a.name && a.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    document.getElementById("crmAnalysisCount").innerText = `${studentAnal.length}건`;

    document.getElementById("crmAttendanceCounts").innerText = `출석 ${presentCount}회, 결석 ${absentCount}회, 보강 완료 ${makeupCount}회`;
    
    if (student.makeupDate && student.makeupCompleted !== '완료') {
      document.getElementById("crmMakeupPendingText").innerText = `${student.makeupDate} (대기)`;
      document.getElementById("crmMakeupPendingText").style.color = "var(--color-makeup)";
    } else {
      document.getElementById("crmMakeupPendingText").innerText = "없음";
      document.getElementById("crmMakeupPendingText").style.color = "var(--text-secondary)";
    }

    const tableBody = document.getElementById("crmAttendanceListBody");
    tableBody.innerHTML = "";
    if (studentLogs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:1rem; color:var(--text-muted); font-size:0.85rem;">출결 로그가 존재하지 않습니다.</td></tr>`;
    } else {
      const sortedLogs = [...studentLogs].sort((a, b) => {
        const timeA = a.timestamp || `${a.date || ''} ${a.time || ''}`;
        const timeB = b.timestamp || `${b.date || ''} ${b.time || ''}`;
        return timeB.localeCompare(timeA);
      });
      sortedLogs.slice(0, 10).forEach(log => {
        let badgeClass = "badge-success";
        if (log.status === "결석") badgeClass = "badge-danger";
        else if (log.status === "보강완료" || log.status === "보강대기") badgeClass = "badge-warning";
        
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
        tr.innerHTML = `
          <td style="padding: 0.5rem 0.8rem;">${log.date}${log.day ? ` (${log.day.substring(0,1)})` : ''}</td>
          <td style="padding: 0.5rem 0.8rem;">${log.time}</td>
          <td style="padding: 0.5rem 0.8rem; text-align: center;"><span class="${badgeClass}" style="font-size:0.75rem; padding: 0.1rem 0.3rem;">${log.status}</span></td>
        `;
        tableBody.appendChild(tr);
      });
    }

    // Render the monthly attendance calendar
    this.renderCrmCalendar(studentLogs);

    // Populate Member Analysis Inputs
    let memberRec = this.app.state.memberAnalysis.find(m => m && m.name && m.name.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    if (!memberRec) {
      const nextRow = this.app.state.memberAnalysis.length > 0 ? Math.max(...this.app.state.memberAnalysis.map(m => m.row)) + 1 : 20;
      memberRec = {
        id: 'member_' + nextRow,
        row: nextRow,
        num: String(this.app.state.memberAnalysis.length + 1),
        name: name,
        grade: student.grade,
        regDate: '', consultation: '', notes: '', progress: '', levelUp: '', levelChange: '',
        grammarDone: '', readingTest: '', bookPlan: '', analysisSent: '', readMethod: '', studentId: '', phone: ''
      };
      this.app.state.memberAnalysis.push(memberRec);
      this.app.saveState();
      if (this.app.sheetSim) this.app.sheetSim.setData(this.app.state);
    }

    // Bind Data to Accordions (Request 1 - renderAccordion)
    this.renderAccordion(memberRec);

    // Textbooks render
    const textbookContainer = document.getElementById("crmTextbookContainer");
    textbookContainer.innerHTML = "";
    if (allStudentBooks.length === 0) {
      textbookContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">학습 중이거나 완료된 교재가 없습니다.</div>`;
    } else {
      allStudentBooks.forEach(book => {
        const card = document.createElement("div");
        card.className = "textbook-card";
        
        let categoryClass = "category-reading";
        if (book.category === "문학") categoryClass = "category-literature";
        else if (book.category === "비문학") categoryClass = "category-non-fiction";
        else if (book.category === "어휘") categoryClass = "category-vocabulary";
        else if (book.category === "복합") categoryClass = "category-korean";
        
        card.innerHTML = `
          <div class="textbook-card-header">
            <span class="textbook-badge ${categoryClass}">${book.category}</span>
            <span class="textbook-pages" style="color: ${book.status === '완료' ? 'var(--color-regular)' : 'var(--warning)'}; font-weight:600;">${book.status}</span>
          </div>
          <div class="textbook-title">${this.escapeHtml(book.title)}</div>

          <div class="textbook-grid-details" style="grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.8rem;">
            <div class="textbook-detail-item">
              <span class="textbook-detail-label">시작일</span>
              <span class="textbook-detail-value">${book.startDate || '-'}</span>
            </div>
            <div class="textbook-detail-item">
              <span class="textbook-detail-label">마침일</span>
              <span class="textbook-detail-value">${book.endDate || '-'}</span>
            </div>
            <div class="textbook-detail-item" style="grid-column: span 2;">
              <span class="textbook-detail-label">교재 정답률</span>
              <span class="textbook-detail-value">${book.accuracy || '-'}</span>
            </div>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.6rem; padding-top:0.6rem; border-top:1px solid rgba(255,255,255,0.03);">
            <button class="btn-primary btn-edit-book-crm" data-row="${book.row}" data-key="${book.key}" style="padding:0.25rem 0.6rem; font-size:0.75rem; background:rgba(99,102,241,0.08); border:1px solid var(--accent); color:var(--accent); width: 100%;">교재 정보 수정</button>
          </div>
        `;
        textbookContainer.appendChild(card);
      });
      this.attachCrmTextbookActions();
    }

    // Evaluations render
    const evaluationList = document.getElementById("crmEvaluationList");
    evaluationList.innerHTML = "";
    if (studentAnal.length === 0) {
      evaluationList.innerHTML = `<div style="text-align:center; padding:3rem 1rem; color:var(--text-muted); font-size:0.9rem;">작성된 상담 및 리포트 발송 기록이 없습니다.</div>`;
    } else {
      const sortedAnal = [...studentAnal].sort((a, b) => {
        const periodA = a.period || "";
        const periodB = b.period || "";
        return periodB.localeCompare(periodA);
      });
      sortedAnal.forEach(anal => {
        const card = document.createElement("div");
        card.className = "evaluation-card";
        
        card.innerHTML = `
          <div class="evaluation-card-header">
            <span class="evaluation-type">📝 상담 / 리포트 발송 기록</span>
            <span class="evaluation-date">${this.escapeHtml(anal.period)}</span>
          </div>
          <div class="evaluation-meta">
            <span><strong>작성인:</strong> ${this.escapeHtml(anal.author)}</span>
          </div>
          <div class="evaluation-comment" style="margin-top: 0.5rem; font-size: 0.85rem; line-height: 1.4; color: var(--text-primary); max-height: 80px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
            <strong>상담내용/리포트발송:</strong><br>
            ${this.escapeHtml(anal.content).replace(/\n/g, '<br>')}
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; margin-top:0.4rem; padding-top:0.4rem; border-top:1px solid rgba(0,0,0,0.03);">
            <button class="btn-large-view-eval" data-id="${anal.id}" style="background:rgba(99,102,241,0.08); border:1px solid var(--accent); color:var(--accent); border-radius:4px; padding:0.25rem 0.5rem; cursor:pointer; font-weight:600;">🔍 크게 보기</button>
            <button class="btn-delete-crm-eval" data-id="${anal.id}" style="background:transparent; border:none; color:var(--danger); cursor:pointer;">🗑️ 기록 삭제</button>
          </div>
        `;
        evaluationList.appendChild(card);
      });
      this.attachCrmEvaluationActions();
    }
    
    // Timeline render
    this.renderTimeline(name);
  }

  // CRM Monthly Attendance Calendar renderer
  renderCrmCalendar(studentLogs) {
    const container = document.getElementById("crmAttendanceCalendarContainer");
    if (!container) return;

    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "crm-calendar-wrapper";

    // Calendar Header
    const header = document.createElement("div");
    header.className = "crm-calendar-header";

    const title = document.createElement("div");
    title.className = "crm-calendar-title";
    title.innerText = `📅 ${this.crmCalendarYear}년 ${this.crmCalendarMonth}월 출결 현황`;

    const navContainer = document.createElement("div");
    navContainer.style.display = "flex";
    navContainer.style.gap = "0.4rem";

    const prevBtn = document.createElement("button");
    prevBtn.className = "crm-calendar-nav-btn";
    prevBtn.innerText = "<";
    prevBtn.onclick = (e) => {
      e.preventDefault();
      this.crmCalendarMonth--;
      if (this.crmCalendarMonth < 1) {
        this.crmCalendarMonth = 12;
        this.crmCalendarYear--;
      }
      this.renderCrmCalendar(studentLogs);
    };

    const nextBtn = document.createElement("button");
    nextBtn.className = "crm-calendar-nav-btn";
    nextBtn.innerText = ">";
    nextBtn.onclick = (e) => {
      e.preventDefault();
      this.crmCalendarMonth++;
      if (this.crmCalendarMonth > 12) {
        this.crmCalendarMonth = 1;
        this.crmCalendarYear++;
      }
      this.renderCrmCalendar(studentLogs);
    };

    navContainer.appendChild(prevBtn);
    navContainer.appendChild(nextBtn);
    header.appendChild(title);
    header.appendChild(navContainer);
    wrapper.appendChild(header);

    // Grid Container
    const grid = document.createElement("div");
    grid.className = "crm-calendar-grid";

    // Week Headers
    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
    weekDays.forEach(day => {
      const dayHeader = document.createElement("div");
      dayHeader.className = "crm-calendar-day-header";
      dayHeader.innerText = day;
      if (day === "일") dayHeader.style.color = "#ef4444";
      if (day === "토") dayHeader.style.color = "#3b82f6";
      grid.appendChild(dayHeader);
    });

    // Calendar Days Calculation
    const firstDay = new Date(this.crmCalendarYear, this.crmCalendarMonth - 1, 1);
    const lastDay = new Date(this.crmCalendarYear, this.crmCalendarMonth, 0);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const totalDays = lastDay.getDate();

    // Previous Month's trailing days
    const prevMonthLastDay = new Date(this.crmCalendarYear, this.crmCalendarMonth - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const cell = document.createElement("div");
      cell.className = "crm-calendar-cell other-month";
      cell.innerText = prevMonthLastDay - i;
      grid.appendChild(cell);
    }

    // Current Month's days
    for (let day = 1; day <= totalDays; day++) {
      const cell = document.createElement("div");
      cell.className = "crm-calendar-cell";
      cell.innerText = day;

      // Find logs for this specific date
      const dateLogs = studentLogs.filter(log => {
        if (!log.date) return false;
        const cleanDate = log.date.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, "").replace(/\(|\)/g, "").trim();
        const parts = cleanDate.split(/[\/\.-]/);
        let m = -1, d = -1;
        if (parts.length >= 3) {
          m = parseInt(parts[1], 10);
          d = parseInt(parts[2], 10);
        } else if (parts.length === 2) {
          m = parseInt(parts[0], 10);
          d = parseInt(parts[1], 10);
        }
        return m === this.crmCalendarMonth && d === day;
      });

      if (dateLogs.length > 0) {
        let status = "대기";
        let inTime = "";
        let outTime = "";
        let details = "";

        const presentLog = dateLogs.find(l => l.status === "출석" || l.status === "수업완료" || l.status === "출석완료");
        const makeupLog = dateLogs.find(l => l.status === "보강완료" || l.status === "보강" || l.status === "보강대기");
        const absentLog = dateLogs.find(l => l.status === "결석");
        const cancelledLog = dateLogs.find(l => l.status === "휴강");

        if (presentLog) {
          status = "present";
          inTime = presentLog.inTime || presentLog.time || "";
          outTime = presentLog.outTime || "";
          details = "출석";
        } else if (makeupLog) {
          status = "makeup";
          inTime = makeupLog.inTime || makeupLog.time || "";
          outTime = makeupLog.outTime || "";
          details = "보강 완료";
        } else if (absentLog) {
          status = "absent";
          details = "결석";
        } else if (cancelledLog) {
          status = "cancelled";
          details = "휴강";
        }

        if (status !== "대기") {
          cell.classList.add(`status-${status}`);
          
          // Create Dot
          const dot = document.createElement("div");
          dot.className = "crm-calendar-dot";
          cell.appendChild(dot);

          // Create Premium Tooltip
          const tooltip = document.createElement("div");
          tooltip.className = "crm-calendar-tooltip";
          
          let tooltipText = `${details}`;
          if (inTime) {
            tooltipText += ` | 등원 ${inTime}`;
          }
          if (outTime) {
            tooltipText += ` ➡️ 하원 ${outTime}`;
          }
          tooltip.innerText = tooltipText;
          cell.appendChild(tooltip);
        }
      }

      grid.appendChild(cell);
    }

    // Next Month's leading days to complete the grid row
    const currentCellsCount = startDayOfWeek + totalDays;
    const remainingCells = (currentCellsCount % 7 === 0) ? 0 : 7 - (currentCellsCount % 7);
    for (let i = 1; i <= remainingCells; i++) {
      const cell = document.createElement("div");
      cell.className = "crm-calendar-cell other-month";
      cell.innerText = i;
      grid.appendChild(cell);
    }

    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  }

  // Request 1: renderAccordion function
  renderAccordion(memberRec) {
    const applyConditionalColor = (elId, value) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.value = value || "";
      const valStr = String(value || "");
      if (valStr.includes("글완") || valStr.includes("글쓰기완") || valStr.includes("완료") || valStr.includes("표현활동")) {
        el.style.color = "#2563eb";
        el.style.fontWeight = "bold";
      } else {
        el.style.color = "";
        el.style.fontWeight = "";
      }

      // Update display box
      const displayBox = document.getElementById(`display-box-${elId}`);
      if (displayBox) {
        displayBox.innerHTML = this.renderMultilineDisplay(valStr);
      }

      // Update accordion preview
      const preview = document.getElementById(`preview-${elId}`);
      if (preview) {
        let previewText = valStr.replace(/\r?\n/g, " ") || "비어 있음";
        if (previewText.length > 25) {
          previewText = previewText.substring(0, 25) + "...";
        }
        preview.innerText = previewText;
        if (valStr.includes("글완") || valStr.includes("글쓰기완") || valStr.includes("완료") || valStr.includes("표현활동")) {
          preview.style.color = "#2563eb";
          preview.style.fontWeight = "bold";
        } else {
          preview.style.color = "";
          preview.style.fontWeight = "";
        }
      }
    };

    applyConditionalColor("crmMemberRegDate", memberRec.regDate);
    applyConditionalColor("crmMemberStudentId", memberRec.studentId);
    applyConditionalColor("crmMemberReadMethod", memberRec.readMethod);
    applyConditionalColor("crmMemberAnalysisSent", memberRec.analysisSent);
    applyConditionalColor("crmMemberLevelUp", memberRec.levelUp);
    applyConditionalColor("crmMemberLevelChange", memberRec.levelChange);
    applyConditionalColor("crmMemberGrammarDone", memberRec.grammarDone);
    applyConditionalColor("crmMemberReadingTest", memberRec.readingTest);
    applyConditionalColor("crmMemberBookPlan", memberRec.bookPlan);
    applyConditionalColor("crmMemberConsultation", memberRec.consultation);
    applyConditionalColor("crmMemberNotes", memberRec.notes);
    applyConditionalColor("crmMemberProgress", memberRec.progress);
    applyConditionalColor("crmMemberPhone", memberRec.phone); // P열 연동 누락 방지
  }

  attachCrmTextbookActions() {
    document.querySelectorAll(".btn-edit-book-crm").forEach(btn => {
      btn.onclick = () => {
        const rowNum = parseInt(btn.getAttribute("data-row"));
        const key = btn.getAttribute("data-key");
        const studentRow = this.app.state.textbooks.find(b => b.row === rowNum);
        if (studentRow) {
          document.getElementById("editCrmTextbookRow").value = rowNum;
          document.getElementById("editCrmTextbookKey").value = key;
          
          let catDisplay = key;
          if (key === "nonfiction") catDisplay = "비문학";
          else if (key === "literature") catDisplay = "문학";
          else if (key === "vocab") catDisplay = "어휘";
          else if (key === "complex") catDisplay = "복합";
          else if (key === "readaloud") catDisplay = "음독";
          
          document.getElementById("editCrmTextbookCategoryDisplay").value = catDisplay;
          document.getElementById("editCrmTextbookTitle").value = studentRow[`${key}Title`] || "";
          document.getElementById("editCrmTextbookStartDate").value = studentRow[`${key}Start`] || "";
          document.getElementById("editCrmTextbookEndDate").value = studentRow[`${key}End`] || "";
          document.getElementById("editCrmTextbookAccuracy").value = studentRow[`${key}Accuracy`] || "";
          
          document.getElementById("modalEditCrmTextbook").classList.add("active");
        }
      };
    });
  }

  attachCrmEvaluationActions() {
    document.querySelectorAll(".btn-delete-crm-eval").forEach(btn => {
      btn.onclick = () => {
        const evalId = btn.getAttribute("data-id");
        const evaluation = this.app.state.consultations.find(a => a.id === evalId);
        if (evaluation && confirm("이 상담 기록을 삭제하시겠습니까?")) {
          this.app.state.consultations = this.app.state.consultations.filter(a => a.id !== evalId);
          this.app.saveState();
          this.app.sheetSim.setData(this.app.state);
          this.loadCrmStudent(this.currentCrmStudentName);
          
          this.app.api.deleteFieldInGoogleSheets(evaluation.row, "consultations");
        }
      };
    });

    document.querySelectorAll(".btn-large-view-eval").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-id");
        const anal = this.app.state.consultations.find(a => a.id === id);
        if (anal) {
          const title = `📝 상담 및 리포트 기록 (${anal.period})`;
          const contentHtml = `
            <div style="display:flex; flex-direction:column; gap:1rem; font-family:var(--font-main);">
              <div style="font-size:0.95rem; color:var(--text-secondary); border-bottom:1px solid var(--panel-border); padding-bottom:0.5rem;">
                <strong>작성자:</strong> ${this.escapeHtml(anal.author)}
              </div>
              <div>
                <strong style="color:var(--accent); font-size:1rem;">[상담 내용 / 리포트 발송]</strong>
                <div class="large-view-text" style="margin-top:0.4rem;">${this.escapeHtml(anal.content)}</div>
              </div>
              <div>
                <strong style="color:var(--color-makeup); font-size:1rem;">[부모님의 Need / 학생 특이사항]</strong>
                <div class="large-view-text" style="margin-top:0.4rem; border-left:3px solid var(--color-makeup); padding-left:0.6rem;">${this.escapeHtml(anal.needs || '없음')}</div>
              </div>
            </div>
          `;
          this.showLargeView(title, contentHtml);
        }
      };
    });
  }

  showLargeView(title, htmlContent) {
    const modalLarge = document.getElementById("modalLargeView");
    const titleEl = document.getElementById("largeViewTitle");
    const contentEl = document.getElementById("largeViewContentArea");
    if (modalLarge && titleEl && contentEl) {
      titleEl.innerText = title;
      contentEl.innerHTML = htmlContent;
      modalLarge.classList.add("active");
    }
  }

  initCrmAccordions() {
    // Accordion toggle handler
    document.querySelectorAll(".crm-accordion-header").forEach(header => {
      header.onclick = (e) => {
        e.preventDefault();
        const item = header.closest(".crm-accordion-item");
        if (item) {
          item.classList.toggle("active");
        }
      };
    });

    // Expand / Collapse All
    const btnExpandAll = document.getElementById("btnCrmExpandAll");
    const btnCollapseAll = document.getElementById("btnCrmCollapseAll");

    if (btnExpandAll) {
      btnExpandAll.onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll(".crm-accordion-item").forEach(item => {
          item.classList.add("active");
        });
      };
    }

    if (btnCollapseAll) {
      btnCollapseAll.onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll(".crm-accordion-item").forEach(item => {
          item.classList.remove("active");
        });
      };
    }

    const fields = [
      "crmMemberRegDate", "crmMemberStudentId", "crmMemberReadMethod", 
      "crmMemberAnalysisSent", "crmMemberLevelUp", "crmMemberLevelChange", 
      "crmMemberGrammarDone", "crmMemberReadingTest", "crmMemberBookPlan", 
      "crmMemberConsultation", "crmMemberNotes", "crmMemberProgress", "crmMemberPhone"
    ];

    fields.forEach(fId => {
      const input = document.getElementById(fId);
      const preview = document.getElementById(`preview-${fId}`);
      const displayBox = document.getElementById(`display-box-${fId}`);
      if (input) {
        input.addEventListener("input", () => {
          const valStr = input.value || "";
          
          if (displayBox) {
            displayBox.innerHTML = this.renderMultilineDisplay(valStr);
          }

          if (preview) {
            let previewText = valStr.replace(/\r?\n/g, " ") || "비어 있음";
            if (previewText.length > 25) {
              previewText = previewText.substring(0, 25) + "...";
            }
            preview.innerText = previewText;
            if (valStr.includes("글완") || valStr.includes("글쓰기완") || valStr.includes("완료") || valStr.includes("표현활동")) {
              preview.style.color = "#2563eb";
              preview.style.fontWeight = "bold";
            } else {
              preview.style.color = "";
              preview.style.fontWeight = "";
            }
          }
        });
      }
    });
  }

  renderMultilineDisplay(value) {
    if (!value || value.trim() === "") {
      return `<div style="color: var(--text-muted); font-style: italic; font-size: 0.85rem; padding: 0.3rem;">비어 있음</div>`;
    }
    const lines = value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return `<div style="color: var(--text-muted); font-style: italic; font-size: 0.85rem; padding: 0.3rem;">비어 있음</div>`;
    }
    return lines.map(line => {
      let lineStyle = "padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.9rem; line-height: 1.4;";
      if (line.includes("글완") || line.includes("글쓰기완") || line.includes("완료") || line.includes("표현활동")) {
        lineStyle += " color: #2563eb; font-weight: bold;";
      }
      return `<div style="${lineStyle}">• ${this.escapeHtml(line)}</div>`;
    }).join("");
  }

  renderTimeline(name) {
    const container = document.getElementById("crmTimelineContainer");
    if (!container) return;

    // 1. Gather logs from dailyLogs and accumulatedLogs
    const dailyLogs = this.app.state.dailyLogs.filter(log => log.name === name);
    const accumulatedLogs = this.app.state.accumulatedLogs.filter(log => log.name === name);

    const allLogs = [];
    
    // Add daily logs
    dailyLogs.forEach(log => {
      // Avoid separator rows or empty names
      if (log.date && log.date.indexOf("여기부터는 ") === 0) return;
      
      allLogs.push({
        isToday: true,
        date: log.date || "",
        time: log.time || "",
        status: log.status || "대기",
        inTime: log.inTime || "",
        reason: log.reason || "",
        number: log.number || "",
        event: log.event || "",
        grammarDone: log.grammarDone || log.specialClass || "",
        contents: log.contents || "",
        notes: log.notes || ""
      });
    });

    // Add accumulated logs
    accumulatedLogs.forEach(log => {
      allLogs.push({
        isToday: false,
        date: log.date || "",
        time: log.time || "",
        status: log.status || "수업완료",
        inTime: log.inTime || "",
        reason: log.reason || "",
        number: log.number || "",
        event: log.event || "",
        grammarDone: log.grammarDone || log.specialClass || "",
        contents: log.contents || "",
        notes: log.notes || ""
      });
    });

    // 3. Sort chronologically (newest first).
    const parseLogDateToVal = (dateStr) => {
      if (!dateStr) return 0;
      // Handle YYYY-MM-DD
      const ymdMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (ymdMatch) {
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        return month * 100 + day;
      }
      // Handle M/D or M.D
      const mdMatch = dateStr.match(/(\d+)[\/\.-](\d+)/);
      if (mdMatch) {
        const month = parseInt(mdMatch[1], 10);
        const day = parseInt(mdMatch[2], 10);
        return month * 100 + day;
      }
      return 0;
    };

    allLogs.sort((a, b) => {
      const valA = parseLogDateToVal(a.date);
      const valB = parseLogDateToVal(b.date);
      if (valB !== valA) {
        return valB - valA; // descending
      }
      return (b.time || "").localeCompare(a.time || "");
    });

    // 4. Render timeline items
    container.innerHTML = "";
    if (allLogs.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">수업 기록이 없습니다.</div>`;
      return;
    }

    allLogs.forEach(log => {
      const itemEl = document.createElement("div");
      itemEl.className = "timeline-item";
      
      let statusBadgeClass = "status-waiting";
      const normStatus = this.escapeHtml(this.app.sheetSim.getNormalizedStatus(log.status));
      if (normStatus === "수업완료") statusBadgeClass = "status-completed";
      else if (normStatus === "수업중") statusBadgeClass = "status-ongoing";
      else if (normStatus === "결석") statusBadgeClass = "status-absent";
      else if (normStatus === "보강완료") statusBadgeClass = "status-makeup-done";

      let eventHtml = "";
      if (log.event) {
        eventHtml += `<span class="timeline-tag tag-event">${this.escapeHtml(log.event)}</span>`;
      }
      if (log.number) {
        eventHtml += `<span class="timeline-tag tag-number">${this.escapeHtml(log.number)}</span>`;
      }
      if (log.grammarDone) {
        eventHtml += `<span class="timeline-tag tag-grammar">${this.escapeHtml(log.grammarDone)}</span>`;
      }

      let contentsStyled = this.escapeHtml(log.contents || "");
      if (contentsStyled.includes("완료") || contentsStyled.includes("글완") || contentsStyled.includes("글쓰기완")) {
        contentsStyled = `<span class="highlight-success">${contentsStyled}</span>`;
      }
      
      let timeText = `${log.time}`;
      if (log.inTime) {
        timeText += ` (${log.inTime} 등원)`;
      } else if (log.status === "결석" && log.reason) {
        timeText += ` (${log.reason})`;
      }

      itemEl.innerHTML = `
        <div class="timeline-date-col">
          <div class="timeline-date">${this.escapeHtml(log.date)}</div>
          <div class="timeline-time">${this.escapeHtml(timeText)}</div>
        </div>
        <div class="timeline-marker">
          <div class="timeline-marker-dot"></div>
          <div class="timeline-marker-line"></div>
        </div>
        <div class="timeline-content-col">
          <div class="timeline-card">
            <div class="timeline-card-header">
              <span class="timeline-badge ${statusBadgeClass}">${normStatus}${log.isToday ? ' <span style="font-size:0.65rem; opacity:0.8;">[오늘]</span>' : ''}</span>
              <div class="timeline-tags-wrapper">${eventHtml}</div>
            </div>
            ${log.contents ? `<div class="timeline-card-body">${contentsStyled.replace(/\n/g, '<br>')}</div>` : ''}
            ${log.notes ? `<div class="timeline-card-footer">💡 특이사항: ${this.escapeHtml(log.notes)}</div>` : ''}
          </div>
        </div>
      `;
      container.appendChild(itemEl);
    });
  }

  isSameDate(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return false;
    const clean1 = String(dateStr1).trim().replace(/\s+/g, "");
    const clean2 = String(dateStr2).trim().replace(/\s+/g, "");
    if (clean1 === clean2) return true;
    
    const m1 = clean1.match(/(\d+)[\/\.](\d+)/);
    const m2 = clean2.match(/(\d+)[\/\.](\d+)/);
    if (m1 && m2) {
      return parseInt(m1[1], 10) === parseInt(m2[1], 10) && 
             parseInt(m1[2], 10) === parseInt(m2[2], 10);
    }
    return false;
  }

  markStudentCheckInFromCrm(name) {
    const student = this.app.state.students.find(st => st.name === name);
    if (!student) return;

    const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    const todayDay = WEEKDAYS[new Date().getDay()];
    const dates = getFormattedDateOfWeekday(todayDay);
    const shortDay = todayDay.substring(0, 1);
    const dailyLogDateStr = `${dates.slashFormat}${shortDay}`;

    // Check if there is an active makeup today
    let isMakeup = false;
    if (student.makeupDate) {
      const parsedMakeups = parseMultipleMakeups(student.makeupDate);
      isMakeup = parsedMakeups.some(parsed => 
        parsed && parsed.day === todayDay && (parsed.isWeekly || parsed.formattedSlash === dates.slashFormat || parsed.formattedDot === dates.dotFormat)
      );
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const activeTime = student.times && student.times[todayDay] ? student.times[todayDay].trim() : currentTime;

    // Check if they already have a log for today
    let dailyLog = this.app.state.dailyLogs.find(log => 
      log && log.name && log.name.replace(/\s+/g, '') === name.replace(/\s+/g, '') && 
      this.isSameDate(log.date, dailyLogDateStr)
    );

    if (dailyLog) {
      dailyLog.status = "수업중";
      dailyLog.inTime = currentTime;
      const updates = [
        { tab: "dailyLogs", row: dailyLog.row, field: "status", value: "수업중" },
        { tab: "dailyLogs", row: dailyLog.row, field: "inTime", value: currentTime }
      ];
      this.app.api.updateBatchInGoogleSheets(updates);
    } else {
      const nextRow = this.app.state.dailyLogs.length > 0 ? Math.max(...this.app.state.dailyLogs.map(l => l.row)) + 1 : 2;
      dailyLog = {
        id: 'daily_' + nextRow,
        row: nextRow,
        date: dailyLogDateStr,
        time: activeTime,
        name: name,
        notes: student.notes || "",
        status: "수업중",
        inTime: currentTime,
        reason: isMakeup ? "보강 수업" : "",
        number: "",
        event: "",
        grammarDone: "",
        specialClass: "",
        contents: ""
      };
      this.app.state.dailyLogs.push(dailyLog);
      this.app.api.addDailyLogToGoogleSheets(dailyLog);
    }

    // Trigger SMS Notification if configured
    this.app.smsManager.sendSmsNotification(student, "in", currentTime);

    // Save state and re-render
    this.app.saveState();
    if (this.app.sheetSim) this.app.sheetSim.setData(this.app.state);
    
    // Force re-render of current day dashboard
    this.app.dashboardManager.selectedDay = todayDay;
    this.app.dashboardManager.updateDashboard();
    
    // Reload CRM profile card
    this.loadCrmStudent(name);
    
    alert(`${name} 학생의 오늘 등원 처리가 완료되었습니다.`);
  }
}
