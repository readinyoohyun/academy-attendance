// app.js - Main Application Logic for Academy Attendance & CRM System (Refactored & Modularized)
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function getNormalizedStatus(status) {
  if (!status) return "대기";
  const s = String(status).trim().replace(/\s+/g, "");
  if (s === "출석" || s === "수업완료" || s === "출석완료" || s === "완료") return "수업완료";
  if (s === "보강완료" || s === "보강 완료" || s === "보강") return "보강완료";
  if (s === "수업중" || s === "수업 중" || s === "중") return "수업중";
  if (s === "결석") return "결석";
  if (s === "대기") return "대기";
  return s;
}

// Real student data imported from the user's spreadsheet for high-fidelity simulation
const INITIAL_STUDENTS = [
  { 
    id: 'row_2', row: 2, name: '강성모', grade: '중2', classes: '90분/주3회 월,화,목5시',
    times: { '월요일': '18:00', '화요일': '18:00', '수요일': '17:30', '목요일': '', '금요일': '17:30', '토요일': '', '일요일': '' },
    notes: '90분 6/19(금) 15분 추가!', absentDates: '12./29, 1/15, 4/8, 4/27, 5/27', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_3', row: 3, name: '강예진', grade: '중1', classes: '60분 주 5회 월~목16시 금5:30',
    times: { '월요일': '16:00', '화요일': '16:00', '수요일': '16:00', '목요일': '16:00', '금요일': '17:30', '토요일': '', '일요일': '' },
    notes: '음독 합니다. 모든 활동 주의 깊게 관찰 필요', absentDates: '4/8, 4/9, 5/22', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_4', row: 4, name: '강지호', grade: '초5', classes: '60분/주3회 화6 수2:40 금5',
    times: { '월요일': '', '화요일': '18:00', '수요일': '13:30', '목요일': '', '금요일': '17:00', '토요일': '', '일요일': '' },
    notes: '', absentDates: '', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_5', row: 5, name: '곽세연', grade: '초5', classes: '90분/ 주1회 금 3시',
    times: { '월요일': '', '화요일': '', '수요일': '', '목요일': '', '금요일': '15:00', '토요일': '', '일요일': '' },
    notes: '', absentDates: '', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_6', row: 6, name: '강찬', grade: '초4', classes: '60분 / 3회 월수금 4시',
    times: { '월요일': '16:00', '화요일': '', '수요일': '16:00', '목요일': '', '금요일': '16:00', '토요일': '', '일요일': '' },
    notes: '', absentDates: '5/13, 5/15', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_7', row: 7, name: '권서윤', grade: '중1', classes: '주270분/월수금60',
    times: { '월요일': '18:30', '화요일': '', '수요일': '18:30', '목요일': '', '금요일': '18:30', '토요일': '10:30', '일요일': '' },
    notes: '월수금60분/토90분', absentDates: '3/28, 4/15, 4/27, 5/22', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_8', row: 8, name: '김건우', grade: '초5', classes: '60분/주3회 수 목 3시/토11시',
    times: { '월요일': '', '화요일': '', '수요일': '15:00', '목요일': '15:00', '금요일': '', '토요일': '11:00', '일요일': '' },
    notes: '6/17, 6/18 결석', absentDates: '4/22, 6/10, 6/17, 6/18', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_9', row: 9, name: '김다원', grade: '중2', classes: '90분/주3회 월수15:30/토11:00',
    times: { '월요일': '15:30', '화요일': '', '수요일': '15:30', '목요일': '', '금요일': '15:30', '토요일': '', '일요일': '' },
    notes: '서술형 약함, 서술 속도 느림', absentDates: '4/29, 5/20, 5/22', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_10', row: 10, name: '김민준', grade: '초4', classes: '60분/2회 월 수 2시',
    times: { '월요일': '14:00', '화요일': '', '수요일': '14:00', '목요일': '', '금요일': '', '토요일': '', '일요일': '' },
    notes: '2-4코스업 사진촬영', absentDates: '5/4, 5/9, 5/18, 5/20, 6/1, 6/8', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_11', row: 11, name: '26 김민준', grade: '초3', classes: '주2회 90분 화4시 /목3시',
    times: { '월요일': '', '화요일': '16:00', '수요일': '', '목요일': '15:00', '금요일': '', '토요일': '', '일요일': '' },
    notes: '', absentDates: '4/30, 5/21', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_12', row: 12, name: '김래호', grade: '초5', classes: '60분/2회 화 목4:00',
    times: { '월요일': '', '화요일': '16:00', '수요일': '', '목요일': '16:00', '금요일': '', '토요일': '', '일요일': '' },
    notes: '', absentDates: '', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_13', row: 13, name: '김지완', grade: '초3', classes: '60분/5회 월화수금3시,목4시',
    times: { '월요일': '15:00', '화요일': '15:00', '수요일': '15:00', '목요일': '16:00', '금요일': '15:00', '토요일': '', '일요일': '' },
    notes: '기초도서 듣기->읽기 / 음독', absentDates: '4/20', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_14', row: 14, name: '김태은', grade: '중2', classes: '90분/3회 월수금15:30 60분',
    times: { '월요일': '15:30', '화요일': '', '수요일': '15:30', '목요일': '', '금요일': '15:30', '토요일': '', '일요일': '' },
    notes: '60분 수업', absentDates: '5/22, 6/5, 6/17', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_15', row: 15, name: '김알란', grade: '초5', classes: '90분/2회 수 2시,목 4시',
    times: { '월요일': '', '화요일': '', '수요일': '14:00', '목요일': '16:00', '금요일': '', '토요일': '', '일요일': '' },
    notes: '목: 읽트 지켜봐야 함', absentDates: '', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_16', row: 16, name: '김하예', grade: '초2', classes: '90분/2회 화,목 3시30',
    times: { '월요일': '', '화요일': '15:30', '수요일': '', '목요일': '15:30', '금요일': '', '토요일': '', '일요일': '' },
    notes: '', absentDates: '', makeupDate: '', makeupCompleted: ''
  },
  { 
    id: 'row_17', row: 17, name: '이하준', grade: '초3', classes: '문해력,한국사 월수 13:30',
    times: { '월요일': '13:30', '화요일': '', '수요일': '13:30', '목요일': '', '금요일': '', '토요일': '', '일요일': '' },
    notes: '월.문해력 수.한국사', absentDates: '6/5', makeupDate: '', makeupCompleted: ''
  }
];

