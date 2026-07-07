// sheet-sim.js - Custom Google Sheets Simulator supporting multiple tabs
class SheetSimulator {
  constructor(containerId, onDataChanged) {
    this.container = document.getElementById(containerId);
    this.onDataChanged = onDataChanged; // Callback when data changes: (tabName, updatedData)
    this.searchQuery = "";
    this.activeTab = "전체 시간표";
    
    // Internal data storage
    this.dataMap = {
      students: [],
      dailyLogs: [],
      textbooks: [],
      consultations: [],
      memberAnalysis: [],
      attendanceLogs: [],
      accumulatedLogs: []
    };
  }

  getNormalizedStatus(status) {
    if (!status) return "대기";
    const s = String(status).trim().replace(/\s+/g, "");
    if (s === "출석" || s === "수업완료" || s === "출석완료" || s === "완료") return "수업완료";
    if (s === "보강완료" || s === "보강 완료" || s === "보강") return "보강완료";
    if (s === "수업중" || s === "수업 중" || s === "중") return "수업중";
    if (s === "결석") return "결석";
    if (s === "대기") return "대기";
    return s;
  }

  normalizeGrade(g) {
    if (!g) return "";
    let s = String(g).trim().replace(/\s+/g, "");
    s = s.replace(/^초등(\d)/, "초$1");
    s = s.replace(/^중등(\d)/, "중$1");
    s = s.replace(/^고등(\d)/, "고$1");
    return s;
  }

