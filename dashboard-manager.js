// dashboard-manager.js - DashboardManager Class to handle attendance dashboard elements & cycles
class DashboardManager {
  constructor(app) {
    this.app = app;
  }

  get selectedDay() { return this.app.selectedDay; }
  set selectedDay(val) { this.app.selectedDay = val; }
  get selectedTime() { return this.app.selectedTime; }
  set selectedTime(val) { this.app.selectedTime = val; }
  get autoTimeEnabled() { return this.app.autoTimeEnabled; }
  set autoTimeEnabled(val) { this.app.autoTimeEnabled = val; }

  escapeHtml(str) {
    return this.app.escapeHtml(str);
  }

  setToCurrentTime() {
    const now = new Date();
    const day = WEEKDAYS[now.getDay()];
    const hour = now.getHours();
    const roundedHour = `${String(hour).padStart(2, '0')}:00`;
    
    const validHours = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
    let finalHour = "14:00";
    if (validHours.includes(roundedHour)) {
      finalHour = roundedHour;
    } else {
      let minDiff = Infinity;
      validHours.forEach(h => {
        const hVal = parseInt(h.split(':')[0]);
        const diff = Math.abs(hVal - hour);
        if (diff < minDiff) {
          minDiff = diff;
          finalHour = h;
        }
      });
    }

    this.selectedDay = day;
    this.selectedTime = finalHour;

    const dayEl = document.getElementById("selectDay");
    const timeEl = document.getElementById("selectTime");
    if (dayEl) dayEl.value = day;
    if (timeEl) timeEl.value = finalHour;

    this.updateDashboard();
  }