const INITIAL_DAILY_LOGS = [
  { id: 'daily_3', row: 3, date: '6/18목', time: '18:00', name: '강성모', status: '출석', inTime: '17:55', reason: '', contents: '비문학 처음 세계사 1단원 요약', notes: '' },
  { id: 'daily_4', row: 4, date: '6/18목', time: '16:00', name: '강예진', status: '출석', inTime: '15:58', reason: '', contents: '어휘 학습 및 문해력 독해 트레이닝', notes: '묵독 점검함.' },
  { id: 'daily_5', row: 5, date: '6/18목', time: '15:00', name: '26 김민준', status: '보강완료', inTime: '15:02', reason: '이전 결석 보강', contents: '국어 독해 기본 1단계', notes: '집중도가 매우 좋음.' }
];

const INITIAL_TEXTBOOKS = [
  { 
    id: 'textbook_2', row: 2, grade: '중2', name: '강성모', 
    nonfictionTitle: '처음 세계사 1', nonfictionStart: '2026-05-10', nonfictionEnd: '', nonfictionAccuracy: '75%',
    literatureTitle: '중학 국어 소설 1', literatureStart: '2026-06-01', literatureEnd: '', literatureAccuracy: '80%',
    vocabTitle: '', vocabStart: '', vocabEnd: '', vocabAccuracy: '',
    complexTitle: '', complexStart: '', complexEnd: '', complexAccuracy: ''
  },
  { 
    id: 'textbook_3', row: 3, grade: '중1', name: '강예진', 
    nonfictionTitle: '', nonfictionStart: '', nonfictionEnd: '', nonfictionAccuracy: '',
    literatureTitle: '중학 국어 시 1', literatureStart: '2026-06-01', literatureEnd: '', literatureAccuracy: '85%',
    vocabTitle: '중학 어휘 마스터', vocabStart: '2026-06-01', vocabEnd: '', vocabAccuracy: '90%',
    complexTitle: '', complexStart: '', complexEnd: '', complexAccuracy: ''
  },
  { 
    id: 'textbook_4', row: 4, grade: '초5', name: '강지호', 
    nonfictionTitle: '', nonfictionStart: '', nonfictionEnd: '', nonfictionAccuracy: '',
    literatureTitle: '', literatureStart: '', literatureEnd: '', literatureAccuracy: '',
    vocabTitle: '초등 국어 필수 어휘 3단계', vocabStart: '2026-06-05', vocabEnd: '', vocabAccuracy: '85%',
    complexTitle: '초등 국어 독해 통합', complexStart: '2026-06-05', complexEnd: '', complexAccuracy: '80%'
  }
];

const INITIAL_CONSULTATIONS = [
  { 
    id: 'consultation_2', row: 2, grade: '초4', name: '신나라', period: '6/16', author: '원', 
    content: '5/29에 리원이가 [문해력PT] 첫 수업을 했습니다. 설명하는글 분석 2단계로 시작하였습니다. 설명하는 글을 읽고 중심 내용과 중심 화제를 찾아보았습니다.', 
    needs: '부모님이 독해력 강화를 강하게 요구하심.' 
  },
  { 
    id: 'consultation_3', row: 3, grade: '중1', name: '권서윤', period: '6/16', author: '하', 
    content: '서윤이가 『초등 국어 독해왕 6』 교재를 끝까지 성실하게 완주하였습니다. 정답률은 83%로, 지문의 핵심 내용을 파악하고 문제의 요구를 이해하는 능력이 꾸준히 향상되고 있습니다.', 
    needs: '비문학 독해 6단계 이어서 진행 예정.' 
  }
];

const INITIAL_MEMBER_ANALYSIS = [
  {
    id: 'member_19', row: 19, num: '1', name: '강성모', grade: '중등 2', regDate: '25.01.02',
    consultation: '', notes: '25.1/8 3-1사랑으로세계를치료한 50', progress: '수업 참여도 양호',
    levelUp: '', levelChange: '3-1', grammarDone: '', readingTest: '', bookPlan: '',
    analysisSent: '발송완료', readMethod: '정독', studentId: 'ksm123', phone: '010-9876-5432'
  },
  {
    id: 'member_20', row: 20, num: '2', name: '신나라', grade: '초등 4', regDate: '26.3',
    consultation: '입회상담 완료', notes: '글쓰기는 잘한다. 발표는 부끄러워하지만 밝다.', progress: '설명문 지문분석 2단계 시작',
    levelUp: '4-1초록띠', levelChange: '3-1', grammarDone: '어린이 훈민정음 3-1', readingTest: '26.4/7', bookPlan: '',
    analysisSent: '발송완료', readMethod: '정독', studentId: 'snr123', phone: '010-1234-5678'
  }
];

const INITIAL_ATTENDANCE_LOGS = [
  { id: 'log_2', row: 2, timestamp: '2026-06-18 17:55:12', name: '강성모', date: '6/18', day: '목요일', time: '18:00', status: '출석' },
  { id: 'log_3', row: 3, timestamp: '2026-06-18 15:58:44', name: '강예진', date: '6/18', day: '목요일', time: '16:00', status: '출석' },
  { id: 'log_4', row: 4, timestamp: '2026-06-18 15:02:10', name: '26 김민준', date: '6/18', day: '목요일', time: '15:00', status: '보강완료' }
];