  setData(dataMap) {
    this.dataMap = {
      students: dataMap.students || [],
      dailyLogs: dataMap.dailyLogs || [],
      textbooks: dataMap.textbooks || [],
      consultations: dataMap.consultations || [],
      memberAnalysis: dataMap.memberAnalysis || [],
      attendanceLogs: dataMap.attendanceLogs || [],
      accumulatedLogs: dataMap.accumulatedLogs || []
    };
    this.render();
  }

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.render();
  }

  getConditionalStyle(value, fieldName) {
    if (!value) return "";
    const valStr = String(value);
    if (valStr.includes("글완") || valStr.includes("글쓰기완") || valStr.includes("완료") || valStr.includes("표현활동")) {
      return "color: #2563eb; font-weight: bold;";
    }
    return "";
  }


  // Calculate capacities for Timetable
  calculateCapacities() {
    const capacities = {};
    const days = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
    const hours = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
    
    days.forEach(d => {
      capacities[d] = {};
      hours.forEach(h => {
        capacities[d][h] = { lower: 0, upper: 0 };
      });
    });

    this.dataMap.students.forEach(student => {
      const grade = student.grade;
      const isLower = ['초1', '초2', '초3'].includes(grade);
      
      if (student.times) {
        Object.keys(student.times).forEach(day => {
          const timeStr = student.times[day];
          if (timeStr) {
            const parts = timeStr.split(/[,/; ]+/).map(t => t.trim()).filter(Boolean);
            parts.forEach(time => {
              if (capacities[day] && capacities[day][time]) {
                if (isLower) capacities[day][time].lower++;
                else capacities[day][time].upper++;
              }
            });
          }
        });
      }

      if (student.makeupDate) {
        // Simple makeup date day/time parsing
        const cleanStr = student.makeupDate.trim();
        const simpleMatch = cleanStr.match(/^([가-힣]{3})\s+(\d{2}:\d{2})$/);
        let parsed = null;
        if (simpleMatch) {
          parsed = { day: simpleMatch[1], time: simpleMatch[2] };
        } else {
          const d = new Date(cleanStr.replace(/-/g, '/'));
          if (!isNaN(d.getTime())) {
            const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
            const day = dayNames[d.getDay()];
            const time = `${String(d.getHours()).padStart(2, '0')}:00`;
            parsed = { day, time };
          }
        }

        if (parsed && capacities[parsed.day] && capacities[parsed.day][parsed.time]) {
          if (isLower) capacities[parsed.day][parsed.time].lower++;
          else capacities[parsed.day][parsed.time].upper++;
        }
      }
    });

    return capacities;
  }

  render() {
    if (!this.container) return;

    const capacities = this.calculateCapacities();

    let html = `
      <div class="sheet-container glass-panel ${this.activeTab === '한명 검색' ? 'decoupled-view' : ''}">
        <!-- Sheet Header Toolbar -->
        <div class="sheet-toolbar">
          <h2 class="panel-title" style="display:flex; align-items:center; gap:0.5rem;">
            📊 구글 시트 시뮬레이터
          </h2>
          
          <div class="sheet-search">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" class="input-custom" id="sheetSearchInput" placeholder="이름 또는 검색어 입력..." value="${this.searchQuery}">
          </div>
          
          <div class="action-buttons">
            <button class="btn-primary" id="btnSheetAddRow">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              행 추가
            </button>
            <button class="btn-secondary" id="btnSheetReset">데이터 리셋</button>
          </div>
        </div>

        <!-- Google Sheets Tab Bar -->
        <div class="sheet-tabs">
          <button class="sheet-tab-item ${this.activeTab === '전체 시간표' ? 'active' : ''}" data-tab="전체 시간표">전체 시간표 📑</button>
          <button class="sheet-tab-item ${this.activeTab === '오늘 출석부' ? 'active' : ''}" data-tab="오늘 출석부">오늘 출석부 📅</button>
          <button class="sheet-tab-item ${this.activeTab === '문해력교재관리' ? 'active' : ''}" data-tab="문해력교재관리">문해력교재관리 📚</button>
          <button class="sheet-tab-item ${this.activeTab === '상담내용/리포트발송/채널발송' ? 'active' : ''}" data-tab="상담내용/리포트발송/채널발송">상담내용/리포트발송/채널발송 💬</button>
          <button class="sheet-tab-item ${this.activeTab === '회원 분석/레벨변동/전화상담' ? 'active' : ''}" data-tab="회원 분석/레벨변동/전화상담">회원 분석/레벨변동/전화상담 👤</button>
          <button class="sheet-tab-item ${this.activeTab === '한명 검색' ? 'active' : ''}" data-tab="한명 검색">한명 검색 🔍</button>
          <button class="sheet-tab-item ${this.activeTab === '누적일일수업관리' ? 'active' : ''}" data-tab="누적일일수업관리">누적일일수업관리 📝</button>
        </div>

        <!-- Sheet Table Wrapper -->
        <div class="sheet-table-wrapper" style="border: none; background: transparent; padding: 0; display: block;">
          ${this.activeTab === "한명 검색" ? this.renderDecoupledSingleSearch(capacities) : `
          <table class="sheet-table">
            <thead>
              ${this.renderTableHeader()}
            </thead>
            <tbody>
              ${this.renderTableBody(capacities)}
            </tbody>
          </table>
          `}
        </div>

        <!-- Sheet Footer Legends -->
        ${this.renderFooterLegend()}
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEvents();
    this.makeColumnsResizable();
  }

  renderTableHeader() {
    switch (this.activeTab) {
      case "전체 시간표":
        return `
          <tr>
            <th class="row-num-col">행</th>
            <th>학년 (B)</th>
            <th>학생 이름 (C)</th>
            <th>수업 시수 (D)</th>
            <th style="background:rgba(99,102,241,0.1); text-align:center;">월 (E)</th>
            <th style="background:rgba(99,102,241,0.1); text-align:center;">화 (F)</th>
            <th style="background:rgba(99,102,241,0.1); text-align:center;">수 (G)</th>
            <th style="background:rgba(99,102,241,0.1); text-align:center;">목 (H)</th>
            <th style="background:rgba(99,102,241,0.1); text-align:center;">금 (I)</th>
            <th style="background:rgba(99,102,241,0.1); text-align:center;">토 (J)</th>
            <th>결석 일자들 (L)</th>
            <th style="background:rgba(236,72,153,0.1);">보강일시 (AE)</th>
            <th style="background:rgba(236,72,153,0.1);">보강완료 (AF)</th>
            <th>동작</th>
          </tr>
        `;

      case "오늘 출석부":
        return `
          <tr>
            <th class="row-num-col">행</th>
            <th>날짜요일 (A)</th>
            <th>시간 (B)</th>
            <th>이름 (C)</th>
            <th>특이사항 (D)</th>
            <th>등원여부 (E)</th>
            <th>등원시간 (F)</th>
            <th>보강결석사유 (G)</th>
            <th>숫자 (H)</th>
            <th>이벤트 (I)</th>
            <th>진단/글쓰기 특별 수업 (J)</th>
            <th>수업내용 및 특이사항 (K)</th>
            <th>동작</th>
          </tr>
        `;

      case "문해력교재관리":
        return `
          <tr>
            <th class="row-num-col">행</th>
            <th>학년 (A)</th>
            <th>이름 (B)</th>
            <th style="background:#e0f2fe !important; color:#0369a1;">비문학 교재명 (C)</th>
            <th style="background:#e0f2fe !important; color:#0369a1;">시작일 (D)</th>
            <th style="background:#e0f2fe !important; color:#0369a1;">마침일 (E)</th>
            <th style="background:#e0f2fe !important; color:#0369a1;">정답률 (F)</th>
            <th style="background:#ffe4e6 !important; color:#b91c1c;">문학교재명 (G)</th>
            <th style="background:#ffe4e6 !important; color:#b91c1c;">시작일 (H)</th>
            <th style="background:#ffe4e6 !important; color:#b91c1c;">마침일 (I)</th>
            <th style="background:#ffe4e6 !important; color:#b91c1c;">정답률 (J)</th>
            <th style="background:#fef3c7 !important; color:#b45309;">어휘 교재명 (K)</th>
            <th style="background:#fef3c7 !important; color:#b45309;">시작일 (L)</th>
            <th style="background:#fef3c7 !important; color:#b45309;">마침일 (M)</th>
            <th style="background:#fef3c7 !important; color:#b45309;">정답률 (N)</th>
            <th style="background:#f3e8ff !important; color:#6d28d9;">복합 교재명 (O)</th>
            <th style="background:#f3e8ff !important; color:#6d28d9;">시작일 (P)</th>
            <th style="background:#f3e8ff !important; color:#6d28d9;">마침일 (Q)</th>
            <th style="background:#f3e8ff !important; color:#6d28d9;">정답률 (R)</th>
            <th style="background:#d1fae5 !important; color:#047857;">음독 교재 (S)</th>
            <th style="background:#d1fae5 !important; color:#047857;">시작일 (T)</th>
            <th style="background:#d1fae5 !important; color:#047857;">마침일 (U)</th>
            <th style="background:#d1fae5 !important; color:#047857;">정답률 (V)</th>
            <th>동작</th>
          </tr>
        `;
      case "상담내용/리포트발송/채널발송":
        return `
          <tr>
            <th class="row-num-col" style="width: 40px; text-align:center;">행</th>
            <th style="width: 70px; text-align:center;">학년 (A)</th>
            <th style="width: 90px; text-align:center;">이름 (B)</th>
            <th style="width: 90px; text-align:center;">작성기간 (C)</th>
            <th style="width: 60px; text-align:center; white-space: normal; word-break: break-all;">작성인 (D)</th>
            <th style="width: 380px;">상담내용 / 분석지 / 채널 보냄 (E)</th>
            <th style="width: 300px;">부모님의 need / 학생 특이사항 (F)</th>
            <th style="width: 60px; text-align:center;">동작</th>
          </tr>
        `;
      case "회원 분석/레벨변동/전화상담":
        return `
          <tr>
            <th class="row-num-col">행</th>
            <th>순번 (A)</th>
            <th>이름 (B)</th>
            <th>학년 (C)</th>
            <th>등록일 (D)</th>
            <th>상담/채널 (E)</th>
            <th>학생 특이사항... (F)</th>
            <th>진도 관리 (G)</th>
            <th>교과지수... (H)</th>
            <th>레벨 변동 (I)</th>
            <th>훈민정음... (J)</th>
            <th>읽트/독트... (K)</th>
            <th>목표달성... (L)</th>
            <th>분석지 발송 (M)</th>
            <th>독서 방법 (N)</th>
            <th>아이디 (O)</th>
            <th>연락처 (P)</th>
            <th>동작</th>
          </tr>
        `;
      case "한명 검색":
        return `
          <tr>
            <th class="row-num-col">행</th>
            <th>A</th>
            <th>B</th>
            <th>C</th>
            <th>D</th>
            <th>E</th>
            <th>F</th>
            <th>G</th>
            <th>H</th>
            <th>I</th>
            <th>J</th>
            <th>K</th>
            <th>L</th>
            <th>M</th>
            <th>N</th>
            <th>O</th>
            <th>P</th>
            <th>Q</th>
            <th>R</th>
          </tr>
        `;
      case "누적일일수업관리":
        return `
          <tr>
            <th class="row-num-col">행</th>
            <th>날짜요일 (A)</th>
            <th>시간 (B)</th>
            <th>이름 (C)</th>
            <th>특이사항 (D)</th>
            <th>등원여부 (E)</th>
            <th>등원시간 (F)</th>
            <th>보강결석사유 (G)</th>
            <th>숫자 (H)</th>
            <th>이벤트 (I)</th>
            <th>진단글쓰기/특별수업 (J)</th>
            <th>수업내용 및 특이사항 (K)</th>
            <th>동작</th>
          </tr>
        `;
    }
  }

  renderTableBody(capacities) {
    const query = this.searchQuery;
    
    switch (this.activeTab) {
      case "전체 시간표": {
        const filtered = this.dataMap.students.filter(row => {
          const nameVal = row.name ? String(row.name).toLowerCase() : "";
          const gradeVal = row.grade ? String(row.grade).toLowerCase() : "";
          return nameVal.includes(query) || gradeVal.includes(query);
        });
        if (filtered.length === 0) return `<tr><td colspan="14" style="text-align:center; padding:2rem; color:var(--text-muted);">학생 데이터가 없습니다.</td></tr>`;
        
        return filtered.map(row => {
          let isOverCapacity = false;
          const isLower = ['초1', '초2', '초3'].includes(row.grade);
          if (row.times) {
            Object.keys(row.times).forEach(day => {
              const time = row.times[day];
              if (time && capacities[day] && capacities[day][time]) {
                const cap = capacities[day][time];
                if ((isLower && cap.lower > 10) || (!isLower && cap.upper > 10)) {
                  isOverCapacity = true;
                }
              }
            });
          }

          return `
            <tr class="${isOverCapacity ? 'row-error' : ''}" data-id="${row.id}">
              <td class="row-num-col" style="text-align:center; font-weight:600;">${row.row}</td>

              <td>
                <select class="sheet-input-grade" style="width: 70px;">
                  ${[
                    { val: '초1', label: '초등 1' },
                    { val: '초2', label: '초등 2' },
                    { val: '초3', label: '초등 3' },
                    { val: '초4', label: '초등 4' },
                    { val: '초5', label: '초등 5' },
                    { val: '초6', label: '초등 6' },
                    { val: '중1', label: '중등 1' },
                    { val: '중2', label: '중등 2' },
                    { val: '중3', label: '중등 3' },
                    { val: '고1', label: '고등 1' },
                    { val: '고2', label: '고등 2' },
                    { val: '고3', label: '고등 3' },
                    { val: '기타', label: '기타' }
                  ].map(g => {
                    return '<option value="' + g.val + '"' + (this.normalizeGrade(row.grade) === this.normalizeGrade(g.val) ? ' selected' : '') + '>' + g.label + '</option>';
                  }).join('')}
                </select>
              </td>
              <td><input type="text" class="sheet-input-name" value="${this.escapeHtml(row.name)}" style="width: 90px; font-weight:600;"></td>
              <td><input type="text" class="sheet-input-classes" value="${this.escapeHtml(row.classes || '')}" style="width: 140px;"></td>
              <td><input type="text" class="sheet-input-time" data-day="월요일" value="${this.escapeHtml(row.times['월요일'] || '')}" style="text-align:center; width:55px;"></td>
              <td><input type="text" class="sheet-input-time" data-day="화요일" value="${this.escapeHtml(row.times['화요일'] || '')}" style="text-align:center; width:55px;"></td>
              <td><input type="text" class="sheet-input-time" data-day="수요일" value="${this.escapeHtml(row.times['수요일'] || '')}" style="text-align:center; width:55px;"></td>
              <td><input type="text" class="sheet-input-time" data-day="목요일" value="${this.escapeHtml(row.times['목요일'] || '')}" style="text-align:center; width:55px;"></td>
              <td><input type="text" class="sheet-input-time" data-day="금요일" value="${this.escapeHtml(row.times['금요일'] || '')}" style="text-align:center; width:55px;"></td>
              <td><input type="text" class="sheet-input-time" data-day="토요일" value="${this.escapeHtml(row.times['토요일'] || '')}" style="text-align:center; width:55px;"></td>
              <td><input type="text" class="sheet-input-absent" value="${this.escapeHtml(row.absentDates || '')}"></td>
              <td><input type="text" class="sheet-input-makeup-date" value="${this.escapeHtml(row.makeupDate || '')}" placeholder="YYYY-MM-DD HH:MM" style="width: 130px;"></td>
              <td>
                <select class="sheet-select-makeup-done" style="width: 80px;">
                  <option value="" ${row.makeupCompleted === '' ? 'selected' : ''}>-</option>
                  <option value="대기" ${row.makeupCompleted === '대기' ? 'selected' : ''}>대기</option>
                  <option value="완료" ${row.makeupCompleted === '완료' ? 'selected' : ''}>완료</option>
                </select>
              </td>
              <td><button class="btn-delete-row" data-id="${row.id}">🗑️</button></td>
            </tr>
          `;
        }).join('');
      }
      
      case "오늘 출석부": {
        const filtered = this.dataMap.dailyLogs.filter(row => {
          const nameVal = row && row.name ? String(row.name).toLowerCase() : "";
          const dateVal = row && row.date ? String(row.date).toLowerCase() : "";
          return nameVal.includes(query) || dateVal.includes(query);
        });
        if (filtered.length === 0) return `<tr><td colspan="13" style="text-align:center; padding:2rem; color:var(--text-muted);">오늘의 수업 정보가 없습니다.</td></tr>`;
        
        return filtered.map(row => {
          if (row.date && row.date.indexOf("여기부터는 ") === 0) {
            return `
              <tr data-id="${row.id}" style="background:rgba(99, 102, 241, 0.06); color:var(--text-secondary); font-weight:bold;">
                <td class="row-num-col" style="text-align:center;">${row.row}</td>
                <td colspan="11" style="padding:0.6rem 1rem; text-align:left;">
                  <span>${row.date}</span>
                </td>
                <td><button class="btn-delete-row" data-id="${row.id}">🗑️</button></td>
              </tr>
            `;
          }
          return `
            <tr data-id="${row.id}">
              <td class="row-num-col" style="text-align:center; font-weight:600;">${row.row}</td>
              <td><input type="text" class="sheet-input-date" value="${this.escapeHtml(row.date)}" style="width: 80px;"></td>
              <td><input type="text" class="sheet-input-time" value="${this.escapeHtml(row.time)}" style="width: 60px; text-align:center;"></td>
              <td><input type="text" class="sheet-input-name" value="${this.escapeHtml(row.name)}" style="width: 90px; font-weight:600;"></td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-notes" style="width: 120px; height: 32px; resize: vertical;">${this.escapeHtml(row.notes || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td>
                <select class="sheet-select-status status-select-${this.getNormalizedStatus(row.status)}" style="width: 80px;">
                  <option value="대기" ${this.getNormalizedStatus(row.status) === '대기' ? 'selected' : ''}>대기</option>
                  <option value="수업중" ${this.getNormalizedStatus(row.status) === '수업중' ? 'selected' : ''}>수업중</option>
                  <option value="수업완료" ${this.getNormalizedStatus(row.status) === '수업완료' ? 'selected' : ''}>수업완료</option>
                  <option value="휴강" ${this.getNormalizedStatus(row.status) === '휴강' ? 'selected' : ''}>휴강</option>
                  <option value="보강완료" ${this.getNormalizedStatus(row.status) === '보강완료' ? 'selected' : ''}>보강완료</option>
                  <option value="결석" ${this.getNormalizedStatus(row.status) === '결석' ? 'selected' : ''}>결석</option>
                </select>
              </td>
              <td><input type="text" class="sheet-input-in-time" value="${this.escapeHtml(row.inTime || '')}" placeholder="HH:MM" style="width: 65px; text-align:center;"></td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-reason" style="width: 90px; height: 32px; resize: vertical;">${this.escapeHtml(row.reason || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td><input type="text" class="sheet-input-number" value="${this.escapeHtml(row.number || '')}" style="width: 60px; text-align:center;"></td>
              <td><input type="text" class="sheet-input-event" value="${this.escapeHtml(row.event || '')}" style="width: 100px;"></td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-grammarDone" style="width: 120px; height: 32px; resize: vertical; ${this.getConditionalStyle(row.grammarDone || row.specialClass, 'grammarDone')}">${this.escapeHtml(row.grammarDone || row.specialClass || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-contents" style="width: 170px; height: 32px; resize: vertical;">${this.escapeHtml(row.contents || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td><button class="btn-delete-row" data-id="${row.id}">🗑️</button></td>
            </tr>
          `;
        }).join('');
      }

      case "문해력교재관리": {
        const filtered = this.dataMap.textbooks.filter(row => {
          const nameVal = row.name ? String(row.name).toLowerCase() : "";
          const nonfictionVal = row.nonfictionTitle ? String(row.nonfictionTitle).toLowerCase() : "";
          const literatureVal = row.literatureTitle ? String(row.literatureTitle).toLowerCase() : "";
          const vocabVal = row.vocabTitle ? String(row.vocabTitle).toLowerCase() : "";
          const complexVal = row.complexTitle ? String(row.complexTitle).toLowerCase() : "";
          const readaloudVal = row.readaloudTitle ? String(row.readaloudTitle).toLowerCase() : "";
          return nameVal.includes(query) || nonfictionVal.includes(query) || literatureVal.includes(query) || vocabVal.includes(query) || complexVal.includes(query) || readaloudVal.includes(query);
        });
        if (filtered.length === 0) return `<tr><td colspan="25" style="text-align:center; padding:2rem; color:var(--text-muted);">교재 현황 데이터가 없습니다.</td></tr>`;
        
        return filtered.map(row => `
          <tr data-id="${row.id}">
            <td class="row-num-col" style="text-align:center; font-weight:600;">${row.row}</td>

            <td>
              <select class="sheet-input-grade" style="width: 80px;">
                ${[
                  { val: '초1', label: '초등 1' },
                  { val: '초2', label: '초등 2' },
                  { val: '초3', label: '초등 3' },
                  { val: '초4', label: '초등 4' },
                  { val: '초5', label: '초등 5' },
                  { val: '초6', label: '초등 6' },
                  { val: '중1', label: '중등 1' },
                  { val: '중2', label: '중등 2' },
                  { val: '중3', label: '중등 3' },
                  { val: '고1', label: '고등 1' },
                  { val: '고2', label: '고등 2' },
                  { val: '고3', label: '고등 3' },
                  { val: '기타', label: '기타' }
                ].map(g => {
                  return '<option value="' + g.val + '"' + (this.normalizeGrade(row.grade) === this.normalizeGrade(g.val) ? ' selected' : '') + '>' + g.label + '</option>';
                }).join('')}
              </select>
            </td>
            <td><input type="text" class="sheet-input-name" value="${this.escapeHtml(row.name)}" style="width: 80px; font-weight:600;"></td>
            
            <!-- 비문학 -->
            <td style="${row.nonfictionTitle ? 'background-color: #e0f2fe;' : ''}"><input type="text" class="sheet-input-field" data-field="nonfictionTitle" value="${this.escapeHtml(row.nonfictionTitle || '')}" style="width: 120px;"></td>
            <td style="${row.nonfictionStart ? 'background-color: #e0f2fe;' : ''}"><input type="text" class="sheet-input-field" data-field="nonfictionStart" value="${this.escapeHtml(row.nonfictionStart || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.nonfictionEnd ? 'background-color: #e0f2fe;' : ''}"><input type="text" class="sheet-input-field" data-field="nonfictionEnd" value="${this.escapeHtml(row.nonfictionEnd || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.nonfictionAccuracy ? 'background-color: #e0f2fe;' : ''}"><input type="text" class="sheet-input-field" data-field="nonfictionAccuracy" value="${this.escapeHtml(row.nonfictionAccuracy || '')}" style="width: 60px; text-align:center;"></td>
            
            <!-- 문학 -->
            <td style="${row.literatureTitle ? 'background-color: #ffe4e6;' : ''}"><input type="text" class="sheet-input-field" data-field="literatureTitle" value="${this.escapeHtml(row.literatureTitle || '')}" style="width: 120px;"></td>
            <td style="${row.literatureStart ? 'background-color: #ffe4e6;' : ''}"><input type="text" class="sheet-input-field" data-field="literatureStart" value="${this.escapeHtml(row.literatureStart || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.literatureEnd ? 'background-color: #ffe4e6;' : ''}"><input type="text" class="sheet-input-field" data-field="literatureEnd" value="${this.escapeHtml(row.literatureEnd || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.literatureAccuracy ? 'background-color: #ffe4e6;' : ''}"><input type="text" class="sheet-input-field" data-field="literatureAccuracy" value="${this.escapeHtml(row.literatureAccuracy || '')}" style="width: 60px; text-align:center;"></td>
            
            <!-- 어휘 -->
            <td style="${row.vocabTitle ? 'background-color: #fef3c7;' : ''}"><input type="text" class="sheet-input-field" data-field="vocabTitle" value="${this.escapeHtml(row.vocabTitle || '')}" style="width: 120px;"></td>
            <td style="${row.vocabStart ? 'background-color: #fef3c7;' : ''}"><input type="text" class="sheet-input-field" data-field="vocabStart" value="${this.escapeHtml(row.vocabStart || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.vocabEnd ? 'background-color: #fef3c7;' : ''}"><input type="text" class="sheet-input-field" data-field="vocabEnd" value="${this.escapeHtml(row.vocabEnd || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.vocabAccuracy ? 'background-color: #fef3c7;' : ''}"><input type="text" class="sheet-input-field" data-field="vocabAccuracy" value="${this.escapeHtml(row.vocabAccuracy || '')}" style="width: 60px; text-align:center;"></td>
            
            <!-- 복합 -->
            <td style="${row.complexTitle ? 'background-color: #f3e8ff;' : ''}"><input type="text" class="sheet-input-field" data-field="complexTitle" value="${this.escapeHtml(row.complexTitle || '')}" style="width: 120px;"></td>
            <td style="${row.complexStart ? 'background-color: #f3e8ff;' : ''}"><input type="text" class="sheet-input-field" data-field="complexStart" value="${this.escapeHtml(row.complexStart || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.complexEnd ? 'background-color: #f3e8ff;' : ''}"><input type="text" class="sheet-input-field" data-field="complexEnd" value="${this.escapeHtml(row.complexEnd || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.complexAccuracy ? 'background-color: #f3e8ff;' : ''}"><input type="text" class="sheet-input-field" data-field="complexAccuracy" value="${this.escapeHtml(row.complexAccuracy || '')}" style="width: 60px; text-align:center;"></td>
            
            <!-- 음독 -->
            <td style="${row.readaloudTitle ? 'background-color: #d1fae5;' : ''}"><input type="text" class="sheet-input-field" data-field="readaloudTitle" value="${this.escapeHtml(row.readaloudTitle || '')}" style="width: 120px;"></td>
            <td style="${row.readaloudStart ? 'background-color: #d1fae5;' : ''}"><input type="text" class="sheet-input-field" data-field="readaloudStart" value="${this.escapeHtml(row.readaloudStart || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.readaloudEnd ? 'background-color: #d1fae5;' : ''}"><input type="text" class="sheet-input-field" data-field="readaloudEnd" value="${this.escapeHtml(row.readaloudEnd || '')}" style="width: 80px; text-align:center;"></td>
            <td style="${row.readaloudAccuracy ? 'background-color: #d1fae5;' : ''}"><input type="text" class="sheet-input-field" data-field="readaloudAccuracy" value="${this.escapeHtml(row.readaloudAccuracy || '')}" style="width: 60px; text-align:center;"></td>
            
            <td><button class="btn-delete-row" data-id="${row.id}">🗑️</button></td>
          </tr>
        `).join('');
      }



      case "상담내용/리포트발송/채널발송": {
        const filtered = this.dataMap.consultations.filter(row => {
          const nameVal = row.name ? String(row.name).toLowerCase() : "";
          const contentVal = row.content ? String(row.content).toLowerCase() : "";
          return nameVal.includes(query) || contentVal.includes(query);
        });
        if (filtered.length === 0) return `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">상담 기록이 없습니다.</td></tr>`;
        
        return filtered.map(row => `
          <tr data-id="${row.id}">
            <td class="row-num-col" style="text-align:center; font-weight:600;">${row.row}</td>

            <td>
              <select class="sheet-input-grade" style="width: 70px;">
                ${[
                  { val: '초1', label: '초등 1' },
                  { val: '초2', label: '초등 2' },
                  { val: '초3', label: '초등 3' },
                  { val: '초4', label: '초등 4' },
                  { val: '초5', label: '초등 5' },
                  { val: '초6', label: '초등 6' },
                  { val: '중1', label: '중등 1' },
                  { val: '중2', label: '중등 2' },
                  { val: '중3', label: '중등 3' },
                  { val: '고1', label: '고등 1' },
                  { val: '고2', label: '고등 2' },
                  { val: '고3', label: '고등 3' },
                  { val: '기타', label: '기타' }
                ].map(g => {
                  return '<option value="' + g.val + '"' + (this.normalizeGrade(row.grade) === this.normalizeGrade(g.val) ? ' selected' : '') + '>' + g.label + '</option>';
                }).join('')}
              </select>
            </td>
            <td><input type="text" class="sheet-input-name" value="${this.escapeHtml(row.name)}" style="width: 90px; font-weight:600;"></td>
            <td><input type="text" class="sheet-input-period" value="${this.escapeHtml(row.period || '')}" style="width: 90px; text-align:center;"></td>
            <td><input type="text" class="sheet-input-author" value="${this.escapeHtml(row.author || '')}" style="width: 50px; text-align:center;"></td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-content" style="width: 370px; height: 32px; min-height: 32px; resize: vertical; transition: height 0.2s; padding: 0.4rem; font-family: var(--font-main); border: 1px solid transparent; border-radius: 6px; background: transparent; overflow-y: hidden;" onfocus="this.style.height='120px'; this.style.background='var(--input-bg)'; this.style.borderColor='var(--accent)';" onblur="this.style.height='32px'; this.style.background='transparent'; this.style.borderColor='transparent';">${this.escapeHtml(row.content || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-needs" style="width: 290px; height: 32px; min-height: 32px; resize: vertical; transition: height 0.2s; padding: 0.4rem; font-family: var(--font-main); border: 1px solid transparent; border-radius: 6px; background: transparent; overflow-y: hidden;" onfocus="this.style.height='120px'; this.style.background='var(--input-bg)'; this.style.borderColor='var(--accent)';" onblur="this.style.height='32px'; this.style.background='transparent'; this.style.borderColor='transparent';">${this.escapeHtml(row.needs || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td><button class="btn-delete-row" data-id="${row.id}">🗑️</button></td>
          </tr>
        `).join('');
      }

      case "회원 분석/레벨변동/전화상담": {
        const filtered = this.dataMap.memberAnalysis.filter(row => {
          const nameVal = row.name ? String(row.name).toLowerCase() : "";
          const notesVal = row.notes ? String(row.notes).toLowerCase() : "";
          return nameVal.includes(query) || notesVal.includes(query);
        });
        if (filtered.length === 0) return `<tr><td colspan="18" style="text-align:center; padding:2rem; color:var(--text-muted);">회원 분석 데이터가 없습니다.</td></tr>`;
        
        return filtered.map(row => `
          <tr data-id="${row.id}">
            <td class="row-num-col" style="text-align:center; font-weight:600;">${row.row}</td>
            <td><input type="text" class="sheet-input-num" value="${this.escapeHtml(row.num || '')}" style="width: 50px; text-align:center; ${this.getConditionalStyle(row.num)}"></td>
            <td><input type="text" class="sheet-input-name" value="${this.escapeHtml(row.name)}" style="width: 90px; font-weight:600; ${this.getConditionalStyle(row.name)}"></td>

            <td>
              <select class="sheet-input-grade" style="width: 80px; ${this.getConditionalStyle(row.grade)}">
                ${[
                  { val: '초1', label: '초등 1' },
                  { val: '초2', label: '초등 2' },
                  { val: '초3', label: '초등 3' },
                  { val: '초4', label: '초등 4' },
                  { val: '초5', label: '초등 5' },
                  { val: '초6', label: '초등 6' },
                  { val: '중1', label: '중등 1' },
                  { val: '중2', label: '중등 2' },
                  { val: '중3', label: '중등 3' },
                  { val: '고1', label: '고등 1' },
                  { val: '고2', label: '고등 2' },
                  { val: '고3', label: '고등 3' },
                  { val: '기타', label: '기타' }
                ].map(g => {
                  return '<option value="' + g.val + '"' + (this.normalizeGrade(row.grade) === this.normalizeGrade(g.val) ? ' selected' : '') + '>' + g.label + '</option>';
                }).join('')}
              </select>
            </td>
            <td><input type="text" class="sheet-input-regDate" value="${this.escapeHtml(row.regDate || '')}" style="width: 80px; text-align:center; ${this.getConditionalStyle(row.regDate)}"></td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-consultation" style="width: 120px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.consultation)}">${this.escapeHtml(row.consultation || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-notes" style="width: 170px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.notes)}">${this.escapeHtml(row.notes || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-progress" style="width: 120px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.progress, 'progress')}">${this.escapeHtml(row.progress || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-levelUp" style="width: 90px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.levelUp)}">${this.escapeHtml(row.levelUp || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-levelChange" style="width: 70px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.levelChange)}">${this.escapeHtml(row.levelChange || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-grammarDone" style="width: 90px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.grammarDone, 'grammarDone')}">${this.escapeHtml(row.grammarDone || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-readingTest" style="width: 90px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.readingTest)}">${this.escapeHtml(row.readingTest || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-bookPlan" style="width: 90px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.bookPlan)}">${this.escapeHtml(row.bookPlan || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-analysisSent" style="width: 65px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.analysisSent)}">${this.escapeHtml(row.analysisSent || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-readMethod" style="width: 65px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.readMethod)}">${this.escapeHtml(row.readMethod || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap:4px;">
                <textarea class="sheet-input-studentId" style="width: 65px; height: 35px; resize: vertical; ${this.getConditionalStyle(row.studentId)}">${this.escapeHtml(row.studentId || '')}</textarea>
                <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
              </div>
            </td>
            <td><input type="text" class="sheet-input-phone" value="${this.escapeHtml(row.phone || '')}" style="width: 110px; ${this.getConditionalStyle(row.phone)}"></td>
            <td><button class="btn-delete-row" data-id="${row.id}">🗑️</button></td>
          </tr>
        `).join('');
      }

      case "한명 검색": {
        const searchName = (query || "신나라").toLowerCase().trim();
        const members = this.dataMap.memberAnalysis.filter(m => {
          const nameVal = m.name ? String(m.name).toLowerCase().trim() : "";
          return nameVal === searchName;
        });
        const studentTextbooks = this.dataMap.textbooks.filter(t => {
          const nameVal = t.name ? String(t.name).toLowerCase().trim() : "";
          return nameVal === searchName;
        });
        const studentConsults = this.dataMap.consultations.filter(c => {
          const nameVal = c.name ? String(c.name).toLowerCase().trim() : "";
          return nameVal === searchName;
        });
        
        const memberRows = Math.max(1, members.length);
        const textbookRows = Math.max(1, studentTextbooks.length);
        
        let rowsHtml = "";
        
        // Row 1: Empty
        rowsHtml += `
          <tr>
            <td class="row-num-col">1</td>
            ${Array(18).fill('<td></td>').join('')}
          </tr>
        `;
        
        // Row 2: Empty
        rowsHtml += `
          <tr>
            <td class="row-num-col">2</td>
            ${Array(18).fill('<td></td>').join('')}
          </tr>
        `;
        
        // Row 3: Name search input
        rowsHtml += `
          <tr>
            <td class="row-num-col">3</td>
            <td style="font-weight:bold; background:rgba(99,102,241,0.08); color:var(--accent); text-align:center;">학생 이름 (B3)</td>
            <td style="background:rgba(99,102,241,0.03); padding:0.2rem;">
              <input type="text" class="sheet-input-search-name" value="${this.escapeHtml(searchName)}" style="width:100%; font-weight:bold; background:rgba(99,102,241,0.08); border:1px solid var(--accent); color:var(--text-primary); text-align:center; border-radius:4px; padding:0.15rem;">
            </td>
            <td colspan="16" style="color:var(--text-muted); font-size:0.8rem; padding-left:12px; vertical-align:middle; text-align:left;">
              ← <b>여기에 이름을 입력하고 Enter를 누르시면</b> 아래의 모든 영역이 각 시트에서 FILTER 함수를 통해 실시간으로 콕 찝어 통합 조회됩니다.
            </td>
          </tr>
        `;
        
        // Row 4: Empty
        rowsHtml += `
          <tr>
            <td class="row-num-col">4</td>
            ${Array(18).fill('<td></td>').join('')}
          </tr>
        `;
        
        // Row 5: Section 1 Title
        rowsHtml += `
          <tr>
            <td class="row-num-col">5</td>
            <td colspan="18" style="font-weight:bold; background:rgba(16,185,129,0.15); color:#10b981; padding:0.4rem 0.8rem; text-align:left;">
              🟢 1. 회원 종합 분석 및 레벨 관리 (수식: FILTER('회원 분석/레벨변동/전화상담'!A2:P, TRIM(이름) = TRIM(B3)))
            </td>
          </tr>
        `;
        
        // Row 6: Section 1 Header
        rowsHtml += `
          <tr style="background:rgba(255,255,255,0.02); font-weight:bold; font-size:0.8rem;">
            <td class="row-num-col">6</td>
            <td style="text-align:center;">순번 (A)</td>
            <td style="text-align:center;">이름 (B)</td>
            <td style="text-align:center;">학년 (C)</td>
            <td style="text-align:center;">등록일 (D)</td>
            <td style="text-align:center;">상담/채널 (E)</td>
            <td style="text-align:center;">학생 특이사항... (F)</td>
            <td style="text-align:center;">진도 관리 (G)</td>
            <td style="text-align:center;">교과지수... (H)</td>
            <td style="text-align:center;">레벨 변동 (I)</td>
            <td style="text-align:center;">훈민정음... (J)</td>
            <td style="text-align:center;">읽트/독트... (K)</td>
            <td style="text-align:center;">목표달성... (L)</td>
            <td style="text-align:center;">분석지 발송 (M)</td>
            <td style="text-align:center;">독서 방법 (N)</td>
            <td style="text-align:center;">아이디 (O)</td>
            <td style="text-align:center;">연락처 (P)</td>
            <td>(Q)</td>
            <td>(R)</td>
          </tr>
        `;
        
        // Row 7+: Section 1 Data
        if (members.length > 0) {
          members.forEach((member, index) => {
            rowsHtml += `
              <tr style="background:rgba(16,185,129,0.02);">
                <td class="row-num-col">${7 + index}</td>
                <td style="text-align:center;" title="수식 결과 Col A">${this.escapeHtml(member.num || '')}</td>
                <td style="text-align:center; font-weight:600;">${this.escapeHtml(member.name || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.grade || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.regDate || '')}</td>
                <td style="white-space:pre-wrap; word-break:break-all; font-size:0.85rem; line-height:1.4; text-align:left; ${this.getConditionalStyle(member.consultation)}">${this.escapeHtml(member.consultation || '')}</td>
                <td style="white-space:pre-wrap; word-break:break-all; font-size:0.85rem; line-height:1.4; text-align:left; ${this.getConditionalStyle(member.notes)}">${this.escapeHtml(member.notes || '')}</td>
                <td style="max-width:200px; font-size:0.85rem; line-height:1.4; vertical-align:top; text-align:left;">${this.renderRichTextHtml(member.progress || '')}</td>
                <td style="${this.getConditionalStyle(member.levelUp)}">${this.escapeHtml(member.levelUp || '')}</td>
                <td style="${this.getConditionalStyle(member.levelChange)}">${this.escapeHtml(member.levelChange || '')}</td>
                <td style="max-width:180px; font-size:0.85rem; line-height:1.4; vertical-align:top; text-align:left;">${this.renderRichTextHtml(member.grammarDone || '')}</td>
                <td style="${this.getConditionalStyle(member.readingTest)}">${this.escapeHtml(member.readingTest || '')}</td>
                <td style="${this.getConditionalStyle(member.bookPlan)}">${this.escapeHtml(member.bookPlan || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.analysisSent || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.readMethod || '')}</td>
                <td>${this.escapeHtml(member.studentId || '')}</td>
                <td>${this.escapeHtml(member.phone || '')}</td>
                <td></td>
                <td></td>
              </tr>
            `;
          });
        } else {
          rowsHtml += `
            <tr>
              <td class="row-num-col">7</td>
              <td colspan="18" style="color:var(--danger); padding:0.5rem; text-align:left; font-style:italic;">
                ➔ 결과: 검색된 회원 종합 분석이 없습니다. (회원 분석/레벨변동/전화상담 시트 확인 필요)
              </td>
            </tr>
          `;
        }
        
        const sec2TitleRow = 8 + memberRows;
        const sec2HeaderRow = 9 + memberRows;
        const sec2DataStartRow = 10 + memberRows;
        
        // Empty Row after Section 1
        rowsHtml += `
          <tr>
            <td class="row-num-col">${sec2TitleRow - 1}</td>
            ${Array(18).fill('<td></td>').join('')}
          </tr>
        `;
        
        // Section 2 Title
        rowsHtml += `
          <tr>
            <td class="row-num-col">${sec2TitleRow}</td>
            <td colspan="18" style="font-weight:bold; background:rgba(245,158,11,0.15); color:#f59e0b; padding:0.4rem 0.8rem; text-align:left;">
              🟠 2. 문해력 교재 관리 현황 (수식: FILTER('문해력교재관리'!A2:R, TRIM(이름) = TRIM(B3)))
            </td>
          </tr>
        `;
        
        // Section 2 Header
        rowsHtml += `
          <tr style="background:rgba(255,255,255,0.02); font-weight:bold; font-size:0.8rem;">
            <td class="row-num-col">${sec2HeaderRow}</td>
            <td style="text-align:center; font-weight:bold; color:var(--text-muted);">학년 (A)</td>
            <td style="text-align:center; font-weight:bold; color:var(--text-muted);">이름 (B)</td>
            <td style="text-align:center; background:rgba(245,158,11,0.05);">비문학 교재 (C)</td>
            <td style="text-align:center; background:rgba(245,158,11,0.05);">시작일 (D)</td>
            <td style="text-align:center; background:rgba(245,158,11,0.05);">마침일 (E)</td>
            <td style="text-align:center; background:rgba(245,158,11,0.05);">정답률 (F)</td>
            <td style="text-align:center; background:rgba(99,102,241,0.05);">문학 교재 (G)</td>
            <td style="text-align:center; background:rgba(99,102,241,0.05);">시작일 (H)</td>
            <td style="text-align:center; background:rgba(99,102,241,0.05);">마침일 (I)</td>
            <td style="text-align:center; background:rgba(99,102,241,0.05);">정답률 (J)</td>
            <td style="text-align:center; background:rgba(16,185,129,0.05);">어휘 교재 (K)</td>
            <td style="text-align:center; background:rgba(16,185,129,0.05);">시작일 (L)</td>
            <td style="text-align:center; background:rgba(16,185,129,0.05);">마침일 (M)</td>
            <td style="text-align:center; background:rgba(16,185,129,0.05);">정답률 (N)</td>
            <td style="text-align:center; background:rgba(236,72,153,0.05);">복합 교재 (O)</td>
            <td style="text-align:center; background:rgba(236,72,153,0.05);">시작일 (P)</td>
            <td style="text-align:center; background:rgba(236,72,153,0.05);">마침일 (Q)</td>
            <td style="text-align:center; background:rgba(236,72,153,0.05);">정답률 (R)</td>
          </tr>
        `;
        
        // Section 2 Data
        if (studentTextbooks.length > 0) {
          studentTextbooks.forEach((tb, index) => {
            rowsHtml += `
              <tr style="background:rgba(245,158,11,0.02);">
                <td class="row-num-col">${sec2DataStartRow + index}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.grade || '')}</td>
                <td style="text-align:center; font-weight:600;">${this.escapeHtml(tb.name || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexAccuracy || '')}</td>
              </tr>
            `;
          });
        } else {
          rowsHtml += `
            <tr>
              <td class="row-num-col">${sec2DataStartRow}</td>
              <td colspan="18" style="color:var(--danger); padding:0.5rem; text-align:left; font-style:italic;">
                ➔ 결과: 등록된 문해력 교재 현황이 없습니다. (문해력교재관리 시트 확인 필요)
              </td>
            </tr>
          `;
        }
        
        const sec3TitleRow = sec2DataStartRow + textbookRows + 1;
        const sec3HeaderRow = sec3TitleRow + 1;
        const sec3DataStartRow = sec3HeaderRow + 1;
        
        // Empty Row after Section 2
        rowsHtml += `
          <tr>
            <td class="row-num-col">${sec3TitleRow - 1}</td>
            ${Array(18).fill('<td></td>').join('')}
          </tr>
        `;
        
        // Section 3 Title
        rowsHtml += `
          <tr>
            <td class="row-num-col">${sec3TitleRow}</td>
            <td colspan="18" style="font-weight:bold; background:rgba(99,102,241,0.08); color:var(--accent); padding:0.4rem 0.8rem; text-align:left;">
              🔵 3. 상담 및 리포트 발송 기록 (수식: FILTER('상담내용/리포트발송/채널발송'!A2:F, TRIM(이름) = TRIM(B3)))
            </td>
          </tr>
        `;
        
        // Section 3 Header
        rowsHtml += `
          <tr style="background:rgba(255,255,255,0.02); font-weight:bold; font-size:0.8rem;">
            <td class="row-num-col">${sec3HeaderRow}</td>
            <td style="width: 70px; text-align:center;">학년 (A)</td>
            <td style="width: 90px; text-align:center;">이름 (B)</td>
            <td style="width: 90px; text-align:center;">작성기간 (C)</td>
            <td style="width: 60px; text-align:center; white-space: normal; word-break: break-all;">작성인 (D)</td>
            <td style="min-width: 380px; text-align:left;">상담내용 / 분석지 / 채널 보냄 (E)</td>
            <td style="min-width: 300px; text-align:left;">부모님의 need / 학생 특이사항 (F)</td>
            ${Array(12).fill('<td></td>').join('')}
          </tr>
        `;
        
        // Section 3 Data Rows
        if (studentConsults.length > 0) {
          studentConsults.forEach((c, index) => {
            rowsHtml += `
              <tr style="background:rgba(99,102,241,0.02);">
                <td class="row-num-col">${sec3DataStartRow + index}</td>
                <td style="width: 70px; text-align:center;">${this.escapeHtml(c.grade || '')}</td>
                <td style="width: 90px; text-align:center; font-weight:600;">${this.escapeHtml(c.name || '')}</td>
                <td style="width: 90px; text-align:center;">${this.escapeHtml(c.period || '')}</td>
                <td style="width: 60px; text-align:center; white-space: normal; word-break: break-all;">${this.escapeHtml(c.author || '')}</td>
                <td style="min-width: 380px; text-align:left; white-space:pre-wrap; word-break:break-all; font-size:0.85rem; line-height:1.4; padding:0.4rem;">${this.escapeHtml(c.content || '')}</td>
                <td style="min-width: 300px; text-align:left; white-space:pre-wrap; word-break:break-all; font-size:0.85rem; line-height:1.4; padding:0.4rem;">${this.escapeHtml(c.needs || '')}</td>
                ${Array(12).fill('<td></td>').join('')}
              </tr>
            `;
          });
        } else {
          rowsHtml += `
            <tr>
              <td class="row-num-col">${sec3DataStartRow}</td>
              <td colspan="18" style="color:var(--danger); padding:0.5rem; text-align:left; font-style:italic;">
                ➔ 결과: 등록된 상담/리포트 기록이 없습니다. (상담내용/리포트발송/채널발송 시트 확인 필요)
              </td>
            </tr>
          `;
        }
        
        return rowsHtml;
      }

      case "누적일일수업관리": {
        const filtered = this.dataMap.accumulatedLogs.filter(row => {
          const nameVal = row.name ? String(row.name).toLowerCase() : "";
          const dateVal = row.date ? String(row.date).toLowerCase() : "";
          return nameVal.includes(query) || dateVal.includes(query);
        });
        if (filtered.length === 0) return `<tr><td colspan="14" style="text-align:center; padding:2rem; color:var(--text-muted);">누적일일수업관리 데이터가 없습니다.</td></tr>`;
        
        // Limit rendering to the first 100 entries to prevent performance freeze
        const sliced = filtered.slice(0, 100);
        return sliced.map((row, idx) => {
          const rowId = row.id || `acc_${idx}`;
          const rowNum = row.row || (idx + 2);
          return `
            <tr data-id="${rowId}">
              <td class="row-num-col" style="text-align:center; font-weight:600;">${rowNum}</td>
              <td><input type="text" class="sheet-input-date" value="${this.escapeHtml(row.date)}" style="width: 80px;"></td>
              <td><input type="text" class="sheet-input-time" value="${this.escapeHtml(row.time)}" style="width: 60px; text-align:center;"></td>
              <td><input type="text" class="sheet-input-name" value="${this.escapeHtml(row.name)}" style="width: 90px; font-weight:600;"></td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-notes" style="width: 120px; height: 32px; resize: vertical;">${this.escapeHtml(row.notes || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td>
                <select class="sheet-select-status status-select-${this.getNormalizedStatus(row.status)}" style="width: 80px;">
                  <option value="대기" ${this.getNormalizedStatus(row.status) === '대기' ? 'selected' : ''}>대기</option>
                  <option value="수업중" ${this.getNormalizedStatus(row.status) === '수업중' ? 'selected' : ''}>수업중</option>
                  <option value="수업완료" ${this.getNormalizedStatus(row.status) === '수업완료' ? 'selected' : ''}>수업완료</option>
                  <option value="휴강" ${this.getNormalizedStatus(row.status) === '휴강' ? 'selected' : ''}>휴강</option>
                  <option value="보강완료" ${this.getNormalizedStatus(row.status) === '보강완료' ? 'selected' : ''}>보강완료</option>
                  <option value="결석" ${this.getNormalizedStatus(row.status) === '결석' ? 'selected' : ''}>결석</option>
                </select>
              </td>
              <td><input type="text" class="sheet-input-in-time" value="${this.escapeHtml(row.inTime || '')}" placeholder="HH:MM" style="width: 65px; text-align:center;"></td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-reason" style="width: 90px; height: 32px; resize: vertical;">${this.escapeHtml(row.reason || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td><input type="text" class="sheet-input-number" value="${this.escapeHtml(row.number || '')}" style="width: 60px; text-align:center;"></td>
              <td><input type="text" class="sheet-input-event" value="${this.escapeHtml(row.event || '')}" style="width: 100px;"></td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-grammarDone" style="width: 120px; height: 32px; resize: vertical; ${this.getConditionalStyle(row.grammarDone, 'grammarDone')}">${this.escapeHtml(row.grammarDone || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <textarea class="sheet-input-contents" style="width: 170px; height: 32px; resize: vertical;">${this.escapeHtml(row.contents || '')}</textarea>
                  <button type="button" class="btn-zoom-textarea" style="background:transparent; border:none; cursor:pointer; padding:2px; font-size:1.1rem; outline:none;" title="크게보기">🔍</button>
                </div>
              </td>
              <td><button class="btn-delete-row" data-id="${rowId}">🗑️</button></td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  renderFooterLegend() {
    switch (this.activeTab) {
      case "전체 시간표":
        return `
          <div class="sheet-capacity-legend" style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>정원:</strong> 초등 저학년(초1-3) 10명 이하 / 고학년(초4-중3) 10명 이하 (과밀 발생 시 붉은색 줄 표시)</div>
            <div>✏️ <strong>결석 일자:</strong> <code>6/17, 6/18</code> 처럼 쉼표로 작성하면 결석 처리됩니다.</div>
          </div>
        `;
      case "오늘 출석부":
        return `
          <div class="sheet-capacity-legend" style="font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>일일 출석부:</strong> 매일 아침 트리거 작동 시 오늘 자 해당 요일 학생들이 자동 로드됩니다. 직접 편집 및 수동 등록도 가능합니다.</div>
          </div>
        `;
      case "문해력교재관리":
        return `
          <div class="sheet-capacity-legend" style="font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>문해력교재관리:</strong> 비문학, 문학, 어휘, 복합 영역별 학습 중인 교재 정보(시작일, 마침일, 정답률)를 기입하여 학생별 진도를 관리합니다.</div>
          </div>
        `;
      case "상담내용/리포트발송/채널발송":
        return `
          <div class="sheet-capacity-legend" style="font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>상담내용/리포트발송/채널발송:</strong> 매월/매주 학부모님께 채널로 발송한 상담내용, 리포트 발송 일시, 이전 독서 리포트 등을 상세하게 누적하는 공간입니다.</div>
          </div>
        `;
      case "회원 분석/레벨변동/전화상담":
        return `
          <div class="sheet-capacity-legend" style="font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>회원 분석/레벨변동/전화상담:</strong> 등하원, 코칭 방향, 진도 상태, 레벨 업 일자, 훈민정음 완료 진도 등 학생 프로필과 개별 분석이 총망라된 마스터 테이블입니다.</div>
          </div>
        `;
      case "한명 검색":
        return `
          <div class="sheet-capacity-legend" style="font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>한명 검색 대시보드:</strong> B3 셀에 이름을 적고 Enter를 치시면, 회원 분석, 문해력 교재, 상담 내용을 한 곳에 콕 찍어 모아 볼 수 있습니다.</div>
          </div>
        `;
      case "누적일일수업관리":
        return `
          <div class="sheet-capacity-legend" style="font-size:0.85rem; color:var(--text-secondary); padding:0.5rem 0;">
            <div>💡 <strong>누적일일수업관리:</strong> 구글 시트의 "누적일일수업관리" 시트와 연동되는 공간입니다. (※ 브라우저 속도 최적화를 위해 최근 100개 항목만 로드되며, 상단 검색창에 이름이나 날짜를 입력하여 전체 기록을 안전하게 조회하실 수 있습니다.)</div>
          </div>
        `;
    }
  }

  attachEvents() {
    // Search input
    const searchInput = document.getElementById("sheetSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        const filterVal = this.searchQuery.toLowerCase().trim();
        const rows = this.container.querySelectorAll(".sheet-table tbody tr");
        rows.forEach(tr => {
          let hasMatch = false;
          tr.querySelectorAll("td, th").forEach(cell => {
            const inp = cell.querySelector("input, select, textarea");
            const val = inp ? inp.value : cell.textContent;
            if (val && val.toLowerCase().includes(filterVal)) {
              hasMatch = true;
            }
          });
          if (hasMatch) {
            tr.style.display = "";
          } else {
            tr.style.display = "none";
          }
        });
      });
    }

    // Search input inside Single Student Search tab cell B3
    const searchNameCell = this.container.querySelector(".sheet-input-search-name");
    if (searchNameCell) {
      searchNameCell.addEventListener("change", (e) => {
        this.searchQuery = e.target.value.trim();
        this.render();
        // Sync with CRM selection if matching student exists
        if (window.app) {
          const student = window.app.state.students.find(s => s.name.toLowerCase() === this.searchQuery.toLowerCase());
          if (student) {
            window.app.currentCrmStudentName = student.name;
          }
        }
      });
      searchNameCell.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.searchQuery = e.target.value.trim();
          this.render();
        }
      });
    }

    // Tab switching buttons
    this.container.querySelectorAll(".sheet-tab-item").forEach(tab => {
      tab.addEventListener("click", () => {
        this.activeTab = tab.getAttribute("data-tab");
        this.render();
      });
    });

    // Reset button
    const btnReset = document.getElementById("btnSheetReset");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        if (confirm("모든 데이터를 초기화하시겠습니까?")) {
          if (window.resetDemoData) {
            window.resetDemoData();
          }
        }
      });
    }

    // Add row handler
    const btnAddRow = document.getElementById("btnSheetAddRow");
    if (btnAddRow) {
      btnAddRow.addEventListener("click", () => {
        this.handleAddRow();
      });
    }

    // Delete row handler
    this.container.querySelectorAll(".btn-delete-row").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (confirm("이 행을 삭제하시겠습니까? (구글시트 연동 시 실제 시트 삭제는 구글시트에서 직접 해주셔야 안전합니다)")) {
          this.handleDeleteRow(id);
        }
      });
    });
    // Update row handlers
    this.attachCellChangeListeners();
  }

  makeColumnsResizable() {
    const tables = this.container.querySelectorAll(".sheet-table");
    tables.forEach(table => {
      const cols = table.querySelectorAll("th");
      cols.forEach((col, colIndex) => {
        const key = `col_width_${this.activeTab}_${colIndex}`;
        const savedWidth = localStorage.getItem(key);
        
        // 1. Apply width to the header and body cells
        if (savedWidth) {
          col.style.width = savedWidth;
          col.style.minWidth = savedWidth;
          
          const rows = table.querySelectorAll("tbody tr");
          rows.forEach(tr => {
            const td = tr.children[colIndex];
            if (td) {
              td.style.width = savedWidth;
              td.style.minWidth = savedWidth;
            }
          });
        }

        // 2. Ensure all inputs inside this column's cells fill 100% width
        const rows = table.querySelectorAll("tbody tr");
        rows.forEach(tr => {
          const td = tr.children[colIndex];
          if (td) {
            const inputs = td.querySelectorAll("input, textarea, select");
            inputs.forEach(input => {
              input.style.width = "100%";
              input.style.boxSizing = "border-box";
            });
          }
        });

        // 3. Create resize handles if not present
        if (col.querySelector(".resize-handle")) return;
        const handle = document.createElement("div");
        handle.className = "resize-handle";
        col.appendChild(handle);
        col.style.position = "relative";
        
        let startX, startWidth;
        
        const startResize = (clientX) => {
          startX = clientX;
          startWidth = col.offsetWidth;
          col.classList.add("resizing");
        };
        
        const resize = (clientX) => {
          const width = startWidth + (clientX - startX);
          if (width > 20) {
            // Set width for header
            col.style.width = width + "px";
            col.style.minWidth = width + "px";
            
            // Set width for all body cells in this column
            const tbodyRows = table.querySelectorAll("tbody tr");
            tbodyRows.forEach(tr => {
              const td = tr.children[colIndex];
              if (td) {
                td.style.width = width + "px";
                td.style.minWidth = width + "px";
              }
            });
          }
        };
        
        const endResize = () => {
          col.classList.remove("resizing");
          // Save width to localStorage
          localStorage.setItem(key, col.style.width);
        };

        // Mouse Events
        handle.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          startResize(e.pageX);
          
          const onMouseMove = (moveEvent) => {
            resize(moveEvent.pageX);
          };
          const onMouseUp = () => {
            endResize();
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          };
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        });

        // Touch Events (for mobile/tablet support)
        handle.addEventListener("touchstart", (e) => {
          if (e.touches.length > 0) {
            e.stopPropagation();
            startResize(e.touches[0].pageX);
            
            const onTouchMove = (moveEvent) => {
              if (moveEvent.touches.length > 0) {
                moveEvent.preventDefault();
                resize(moveEvent.touches[0].pageX);
              }
            };
            const onTouchEnd = () => {
              endResize();
              document.removeEventListener("touchmove", onTouchMove);
              document.removeEventListener("touchend", onTouchEnd);
            };
            document.addEventListener("touchmove", onTouchMove, { passive: false });
            document.addEventListener("touchend", onTouchEnd);
          }
        });

      });
    });
  }

  handleAddRow() {
    let dataset = [];
    let nextRowIndex = 2;
    let newRow = {};

    switch (this.activeTab) {
      case "전체 시간표":
        dataset = this.dataMap.students;
        nextRowIndex = dataset.length > 0 ? Math.max(...dataset.map(r => r.row)) + 1 : 2;
        newRow = {
          id: 'row_' + nextRowIndex,
          row: nextRowIndex,
          name: '새 학생',
          grade: '초3',
          classes: '60분/주1회',
          times: { '월요일': '', '화요일': '', '수요일': '', '목요일': '', '금요일': '', '토요일': '', '일요일': '' },
          notes: '',
          absentDates: '',
          makeupDate: '',
          makeupCompleted: ''
        };
        dataset.push(newRow);
        this.onDataChanged("students", dataset);
        break;
        
      case "오늘 출석부":
        dataset = this.dataMap.dailyLogs;
        nextRowIndex = dataset.length > 0 ? Math.max(...dataset.map(r => r.row)) + 1 : 2;
        const today = new Date();
        const dateStr = `${today.getMonth()+1}/${today.getDate()}목`; // simple default
        newRow = {
          id: 'daily_' + nextRowIndex,
          row: nextRowIndex,
          date: dateStr,
          time: '15:00',
          name: '새 학생',
          status: '대기',
          inTime: '',
          reason: '',
          contents: '',
          notes: ''
        };
        dataset.push(newRow);
        this.onDataChanged("dailyLogs", dataset);
        break;

      case "문해력교재관리":
        dataset = this.dataMap.textbooks;
        nextRowIndex = dataset.length > 0 ? Math.max(...dataset.map(r => r.row)) + 1 : 2;
        newRow = {
          id: 'textbook_' + nextRowIndex,
          row: nextRowIndex,
          grade: '초3',
          name: '새 학생',
          nonfictionTitle: '', nonfictionStart: '', nonfictionEnd: '', nonfictionAccuracy: '',
          literatureTitle: '', literatureStart: '', literatureEnd: '', literatureAccuracy: '',
          vocabTitle: '', vocabStart: '', vocabEnd: '', vocabAccuracy: '',
          complexTitle: '', complexStart: '', complexEnd: '', complexAccuracy: ''
        };
        dataset.push(newRow);
        this.onDataChanged("textbooks", dataset);
        break;

      case "상담내용/리포트발송/채널발송":
        dataset = this.dataMap.consultations;
        nextRowIndex = dataset.length > 0 ? Math.max(...dataset.map(r => r.row)) + 1 : 2;
        newRow = {
          id: 'consultation_' + nextRowIndex,
          row: nextRowIndex,
          grade: '초3',
          name: '새 학생',
          period: '6/18',
          author: '원',
          content: '설명하는글 분석 2단계 시작.',
          needs: ''
        };
        dataset.push(newRow);
        this.onDataChanged("consultations", dataset);
        break;

      case "회원 분석/레벨변동/전화상담":
        dataset = this.dataMap.memberAnalysis;
        nextRowIndex = dataset.length > 0 ? Math.max(...dataset.map(r => r.row)) + 1 : 20;
        newRow = {
          id: 'member_' + nextRowIndex,
          row: nextRowIndex,
          num: String(dataset.length + 1),
          name: '새 학생',
          grade: '초3',
          regDate: '',
          consultation: '',
          notes: '',
          progress: '',
          levelUp: '',
          levelChange: '',
          grammarDone: '',
          readingTest: '',
          bookPlan: '',
          analysisSent: '',
          readMethod: '',
          studentId: '',
          phone: ''
        };
        dataset.push(newRow);
        this.onDataChanged("memberAnalysis", dataset);
        if (window.app && window.app.api && window.app.api.addMemberAnalysisToGoogleSheets) {
          window.app.api.addMemberAnalysisToGoogleSheets(newRow);
        }
        break;

      case "한명 검색":
        alert("한명 검색 시트에서는 직접 행을 추가하실 수 없습니다. 대신 검색 학생 이름 셀(B3)의 이름을 수정해 주세요.");
        return;

      case "누적일일수업관리":
        dataset = this.dataMap.accumulatedLogs;
        nextRowIndex = dataset.length > 0 ? Math.max(...dataset.map(r => r.row || 0)) + 1 : 2;
        if (nextRowIndex < 2) nextRowIndex = dataset.length + 2;
        const accNow = new Date();
        newRow = {
          id: 'acc_' + Date.now(),
          row: nextRowIndex,
          date: `${accNow.getMonth()+1}/${accNow.getDate()}월`,
          time: '15:00',
          name: '새 학생',
          notes: '',
          status: '수업완료',
          inTime: '15:00',
          reason: '',
          number: '',
          event: '',
          grammarDone: '',
          contents: ''
        };
        dataset.push(newRow);
        this.onDataChanged("accumulatedLogs", dataset);
        break;
    }
    this.render();
  }

  handleDeleteRow(id) {
    let dataset = [];
    switch (this.activeTab) {
      case "전체 시간표":
        this.dataMap.students = this.dataMap.students.filter(r => r.id !== id);
        this.onDataChanged("students", this.dataMap.students);
        break;
      case "오늘 출석부":
        this.dataMap.dailyLogs = this.dataMap.dailyLogs.filter(r => r.id !== id);
        this.onDataChanged("dailyLogs", this.dataMap.dailyLogs);
        break;
      case "문해력교재관리":
        this.dataMap.textbooks = this.dataMap.textbooks.filter(r => r.id !== id);
        this.onDataChanged("textbooks", this.dataMap.textbooks);
        break;
      case "상담내용/리포트발송/채널발송":
        this.dataMap.consultations = this.dataMap.consultations.filter(r => r.id !== id);
        this.onDataChanged("consultations", this.dataMap.consultations);
        break;
      case "회원 분석/레벨변동/전화상담":
        this.dataMap.memberAnalysis = this.dataMap.memberAnalysis.filter(r => r.id !== id);
        this.onDataChanged("memberAnalysis", this.dataMap.memberAnalysis);
        break;
      case "누적일일수업관리":
        this.dataMap.accumulatedLogs = this.dataMap.accumulatedLogs.filter((r, idx) => r.id !== id && `acc_${idx}` !== id);
        this.onDataChanged("accumulatedLogs", this.dataMap.accumulatedLogs);
        break;
    }
    this.render();
  }

  attachCellChangeListeners() {
    const updateField = (id, datasetKey, rowArray, field, value) => {
      const row = rowArray.find(r => r.id === id);
      if (row) {
        row[field] = value;
        
        // Side effects for textbooks
        if (datasetKey === "textbooks") {
          if (field === "currentPage" || field === "totalPage") {
            const cur = parseInt(row.currentPage) || 0;
            const tot = parseInt(row.totalPage) || 0;
            if (cur >= tot && tot > 0) {
              row.status = "완료";
              if (!row.endDate) {
                const today = new Date();
                row.endDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
              }
            } else {
              row.status = "학습중";
            }
          }
        }

        if (datasetKey === "dailyLogs" && (field === "number" || field === "event" || field === "grammarDone" || field === "contents")) {
          if (!row.date) {
            const today = new Date();
            const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
            const todayDay = weekdays[today.getDay()];
            row.date = `${today.getMonth() + 1}/${today.getDate()}${todayDay}`;
            if (window.app && window.app.updateFieldInGoogleSheets) {
              window.app.updateFieldInGoogleSheets(row.row, "date", row.date, "dailyLogs");
            }
          }
          this.accumulateLocalDailyEvent(row.name, row.date, row.number, row.event, row.grammarDone, row.contents);
        }
        
        this.onDataChanged(datasetKey, rowArray);
        
        // Google Sheet sync API trigger
        if (window.app && window.app.updateFieldInGoogleSheets) {
          window.app.updateFieldInGoogleSheets(row.row, field, value, datasetKey);
        }
      }
    };

    this.container.querySelectorAll("tr[data-id]").forEach(tr => {
      const id = tr.getAttribute("data-id");

      switch (this.activeTab) {
        case "전체 시간표": {
          const rowArray = this.dataMap.students;
          tr.querySelector(".sheet-input-grade").addEventListener("change", (e) => updateField(id, "students", rowArray, "grade", e.target.value.trim()));
          tr.querySelector(".sheet-input-name").addEventListener("change", (e) => updateField(id, "students", rowArray, "name", e.target.value.trim()));
          tr.querySelector(".sheet-input-classes").addEventListener("change", (e) => updateField(id, "students", rowArray, "classes", e.target.value.trim()));
          tr.querySelector(".sheet-input-absent").addEventListener("change", (e) => updateField(id, "students", rowArray, "absentDates", e.target.value.trim()));
          tr.querySelector(".sheet-input-makeup-date").addEventListener("change", (e) => {
            updateField(id, "students", rowArray, "makeupDate", e.target.value.trim());
            const rowObj = rowArray.find(r => r.id === id);
            if (rowObj && rowObj.makeupDate && rowObj.makeupCompleted === '') {
              updateField(id, "students", rowArray, "makeupCompleted", "대기");
            }
            this.render();
          });
          tr.querySelector(".sheet-select-makeup-done").addEventListener("change", (e) => {
            const val = e.target.value;
            const rowObj = rowArray.find(r => r.id === id);
            if (rowObj) {
              rowObj.makeupCompleted = val;
              if (window.app && window.app.updateFieldInGoogleSheets) {
                window.app.updateFieldInGoogleSheets(rowObj.row, "makeupCompleted", val, "students");
              }
              if (val === "완료") {
                if (rowObj.absentDates) {
                  const datesList = rowObj.absentDates.split(',').map(d => d.trim()).filter(Boolean);
                  for (let i = 0; i < datesList.length; i++) {
                    if (!datesList[i].startsWith('~~') && !datesList[i].endsWith('~~')) {
                      datesList[i] = `~~${datesList[i]}~~`;
                      break;
                    }
                  }
                  rowObj.absentDates = datesList.join(', ');
                  if (window.app && window.app.updateFieldInGoogleSheets) {
                    window.app.updateFieldInGoogleSheets(rowObj.row, "absentDates", rowObj.absentDates, "students");
                  }
                }
              } else {
                if (rowObj.absentDates) {
                  const datesList = rowObj.absentDates.split(',').map(d => d.trim()).filter(Boolean);
                  for (let i = datesList.length - 1; i >= 0; i--) {
                    if (datesList[i].startsWith('~~') && datesList[i].endsWith('~~')) {
                      datesList[i] = datesList[i].substring(2, datesList[i].length - 2);
                      break;
                    }
                  }
                  rowObj.absentDates = datesList.join(', ');
                  if (window.app && window.app.updateFieldInGoogleSheets) {
                    window.app.updateFieldInGoogleSheets(rowObj.row, "absentDates", rowObj.absentDates, "students");
                  }
                }
              }
              this.render();
            }
          });
          
          tr.querySelectorAll(".sheet-input-time").forEach(input => {
            input.addEventListener("change", (e) => {
              const day = input.getAttribute("data-day");
              const rowObj = rowArray.find(r => r.id === id);
              if (rowObj && rowObj.times) {
                rowObj.times[day] = e.target.value.trim();
                this.onDataChanged("students", rowArray);
                if (window.app && window.app.updateFieldInGoogleSheets) {
                  window.app.updateFieldInGoogleSheets(rowObj.row, "times", JSON.stringify(rowObj.times), "students");
                }
                this.render();
              }
            });
          });
          break;
        }

        case "오늘 출석부": {
          const rowArray = this.dataMap.dailyLogs;
          const dateInput = tr.querySelector(".sheet-input-date");
          if (dateInput) dateInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "date", e.target.value.trim()));
          
          const timeInput = tr.querySelector(".sheet-input-time");
          if (timeInput) timeInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "time", e.target.value.trim()));
          
          const nameInput = tr.querySelector(".sheet-input-name");
          if (nameInput) nameInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "name", e.target.value.trim()));
          
          const statusSelect = tr.querySelector(".sheet-select-status");
          if (statusSelect) {
            statusSelect.addEventListener("change", (e) => {
              const val = e.target.value;
              const norm = this.getNormalizedStatus(val);
              e.target.className = `sheet-select-status status-select-${norm}`;
              updateField(id, "dailyLogs", rowArray, "status", val);
            });
          }
          
          const inTimeInput = tr.querySelector(".sheet-input-in-time");
          if (inTimeInput) inTimeInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "inTime", e.target.value.trim()));
          
          const reasonInput = tr.querySelector(".sheet-input-reason");
          if (reasonInput) reasonInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "reason", e.target.value.trim()));
          
          const numberInput = tr.querySelector(".sheet-input-number");
          if (numberInput) numberInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "number", e.target.value.trim()));
          
          const eventInput = tr.querySelector(".sheet-input-event");
          if (eventInput) eventInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "event", e.target.value.trim()));
          
          const grammarInput = tr.querySelector(".sheet-input-grammarDone");
          if (grammarInput) grammarInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "grammarDone", e.target.value.trim()));
          
          const contentsInput = tr.querySelector(".sheet-input-contents");
          if (contentsInput) contentsInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "contents", e.target.value.trim()));
          
          const notesInput = tr.querySelector(".sheet-input-notes");
          if (notesInput) notesInput.addEventListener("change", (e) => updateField(id, "dailyLogs", rowArray, "notes", e.target.value.trim()));
          break;
        }

        case "문해력교재관리": {
          const rowArray = this.dataMap.textbooks;
          tr.querySelector(".sheet-input-grade").addEventListener("change", (e) => {
            updateField(id, "textbooks", rowArray, "grade", e.target.value.trim());
            this.render();
          });
          tr.querySelector(".sheet-input-name").addEventListener("change", (e) => {
            updateField(id, "textbooks", rowArray, "name", e.target.value.trim());
            this.render();
          });
          tr.querySelectorAll(".sheet-input-field").forEach(input => {
            input.addEventListener("change", (e) => {
              const field = input.getAttribute("data-field");
              updateField(id, "textbooks", rowArray, field, e.target.value.trim());
              this.render();
            });
          });
          break;
        }

        case "상담내용/리포트발송/채널발송": {
          const rowArray = this.dataMap.consultations;
          tr.querySelector(".sheet-input-grade").addEventListener("change", (e) => updateField(id, "consultations", rowArray, "grade", e.target.value.trim()));
          tr.querySelector(".sheet-input-name").addEventListener("change", (e) => updateField(id, "consultations", rowArray, "name", e.target.value.trim()));
          tr.querySelector(".sheet-input-period").addEventListener("change", (e) => updateField(id, "consultations", rowArray, "period", e.target.value.trim()));
          tr.querySelector(".sheet-input-author").addEventListener("change", (e) => updateField(id, "consultations", rowArray, "author", e.target.value.trim()));
          tr.querySelector(".sheet-input-content").addEventListener("change", (e) => updateField(id, "consultations", rowArray, "content", e.target.value.trim()));
          tr.querySelector(".sheet-input-needs").addEventListener("change", (e) => updateField(id, "consultations", rowArray, "needs", e.target.value.trim()));
          break;
        }

        case "회원 분석/레벨변동/전화상담": {
          const rowArray = this.dataMap.memberAnalysis;
          tr.querySelector(".sheet-input-num").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "num", e.target.value.trim()));
          tr.querySelector(".sheet-input-name").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "name", e.target.value.trim()));
          tr.querySelector(".sheet-input-grade").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "grade", e.target.value.trim()));
          tr.querySelector(".sheet-input-regDate").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "regDate", e.target.value.trim()));
          tr.querySelector(".sheet-input-consultation").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "consultation", e.target.value.trim()));
          tr.querySelector(".sheet-input-notes").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "notes", e.target.value.trim()));
          tr.querySelector(".sheet-input-progress").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "progress", e.target.value.trim()));
          tr.querySelector(".sheet-input-levelUp").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "levelUp", e.target.value.trim()));
          tr.querySelector(".sheet-input-levelChange").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "levelChange", e.target.value.trim()));
          tr.querySelector(".sheet-input-grammarDone").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "grammarDone", e.target.value.trim()));
          tr.querySelector(".sheet-input-readingTest").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "readingTest", e.target.value.trim()));
          tr.querySelector(".sheet-input-bookPlan").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "bookPlan", e.target.value.trim()));
          tr.querySelector(".sheet-input-analysisSent").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "analysisSent", e.target.value.trim()));
          tr.querySelector(".sheet-input-readMethod").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "readMethod", e.target.value.trim()));
          tr.querySelector(".sheet-input-studentId").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "studentId", e.target.value.trim()));
          tr.querySelector(".sheet-input-phone").addEventListener("change", (e) => updateField(id, "memberAnalysis", rowArray, "phone", e.target.value.trim()));
          break;
        }

        case "누적일일수업관리": {
          const rowArray = this.dataMap.accumulatedLogs;
          const rowObj = rowArray.find(r => r.id === id || `acc_${rowArray.indexOf(r)}` === id);
          if (rowObj) {
            const updateAccField = (field, val) => {
              rowObj[field] = val;
              this.onDataChanged("accumulatedLogs", rowArray);
              if (window.app && window.app.updateFieldInGoogleSheets) {
                window.app.updateFieldInGoogleSheets(rowObj.row || (rowArray.indexOf(rowObj) + 2), field, val, "accumulatedLogs");
              }
            };
            
            const dateInput = tr.querySelector(".sheet-input-date");
            if (dateInput) dateInput.addEventListener("change", (e) => updateAccField("date", e.target.value.trim()));
            
            const timeInput = tr.querySelector(".sheet-input-time");
            if (timeInput) timeInput.addEventListener("change", (e) => updateAccField("time", e.target.value.trim()));
            
            const nameInput = tr.querySelector(".sheet-input-name");
            if (nameInput) nameInput.addEventListener("change", (e) => updateAccField("name", e.target.value.trim()));
            
            const notesInput = tr.querySelector(".sheet-input-notes");
            if (notesInput) notesInput.addEventListener("change", (e) => updateAccField("notes", e.target.value.trim()));
            
            const statusSelect = tr.querySelector(".sheet-select-status");
            if (statusSelect) {
              statusSelect.addEventListener("change", (e) => {
                const val = e.target.value;
                const norm = this.getNormalizedStatus(val);
                e.target.className = `sheet-select-status status-select-${norm}`;
                updateAccField("status", val);
              });
            }
            
            const inTimeInput = tr.querySelector(".sheet-input-in-time");
            if (inTimeInput) inTimeInput.addEventListener("change", (e) => updateAccField("inTime", e.target.value.trim()));
            
            const reasonInput = tr.querySelector(".sheet-input-reason");
            if (reasonInput) reasonInput.addEventListener("change", (e) => updateAccField("reason", e.target.value.trim()));
            
            const numberInput = tr.querySelector(".sheet-input-number");
            if (numberInput) numberInput.addEventListener("change", (e) => updateAccField("number", e.target.value.trim()));
            
            const eventInput = tr.querySelector(".sheet-input-event");
            if (eventInput) eventInput.addEventListener("change", (e) => updateAccField("event", e.target.value.trim()));
            
            const grammarInput = tr.querySelector(".sheet-input-grammarDone");
            if (grammarInput) grammarInput.addEventListener("change", (e) => updateAccField("grammarDone", e.target.value.trim()));

            const contentsInput = tr.querySelector(".sheet-input-contents");
            if (contentsInput) contentsInput.addEventListener("change", (e) => updateAccField("contents", e.target.value.trim()));
          }
          break;
        }
      }
    });
  }

  accumulateLocalDailyEvent(studentName, dateStr, numberVal, eventVal, grammarDoneVal, contentsVal) {
    if (!studentName) return;

    // Find student in memberAnalysis
    const student = this.dataMap.memberAnalysis.find(s => s.name.trim() === studentName.trim());
    if (!student) return;

    // Parse M/D from dateStr (e.g. "6/19금" -> "6/19")
    const mdMatch = dateStr ? dateStr.match(/(\d+\/\d+)/) : null;
    let dateFormatted = "";
    if (mdMatch) {
      dateFormatted = mdMatch[1];
    } else {
      const today = new Date();
      dateFormatted = `${today.getMonth() + 1}/${today.getDate()}`;
    }

    const yy = String(new Date().getFullYear()).substring(2);
    const eventDatePrefix = `${yy}.${dateFormatted}`;

    // Parse multi-line / comma-separated / semicolon-separated entries
    const splitRegex = /[\n,;]+/;
    const numLines = numberVal ? numberVal.split(splitRegex).map(s => s.trim()).filter(Boolean) : [];
    const eventLines = eventVal ? eventVal.split(splitRegex).map(s => s.trim()).filter(Boolean) : [];
    const grammarLines = grammarDoneVal ? grammarDoneVal.split(splitRegex).map(s => s.trim()).filter(Boolean) : [];

    const maxLen = Math.max(numLines.length, eventLines.length);

    // Track original values to check if any field has changed after modifications
    const originalValues = {};
    const targetFields = ["notes", "progress", "levelUp", "grammarDone", "readingTest", "bookPlan"];
    targetFields.forEach(field => {
      originalValues[field] = (student[field] || "").trim();
    });

    const groupMap = {
      notes: [],
      progress: [],
      levelUp: [],
      grammarDone: [],
      readingTest: [],
      bookPlan: []
    };

    // Parse contentsVal (Col K) into groupMap.notes
    const contentsLines = contentsVal ? contentsVal.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean) : [];
    contentsLines.forEach(line => {
      groupMap.notes.push(`${eventDatePrefix} ${line}`);
    });

    for (let idx = 0; idx < maxLen; idx++) {
      const num = numLines[idx] || "";
      const ev = eventLines[idx] || "";
      if (!num && !ev) continue;

      let textToAppend = eventDatePrefix;
      if (num) textToAppend += ` ${num}`;
      if (ev) textToAppend += ` ${ev}`;

      let field = "levelUp"; // Default
      const lowerEvent = ev.toLowerCase();
      
      if (lowerEvent.includes("코스업") || lowerEvent.includes("레벨업") || lowerEvent.includes("진로검사")) {
        field = "levelUp";
      } else if (lowerEvent.includes("진단") || lowerEvent.includes("진도")) {
        field = "progress";
      } else if (lowerEvent.includes("훈민정음") || lowerEvent.includes("한자") || lowerEvent.includes("교재")) {
        field = "grammarDone";
      } else if (lowerEvent.includes("독서계획표") || lowerEvent.includes("친구") || lowerEvent.includes("탐험가") || lowerEvent.includes("고수") || lowerEvent.includes("챔피언") || lowerEvent.includes("마스터") || lowerEvent.includes("달성") || lowerEvent.includes("스티커")) {
        field = "bookPlan";
      } else if (lowerEvent.includes("읽트") || lowerEvent.includes("독트") || lowerEvent.includes("읽기") || lowerEvent.includes("독서")) {
        field = "readingTest";
      } else {
        field = "levelUp";
      }

      groupMap[field].push(textToAppend);
    }

    // Parse Column J (grammarDone) items
    grammarLines.forEach(item => {
      const cleanItemNoSpaces = item.replace(/\s+/g, "");
      const isCompletion = cleanItemNoSpaces.includes("글완") || cleanItemNoSpaces.includes("글쓰기완") || cleanItemNoSpaces.includes("완료");

      if (isCompletion) {
        // Find existing book line in grammarDone (Col J) and append " 글완"
        const cleanBook = item.replace(/글완|글쓰기완료|글쓰기완|완료/g, "").replace(/글쓰기\s*완/g, "").trim();
        let currentGrammar = (student.grammarDone || "").trim();
        if (currentGrammar) {
          let lines = currentGrammar.split("\n");
          let found = false;
          const cleanBookNoSpaces = cleanBook.replace(/\s+/g, "").toLowerCase();
          lines = lines.map(line => {
            const lineNoSpaces = line.replace(/\s+/g, "").toLowerCase();
            if (cleanBookNoSpaces && lineNoSpaces.includes(cleanBookNoSpaces)) {
              found = true;
              if (!line.includes("글완") && !line.includes("글쓰기완") && !line.includes("완료")) {
                const newLine = `${line} 글완`;
                if (newLine.trim().indexOf(eventDatePrefix) === 0) {
                  groupMap.grammarDone.push(newLine);
                }
                return newLine;
              }
            }
            return line;
          });
          
          if (!found && cleanBookNoSpaces) {
            const newLine = `${eventDatePrefix} ${cleanBook} 글완`;
            lines.push(newLine);
            groupMap.grammarDone.push(newLine);
            found = true;
          } else if (!found && !cleanBookNoSpaces && lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            if (!lastLine.includes("글완") && !lastLine.includes("글쓰기완") && !lastLine.includes("완료")) {
              const newLine = `${lastLine} 글완`;
              if (newLine.trim().indexOf(eventDatePrefix) === 0) {
                groupMap.grammarDone.push(newLine);
              }
              lines[lines.length - 1] = newLine;
            }
          }
          student.grammarDone = lines.join("\n");
        } else if (cleanBook) {
          const newLine = `${eventDatePrefix} ${cleanBook} 글완`;
          student.grammarDone = newLine;
          groupMap.grammarDone.push(newLine);
        } else {
          const newLine = `${eventDatePrefix} 글완`;
          student.grammarDone = newLine;
          groupMap.grammarDone.push(newLine);
        }

      } else {
        // Prepend date if not present
        const datePattern = /^\d+[\./]\d+/;
        let textToAppend = "";
        if (datePattern.test(item)) {
          if (/^\d+\/\d+/.test(item)) {
            textToAppend = `${yy}.${item}`;
          } else {
            textToAppend = item;
          }
        } else {
          textToAppend = `${eventDatePrefix} ${item}`;
        }
        groupMap.grammarDone.push(textToAppend);
      }
    });

    targetFields.forEach(field => {
      let currentContent = (student[field] || "").trim();
      let lines = currentContent ? currentContent.split("\n") : [];
      
      const filteredLines = lines.filter(line => line.trim().indexOf(eventDatePrefix) !== 0);

      const newEventsToday = groupMap[field];
      newEventsToday.forEach(text => filteredLines.push(text));

      const newContent = filteredLines.join("\n");
      if (originalValues[field] !== newContent.trim()) {
        student[field] = newContent;
        this.onDataChanged("memberAnalysis", this.dataMap.memberAnalysis);
        if (window.app && window.app.updateFieldInGoogleSheets) {
          window.app.updateFieldInGoogleSheets(student.row, field, newContent, "memberAnalysis");
        }
      }
    });
  }

  renderDecoupledSingleSearch(capacities) {
    const searchName = this.searchQuery || "신나라";
    const members = this.dataMap.memberAnalysis.filter(m => m.name.toLowerCase().trim() === searchName.toLowerCase().trim());
    const studentTextbooks = this.dataMap.textbooks.filter(t => t.name.toLowerCase().trim() === searchName.toLowerCase().trim());
    const studentConsults = this.dataMap.consultations.filter(c => c.name.toLowerCase().trim() === searchName.toLowerCase().trim());

    let html = `
      <div class="decoupled-search-header" style="background: rgba(99,102,241,0.04); border: 1px dashed rgba(99,102,241,0.2); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
        <span style="font-weight:bold; color:var(--accent); font-size: 0.95rem;">🔍 학생 이름 (B3 셀):</span>
        <input type="text" class="sheet-input-search-name" value="${this.escapeHtml(searchName)}" style="max-width: 200px; font-weight:bold; background:var(--input-bg); border:1px solid var(--accent); color:var(--text-primary); text-align:center; border-radius:4px; padding:0.4rem 0.6rem; font-size:1rem; outline: none; box-shadow: 0 0 10px rgba(99,102,241,0.05);">
        <span style="color:var(--text-muted); font-size:0.85rem;">
          ← 이름을 입력하고 <b>Enter</b>를 누르시면 아래 세 가지 리포트 영역이 각 시트에서 자동으로 추출(FILTER) 및 통합 연동됩니다.
        </span>
      </div>
    `;

    html += `
      <div class="decoupled-section-card" style="background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 12px; padding: 1.2rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);">
        <div style="font-weight:bold; color:#10b981; margin-bottom: 0.8rem; font-size:0.95rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%;"></span>
          🟢 1. 회원 종합 분석 및 레벨 관리 (회원 분석/레벨변동/전화상담 시트 연동)
        </div>
        <div class="sheet-table-wrapper" style="overflow-x: auto; max-width: 100%; border: 1px solid var(--table-border); border-radius: 8px;">
          <table class="sheet-table" style="width: 100%; min-width: 1200px; border-collapse: collapse;">
            <thead>
              <tr style="background:var(--table-header-bg); font-weight:bold; font-size:0.8rem;">
                <th class="row-num-col" style="width: 40px;">행</th>
                <th>순번 (A)</th>
                <th>이름 (B)</th>
                <th>학년 (C)</th>
                <th>등록일 (D)</th>
                <th>상담/채널 (E)</th>
                <th>학생 특이사항... (F)</th>
                <th>진도 관리 (G)</th>
                <th>교과지수... (H)</th>
                <th>레벨 변동 (I)</th>
                <th>훈민정음... (J)</th>
                <th>읽트/독트... (K)</th>
                <th>목표달성... (L)</th>
                <th>분석지 발송 (M)</th>
                <th>독서 방법 (N)</th>
                <th>아이디 (O)</th>
                <th>연락처 (P)</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (members.length > 0) {
      members.forEach((member, index) => {
        html += `
              <tr style="background:rgba(16,185,129,0.01);">
                <td class="row-num-col" style="text-align:center;">${7 + index}</td>
                <td style="text-align:center;">${this.escapeHtml(member.num || '')}</td>
                <td style="text-align:center; font-weight:600; color: var(--accent);">${this.escapeHtml(member.name || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.grade || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.regDate || '')}</td>
                <td style="white-space:pre-wrap; word-break:break-all; font-size:0.8rem; line-height:1.4; text-align:left;" title="${this.escapeHtml(member.consultation || '')}">${this.escapeHtml(member.consultation || '')}</td>
                <td style="white-space:pre-wrap; word-break:break-all; font-size:0.8rem; line-height:1.4; text-align:left;" title="${this.escapeHtml(member.notes || '')}">${this.escapeHtml(member.notes || '')}</td>
                <td style="max-width:200px; font-size:0.8rem; line-height:1.4; vertical-align:top; text-align:left; white-space: pre-wrap;">${this.renderRichTextHtml(member.progress || '')}</td>
                <td>${this.escapeHtml(member.levelUp || '')}</td>
                <td>${this.escapeHtml(member.levelChange || '')}</td>
                <td style="max-width:180px; font-size:0.8rem; line-height:1.4; vertical-align:top; text-align:left; white-space: pre-wrap;">${this.renderRichTextHtml(member.grammarDone || '')}</td>
                <td>${this.escapeHtml(member.readingTest || '')}</td>
                <td>${this.escapeHtml(member.bookPlan || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.analysisSent || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(member.readMethod || '')}</td>
                <td>${this.escapeHtml(member.studentId || '')}</td>
                <td>${this.escapeHtml(member.phone || '')}</td>
              </tr>
        `;
      });
    } else {
      html += `
              <tr>
                <td class="row-num-col">7</td>
                <td colspan="16" style="color:var(--danger); padding:0.8rem; text-align:left; font-style:italic;">
                  ➔ 결과: 검색된 회원 종합 분석이 없습니다.
                </td>
              </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    html += `
      <div class="decoupled-section-card" style="background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 12px; padding: 1.2rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);">
        <div style="font-weight:bold; color:#f59e0b; margin-bottom: 0.8rem; font-size:0.95rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="display:inline-block; width:10px; height:10px; background:#f59e0b; border-radius:50%;"></span>
          🟠 2. 문해력 교재 관리 현황 (문해력교재관리 시트 연동)
        </div>
        <div class="sheet-table-wrapper" style="overflow-x: auto; max-width: 100%; border: 1px solid var(--table-border); border-radius: 8px;">
          <table class="sheet-table" style="width: 100%; min-width: 1200px; border-collapse: collapse;">
            <thead>
              <tr style="background:var(--table-header-bg); font-weight:bold; font-size:0.8rem;">
                <th class="row-num-col" style="width: 40px;">행</th>
                <th>학년 (A)</th>
                <th>이름 (B)</th>
                <th style="background:rgba(245,158,11,0.03);">비문학 교재 (C)</th>
                <th style="background:rgba(245,158,11,0.03);">시작일 (D)</th>
                <th style="background:rgba(245,158,11,0.03);">마침일 (E)</th>
                <th style="background:rgba(245,158,11,0.03);">정답률 (F)</th>
                <th style="background:rgba(99,102,241,0.03);">문학 교재 (G)</th>
                <th style="background:rgba(99,102,241,0.03);">시작일 (H)</th>
                <th style="background:rgba(99,102,241,0.03);">마침일 (I)</th>
                <th style="background:rgba(99,102,241,0.03);">정답률 (J)</th>
                <th style="background:rgba(16,185,129,0.03);">어휘 교재 (K)</th>
                <th style="background:rgba(16,185,129,0.03);">시작일 (L)</th>
                <th style="background:rgba(16,185,129,0.03);">마침일 (M)</th>
                <th style="background:rgba(16,185,129,0.03);">정답률 (N)</th>
                <th style="background:rgba(236,72,153,0.03);">복합 교재 (O)</th>
                <th style="background:rgba(236,72,153,0.03);">시작일 (P)</th>
                <th style="background:rgba(236,72,153,0.03);">마침일 (Q)</th>
                <th style="background:rgba(236,72,153,0.03);">정답률 (R)</th>
                <th style="background:rgba(99,102,241,0.03);">음독 교재 (S)</th>
                <th style="background:rgba(99,102,241,0.03);">시작일 (T)</th>
                <th style="background:rgba(99,102,241,0.03);">마침일 (U)</th>
                <th style="background:rgba(99,102,241,0.03);">정답률 (V)</th>
              </tr>
            </thead>
            <tbody>
    `;

    const sec2StartRow = 7 + Math.max(1, members.length) + 3;
    if (studentTextbooks.length > 0) {
      studentTextbooks.forEach((tb, index) => {
        html += `
              <tr style="background:rgba(245,158,11,0.01);">
                <td class="row-num-col" style="text-align:center;">${sec2StartRow + index}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.grade || '')}</td>
                <td style="text-align:center; font-weight:600; color: var(--accent);">${this.escapeHtml(tb.name || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.nonfictionAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.literatureAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.vocabAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.complexAccuracy || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.readaloudTitle || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.readaloudStart || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.readaloudEnd || '')}</td>
                <td style="text-align:center;">${this.escapeHtml(tb.readaloudAccuracy || '')}</td>
              </tr>
        `;
      });
    } else {
      html += `
              <tr>
                <td class="row-num-col">${sec2StartRow}</td>
                <td colspan="23" style="color:var(--danger); padding:0.8rem; text-align:left; font-style:italic;">
                  ➔ 결과: 등록된 문해력 교재 현황이 없습니다.
                </td>
              </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    html += `
      <div class="decoupled-section-card" style="background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 12px; padding: 1.2rem; box-shadow: var(--shadow-sm);">
        <div style="font-weight:bold; color:var(--accent); margin-bottom: 0.8rem; font-size:0.95rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="display:inline-block; width:10px; height:10px; background:var(--accent); border-radius:50%;"></span>
          🔵 3. 상담 및 리포트 발송 기록 (상담내용/리포트발송/채널발송 시트 연동)
        </div>
        <div class="sheet-table-wrapper" style="overflow-x: auto; max-width: 100%; border: 1px solid var(--table-border); border-radius: 8px;">
          <table class="sheet-table" style="width: 100%; min-width: 800px; border-collapse: collapse;">
            <thead>
              <tr style="background:var(--table-header-bg); font-weight:bold; font-size:0.8rem;">
                <th class="row-num-col" style="width: 40px; text-align:center;">행</th>
                <th style="width: 70px; text-align:center;">학년 (A)</th>
                <th style="width: 90px; text-align:center;">이름 (B)</th>
                <th style="width: 90px; text-align:center;">작성기간 (C)</th>
                <th style="width: 60px; text-align:center; white-space: normal; word-break: break-all;">작성인 (D)</th>
                <th style="min-width: 380px; text-align:left;">상담내용 / 분석지 / 채널 보냄 (E)</th>
                <th style="min-width: 300px; text-align:left;">부모님의 need / 학생 특이사항 (F)</th>
              </tr>
            </thead>
            <tbody>
    `;

    const sec3StartRow = sec2StartRow + Math.max(1, studentTextbooks.length) + 3;
    if (studentConsults.length > 0) {
      studentConsults.forEach((c, index) => {
        html += `
              <tr style="background:rgba(99,102,241,0.01);">
                <td class="row-num-col" style="width: 40px; text-align:center;">${sec3StartRow + index}</td>
                <td style="width: 70px; text-align:center;">${this.escapeHtml(c.grade || '')}</td>
                <td style="width: 90px; text-align:center; font-weight:600; color: var(--accent);">${this.escapeHtml(c.name || '')}</td>
                <td style="width: 90px; text-align:center;">${this.escapeHtml(c.period || '')}</td>
                <td style="width: 60px; text-align:center; white-space: normal; word-break: break-all;">${this.escapeHtml(c.author || '')}</td>
                <td style="min-width: 380px; text-align:left; white-space:pre-wrap; word-break:break-all; font-size:0.85rem; line-height:1.4; padding:0.5rem 0.8rem;">${this.escapeHtml(c.content || '')}</td>
                <td style="min-width: 300px; text-align:left; white-space:pre-wrap; word-break:break-all; font-size:0.85rem; line-height:1.4; padding:0.5rem 0.8rem;">${this.escapeHtml(c.needs || '')}</td>
              </tr>
        `;
      });
    } else {
      html += `
              <tr>
                <td class="row-num-col">${sec3StartRow}</td>
                <td colspan="7" style="color:var(--danger); padding:0.8rem; text-align:left; font-style:italic;">
                  ➔ 결과: 등록된 상담 및 리포트 발송 기록이 없습니다.
                </td>
              </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    return html;
  }

  renderRichTextHtml(text) {
    if (!text) return "";
    const lines = text.split("\n");
    return lines.map(line => {
      const isBlue = line.includes("글완") || line.includes("글쓰기완") || line.includes("완료") || line.includes("표현활동");
      if (isBlue) {
        return `<div style="color: #2563eb; font-weight: bold;">${this.escapeHtml(line)}</div>`;
      }
      return `<div>${this.escapeHtml(line)}</div>`;
    }).join("");
  }

  escapeHtml(string) {
    return String(string)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