  getActiveStudentsForTime(timeStr) {
    const dates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${dates.slashFormat}${shortDay}`;
    
    return this.app.state.students.filter(student => {
      // 1. Is student absent on this specific day?
      let isAbsent = false;
      if (student.absentDates) {
        const cleanAbs = student.absentDates.replace(/\s+/g, '');
        isAbsent = cleanAbs.includes(dates.slashFormat) || cleanAbs.includes(dates.dotFormat);
      }

      // 2. Case A: Makeup Class
      let isMakeupTodayAndTime = false;
      if (student.makeupDate) {
        const parsed = parseMakeupDate(student.makeupDate);
        const isDateMatch = parsed && (parsed.isWeekly || parsed.formattedSlash === dates.slashFormat || parsed.formattedDot === dates.dotFormat);
        if (parsed && parsed.day === this.selectedDay && parsed.time === timeStr && isDateMatch) {
          isMakeupTodayAndTime = true;
        }
      }
      
      // 3. Case B: Regular Class
      const regularTimeStr = student.times && student.times[this.selectedDay];
      let isRegularActive = false;
      if (regularTimeStr) {
        const parts = regularTimeStr.split(/[,/; ]+/).map(t => t.trim()).filter(Boolean);
        isRegularActive = parts.includes(timeStr);
      }
      
      // Show regular student here unless they have a makeup today
      let hasMakeupToday = false;
      if (student.makeupDate) {
        const parsed = parseMakeupDate(student.makeupDate);
        const isDateMatch = parsed && (parsed.isWeekly || parsed.formattedSlash === dates.slashFormat || parsed.formattedDot === dates.dotFormat);
        if (parsed && parsed.day === this.selectedDay && isDateMatch) {
          hasMakeupToday = true;
        }
      }

      // Check if student has a daily log for this time slot today with active status (not standby)
      const hasLog = this.app.state.dailyLogs.some(l => 
        (l.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, '') && 
        (l.date || '').trim() === dailyLogDateStr.trim() &&
        (l.time || '').trim() === timeStr.trim() &&
        l.status && l.status !== '대기'
      );

      if (hasLog) {
        const isScheduledToday = (isRegularActive && !hasMakeupToday) || isMakeupTodayAndTime;
        if (isScheduledToday) {
          return true;
        }
        // If they have a log but are not scheduled on this day/time, check if another student with the same name IS scheduled.
        const sameNameStudents = this.app.state.students.filter(s => (s.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, ''));
        const anyScheduled = sameNameStudents.some(s => {
          const sMakeup = s.makeupDate ? parseMakeupDate(s.makeupDate) : null;
          const sIsMakeup = sMakeup && sMakeup.day === this.selectedDay && sMakeup.time === timeStr && (sMakeup.isWeekly || sMakeup.formattedSlash === dates.slashFormat || sMakeup.formattedDot === dates.dotFormat);
          const sRegTime = s.times && s.times[this.selectedDay];
          let sIsRegActive = false;
          if (sRegTime) {
            const parts = sRegTime.split(/[,/; ]+/).map(t => t.trim()).filter(Boolean);
            sIsRegActive = parts.includes(timeStr);
          }
          let sHasMakeupToday = false;
          if (s.makeupDate) {
            const parsed = parseMakeupDate(s.makeupDate);
            const sIsDateMatch = parsed && (parsed.isWeekly || parsed.formattedSlash === dates.slashFormat || parsed.formattedDot === dates.dotFormat);
            if (parsed && parsed.day === this.selectedDay && sIsDateMatch) {
              sHasMakeupToday = true;
            }
          }
          return (sIsRegActive && !sHasMakeupToday) || sIsMakeup;
        });

        if (anyScheduled) {
          return false; // The scheduled one will be shown, don't show this duplicate.
        }
        // If none are scheduled, show the first one to represent this log.
        return student.id === sameNameStudents[0].id;
      }

      return (isRegularActive && !hasMakeupToday) || isMakeupTodayAndTime;
    });
  }

  updateDashboard() {
    this.app.syncAttendanceFromDailyLogs();
    const container = document.getElementById("timeSlotsContainer");
    const timeIndicator = document.getElementById("selectedTimeIndicator");
    if (!container || !timeIndicator) return;
    
    timeIndicator.innerText = `${this.selectedDay} 전체 수업 현황`;
    container.innerHTML = "";

    const targetDates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${targetDates.slashFormat}${shortDay}`;
    
    const activeTimesSet = new Set();
    this.app.state.students.forEach(st => {
      const regTime = st.times && st.times[this.selectedDay];
      if (regTime && regTime.trim() !== "") {
        const parts = regTime.split(/[,/; ]+/).map(t => t.trim()).filter(Boolean);
        parts.forEach(p => activeTimesSet.add(p));
      }
      if (st.makeupDate) {
        const parsed = parseMakeupDate(st.makeupDate);
        if (parsed && parsed.day === this.selectedDay && (parsed.isWeekly || parsed.formattedSlash === targetDates.slashFormat || parsed.formattedDot === targetDates.dotFormat)) {
          activeTimesSet.add(parsed.time.trim());
        }
      }
    });

    this.app.state.dailyLogs.forEach(l => {
      if ((l.date || '').trim() === dailyLogDateStr.trim() && l.time && l.status && l.status !== '대기') {
        activeTimesSet.add(l.time.trim());
      }
    });

    const sortedTimes = Array.from(activeTimesSet).sort((a, b) => a.localeCompare(b));

    let anyStudentOnThisDay = false;
    let anyOverCapacityOnThisDay = false;

    // Group sorted times by hour slot
    const hourGroups = {};
    sortedTimes.forEach(timeStr => {
      const hourKey = timeStr.split(':')[0] + ':00';
      if (!hourGroups[hourKey]) {
        hourGroups[hourKey] = [];
      }
      const students = this.getActiveStudentsForTime(timeStr);
      if (students.length > 0) {
        hourGroups[hourKey].push({ timeStr, students });
      }
    });

    const sortedHourKeys = Object.keys(hourGroups).sort((a, b) => a.localeCompare(b));

    sortedHourKeys.forEach(hourKey => {
      const slotsInHour = hourGroups[hourKey];
      anyStudentOnThisDay = true;

      let lowerCount = 0;
      let upperCount = 0;
      slotsInHour.forEach(slot => {
        slot.students.forEach(st => {
          const isLower = ['초1', '초2', '초3'].includes(st.grade);
          if (isLower) lowerCount++;
          else upperCount++;
        });
      });

      const isLowerOver = lowerCount > 10;
      const isUpperOver = upperCount > 10;
      if (isLowerOver || isUpperOver) {
        anyOverCapacityOnThisDay = true;
      }

      const section = document.createElement("div");
      section.className = "time-slot-section glass-panel";
      section.style.background = "var(--box-bg)";
      section.style.border = "1px solid var(--panel-border)";
      section.style.borderRadius = "12px";
      section.style.padding = "1.2rem";
      section.style.display = "flex";
      section.style.flexDirection = "column";
      section.style.gap = "1rem";
      section.style.marginBottom = "1.5rem";

      const header = document.createElement("div");
      header.className = "time-slot-header";
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";
      header.style.paddingBottom = "0.6rem";

      const title = document.createElement("h3");
      title.innerText = `⏰ ${hourKey} 수업`;
      title.style.fontSize = "1.1rem";
      title.style.fontWeight = "600";
      title.style.color = "var(--accent)";
      
      const capacityInfo = document.createElement("div");
      capacityInfo.style.display = "flex";
      capacityInfo.style.gap = "0.75rem";
      capacityInfo.style.fontSize = "0.85rem";

      const lowerBadge = isLowerOver 
        ? `<span class="badge-danger">저학년: ${lowerCount}/10명 (초과)</span>`
        : (lowerCount === 10 ? `<span class="badge-warning">저학년: 10/10명</span>` : `<span class="badge-success">저학년: ${lowerCount}/10명</span>`);

      const upperBadge = isUpperOver 
        ? `<span class="badge-danger">고학년/중등: ${upperCount}/10명 (초과)</span>`
        : (upperCount === 10 ? `<span class="badge-warning">고학년/중등: 10/10명</span>` : `<span class="badge-success">고학년/중등: ${upperCount}/10명</span>`);

      capacityInfo.innerHTML = `${lowerBadge} ${upperBadge}`;

      header.appendChild(title);
      header.appendChild(capacityInfo);
      section.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "student-grid";

      slotsInHour.forEach(slot => {
        const timeStr = slot.timeStr;
        const activeStudents = slot.students;

        activeStudents.forEach(student => {
          const card = document.createElement("div");
          let typeClass = "regular";
          let statusLabel = "대기";
          const parsedMakeup = student.makeupDate ? parseMakeupDate(student.makeupDate) : null;
          const isMakeupToday = parsedMakeup && parsedMakeup.day === this.selectedDay && (parsedMakeup.isWeekly || parsedMakeup.formattedSlash === targetDates.slashFormat || parsedMakeup.formattedDot === targetDates.dotFormat) && parsedMakeup.time === timeStr;
          
          let isAbsent = false;
          if (student.absentDates) {
            const cleanAbs = student.absentDates.replace(/\s+/g, '');
            isAbsent = cleanAbs.includes(targetDates.slashFormat) || cleanAbs.includes(targetDates.dotFormat);
          }

          const dailyLog = this.app.state.dailyLogs.find(l => 
            (l.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, '') && 
            (l.time || '').trim() === timeStr.trim() &&
            (l.date || '').trim() === dailyLogDateStr.trim()
          );

          if (isMakeup) {
            const norm = dailyLog ? getNormalizedStatus(dailyLog.status) : "대기";
            if (norm === "보강완료" || norm === "수업완료") {
              typeClass = "completed";
              statusLabel = "보강 완료";
            } else if (norm === "수업중") {
              typeClass = "in-class";
              statusLabel = "보강 수업중";
            } else if (norm === "결석") {
              typeClass = "absent";
              statusLabel = "결석";
            } else if (norm === "휴강") {
              typeClass = "cancelled";
              statusLabel = "휴강";
            } else {
              typeClass = "makeup";
              statusLabel = "보강 수업";
            }
          } else {
            const norm = dailyLog ? getNormalizedStatus(dailyLog.status) : "대기";
            if (norm === "결석") {
              typeClass = "absent";
              statusLabel = "결석";
            } else if (norm === "수업완료" || norm === "보강완료") {
              typeClass = "completed";
              statusLabel = "출석 완료";
            } else if (norm === "수업중") {
              typeClass = "in-class";
              statusLabel = "수업중";
            } else if (norm === "휴강") {
              typeClass = "cancelled";
              statusLabel = "휴강";
            } else if (isAbsent) {
              typeClass = "absent";
              statusLabel = "결석";
            } else {
              typeClass = "regular";
              statusLabel = "대기";
            }
          }

          const memberRecForPhoneOnCard = this.app.state.memberAnalysis.find(m => (m.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, ''));
          const parentPhoneOnCard = memberRecForPhoneOnCard ? (memberRecForPhoneOnCard.phone || "").trim() : "";

          card.className = `student-card glass-panel ${typeClass}`;
          card.setAttribute("data-id", student.id);

          let timerHtml = "";
          if (typeClass === "in-class" && dailyLog && dailyLog.inTime) {
            const inTimeParts = dailyLog.inTime.split(":");
            if (inTimeParts.length === 2) {
              const inHrs = parseInt(inTimeParts[0], 10);
              const inMins = parseInt(inTimeParts[1], 10);
              const now = new Date();
              const inDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), inHrs, inMins, 0);
              const durationMins = getClassDuration(student);
              const elapsedMins = Math.max(0, Math.floor((now.getTime() - inDate.getTime()) / 60000));
              const progressPercent = Math.min(100, Math.round((elapsedMins / durationMins) * 100));
              const remainingMins = Math.max(0, durationMins - elapsedMins);
              
              timerHtml = `
                <div class="card-timer-container" style="margin-top: 0.6rem; font-size: 0.75rem; color: var(--text-secondary); width: 100%;">
                  <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                    <span>⏱️ ${elapsedMins}/${durationMins}분 경과</span>
                    <span>${remainingMins}분 남음</span>
                  </div>
                  <div class="progress-bar-bg" style="width:100%; height:6px; background:rgba(0,0,0,0.06); border-radius:3px; overflow:hidden;">
                    <div class="progress-bar-fill" style="width:${progressPercent}%; height:100%; background:var(--color-inclass); border-radius:3px; transition:width 0.3s ease;"></div>
                  </div>
                </div>
              `;
            }
          }

          if (typeClass === 'regular' || typeClass === 'makeup') {
            card.innerHTML = `
              <div class="card-header" style="justify-content: center; height: 100%; display: flex; align-items: center; padding: 1.2rem 0;">
                <span class="student-name" style="font-size: 1.4rem; font-weight: 700; text-align: center; color: #ffffff; width: 100%; word-break: keep-all;">${this.escapeHtml(student.name)}</span>
              </div>
            `;
          } else {
            card.innerHTML = `
              <div class="card-header">
                <span class="student-name">${this.escapeHtml(student.name)}</span>
                <div style="display:flex; align-items:center; gap:0.3rem;">
                  <span class="student-grade">${student.grade}</span>
                  <span class="badge-time" style="background:rgba(99,102,241,0.1); color:var(--accent); border:1px solid rgba(99,102,241,0.2); padding:0.1rem 0.35rem; border-radius:4px; font-size:0.7rem; font-weight:600;">${timeStr}</span>
                </div>
              </div>
              <div class="card-meta">
                <div class="card-meta-row" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                  <div style="display:flex; align-items:center;">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; margin-right:4px;">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>${student.classes || '수업'}</span>
                  </div>
                </div>
                ${timerHtml}
              </div>
              <span class="badge-tag">${statusLabel}</span>
              <div class="completed-overlay">
                <div class="checkmark-circle">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:16px; height:16px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            `;
          }

          card.addEventListener("click", (e) => {
            if (e.target.classList.contains("btn-absent-quick")) {
              e.stopPropagation();
              this.handleAbsentQuickClick(student.id, targetDates.slashFormat, timeStr);
              return;
            }
            if (e.target.classList.contains("btn-cancelled-quick")) {
              e.stopPropagation();
              this.handleCancelledQuickClick(student.id, targetDates.slashFormat, timeStr);
              return;
            }
            if (e.target.classList.contains("btn-sms-quick")) {
              e.stopPropagation();
              const msgType = confirm(`${student.name} 학생 학부모님께 문자를 발송하시겠습니까?\n[확인]을 누르면 등원 메시지, [확인 취소]를 누르면 하원 메시지가 작성됩니다.`);
              this.app.smsManager.sendSmsNotification(student, msgType ? "in" : "out", timeStr);
              return;
            }
            this.handleCardClick(student.id, isMakeup, isAbsent, targetDates.slashFormat, timeStr);
          });

          grid.appendChild(card);
        });
      });

      section.appendChild(grid);
      container.appendChild(section);
    });

    const headerWarningContainer = document.getElementById("headerCapacityWarning");
    if (headerWarningContainer) {
      headerWarningContainer.innerHTML = "";
      if (anyOverCapacityOnThisDay) {
        headerWarningContainer.innerHTML = `
          <span class="capacity-warning-badge" style="margin-left: 1rem;">
            ⚠️ 일부 수업 정원 초과 발생!
          </span>
        `;
      }
    }

    if (!anyStudentOnThisDay) {
      container.innerHTML = `
        <div class="no-students-placeholder">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p>이 요일에 예약된 학생이 없습니다.</p>
        </div>
      `;
    }

    this.updateStatusSummary();
  }

  handleCardClick(studentId, isMakeup, isAbsent, dateStr, activeTime) {
    const student = this.app.state.students.find(s => s.id === studentId);
    if (!student) return;

    let finalStatus = "대기";
    const targetDates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${targetDates.slashFormat}${shortDay}`;

    let dailyLog = this.app.state.dailyLogs.find(log => 
      log.name.trim() === student.name.trim() && 
      log.time.trim() === activeTime.trim() && 
      (log.date || '').trim() === dailyLogDateStr.trim()
    );

    let currentStatus = "대기";
    const norm = dailyLog ? getNormalizedStatus(dailyLog.status) : "대기";
    if (isAbsent || norm === "결석") {
      currentStatus = "결석";
    } else if (norm === "수업완료" || norm === "보강완료") {
      currentStatus = "완료";
    } else if (norm === "수업중") {
      currentStatus = "수업중";
    } else if (norm === "휴강") {
      currentStatus = "휴강";
    }

    if (currentStatus === "결석") {
      const confirmReset = confirm(`${student.name} 학생의 결석 상태를 해제하고 대기 상태로 변경하시겠습니까?`);
      if (!confirmReset) return;
      if (isMakeup) {
        student.makeupCompleted = '대기';
        this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "대기", "students");
      } else {
        let datesList = student.absentDates ? student.absentDates.split(',').map(d => d.trim()).filter(Boolean) : [];
        datesList = datesList.filter(d => d !== dateStr);
        student.absentDates = datesList.join(', ');
        this.app.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");
      }
      finalStatus = "대기";
    } else if (currentStatus === "휴강") {
      const confirmReset = confirm(`${student.name} 학생의 휴강 상태를 해제하고 대기 상태로 변경하시겠습니까?`);
      if (!confirmReset) return;
      if (isMakeup) {
        student.makeupCompleted = '대기';
        this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "대기", "students");
      } else {
        student.attendanceStatus = '대기';
      }
      finalStatus = "대기";
    } else if (currentStatus === "완료") {
      const confirmAbsent = confirm(`${student.name} 학생을 결석 상태로 변경하시겠습니까?`);
      if (!confirmAbsent) {
        const confirmReset = confirm("대기 상태로 변경하시겠습니까?");
        if (confirmReset) {
          if (isMakeup) {
            student.makeupCompleted = '대기';
            this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "대기", "students");
          } else {
            student.attendanceStatus = '대기';
          }
          finalStatus = "대기";
        } else {
          return;
        }
      } else {
        if (isMakeup) {
          student.makeupCompleted = '대기';
          this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "대기", "students");
        } else {
          let datesList = student.absentDates ? student.absentDates.split(',').map(d => d.trim()).filter(Boolean) : [];
          if (!datesList.includes(dateStr)) {
            datesList.push(dateStr);
          }
          student.absentDates = datesList.join(', ');
          this.app.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");
        }
        finalStatus = "결석";
      }
    } else if (currentStatus === "수업중") {
      // 1. Check if class time is remaining first (Reuse existing function isClassTimeRemaining)
      if (this.isClassTimeRemaining(student, activeTime)) {
        // Class time is remaining (isClassTimeRemaining already alerts remaining time)
        // Prompt for undoing wrong click (rollback to standby)
        const confirmReset = confirm("대기 상태로 돌리시겠습니까? (오클릭 원복)");
        if (confirmReset) {
          if (isMakeup) {
            student.makeupCompleted = '대기';
            this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "대기", "students");
            if (student.absentDates) {
              const datesList = student.absentDates.split(',').map(d => d.trim()).filter(Boolean);
              for (let i = datesList.length - 1; i >= 0; i--) {
                if (datesList[i].startsWith('~~') && datesList[i].endsWith('~~')) {
                  datesList[i] = datesList[i].substring(2, datesList[i].length - 2);
                  break;
                }
              }
              student.absentDates = datesList.join(', ');
              this.app.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");
            }
          } else {
            student.attendanceStatus = '대기';
          }
          finalStatus = "대기";
        } else {
          return;
        }
      } else {
        // Class time is completed, prompt for normal completion
        const confirmComplete = confirm(`${student.name} 학생의 수업을 완료하시겠습니까?`);
        if (!confirmComplete) {
          const confirmReset = confirm("대기 상태로 돌리시겠습니까? (오클릭 원복)");
          if (confirmReset) {
            if (isMakeup) {
              student.makeupCompleted = '대기';
              this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "대기", "students");
              if (student.absentDates) {
                const datesList = student.absentDates.split(',').map(d => d.trim()).filter(Boolean);
                for (let i = datesList.length - 1; i >= 0; i--) {
                  if (datesList[i].startsWith('~~') && datesList[i].endsWith('~~')) {
                    datesList[i] = datesList[i].substring(2, datesList[i].length - 2);
                    break;
                  }
                }
                student.absentDates = datesList.join(', ');
                this.app.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");
              }
            } else {
              student.attendanceStatus = '대기';
            }
            finalStatus = "대기";
          } else {
            return;
          }
        } else {
          if (isMakeup) {
            student.makeupCompleted = '완료';
            this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "완료", "students");
            if (student.absentDates) {
              const datesList = student.absentDates.split(',').map(d => d.trim()).filter(Boolean);
              for (let i = 0; i < datesList.length; i++) {
                if (!datesList[i].startsWith('~~') && !datesList[i].endsWith('~~')) {
                  datesList[i] = `~~${datesList[i]}~~`;
                  break;
                }
              }
              student.absentDates = datesList.join(', ');
              this.app.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");
            }
            finalStatus = "보강완료";
          } else {
            student.attendanceStatus = '수업완료';
            finalStatus = "수업완료";
          }
        }
      }
    } else { // "대기"
      if (isMakeup) {
        student.makeupCompleted = '수업중';
        this.app.api.updateFieldInGoogleSheets(student.row, "makeupCompleted", "수업중", "students");
      } else {
        student.attendanceStatus = '수업중';
      }
      finalStatus = "수업중";
    }

    // Look up parent's phone number from memberAnalysis
    const memberRecForPhone = this.app.state.memberAnalysis.find(m => (m.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, ''));
    const parentPhoneVal = memberRecForPhone ? (memberRecForPhone.phone || "").trim() : "";

    dailyLog = this.app.state.dailyLogs.find(log => 
      (log.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, '') && 
      log.time.trim() === activeTime.trim() && 
      (log.date || '').trim() === dailyLogDateStr.trim()
    );

    let dailyStatus = "대기";
    let dailyInTime = "";
    
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (finalStatus === "수업중") {
      dailyStatus = "수업중";
    } else if (finalStatus === "수업완료") {
      dailyStatus = "수업완료";
    } else if (finalStatus === "보강완료") {
      dailyStatus = "보강완료";
    } else if (finalStatus === "결석") {
      dailyStatus = "결석";
    } else {
      dailyStatus = "대기";
    }

    if (dailyLog) {
      dailyInTime = dailyLog.inTime || "";
      if ((finalStatus === "수업중" || finalStatus === "보강완료") && !dailyInTime) {
        dailyInTime = currentTime;
      } else if (finalStatus === "결석" || finalStatus === "대기") {
        dailyInTime = "";
      }
      dailyLog.status = dailyStatus;
      dailyLog.inTime = dailyInTime;
      const attendanceUpdates = [
        { tab: "dailyLogs", row: dailyLog.row, field: "status", value: dailyStatus },
        { tab: "dailyLogs", row: dailyLog.row, field: "inTime", value: dailyInTime }
      ];
      this.app.api.updateBatchInGoogleSheets(attendanceUpdates);
    } else {
      if (finalStatus === "수업중" || finalStatus === "보강완료") {
        dailyInTime = currentTime;
      }
      const nextRow = this.app.state.dailyLogs.length > 0 ? Math.max(...this.app.state.dailyLogs.map(l => l.row)) + 1 : 2;
      dailyLog = {
        id: 'daily_' + nextRow,
        row: nextRow,
        date: dailyLogDateStr,
        time: activeTime,
        name: student.name,
        notes: student.notes || "",
        status: dailyStatus,
        inTime: dailyInTime,
        reason: isMakeup ? "보강 수업" : (finalStatus === "결석" ? "정규 결석" : ""),
        number: "",
        event: "",
        grammarDone: "",
        specialClass: "",
        contents: ""
      };
      this.app.state.dailyLogs.push(dailyLog);
      this.app.api.addDailyLogToGoogleSheets(dailyLog);
    }

    // Trigger SMS Notification
    if (finalStatus === "수업중") {
      this.app.smsManager.sendSmsNotification(student, "in", dailyInTime || currentTime);
    } else if (finalStatus === "수업완료" || finalStatus === "보강완료") {
      this.app.smsManager.sendSmsNotification(student, "out", currentTime);
    }

    // Log the attendance event
    this.logAttendanceEvent(student.name, finalStatus, activeTime);

    this.app.saveState();
    this.app.sheetSim.setData(this.app.state);
    this.updateDashboard();
  }

  handleAbsentQuickClick(studentId, dateStr, activeTime) {
    const student = this.app.state.students.find(s => s.id === studentId);
    if (!student) return;

    const confirmAbsent = confirm(`${student.name} 학생을 결석 처리하시겠습니까?`);
    if (!confirmAbsent) return;

    let datesList = student.absentDates ? student.absentDates.split(',').map(d => d.trim()).filter(Boolean) : [];
    if (!datesList.includes(dateStr)) {
      datesList.push(dateStr);
    }
    student.absentDates = datesList.join(', ');
    student.attendanceStatus = '대기';

    this.app.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");

    const targetDates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${targetDates.slashFormat}${shortDay}`;
    
    const memberRecForPhone = this.app.state.memberAnalysis.find(m => (m.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, ''));
    const parentPhoneVal = memberRecForPhone ? (memberRecForPhone.phone || "").trim() : "";

    let dailyLog = this.app.state.dailyLogs.find(log => 
      (log.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, '') && 
      (log.date || '').trim() === dailyLogDateStr.trim() &&
      (log.time || '').trim() === activeTime.trim()
    );

    if (dailyLog) {
      dailyLog.status = "결석";
      dailyLog.inTime = "";
      const absentUpdates = [
        { tab: "dailyLogs", row: dailyLog.row, field: "status", value: "결석" },
        { tab: "dailyLogs", row: dailyLog.row, field: "inTime", value: "" }
      ];
      this.app.api.updateBatchInGoogleSheets(absentUpdates);
    } else {
      const nextRow = this.app.state.dailyLogs.length > 0 ? Math.max(...this.app.state.dailyLogs.map(l => l.row)) + 1 : 2;
      dailyLog = {
        id: 'daily_' + nextRow,
        row: nextRow,
        date: dailyLogDateStr,
        time: activeTime,
        name: student.name,
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

    this.logAttendanceEvent(student.name, "결석", activeTime);

    this.app.saveState();
    this.app.sheetSim.setData(this.app.state);
    this.updateDashboard();
  }

  handleCancelledQuickClick(studentId, dateStr, activeTime) {
    const student = this.app.state.students.find(s => s.id === studentId);
    if (!student) return;

    const confirmCancel = confirm(`${student.name} 학생의 오늘 수업을 휴강 처리하시겠습니까?`);
    if (!confirmCancel) return;

    student.attendanceStatus = '대기';

    const targetDates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${targetDates.slashFormat}${shortDay}`;
    
    const memberRecForPhone = this.app.state.memberAnalysis.find(m => (m.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, ''));
    const parentPhoneVal = memberRecForPhone ? (memberRecForPhone.phone || "").trim() : "";

    let dailyLog = this.app.state.dailyLogs.find(log => 
      (log.name || '').replace(/\s+/g, '') === (student.name || '').replace(/\s+/g, '') && 
      (log.date || '').trim() === dailyLogDateStr.trim() &&
      (log.time || '').trim() === activeTime.trim()
    );

    if (dailyLog) {
      dailyLog.status = "휴강";
      dailyLog.inTime = "";
      dailyLog.reason = "휴강";
      const cancelUpdates = [
        { tab: "dailyLogs", row: dailyLog.row, field: "status", value: "휴강" },
        { tab: "dailyLogs", row: dailyLog.row, field: "inTime", value: "" },
        { tab: "dailyLogs", row: dailyLog.row, field: "reason", value: "휴강" }
      ];
      this.app.api.updateBatchInGoogleSheets(cancelUpdates);
    } else {
      const nextRow = this.app.state.dailyLogs.length > 0 ? Math.max(...this.app.state.dailyLogs.map(l => l.row)) + 1 : 2;
      dailyLog = {
        id: 'daily_' + nextRow,
        row: nextRow,
        date: dailyLogDateStr,
        time: activeTime,
        name: student.name,
        notes: student.notes || "",
        status: "휴강",
        inTime: "",
        reason: "휴강",
        number: "",
        event: "",
        grammarDone: "",
        specialClass: "",
        contents: ""
      };
      this.app.state.dailyLogs.push(dailyLog);
      this.app.api.addDailyLogToGoogleSheets(dailyLog);
    }

    this.logAttendanceEvent(student.name, "휴강", activeTime);

    this.app.saveState();
    this.app.sheetSim.setData(this.app.state);
    this.updateDashboard();
  }

  updateStatusSummary() {
    const summaryStandby = document.getElementById("summaryStandbyCount");
    const summaryInClass = document.getElementById("summaryInClassCount");
    const summaryCompleted = document.getElementById("summaryCompletedCount");
    const summaryAbsent = document.getElementById("summaryAbsentCount");
    const summaryMakeup = document.getElementById("summaryMakeupCount");
    const summaryCancelled = document.getElementById("summaryCancelledCount");

    if (!summaryStandby) return;

    let standbyCount = 0;
    let inClassCount = 0;
    let completedCount = 0;
    let absentCount = 0;
    let makeupCount = 0;
    let cancelledCount = 0;

    const targetDates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${targetDates.slashFormat}${shortDay}`;

    // Get all times that are active on this day
    const activeTimesSet = new Set();
    this.app.state.students.forEach(st => {
      const regTime = st.times && st.times[this.selectedDay];
      if (regTime && regTime.trim() !== "") {
        const parts = regTime.split(/[,/; ]+/).map(t => t.trim()).filter(Boolean);
        parts.forEach(p => activeTimesSet.add(p));
      }
      if (st.makeupDate) {
        const parsed = parseMakeupDate(st.makeupDate);
        if (parsed && parsed.day === this.selectedDay && (parsed.isWeekly || parsed.formattedSlash === targetDates.slashFormat || parsed.formattedDot === targetDates.dotFormat)) {
          activeTimesSet.add(parsed.time.trim());
        }
      }
    });

    this.app.state.dailyLogs.forEach(l => {
      if ((l.date || '').trim() === dailyLogDateStr.trim() && l.time && l.status && l.status !== '대기') {
        activeTimesSet.add(l.time.trim());
      }
    });

    activeTimesSet.forEach(timeStr => {
      const activeStudents = this.getActiveStudentsForTime(timeStr);
      activeStudents.forEach(student => {
        const parsedMakeup = student.makeupDate ? parseMakeupDate(student.makeupDate) : null;
        const isMakeup = parsedMakeup && parsedMakeup.day === this.selectedDay && parsedMakeup.time === timeStr && (parsedMakeup.isWeekly || parsedMakeup.formattedSlash === targetDates.slashFormat || parsedMakeup.formattedDot === targetDates.dotFormat);
        
        let isAbsent = false;
        if (student.absentDates) {
          const cleanAbs = student.absentDates.replace(/\s+/g, '');
          isAbsent = cleanAbs.includes(targetDates.slashFormat) || cleanAbs.includes(targetDates.dotFormat);
        }

        const dailyLog = this.app.state.dailyLogs.find(l => 
          l.name.trim() === student.name.trim() && 
          (l.time || '').trim() === timeStr.trim() &&
          (l.date || '').trim() === dailyLogDateStr.trim()
        );

        const norm = dailyLog ? getNormalizedStatus(dailyLog.status) : "대기";
        if (norm === "결석" || isAbsent) {
          absentCount++;
        } else if (norm === "수업완료" || norm === "보강완료") {
          completedCount++;
        } else if (norm === "수업중") {
          inClassCount++;
        } else if (norm === "휴강") {
          cancelledCount++;
        } else if (isMakeup) {
          makeupCount++;
        } else {
          standbyCount++;
        }
      });
    });

    summaryStandby.innerText = standbyCount;
    summaryInClass.innerText = inClassCount;
    summaryCompleted.innerText = completedCount;
    summaryAbsent.innerText = absentCount;
    summaryMakeup.innerText = makeupCount;
    summaryCancelled.innerText = cancelledCount;
  }

  isClassTimeRemaining(student, activeTime) {
    if (this.selectedDay !== WEEKDAYS[new Date().getDay()]) {
      return false; // Skip checks when editing past calendars
    }

    const targetDates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${targetDates.slashFormat}${shortDay}`;

    const dailyLog = this.app.state.dailyLogs.find(l => 
      l.name.trim() === student.name.trim() && 
      l.time.trim() === activeTime.trim() && 
      (l.date || '').trim() === dailyLogDateStr.trim()
    );

    if (!dailyLog || !dailyLog.inTime) return false;

    // Parse inTime (e.g. "14:02")
    const inTimeParts = dailyLog.inTime.split(":");
    if (inTimeParts.length !== 2) return false;
    const inHrs = parseInt(inTimeParts[0], 10);
    const inMins = parseInt(inTimeParts[1], 10);

    const now = new Date();
    const inDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), inHrs, inMins, 0);

    // Calculate duration
    const durationMins = getClassDuration(student);
    const elapsedMins = Math.floor((now.getTime() - inDate.getTime()) / 60000);
    const remainingMins = durationMins - elapsedMins;

    if (remainingMins > 0) {
      alert(`수업 시간이 ${remainingMins}분 남았습니다. 정해진 수업 시간(${durationMins}분)을 채운 뒤 퇴실해 주세요.`);
      return true; // Still remaining
    }
    return false;
  }

  logAttendanceEvent(name, status, timeStr) {
    if (status === "대기") return;
    
    const today = new Date();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const dateStr = `${m}/${d}`;
    const dayStr = WEEKDAYS[today.getDay()];
    
    const nextRowIdx = this.app.state.attendanceLogs.length > 0 ? Math.max(...this.app.state.attendanceLogs.map(l => l.row)) + 1 : 2;
    const timestampStr = `${today.getFullYear()}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} ${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}:${String(today.getSeconds()).padStart(2,'0')}`;
    
    const newLog = {
      id: 'log_' + nextRowIdx,
      row: nextRowIdx,
      timestamp: timestampStr,
      name: name,
      date: dateStr,
      day: dayStr,
      time: timeStr,
      status: status
    };
    
    this.app.state.attendanceLogs.push(newLog);
    this.app.saveState();
    
    // this.app.api.addAttendanceLogToGoogleSheets(newLog); // Removed as '누적출결데이터' sheet is deleted
  }

  updateQuickSchedules() {
    const listContainer = document.getElementById("quickScheduleList");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const slotsMap = {};
    
    this.app.state.students.forEach(st => {
      if (st.times) {
        Object.keys(st.times).forEach(day => {
          const time = st.times[day];
          if (time) {
            const key = `${day} ${time}`;
            if (!slotsMap[key]) {
              slotsMap[key] = { lower: 0, upper: 0, regular: 0, makeup: 0 };
            }
            const isLower = ['초1', '초2', '초3'].includes(st.grade);
            if (isLower) slotsMap[key].lower++;
            else slotsMap[key].upper++;
            slotsMap[key].regular++;
          }
        });
      }

      if (st.makeupDate) {
        const parsed = parseMakeupDate(st.makeupDate);
        if (parsed) {
          const key = `${parsed.day} ${parsed.time}`;
          if (!slotsMap[key]) {
            slotsMap[key] = { lower: 0, upper: 0, regular: 0, makeup: 0 };
          }
          const isLower = ['초1', '초2', '초3'].includes(st.grade);
          if (isLower) slotsMap[key].lower++;
          else slotsMap[key].upper++;
          slotsMap[key].makeup++;
        }
      }
    });

    const sortedSlots = Object.keys(slotsMap).map(key => {
      const [day, time] = key.split(' ');
      return { key, day, time, ...slotsMap[key] };
    }).sort((a, b) => {
      const days = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
      const dayDiff = days.indexOf(a.day) - days.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.time.localeCompare(b.time);
    });

    if (sortedSlots.length === 0) {
      listContainer.innerHTML = `<div style="padding:0.5rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">등록된 일정 없음</div>`;
      return;
    }

    sortedSlots.forEach(slot => {
      const item = document.createElement("div");
      const isOver = slot.lower > 10 || slot.upper > 10;
      const isActive = slot.day === this.selectedDay && slot.time === this.selectedTime;
      
      item.className = `schedule-quick-item ${isActive ? 'active' : ''}`;
      
      let badgeHtml = "";
      if (isOver) {
        badgeHtml = `<span class="badge-danger">초과</span>`;
      } else if (slot.makeup > 0) {
        badgeHtml = `<span class="badge-warning" style="background:rgba(236,72,153,0.15); color:var(--color-makeup); border-color:rgba(236,72,153,0.3)">보강</span>`;
      } else {
        badgeHtml = `<span class="badge-success">정상</span>`;
      }

      item.innerHTML = `
        <span style="font-weight:500;">${slot.day} ${slot.time}</span>
        <div style="display:flex; align-items:center; gap:0.4rem;">
          <span style="font-size:0.75rem; color:var(--text-secondary);">${slot.lower + slot.upper}명</span>
          ${badgeHtml}
        </div>
      `;

      item.addEventListener("click", () => {
        this.selectedDay = slot.day;
        this.selectedTime = slot.time;
        this.autoTimeEnabled = false;
        const autoEl = document.getElementById("autoTimeSwitch");
        if (autoEl) autoEl.checked = false;
        
        const dayEl = document.getElementById("selectDay");
        const timeEl = document.getElementById("selectTime");
        if (dayEl) dayEl.value = slot.day;
        if (timeEl) timeEl.value = slot.time;
        
        this.app.saveState();
        this.updateDashboard();
      });

      listContainer.appendChild(item);
    });
  }
}