const INITIAL_ACCUMULATED_LOGS = [
  { date: "6/22월", time: "15:00", name: "강성모", notes: "오늘도 성실함", status: "수업완료", inTime: "15:00", reason: "", number: "", event: "", grammarDone: "", contents: "교과 독서 및 단어 확인. 집중력 매우 좋음." },
  { date: "6/22월", time: "16:00", name: "강예진", notes: "", status: "수업완료", inTime: "16:05", reason: "", number: "", event: "읽트완료", grammarDone: "", contents: "비문학 독해 훈련. 속독 훈련을 성실히 이행함." },
  { date: "6/23화", time: "18:00", name: "강성모", notes: "", status: "수업완료", inTime: "17:58", reason: "", number: "4-1", event: "레벨업", grammarDone: "", contents: "레벨업 테스트 합격! 역사 어휘력 우수." },
  { date: "6/23화", time: "13:30", name: "강지호", notes: "수업 시작 전 장난침", status: "수업완료", inTime: "13:35", reason: "", number: "", event: "", grammarDone: "글쓰기 완료", contents: "표현활동 글쓰기 성실히 완료." },
  { date: "6/24수", time: "16:00", name: "강예진", notes: "졸려함", status: "수업완료", inTime: "16:02", reason: "", number: "", event: "", grammarDone: "", contents: "집중을 다소 어려워했으나 끝까지 마무리함." },
  { date: "6/24수", time: "17:30", name: "강성모", notes: "보강 완료", status: "보강완료", inTime: "17:28", reason: "보강 수업", number: "", event: "", grammarDone: "", contents: "지난주 결석분 보강 수업 진행." }
];

// Helper: Get formatted date string (M/D) for a target weekday of the current week
function getFormattedDateOfWeekday(targetDayName) {
  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const today = new Date();
  const todayDayIndex = today.getDay();
  const targetDayIndex = dayNames.indexOf(targetDayName);
  
  const diff = targetDayIndex - todayDayIndex;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + diff);
  
  const m = targetDate.getMonth() + 1;
  const d = targetDate.getDate();
  return {
    slashFormat: `${m}/${d}`, // e.g. "6/18"
    dotFormat: `${m}.${d}`    // e.g. "6.18"
  };
}

// Helper: Parse makeup date string into Day of week and Hour (with yearless/dot/slash/parentheses support)
function parseMakeupDate(makeupStr) {
  if (!makeupStr) return null;
  try {
    let cleanStr = String(makeupStr).trim();
    
    // 1. Check if it's weekly format (e.g. "목요일 16:00" or "수요일 15:30")
    const simpleMatch = cleanStr.match(/^([가-힣]{3})\s+(\d{2}:\d{2})$/);
    if (simpleMatch) {
      return { day: simpleMatch[1], time: simpleMatch[2], isWeekly: true };
    }
    
    // 2. Strip weekday in parentheses if any, e.g. "7/25(토) 16:00" -> "7/25 16:00"
    cleanStr = cleanStr.replace(/\([가-힣]+\)/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 3. Replace dots or dashes with slashes, e.g. "7.25 16:00" -> "7/25 16:00"
    cleanStr = cleanStr.replace(/\./g, '/').replace(/-/g, '/');
    
    // 4. If year is omitted (like "7/25 16:00"), prepend the current year to ensure reliable parsing on Safari/Chrome
    if (cleanStr.match(/^\d{1,2}\/\d{1,2}/)) {
      const currentYear = new Date().getFullYear();
      cleanStr = `${currentYear}/${cleanStr}`;
    }
    
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      const day = WEEKDAYS[d.getDay()];
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const month = d.getMonth() + 1;
      const date = d.getDate();
      return { 
        day, 
        time: `${hours}:${minutes}`, 
        isWeekly: false,
        formattedSlash: `${month}/${date}`,
        formattedDot: `${month}.${date}`
      };
    }
  } catch (e) {
    console.error("Error parsing makeup date: ", makeupStr, e);
  }
  return null;
}

// Helper: Parse comma-separated list of multiple makeup dates
function parseMultipleMakeups(makeupStr) {
  if (!makeupStr) return [];
  const parts = String(makeupStr).split(/[\n,\r]+/).map(p => p.trim()).filter(Boolean);
  const parsedList = [];
  parts.forEach(part => {
    const parsed = parseMakeupDate(part);
    if (parsed) {
      parsedList.push(parsed);
    }
  });
  return parsedList;
}

// Helper: Extract pure date (M/D) from a styled absent date string like "7/1(수)" or "7.1"
function parseAbsentDatePure(absentStr) {
  if (!absentStr) return "";
  const clean = String(absentStr).trim().replace(/\s+/g, '');
  // Extract number/number at start, e.g. "7/1" or "07/01" or "7.1"
  const match = clean.match(/^(\d{1,2})[/\.](\d{1,2})/);
  if (match) {
    const m = parseInt(match[1], 10);
    const d = parseInt(match[2], 10);
    return {
      slashFormat: `${m}/${d}`,
      dotFormat: `${m}.${d}`
    };
  }
  return null;
}

// Helper: Get student class duration in minutes based on classes string or grade
function getClassDuration(student) {
  if (!student) return 60;
  const classesStr = student.classes || "";
  
  const match = classesStr.match(/(60|70|90|100|120|180)\s*분/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  const grade = student.grade || "";
  if (grade.includes("중") || grade.includes("고") || grade.includes("예비중")) {
    return 90;
  }
  return 60;
}

// Main Coordinator Application Class
class AttendanceApp {
  constructor() {
    this.state = {
      students: [],
      dailyLogs: [],
      textbooks: [],
      consultations: [],
      memberAnalysis: [],
      attendanceLogs: [],
      accumulatedLogs: []
    };

    this.gasWebhookUrl = "";
    this.smsMode = "local";
    this.smsApiKey = "";
    this.smsDeviceId = "";
    this.smsLocalIp = "http://192.168.0.50:8080";
    this.smsTemplateIn = "{name}학생이 유현리드인 한그루역사학원에 {time}에 등원하여 수업중입니다.";
    this.smsTemplateOut = "{name}학생이 유현리드인 한그루역사학원에 {time}에 수업을 마치고 하원하였습니다.";

    this.selectedDay = "월요일";
    this.selectedTime = "14:00";
    this.autoTimeEnabled = true;
    
    // Modules Setup (Request 3 - Modularization)
    this.api = new SheetAPI(this);
    this.smsManager = new SMSManager(this);
    this.crmManager = new CRMManager(this);
    this.dashboardManager = new DashboardManager(this);

    // Initializing the mock spreadsheet simulator
    this.sheetSim = new SheetSimulator("sheetSimulatorContainer", (datasetKey, updatedData) => {
      this.state[datasetKey] = updatedData;
      this.saveState();
      this.dashboardManager.updateDashboard();
      this.dashboardManager.updateQuickSchedules();
      if (this.crmManager.currentCrmStudentName) {
        this.crmManager.loadCrmStudent(this.crmManager.currentCrmStudentName);
      }
    });

    this.init();
  }

  init() {
    this.loadState();
    this.adjustMockMakeupDates();
    this.bindEvents();

    // Fetch initial sheets data or trigger local simulation
    this.api.fetchFromGoogleSheets(false);
    this.smsManager.initSmsSettings();
    this.crmManager.initCrmView();

    // Load initial schedules and timelines
    if (this.autoTimeEnabled) {
      this.dashboardManager.setToCurrentTime();
      this.autoTimeInterval = setInterval(() => {
        if (this.autoTimeEnabled) this.dashboardManager.setToCurrentTime();
      }, 60000);
    } else {
      this.dashboardManager.updateDashboard();
      this.dashboardManager.updateQuickSchedules();
    }

    // Refresh dashboard every 30 seconds for the real-time elapsed timer
    this.timerRefreshInterval = setInterval(() => {
      this.dashboardManager.updateDashboard();
    }, 30000);

    // Auto background sync from Google Sheets every 60 seconds (Item 10)
    this.syncInterval = setInterval(() => {
      this.api.fetchFromGoogleSheets(false);
    }, 60000);
  }

  adjustMockMakeupDates() {
    const today = new Date();
    const formattedStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 15:00`;
    
    const targetStudent = this.state.students.find(s => s.name === "26 김민준");
    if (targetStudent) {
      targetStudent.makeupDate = formattedStr;
      targetStudent.makeupCompleted = '대기';
    }
  }

  loadState() {
    const saved = localStorage.getItem("academy_attendance_state");
    if (saved) {
      try {
        this.state = JSON.parse(saved);
        // Ensure properties exist
        if (!this.state.students) this.state.students = [];
        if (!this.state.dailyLogs) this.state.dailyLogs = [];
        if (!this.state.textbooks) this.state.textbooks = [];
        if (!this.state.consultations) this.state.consultations = [];
        if (!this.state.memberAnalysis) this.state.memberAnalysis = [];
        if (!this.state.attendanceLogs) this.state.attendanceLogs = [];
        if (!this.state.accumulatedLogs) this.state.accumulatedLogs = [];
        
        this.students = this.state.students;
      } catch (e) {
        console.error("Failed to parse local state, resetting...", e);
        this.resetToInitialState();
      }
    } else {
      this.resetToInitialState();
    }

    let storedUrl = localStorage.getItem("gas_webhook_url");
    if (!storedUrl || !storedUrl.startsWith("https://script.google.com")) {
      storedUrl = "https://script.google.com/macros/s/AKfycbwKwMUSSvGPoTxAUTj6mOAWczrvOVLHCKymSxtpNa1YU6avxwR7jJH__iuOJlJ9bagXZQ/exec";
      localStorage.setItem("gas_webhook_url", storedUrl);
    }
    this.gasWebhookUrl = storedUrl;
    this.smsMode = localStorage.getItem("sms_mode") || "local";
    this.smsApiKey = localStorage.getItem("sms_api_key") || "";
    this.smsDeviceId = localStorage.getItem("sms_device_id") || "";
    this.smsLocalIp = localStorage.getItem("sms_local_ip") || "http://192.168.0.50:8080";
    this.smsTemplateIn = localStorage.getItem("sms_template_in") || this.smsTemplateIn;
    this.smsTemplateOut = localStorage.getItem("sms_template_out") || this.smsTemplateOut;
    this.autoTimeEnabled = localStorage.getItem("auto_time_enabled") !== "false";

    // Load master settings
    this.academyName = localStorage.getItem("academy_name") || "유현리드인 한그루역사학원";
    this.logoUrl = localStorage.getItem("logo_url") || "";
    this.masterPassword = localStorage.getItem("master_password") || "";
    this.googleSheetUrl = localStorage.getItem("google_sheet_url") || "";
    this.googleSheetId = localStorage.getItem("google_sheet_id") || "";
    this.solapiApiKey = localStorage.getItem("solapi_api_key") || "";
    this.solapiApiSecret = localStorage.getItem("solapi_api_secret") || "";
    this.solapiSenderPhone = localStorage.getItem("solapi_sender_phone") || "";

    // Apply branding to header
    const brandAcademyNameEl = document.getElementById("brandAcademyName");
    if (brandAcademyNameEl) brandAcademyNameEl.innerText = this.academyName;

    const brandLogoSpanEl = document.getElementById("brandLogoSpan");
    if (brandLogoSpanEl) {
      if (this.logoUrl) {
        brandLogoSpanEl.innerHTML = `<img src="${this.logoUrl}" style="height: 32px; border-radius: 4px; object-fit: contain;" alt="Logo">`;
      } else {
        brandLogoSpanEl.innerHTML = `<span id="brandLogoEmoji">🏫</span>`;
      }
    }

    document.getElementById("inputGasUrl").value = this.gasWebhookUrl;
    document.getElementById("autoTimeSwitch").checked = this.autoTimeEnabled;
    this.updateGasUrlQrCode();

    this.sheetSim.setData(this.state);
    this.initMasterSettings();
  }

  resetToInitialState() {
    this.state = {
      students: JSON.parse(JSON.stringify(INITIAL_STUDENTS)),
      dailyLogs: JSON.parse(JSON.stringify(INITIAL_DAILY_LOGS)),
      textbooks: JSON.parse(JSON.stringify(INITIAL_TEXTBOOKS)),
      consultations: JSON.parse(JSON.stringify(INITIAL_CONSULTATIONS)),
      memberAnalysis: JSON.parse(JSON.stringify(INITIAL_MEMBER_ANALYSIS)),
      attendanceLogs: JSON.parse(JSON.stringify(INITIAL_ATTENDANCE_LOGS)),
      accumulatedLogs: JSON.parse(JSON.stringify(INITIAL_ACCUMULATED_LOGS))
    };
    this.students = this.state.students;
    this.saveState();
  }

  saveState() {
    localStorage.setItem("academy_attendance_state", JSON.stringify(this.state));
    localStorage.setItem("gas_webhook_url", this.gasWebhookUrl);
    localStorage.setItem("sms_mode", this.smsMode);
    localStorage.setItem("sms_api_key", this.smsApiKey);
    localStorage.setItem("sms_device_id", this.smsDeviceId);
    localStorage.setItem("sms_local_ip", this.smsLocalIp);
    localStorage.setItem("sms_template_in", this.smsTemplateIn);
    localStorage.setItem("sms_template_out", this.smsTemplateOut);
    localStorage.setItem("auto_time_enabled", String(this.autoTimeEnabled));

    localStorage.setItem("academy_name", this.academyName);
    localStorage.setItem("logo_url", this.logoUrl);
    localStorage.setItem("master_password", this.masterPassword);
    localStorage.setItem("google_sheet_url", this.googleSheetUrl);
    localStorage.setItem("google_sheet_id", this.googleSheetId);
    localStorage.setItem("solapi_api_key", this.solapiApiKey);
    localStorage.setItem("solapi_api_secret", this.solapiApiSecret);
    localStorage.setItem("solapi_sender_phone", this.solapiSenderPhone);
  }

  showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.innerHTML = isError ? `✔️ ${message}` : `✔️ ${message}`; // wait, let's use the correct icons
    if (isError) {
      toast.innerHTML = `❌ ${message}`;
    } else {
      toast.innerHTML = `✔️ ${message}`;
    }
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  updateGasUrlQrCode() {
    const container = document.getElementById("gasUrlQrContainer");
    const img = document.getElementById("gasUrlQrImg");
    if (container && img) {
      if (this.gasWebhookUrl && this.gasWebhookUrl.indexOf("https://script.google.com") === 0) {
        const currentOrigin = window.location.origin;
        const kioskUrl = `${currentOrigin}/kiosk.html?gas_webhook_url=${encodeURIComponent(this.gasWebhookUrl)}`;
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(kioskUrl)}`;
        container.style.display = "block";
      } else {
        container.style.display = "none";
      }
    }
  }

  initMasterSettings() {
    const passwordSection = document.getElementById("settingsPasswordSection");
    const contentSection = document.getElementById("settingsContentSection");
    const verifyBtn = document.getElementById("btnVerifyPassword");
    const passwordInput = document.getElementById("inputMasterPassword");
    const passwordErrorMsg = document.getElementById("passwordErrorMsg");

    const setAcademyName = document.getElementById("setAcademyName");
    const setLogoUrl = document.getElementById("setLogoUrl");
    const setSheetUrl = document.getElementById("setSheetUrl");
    const setSheetId = document.getElementById("setSheetId");
    const setSolapiApiKey = document.getElementById("setSolapiApiKey");
    const setSolapiApiSecret = document.getElementById("setSolapiApiSecret");
    const setSolapiSenderPhone = document.getElementById("setSolapiSenderPhone");

    const saveSettingsBtn = document.getElementById("btnSaveMasterSettings");
    const exportBtn = document.getElementById("btnExportConfig");
    const importBtn = document.getElementById("btnImportConfig");
    const fileSelector = document.getElementById("importConfigFileSelector");

    if (!passwordSection || !contentSection) return;

    // 1. Check password protection
    if (!this.masterPassword) {
      passwordSection.style.display = "none";
      contentSection.style.display = "block";
    } else {
      passwordSection.style.display = "block";
      contentSection.style.display = "none";
    }

    // 2. Pre-populate existing configuration values
    setAcademyName.value = this.academyName || "";
    setLogoUrl.value = this.logoUrl || "";
    setSheetUrl.value = this.googleSheetUrl || "";
    setSheetId.value = this.googleSheetId || "";
    setSolapiApiKey.value = this.solapiApiKey || "";
    setSolapiApiSecret.value = this.solapiApiSecret || "";
    setSolapiSenderPhone.value = this.solapiSenderPhone || "";

    // 3. Verify Master Password
    verifyBtn.onclick = () => {
      const entered = passwordInput.value.trim();
      if (entered === this.masterPassword) {
        passwordSection.style.display = "none";
        contentSection.style.display = "block";
        passwordErrorMsg.style.display = "none";
        this.showToast("마스터 패키지 설정 잠금이 해제되었습니다.");
      } else {
        passwordErrorMsg.style.display = "block";
      }
    };

    // 4. Auto extract Google Sheet ID from URL
    setSheetUrl.oninput = (e) => {
      const url = e.target.value.trim();
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        setSheetId.value = match[1];
      } else {
        setSheetId.value = "";
      }
    };

    // 5. Save all settings
    saveSettingsBtn.onclick = () => {
      const newPass = document.getElementById("setNewMasterPassword").value.trim();
      const newPassConfirm = document.getElementById("setNewMasterPasswordConfirm").value.trim();

      if (newPass) {
        if (newPass !== newPassConfirm) {
          alert("❌ 새 비밀번호와 확인 비밀번호가 서로 일치하지 않습니다!");
          return;
        }
        this.masterPassword = newPass;
      }

      this.academyName = setAcademyName.value.trim() || "유현리드인 한그루역사학원";
      this.logoUrl = setLogoUrl.value.trim();
      this.googleSheetUrl = setSheetUrl.value.trim();
      this.googleSheetId = setSheetId.value.trim();
      this.solapiApiKey = setSolapiApiKey.value.trim();
      this.solapiApiSecret = setSolapiApiSecret.value.trim();
      this.solapiSenderPhone = setSolapiSenderPhone.value.trim();

      // Save state to local storage
      this.saveState();

      // Apply branding dynamically to header
      const brandAcademyNameEl = document.getElementById("brandAcademyName");
      if (brandAcademyNameEl) brandAcademyNameEl.innerText = this.academyName;

      const brandLogoSpanEl = document.getElementById("brandLogoSpan");
      if (brandLogoSpanEl) {
        if (this.logoUrl) {
          brandLogoSpanEl.innerHTML = `<img src="${this.logoUrl}" style="height: 32px; border-radius: 4px; object-fit: contain;" alt="Logo">`;
        } else {
          brandLogoSpanEl.innerHTML = `<span id="brandLogoEmoji">🏫</span>`;
        }
      }

      // If Google Sheet ID is updated, notify SheetAPI
      if (this.googleSheetId) {
        this.showToast("구글 스프레드시트 연동 ID가 갱신되었습니다.");
      }

      alert("🎉 학원 마스터 설정이 성공적으로 저장 및 적용되었습니다!");
      location.reload(); // Reload to fully re-initialize Sheet data with new sheet ID
    };

    // 6. Export configuration as JSON
    exportBtn.onclick = () => {
      const configObj = {
        academy_name: this.academyName,
        logo_url: this.logoUrl,
        master_password: this.masterPassword,
        google_sheet_url: this.googleSheetUrl,
        google_sheet_id: this.googleSheetId,
        solapi_api_key: this.solapiApiKey,
        solapi_api_secret: this.solapiApiSecret,
        solapi_sender_phone: this.solapiSenderPhone,
        gas_webhook_url: this.gasWebhookUrl,
        sms_mode: this.smsMode,
        sms_local_ip: this.smsLocalIp
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(configObj, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `academy_config_${this.academyName.replace(/\s+/g, '_')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showToast("설정 백업 파일(JSON)을 내보냈습니다.");
    };

    // 7. Import configuration from JSON
    importBtn.onclick = () => {
      fileSelector.click();
    };

    fileSelector.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported.academy_name) this.academyName = imported.academy_name;
          if (imported.logo_url !== undefined) this.logoUrl = imported.logo_url;
          if (imported.master_password !== undefined) this.masterPassword = imported.master_password;
          if (imported.google_sheet_url !== undefined) this.googleSheetUrl = imported.google_sheet_url;
          if (imported.google_sheet_id !== undefined) this.googleSheetId = imported.google_sheet_id;
          if (imported.solapi_api_key !== undefined) this.solapiApiKey = imported.solapi_api_key;
          if (imported.solapi_api_secret !== undefined) this.solapiApiSecret = imported.solapi_api_secret;
          if (imported.solapi_sender_phone !== undefined) this.solapiSenderPhone = imported.solapi_sender_phone;
          if (imported.gas_webhook_url !== undefined) this.gasWebhookUrl = imported.gas_webhook_url;
          if (imported.sms_mode !== undefined) this.smsMode = imported.sms_mode;
          if (imported.sms_local_ip !== undefined) this.smsLocalIp = imported.sms_local_ip;

          this.saveState();
          alert("🎉 설정 복원이 완료되었습니다! 새 설정을 적용하기 위해 화면을 새로고침합니다.");
          location.reload();
        } catch (err) {
          alert("❌ 올바른 설정 백업 JSON 파일이 아닙니다: " + err.message);
        }
      };
      reader.readAsText(file);
    };
  }

  syncAttendanceFromDailyLogs() {
    const dates = getFormattedDateOfWeekday(this.selectedDay);
    const shortDay = this.selectedDay.substring(0, 1);
    const dailyLogDateStr = `${dates.slashFormat}${shortDay}`;

    this.state.students.forEach(student => {
      const dailyLog = this.state.dailyLogs.find(l => 
        ((l && l.name) || '').replace(/\s+/g, '') === ((student && student.name) || '').replace(/\s+/g, '') && 
        ((l && l.date) || '').trim() === dailyLogDateStr.trim()
      );
      if (dailyLog) {
        const norm = getNormalizedStatus(dailyLog.status);
        if (norm === "수업완료" || norm === "보강완료") {
          student.attendanceStatus = "수업완료";
          const parsedM = student.makeupDate ? parseMakeupDate(student.makeupDate) : null;
          if (student.makeupDate && parsedM && parsedM.day === this.selectedDay) {
            student.makeupCompleted = "완료";
          }
        } else if (norm === "수업중") {
          student.attendanceStatus = "수업중";
          const parsedM = student.makeupDate ? parseMakeupDate(student.makeupDate) : null;
          if (student.makeupDate && parsedM && parsedM.day === this.selectedDay) {
            student.makeupCompleted = "수업중";
          }
        } else if (norm === "결석") {
          student.attendanceStatus = "결석";
          
          // Two-way sync: If marked as absent on today's daily log, ensure today's date is in absentDates on the students sheet
          const isMakeup = student.makeupDate && parseMultipleMakeups(student.makeupDate).some(parsed => 
            parsed.day === this.selectedDay && 
            (parsed.isWeekly || parsed.formattedSlash === dates.slashFormat || parsed.formattedDot === dates.dotFormat)
          );
          
          if (!isMakeup) {
            let datesList = student.absentDates ? student.absentDates.split(',').map(d => d.trim()).filter(Boolean) : [];
            const hasDate = datesList.some(d => {
              const pure = parseAbsentDatePure(d);
              return pure && (pure.slashFormat === dates.slashFormat || pure.dotFormat === dates.dotFormat);
            });
            if (!hasDate) {
              const shortDay = this.selectedDay.substring(0, 1);
              datesList.push(`${dates.slashFormat}(${shortDay})`);
              student.absentDates = datesList.join(', ');
              this.saveState();
              this.api.updateFieldInGoogleSheets(student.row, "absentDates", student.absentDates, "students");
            }
          }
        } else {
          student.attendanceStatus = "대기";
        }
      } else {
        student.attendanceStatus = "대기";
      }
    });
  }

  bindEvents() {
    // 1. Tab switches
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".view-content").forEach(v => v.classList.remove("active"));
        
        btn.classList.add("active");
        const targetView = btn.getAttribute("data-view");
        document.getElementById(targetView).classList.add("active");
        
        if (targetView === "view-sheet") {
          this.sheetSim.render();
        }
      };
    });

    // 2. Select filter elements
    const selectDay = document.getElementById("selectDay");
    const selectTime = document.getElementById("selectTime");

    selectDay.onchange = (e) => {
      this.selectedDay = e.target.value;
      this.autoTimeEnabled = false;
      document.getElementById("autoTimeSwitch").checked = false;
      this.saveState();
      this.dashboardManager.updateDashboard();
      this.dashboardManager.updateQuickSchedules();
    };

    selectTime.onchange = (e) => {
      this.selectedTime = e.target.value;
      this.autoTimeEnabled = false;
      document.getElementById("autoTimeSwitch").checked = false;
      this.saveState();
      this.dashboardManager.updateDashboard();
      this.dashboardManager.updateQuickSchedules();
    };

    // 3. Auto time selection toggle
    document.getElementById("autoTimeSwitch").onchange = (e) => {
      this.autoTimeEnabled = e.target.checked;
      this.saveState();
      if (this.autoTimeEnabled) {
        this.dashboardManager.setToCurrentTime();
      }
    };

    // 4. Save GAS Url
    document.getElementById("btnSaveGasUrl").onclick = () => {
      const url = document.getElementById("inputGasUrl").value.trim();
      this.gasWebhookUrl = url;
      this.saveState();
      this.updateGasUrlQrCode();
      alert("구글 Apps Script API Webhook 주소가 안전하게 저장되었습니다!");
      this.api.fetchFromGoogleSheets(true);
    };

    document.getElementById("btnResetGasUrl").onclick = () => {
      const defaultUrl = "https://script.google.com/macros/s/AKfycbwKwMUSSvGPoTxAUTj6mOAWczrvOVLHCKymSxtpNa1YU6avxwR7jJH__iuOJlJ9bagXZQ/exec";
      document.getElementById("inputGasUrl").value = defaultUrl;
      this.gasWebhookUrl = defaultUrl;
      localStorage.setItem("gas_webhook_url", defaultUrl);
      this.saveState();
      this.updateGasUrlQrCode();
      alert("연동 주소가 기본 정규 주소로 초기화되었습니다!");
      this.api.fetchFromGoogleSheets(true);
    };

    // Textarea Zoom Modal Events
    const modalZoom = document.getElementById("modalTextareaZoom");
    const zoomField = document.getElementById("textareaZoomField");
    let activeZoomTarget = null;

    const closeZoomModal = () => {
      if (modalZoom) modalZoom.classList.remove("active");
      activeZoomTarget = null;
    };

    const elCloseZoom = document.getElementById("btnCloseTextareaZoomModal");
    if (elCloseZoom) elCloseZoom.onclick = closeZoomModal;
    const elCancelZoom = document.getElementById("btnCancelTextareaZoomModal");
    if (elCancelZoom) elCancelZoom.onclick = closeZoomModal;

    const elSaveZoom = document.getElementById("btnSaveTextareaZoomModal");
    if (elSaveZoom) {
      elSaveZoom.onclick = () => {
        if (activeZoomTarget) {
          activeZoomTarget.value = zoomField.value;
          // Trigger change event to notify sheet-sim of the change!
          const event = new Event('change', { bubbles: true });
          activeZoomTarget.dispatchEvent(event);
        }
        closeZoomModal();
      };
    }

    // Event delegation on document for zoom buttons click!
    document.addEventListener("click", (e) => {
      const zoomBtn = e.target.closest(".btn-zoom-textarea");
      if (zoomBtn) {
        e.stopPropagation();
        e.preventDefault();
        // Find sibling textarea or input in the same cell
        const container = zoomBtn.parentElement;
        if (container) {
          const targetInput = container.querySelector("textarea, input");
          if (targetInput) {
            activeZoomTarget = targetInput;
            zoomField.value = targetInput.value || "";
            if (modalZoom) modalZoom.classList.add("active");
            // Auto focus
            setTimeout(() => zoomField.focus(), 100);
          }
        }
      }
    });

    // 5. Load manually
    const loadBtn = document.getElementById("btnSyncGoogleSheets");
    if (loadBtn) {
      loadBtn.onclick = () => {
        this.api.fetchFromGoogleSheets(true);
      };
    }

    // 6. Modal Add Student triggers
    document.getElementById("btnAddStudent").onclick = () => {
      const dayEl = document.getElementById("selectDay");
      const timeEl = document.getElementById("selectTime");
      
      document.getElementById("formAddStudent").reset();
      document.getElementById("modalAddStudent").classList.add("active");
    };

    document.getElementById("btnCloseModal").onclick = () => document.getElementById("modalAddStudent").classList.remove("active");
    document.getElementById("btnCancelModal").onclick = () => document.getElementById("modalAddStudent").classList.remove("active");

    // Modal Add Student Submit
    document.getElementById("formAddStudent").onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById("inputName").value.trim();
      const grade = document.getElementById("inputGrade").value;
      const classes = document.getElementById("inputClasses").value.trim();
      const day = document.getElementById("inputDay").value;
      const time = document.getElementById("inputTime").value;

      if (!name) {
        alert("이름을 입력해 주세요.");
        return;
      }

      const nextRow = this.state.students.length > 0 ? Math.max(...this.state.students.map(s => s.row)) + 1 : 2;
      const newStudent = {
        id: 'row_' + nextRow,
        row: nextRow,
        name: name,
        grade: grade,
        classes: classes || "60분/주1회",
        times: { '월요일': '', '화요일': '', '수요일': '', '목요일': '', '금요일': '', '토요일': '', '일요일': '' },
        notes: '',
        absentDates: '',
        makeupDate: '',
        makeupCompleted: ''
      };
      newStudent.times[day] = time;

      this.state.students.push(newStudent);
      this.saveState();
      this.sheetSim.setData(this.state);
      this.dashboardManager.updateDashboard();
      this.dashboardManager.updateQuickSchedules();

      // Send to Sheets API
      this.api.addStudentToGoogleSheets(newStudent);

      document.getElementById("modalAddStudent").classList.remove("active");
      document.getElementById("formAddStudent").reset();
      alert(`${name} 학생이 성공적으로 등록되어 구글 시트로 전송되었습니다!`);
    };

    // CRM Textbook Edit Modal Event Bindings
    const closeEditBookBtn = document.getElementById("btnCloseEditCrmTextbookModal");
    const cancelEditBookBtn = document.getElementById("btnCancelEditCrmTextbookModal");
    if (closeEditBookBtn) closeEditBookBtn.onclick = () => document.getElementById("modalEditCrmTextbook").classList.remove("active");
    if (cancelEditBookBtn) cancelEditBookBtn.onclick = () => document.getElementById("modalEditCrmTextbook").classList.remove("active");

    const formEditBook = document.getElementById("formEditCrmTextbook");
    if (formEditBook) {
      formEditBook.onsubmit = (e) => {
        e.preventDefault();
        const rowNum = parseInt(document.getElementById("editCrmTextbookRow").value, 10);
        const key = document.getElementById("editCrmTextbookKey").value;
        const title = document.getElementById("editCrmTextbookTitle").value.trim();
        const startDate = document.getElementById("editCrmTextbookStartDate").value;
        const endDate = document.getElementById("editCrmTextbookEndDate").value;
        const accuracy = document.getElementById("editCrmTextbookAccuracy").value.trim();

        const studentRow = this.state.textbooks.find(b => b.row === rowNum);
        if (studentRow) {
          const titleField = `${key}Title`;
          const startField = `${key}Start`;
          const endField = `${key}End`;
          const accuracyField = `${key}Accuracy`;

          const oldEnd = studentRow[endField] || "";
          const oldEndTrim = oldEnd.trim();
          const newEndTrim = endDate.trim();

          studentRow[titleField] = title;
          studentRow[startField] = startDate;
          studentRow[endField] = newEndTrim;
          studentRow[accuracyField] = accuracy;

          this.saveState();
          this.sheetSim.setData(this.state);
          this.crmManager.loadCrmStudent(this.crmManager.currentCrmStudentName);

          this.api.updateBatchInGoogleSheets([
            { tab: "textbooks", row: rowNum, field: titleField, value: studentRow[titleField] },
            { tab: "textbooks", row: rowNum, field: startField, value: studentRow[startField] },
            { tab: "textbooks", row: rowNum, field: endField, value: studentRow[endField] },
            { tab: "textbooks", row: rowNum, field: accuracyField, value: studentRow[accuracyField] }
          ]);

          document.getElementById("modalEditCrmTextbook").classList.remove("active");

          if (oldEndTrim === "" && newEndTrim !== "") {
            const nextBook = this.smsManager.getNextTextbook(studentRow[titleField]);
            this.smsManager.showSmsPreviewModal(this.crmManager.currentCrmStudentName, studentRow[titleField], nextBook);
          }
        }
      };
    }

    // Close Modals when pressing Esc or clicking Overlay
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
      }
    });

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("active");
      });
    });

    // Close Large view modal
    const closeLarge = document.getElementById("btnCloseLargeViewModal");
    const confirmLarge = document.getElementById("btnConfirmLargeViewModal");
    if (closeLarge) closeLarge.onclick = () => document.getElementById("modalLargeView").classList.remove("active");
    if (confirmLarge) confirmLarge.onclick = () => document.getElementById("modalLargeView").classList.remove("active");

    // Smart Hybrid Sync trigger on window focus and tab visibility change
    window.addEventListener("focus", () => {
      console.log("Window focused. Triggering smart hybrid sync...");
      this.api.fetchFromGoogleSheets(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("Tab visibility changed to visible. Triggering smart hybrid sync...");
        this.api.fetchFromGoogleSheets(false);
      }
    });

    // 7. Copy Code button event listener
    document.querySelectorAll(".btn-copy").forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.getAttribute("data-target");
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const text = targetEl.innerText;
          
          const handleSuccess = () => {
            this.showToast("코드가 클립보드에 복사되었습니다!");
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" stroke="var(--color-regular)" />
              </svg>
              복사 완료!
            `;
            setTimeout(() => {
              btn.innerHTML = originalHtml;
            }, 2000);
          };

          const handleFallback = () => {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand("copy");
              handleSuccess();
            } catch (copyErr) {
              alert("복사에 실패했습니다. 수동으로 복사해 주세요.");
            }
            document.body.removeChild(textarea);
          };

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
              .then(handleSuccess)
              .catch(err => {
                console.error("Clipboard copy failed:", err);
                handleFallback();
              });
          } else {
            handleFallback();
          }
        }
      };
    });
  }

  // Request 1 - Bidirectional data binding for cell updates
  updateValue(tab, row, field, value) {
    // Explicitly handle parent contact (Col P, index 15) and other indices for memberAnalysis
    if (tab === "memberAnalysis") {
      const memberAnalysisFields = [
        "num", "name", "grade", "regDate", "consultation", "notes",
        "progress", "levelUp", "levelChange", "grammarDone",
        "readingTest", "bookPlan", "analysisSent", "readMethod", "studentId", "phone"
      ];
      if (typeof field === "number" || /^\d+$/.test(field)) {
        const idx = parseInt(field, 10);
        if (idx >= 0 && idx < memberAnalysisFields.length) {
          field = memberAnalysisFields[idx];
        }
      } else if (field === "P") {
        field = "phone";
      }
    }

    const dataset = this.state[tab];
    if (dataset) {
      const rowObj = dataset.find(r => r.row === parseInt(row));
      if (rowObj) {
        rowObj[field] = value;
        this.saveState();
        this.sheetSim.setData(this.state);
        
        // Propagate change to Google Sheets
        this.api.updateFieldInGoogleSheets(row, field, value, tab);
        
        // If this was a memberAnalysis update and the current CRM student matches, reload CRM
        if (tab === "memberAnalysis" && this.crmManager.currentCrmStudentName === rowObj.name) {
          this.crmManager.loadCrmStudent(rowObj.name);
        }
      }
    }
  }

  // --- Forwarding Methods (for backward compatibility and SheetSimulator calls) ---
  get currentCrmStudentName() {
    return this.crmManager ? this.crmManager.currentCrmStudentName : "";
  }

  set currentCrmStudentName(val) {
    if (this.crmManager) {
      this.crmManager.currentCrmStudentName = val;
    }
  }

  updateFieldInGoogleSheets(row, field, value, datasetKey = "students") {
    this.api.updateFieldInGoogleSheets(row, field, value, datasetKey);
  }

  updateBatchInGoogleSheets(updates) {
    this.api.updateBatchInGoogleSheets(updates);
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

// Accordion Toggle helper function referenced in index.html onclick attribute
window.toggleCrmSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  const arrow = document.getElementById(`arrow-${sectionId}`);
  if (section) {
    const isVisible = section.style.display !== "none";
    if (isVisible) {
      section.style.display = "none";
      if (arrow) arrow.innerText = "▶";
    } else {
      section.style.display = "flex";
      if (arrow) arrow.innerText = "▼";
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  window.app = new AttendanceApp();
});
