function ensureColumns(sheet, requiredCols) {
  if (!sheet) return;
  var maxCols = sheet.getMaxColumns();
  if (maxCols < requiredCols) {
    sheet.insertColumnsAfter(maxCols, requiredCols - maxCols);
  }
}

var DAILY_SHEET_CANDIDATES = ["오늘 출석부", "출결보강관리", "오늘출석부"];
var GROUP_CLASS_KEYWORDS = ["국어", "세계사", "한국사", "독서", "문해력", "내신", "초등", "중등", "특강"];
var AE_AP_HEADERS = [
  "보강일시", "보강완료", "결석 누적(분)", "보강 완료(분)", "보강 잔여(분)", "오늘 연장(분)",
  "리드인 마라톤 URL", "리드인 독서활동 URL", "리드인 독후활동 URL", "리드인 독서속도", "리드인 이해도", "리드인 수집일"
];
var SHEET_ALTS = {
  "교재단계관리": "문해력교재관리",
  "학부모상담/채널발송": "상담내용/리포트발송/채널발송",
  "월별상담내역": "회원 분석/레벨변동/전화상담",
  "출결보강관리": "오늘 출석부",
  "오늘 출석부": "출결보강관리",
  "전체시간표": "전체 시간표",
  "학생수업관리": "누적일일수업관리"
};

function normName_(s) {
  return String(s || "").trim().replace(/\s+/g, "");
}

function isGroupClassName_(name) {
  var s = String(name || "").trim();
  if (!s || s.length > 8) return true;
  var lower = s.toLowerCase();
  for (var k = 0; k < GROUP_CLASS_KEYWORDS.length; k++) {
    if (lower.indexOf(GROUP_CLASS_KEYWORDS[k]) !== -1) return true;
  }
  return false;
}

function getDailySheet_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < DAILY_SHEET_CANDIDATES.length; i++) {
    var cand = ss.getSheetByName(DAILY_SHEET_CANDIDATES[i]);
    if (cand && cand.getLastRow() > 2) return cand;
  }
  for (var j = 0; j < DAILY_SHEET_CANDIDATES.length; j++) {
    var cand2 = ss.getSheetByName(DAILY_SHEET_CANDIDATES[j]);
    if (cand2) return cand2;
  }
  return null;
}

function getStudentsSheet_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("전체시간표") || ss.getSheetByName("전체 시간표");
}

function getAccumulatedSheet_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("학생수업관리") || ss.getSheetByName("누적일일수업관리") || ss.getSheetByName("출석부 누적 관리") || ss.getSheetByName("출석부누적관리");
}

function getTextbookSheet_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("교재단계관리") || ss.getSheetByName("문해력교재관리");
}

function getConsultSheet_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("학부모상담/채널발송") || ss.getSheetByName("상담내용/리포트발송/채널발송");
}

function getRecordSheetReadOnly_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = [RECORD_SHEET, "[" + RECORD_SHEET + "]", "학습기록", "[학습기록]"];
  for (var i = 0; i < names.length; i++) {
    var cand = ss.getSheetByName(names[i]);
    if (cand) return cand;
  }
  return null;
}

function getOrCreateFolder_(folderName) {
  var it = DriveApp.getFoldersByName(folderName);
  return it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
}

function getStudentBaseDuration_(classesStr, gradeStr) {
  var cStr = String(classesStr || "");
  var gStr = String(gradeStr || "");
  var m = cStr.match(/(\d+)\s*분/);
  if (m) return parseInt(m[1], 10);
  if (gStr.indexOf("중") !== -1 || gStr.indexOf("고") !== -1 || gStr.indexOf("예비중") !== -1) {
    return 90;
  }
  return 60;
}

// 보강 은행 차감 공통 연산 함수 (processMakeupBankOnSheetEdit & runMakeupBankRecovery 단일 SSOT)
function applyMakeupDeductionToStudentRow_(sRow, reasonVal) {
  var rVal = String(reasonVal || "").trim();
  if (!rVal || rVal.indexOf("[차감완료]") !== -1) return null;
  var isMakeup = (rVal === "보강 수업");
  var isExtension = (rVal.indexOf("연장 (") === 0);
  if (!isMakeup && !isExtension) return null;

  var baseDuration = getStudentBaseDuration_(sRow[3], sRow[1]);
  var curDone = parseInt(sRow[33], 10) || 0;
  var curAbsentAcc = parseInt(sRow[32], 10) || 0;
  var todayExt = parseInt(sRow[35], 10) || 0;
  var extMatch = rVal.match(/\d+/);
  var addedMins = isMakeup ? (baseDuration + todayExt) : (extMatch ? parseInt(extMatch[0], 10) : 0);
  if (addedMins <= 0) return null;

  var newDone = curDone + addedMins;
  var absStr = String(sRow[11] || "");
  var dList = absStr ? absStr.split(",").map(function(d) { return d.trim(); }).filter(Boolean) : [];
  var targetStrikes = Math.floor(newDone / baseDuration);
  var updatedDates = [];
  var striked = 0;
  for (var k = 0; k < dList.length; k++) {
    var itm = dList[k];
    var isSt = (itm.indexOf("~~") === 0 && itm.slice(-2) === "~~");
    var cleanD = isSt ? itm.slice(2, -2) : itm;
    if (striked < targetStrikes) {
      updatedDates.push("~~" + cleanD + "~~");
      striked++;
    } else {
      updatedDates.push(cleanD);
    }
  }
  sRow[11] = updatedDates.join(", ");
  sRow[33] = newDone;
  sRow[34] = Math.max(0, curAbsentAcc - newDone);
  if (isMakeup) sRow[31] = "보강완료";
  if (isExtension || todayExt > 0) sRow[35] = 0;

  return {
    newDone: newDone,
    newRemaining: sRow[34],
    newAbsentDatesVal: sRow[11],
    isMakeup: isMakeup,
    resetTodayExt: (isExtension || todayExt > 0),
    newReasonVal: rVal + " [차감완료]"
  };
}

// 현재 시각(한국 표준시 기준)에 따른 목표 출석부 날짜 산출 (21:30 이후 또는 저녁 수동 실행 시 내일/월요일 출석부 생성)
function getExpectedAttendanceTargetDate_(optNow, forceEveningNextDay) {
  var now = optNow || new Date();
  var krHour = parseInt(Utilities.formatDate(now, "Asia/Seoul", "H"), 10);
  var krMin = parseInt(Utilities.formatDate(now, "Asia/Seoul", "m"), 10);
  var isAfter2130 = (krHour > 21) || (krHour === 21 && krMin >= 30);
  var isDaytimeWindow = (krHour >= 6 && !isAfter2130);
  var target = new Date(now.getTime());
  if (isAfter2130 || (forceEveningNextDay && krHour >= 18)) {
    target = new Date(target.getTime() + 86400000);
  }
  var dayNameEn = Utilities.formatDate(target, "Asia/Seoul", "EEEE");
  if (dayNameEn.indexOf("Sunday") !== -1 || dayNameEn.indexOf("일") !== -1) {
    target = new Date(target.getTime() + 86400000);
    dayNameEn = Utilities.formatDate(target, "Asia/Seoul", "EEEE");
  }
  var dayShort = "월";
  var dayLookup = [["Monday", "월"], ["Tuesday", "화"], ["Wednesday", "수"], ["Thursday", "목"], ["Friday", "금"], ["Saturday", "토"], ["Sunday", "일"]];
  for (var di = 0; di < dayLookup.length; di++) {
    if (dayNameEn.indexOf(dayLookup[di][0]) !== -1 || dayNameEn.indexOf(dayLookup[di][1]) !== -1) {
      dayShort = dayLookup[di][1];
      break;
    }
  }
  var m = parseInt(Utilities.formatDate(target, "Asia/Seoul", "M"), 10);
  var d = parseInt(Utilities.formatDate(target, "Asia/Seoul", "d"), 10);
  return {
    targetDate: target, m: m, d: d, todayDayName: dayShort + "요일", dayShort: dayShort,
    dateStr: m + "/" + d + dayShort, dateDot: m + "." + d, dateSlash: m + "/" + d,
    shouldAutoRollover: (isAfter2130 || isDaytimeWindow)
  };
}

function doGet(e) {
  // [어휘] 요청(?action=getVocab / getVocabIndex)이면 바로 응답, 아니면 기존 동작 그대로
  var vocabResp = handleVocabGet(e);
  if (vocabResp) return vocabResp;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 전체시간표 (students) - 매 요청마다 헤더 12회 getValue() 호출 제거 (setupSheetsAndHeaders에서 1회 일괄 처리)
  var sheetStudents = getStudentsSheet_(ss);
  var studentsData = [];
  if (sheetStudents) {
    var lastRow = sheetStudents.getLastRow();
    if (lastRow > 1) {
      ensureColumns(sheetStudents, 42);
      var range = sheetStudents.getRange(2, 1, lastRow - 1, 42);
      var data = range.getDisplayValues();
      
      for (var i = 0; i < data.length; i++) {
        var rowNum = 2 + i;
        var name = String(data[i][2] || "").trim();
        if (!name || isGroupClassName_(name)) continue;
        
        var grade = String(data[i][1] || "").trim();
        var classes = String(data[i][3] || "").trim();
        var notes = String(data[i][10] || "").trim(); // Col K (index 10) 특이사항
        var absentDates = String(data[i][11] || "").trim(); // Col L (index 11)
        var makeupDate = String(data[i][30] || "").trim(); // Col AE (index 30)
        var makeupCompleted = String(data[i][31] || "").trim(); // Col AF (index 31)
        var absentMinsAcc = parseInt(data[i][32] || "0", 10) || 0; // Col AG (index 32)
        var makeupMinsDone = parseInt(data[i][33] || "0", 10) || 0; // Col AH (index 33)
        var makeupMinsRemaining = parseInt(data[i][34] || "0", 10) || 0; // Col AI (index 34)
        var todayExtensionMins = parseInt(data[i][35] || "0", 10) || 0; // Col AJ (index 35)
        var lidinMarathonUrl = String(data[i][36] || "").trim(); // Col AK (index 36)
        var lidinActivityUrl = String(data[i][37] || "").trim(); // Col AL (index 37)
        var lidinPostReadingUrl = String(data[i][38] || "").trim(); // Col AM (index 38)
        var lidinReadingSpeed = String(data[i][39] || "").trim(); // Col AN (index 39)
        var lidinComprehension = String(data[i][40] || "").trim(); // Col AO (index 40)
        var lidinScrapedDate = String(data[i][41] || "").trim(); // Col AP (index 41)
        
        var times = {
          "월요일": String(data[i][4] || "").trim(),
          "화요일": String(data[i][5] || "").trim(),
          "수요일": String(data[i][6] || "").trim(),
          "목요일": String(data[i][7] || "").trim(),
          "금요일": String(data[i][8] || "").trim(),
          "토요일": String(data[i][9] || "").trim(),
          "일요일": ""
        };
        
        studentsData.push({
          id: "row_" + rowNum,
          row: rowNum,
          grade: grade,
          name: name,
          classes: classes,
          times: times,
          notes: notes,
          absentDates: absentDates,
          makeupDate: makeupDate,
          makeupCompleted: makeupCompleted,
          absentMinsAcc: absentMinsAcc,
          makeupMinsDone: makeupMinsDone,
          makeupMinsRemaining: makeupMinsRemaining,
          todayExtensionMins: todayExtensionMins,
          lidinMarathonUrl: lidinMarathonUrl,
          lidinActivityUrl: lidinActivityUrl,
          lidinPostReadingUrl: lidinPostReadingUrl,
          lidinReadingSpeed: lidinReadingSpeed,
          lidinComprehension: lidinComprehension,
          lidinScrapedDate: lidinScrapedDate
        });
      }
    }
  }

  // 2. 출결보강관리 / 오늘 출석부 (dailyLogs) + [자가복구] 밤 9시 30분(21:30) 이후 내일자 및 오전 6시 이후 오늘자 미생성 시 자동 백업·생성
  var sheetDaily = getDailySheet_(ss);
  if (sheetDaily) {
    try {
      var expected = getExpectedAttendanceTargetDate_(new Date(), false);
      if (expected.shouldAutoRollover) {
        var lrCheck = sheetDaily.getLastRow();
        var needsAutoRollover = false;
        if (lrCheck < 3) {
          needsAutoRollover = true;
        } else {
          var r3DateVal = String(sheetDaily.getRange(3, 1).getDisplayValue() || "").trim();
          var r3Match = r3DateVal.match(/(\d+)[\/\.](\d+)/);
          if (r3Match) {
            var r3M = parseInt(r3Match[1], 10);
            var r3D = parseInt(r3Match[2], 10);
            if (r3M !== expected.m || r3D !== expected.d) {
              needsAutoRollover = true;
            }
          }
        }
        if (needsAutoRollover) {
          generateDailyAttendance();
        }
      }
    } catch (autoRollErr) {
      console.error("[doGet] Auto rollover check failed:", autoRollErr);
    }
  }
  var dailyLogsData = [];
  if (sheetDaily) {
    var lastRow = sheetDaily.getLastRow();
    if (lastRow > 2) {
      ensureColumns(sheetDaily, 11);
      var range = sheetDaily.getRange(3, 1, lastRow - 2, 11); // 3행부터 읽기 (2행 템플릿 건너뜀)
      var data = range.getDisplayValues();
      for (var i = 0; i < data.length; i++) {
        var name = String(data[i][2] || "").trim();
        if (!name) continue;
        dailyLogsData.push({
          id: "daily_" + (3 + i),
          row: 3 + i,
          date: String(data[i][0] || "").replace(/\(([월화수목금토일])\)/g, "$1"),
          time: String(data[i][1] || ""),
          name: name,
          notes: String(data[i][3] || ""),
          status: String(data[i][4] || "대기").trim(),
          inTime: String(data[i][5] || ""),
          reason: String(data[i][6] || ""),
          number: String(data[i][7] || ""),
          event: String(data[i][8] || ""),
          grammarDone: String(data[i][9] || ""),
          contents: String(data[i][10] || "")
        });
      }
    }
  }

  // 3. 교재단계관리 (textbooks) - 2행부터 데이터 통일
  var sheetTextbooks = getTextbookSheet_(ss);
  var textbooksData = [];
  if (sheetTextbooks) {
    var lastRow = sheetTextbooks.getLastRow();
    if (lastRow > 1) {
      ensureColumns(sheetTextbooks, 22);
      var range = sheetTextbooks.getRange(2, 1, lastRow - 1, 22);
      var data = range.getDisplayValues();
      for (var i = 0; i < data.length; i++) {
        var name = String(data[i][1] || "").trim();
        if (!name) continue;
        textbooksData.push({
          id: "textbook_" + (2 + i),
          row: 2 + i,
          grade: String(data[i][0] || ""),
          name: name,
          nonfictionTitle: String(data[i][2] || ""),
          nonfictionStart: String(data[i][3] || ""),
          nonfictionEnd: String(data[i][4] || ""),
          nonfictionAccuracy: String(data[i][5] || ""),
          literatureTitle: String(data[i][6] || ""),
          literatureStart: String(data[i][7] || ""),
          literatureEnd: String(data[i][8] || ""),
          literatureAccuracy: String(data[i][9] || ""),
          vocabTitle: String(data[i][10] || ""),
          vocabStart: String(data[i][11] || ""),
          vocabEnd: String(data[i][12] || ""),
          vocabAccuracy: String(data[i][13] || ""),
          complexTitle: String(data[i][14] || ""),
          complexStart: String(data[i][15] || ""),
          complexEnd: String(data[i][16] || ""),
          complexAccuracy: String(data[i][17] || ""),
          readaloudTitle: String(data[i][18] || ""),
          readaloudStart: String(data[i][19] || ""),
          readaloudEnd: String(data[i][20] || ""),
          readaloudAccuracy: String(data[i][21] || "")
        });
      }
    }
  }

  // 4. 학부모상담/채널발송 (consultations)
  var sheetConsult = getConsultSheet_(ss);
  var consultationsData = [];
  if (sheetConsult) {
    var lastRow = sheetConsult.getLastRow();
    if (lastRow > 1) {
      ensureColumns(sheetConsult, 6);
      var range = sheetConsult.getRange(2, 1, lastRow - 1, 6);
      var data = range.getDisplayValues();
      for (var i = 0; i < data.length; i++) {
        var name = String(data[i][1] || "").trim();
        if (!name) continue;
        consultationsData.push({
          id: "consultation_" + (2 + i),
          row: 2 + i,
          grade: String(data[i][0] || ""),
          name: name,
          period: String(data[i][2] || ""),
          author: String(data[i][3] || ""),
          content: String(data[i][4] || ""),
          needs: String(data[i][5] || "")
        });
      }
    }
  }

  // 5. 월별상담내역 / 회원 분석 (memberAnalysis)
  var sheetMember = getMemberAnalysisSheet(ss);
  var memberAnalysisData = [];
  if (sheetMember) {
    var lastRow = sheetMember.getLastRow();
    if (lastRow > 1) {
      ensureColumns(sheetMember, 16);
      var range = sheetMember.getRange(2, 1, lastRow - 1, 16);
      var data = range.getDisplayValues();
      for (var i = 0; i < data.length; i++) {
        var name = String(data[i][1] || "").trim();
        if (!name) continue;
        memberAnalysisData.push({
          id: "member_" + (2 + i),
          row: 2 + i,
          num: String(data[i][0] || ""),
          name: name,
          grade: String(data[i][2] || ""),
          regDate: String(data[i][3] || ""),
          consultation: String(data[i][4] || ""),
          notes: String(data[i][5] || ""),
          progress: String(data[i][6] || ""),
          levelUp: String(data[i][7] || ""),
          levelChange: String(data[i][8] || ""),
          grammarDone: String(data[i][9] || ""),
          readingTest: String(data[i][10] || ""),
          bookPlan: String(data[i][11] || ""),
          analysisSent: String(data[i][12] || ""),
          readMethod: String(data[i][13] || ""),
          studentId: String(data[i][14] || ""),
          phone: String(data[i][15] || "")
        });
      }
    }
  }

  // 6. 누적출결데이터 (attendanceLogs)
  var attendanceLogsData = [];

  // 7. 학생수업관리 (accumulatedLogs) - 원장앱 경량화를 위해 앱 조회 데이터 제외
  var accumulatedLogsData = [];

  // 8. 신규브리핑관리 (briefings)
  var sheetBriefing = ss.getSheetByName("신규브리핑관리") || ss.getSheetByName("신규 브리핑 관리");
  var briefingsData = [];
  if (sheetBriefing) {
    var lastRow = sheetBriefing.getLastRow();
    if (lastRow > 1) {
      var lastCol = sheetBriefing.getLastColumn();
      var range = sheetBriefing.getRange(2, 1, lastRow - 1, lastCol);
      var data = range.getDisplayValues();
      
      for (var i = 0; i < data.length; i++) {
        var rowValues = [];
        for (var j = 0; j < lastCol; j++) {
          rowValues.push(String(data[i][j] || "").trim());
        }
        briefingsData.push({
          row: 2 + i,
          values: rowValues
        });
      }
    }
  }

  // 9. 학습기록 23열 (doGet에서는 시트 쓰기/정렬 없이 순수 Read-Only로만 고속 조회!)
  var sheetRec = getRecordSheetReadOnly_(ss);
  var learningRecordsData = [];
  if (sheetRec && sheetRec.getLastRow() >= 2) {
    var colCnt = Math.min(sheetRec.getMaxColumns(), 23);
    var h1Check = String(sheetRec.getRange(1, 1).getValue() || "").trim();
    if (h1Check === "날짜" && colCnt >= 18) {
      var lastRecRow = sheetRec.getLastRow();
      var numRecRows = Math.min(lastRecRow - 1, 1500);
      var recVals = sheetRec.getRange(2, 1, numRecRows, colCnt).getDisplayValues();
      for (var rIdx = 0; rIdx < recVals.length; rIdx++) {
        var rv = recVals[rIdx];
        var rName = String(rv[1] || "").trim();
        if (!rName) continue;
        var rawStep1 = String(rv[3] || "").trim();
        var rawBook = String(rv[5] || "").trim();
        var rawStep2 = String(rv[10] || "").trim();
        var rawDetail = String(rv[12] || "").trim();
        if (rawStep1 === "-") rawStep1 = "";
        if (rawStep2 === "-") rawStep2 = "";
        var sanGet = vocabSanitizeTrainingRecord_(rv[11], rawDetail, rv[13], rv[18], rv[19], rv[20], rv[21], rv[22]);
        learningRecordsData.push({
          row: 2 + rIdx,
          date: String(rv[0] || "").trim(),
          name: rName,
          hwStatus: vocabNormHwStatus_(rv[2]),
          step1Memo: (rawStep1 && rawStep1 === rawBook) ? "" : rawStep1,
          level: String(rv[4] || "").trim(),
          book: rawBook === "-" ? "" : rawBook,
          vocabTotal: String(rv[6] || "").trim() === "-" ? "" : String(rv[6] || "").trim(),
          vocabCorrect: String(rv[7] || "").trim() === "-" ? "" : String(rv[7] || "").trim(),
          vocabRate: String(rv[8] || "").trim() === "-" ? "" : String(rv[8] || "").trim(),
          diagScore: String(rv[9] || "").trim() === "-" ? "" : String(rv[9] || "").trim(),
          step2Memo: (rawStep2 && rawStep2 === sanGet.detail) ? "" : rawStep2,
          training: sanGet.training,
          detail: sanGet.detail,
          errors: sanGet.errors !== "" ? String(sanGet.errors) : "",
          understanding: vocabNormUnderstanding_(rv[14]),
          literacyMemo: String(rv[15] || "").trim() === "-" ? "" : String(rv[15] || "").trim(),
          reflection: String(rv[16] || "").trim() === "-" ? "" : String(rv[16] || "").trim(),
          wrongWords: String(rv[17] || "").trim() === "-" ? "" : String(rv[17] || "").trim(),
          readTotal: sanGet.readTotal !== "" ? String(sanGet.readTotal) : "",
          readWrong: sanGet.readWrong !== "" ? String(sanGet.readWrong) : "",
          litVocabTotal: sanGet.litVocabTotal !== "" ? String(sanGet.litVocabTotal) : "",
          litVocabWrong: sanGet.litVocabWrong !== "" ? String(sanGet.litVocabWrong) : "",
          litAccuracy: sanGet.litAccuracy !== "" ? String(sanGet.litAccuracy) : ""
        });
      }
    }
  }

  var syncWarningData = null;
  try {
    var rawSyncWarning = PropertiesService.getScriptProperties().getProperty("systemWarning");
    if (rawSyncWarning) syncWarningData = JSON.parse(rawSyncWarning);
  } catch (swErr) {
    syncWarningData = null;
  }

  var responseObj = {
    gasVersion: "2026.10.31-v1",
    syncWarning: syncWarningData,
    students: studentsData,
    dailyLogs: dailyLogsData,
    textbooks: textbooksData,
    consultations: consultationsData,
    memberAnalysis: memberAnalysisData,
    attendanceLogs: attendanceLogsData,
    accumulatedLogs: accumulatedLogsData,
    briefings: briefingsData,
    learningRecords: learningRecordsData
  };

  return ContentService.createTextOutput(JSON.stringify(responseObj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isSameStudentNameInGAS(name1, name2) {
  if (!name1 || !name2) return false;
  var c1 = normName_(name1).toLowerCase();
  var c2 = normName_(name2).toLowerCase();
  if (c1 === c2) return true;
  var pure1 = c1.replace(/^[\d\.\-\_]+/, "");
  var pure2 = c2.replace(/^[\d\.\-\_]+/, "");
  if (pure1 && pure2 && pure1 === pure2) return true;
  return false;
}

function processSingleUpdate(ss, tab, row, field, value, name, date, time, skipRealtimeSync) {
  if (tab === "dailyLogs" || tab === "출결보강관리" || tab === "오늘 출석부" || tab === "오늘출석부") {
    var sheet = getDailySheet_(ss);
    if (sheet) {
      ensureColumns(sheet, 11);
      
      var targetRow = row;

      // [핵심 매칭] 일일 출석부 시트에서 학생 이름으로 최우선 검색 (날짜/시간 서식 차이 및 행 추가/삭제와 무관하게 학생 행 100% 제자리 매칭!)
      if (sheet.getLastRow() > 2) {
        var lastRow = sheet.getLastRow();
        var data = sheet.getRange(3, 1, lastRow - 2, 3).getDisplayValues(); // Col A (date), Col B (time), Col C (name)
        var matchedRow = -1;
        
        if (name) {
          for (var i = 0; i < data.length; i++) {
            if (isSameStudentNameInGAS(data[i][2], name)) {
              matchedRow = 3 + i;
              break;
            }
          }
        }

        if (matchedRow !== -1) {
          targetRow = matchedRow;
        } else if (targetRow >= 3 && targetRow <= lastRow) {
          // 이름으로 매칭되지 않았더라도 클라이언트가 넘겨준 row가 유효하면 해당 행 사용
        } else {
          return -1;
        }
      }

      var cols = {
        date: 1, time: 2, name: 3, notes: 4, status: 5, inTime: 6, reason: 7,
        number: 8, event: 9, grammarDone: 10, contents: 11
      };
      var col = cols[field];
      if (col && targetRow > 2) {
        if (field === "date" && value) value = String(value).replace(/\(([월화수목금토일])\)/g, "$1");
        var cell = sheet.getRange(targetRow, col);
        try {
          cell.setValue(value);
        } catch (err) {
          if (field === "status") {
            cell.clearDataValidations();
            cell.setValue(value);
          } else {
            throw err;
          }
        }
        var needsSync = (field === "number" || field === "event" || field === "grammarDone" || field === "contents" || 
            (field === "status" && (value === "수업완료" || value === "보강완료" || value === "하원완료" || value === "하원" || value === "귀가")));
        if (needsSync && !skipRealtimeSync) {
          accumulateDailyEventToMemberAnalysis(sheet, targetRow);
        }
        return needsSync ? targetRow : -1;
      }
    }
    return -1;
  } else if (tab === "students" || tab === "전체시간표") {
    var sheet = getStudentsSheet_(ss);
    if (sheet) {
      ensureColumns(sheet, 42);
      if (field === "absentDates") {
        var cell = sheet.getRange(row, 12);
        cell.setValue(value);
        formatAbsentCell(cell, value);
      } else if (field === "makeupCompleted") {
        sheet.getRange(row, 32).setValue(value);
      } else if (field === "makeupDate") {
        sheet.getRange(row, 31).setValue(value);
      } else if (field === "absentMinsAcc") {
        sheet.getRange(row, 33).setValue(value);
      } else if (field === "makeupMinsDone") {
        sheet.getRange(row, 34).setValue(value);
      } else if (field === "makeupMinsRemaining") {
        sheet.getRange(row, 35).setValue(value);
      } else if (field === "todayExtensionMins") {
        sheet.getRange(row, 36).setValue(value);
      } else if (field === "lidinMarathonUrl") {
        sheet.getRange(row, 37).setValue(value);
      } else if (field === "lidinActivityUrl") {
        sheet.getRange(row, 38).setValue(value);
      } else if (field === "lidinPostReadingUrl") {
        sheet.getRange(row, 39).setValue(value);
      } else if (field === "lidinReadingSpeed") {
        sheet.getRange(row, 40).setValue(value);
      } else if (field === "lidinComprehension") {
        sheet.getRange(row, 41).setValue(value);
      } else if (field === "lidinScrapedDate") {
        sheet.getRange(row, 42).setValue(value);
      } else if (field === "grade") {
        sheet.getRange(row, 2).setValue(value);
      } else if (field === "name") {
        sheet.getRange(row, 3).setValue(value);
      } else if (field === "classes") {
        sheet.getRange(row, 4).setValue(value);
      } else if (field === "times") {
        var timesObj = JSON.parse(value);
        var dayCols = { "월요일": 5, "화요일": 6, "수요일": 7, "목요일": 8, "금요일": 9, "토요일": 10 };
        for (var dName in dayCols) {
          if (timesObj[dName] !== undefined) {
            sheet.getRange(row, dayCols[dName]).setValue(timesObj[dName]);
          }
        }
      }
    }
  } else if (tab === "textbooks" || tab === "교재단계관리") {
    var sheet = getTextbookSheet_(ss);
    if (sheet) {
      ensureColumns(sheet, 22);
      var cols = {
        grade: 1, name: 2,
        nonfictionTitle: 3, nonfictionStart: 4, nonfictionEnd: 5, nonfictionAccuracy: 6,
        literatureTitle: 7, literatureStart: 8, literatureEnd: 9, literatureAccuracy: 10,
        vocabTitle: 11, vocabStart: 12, vocabEnd: 13, vocabAccuracy: 14,
        complexTitle: 15, complexStart: 16, complexEnd: 17, complexAccuracy: 18,
        readaloudTitle: 19, readaloudStart: 20, readaloudEnd: 21, readaloudAccuracy: 22
      };
      var col = cols[field];
      if (col) {
        sheet.getRange(row, col).setValue(value);
      }
    }
  } else if (tab === "consultations" || tab === "학부모상담/채널발송") {
    var sheet = getConsultSheet_(ss);
    if (sheet) {
      ensureColumns(sheet, 6);
      var cols = {
        grade: 1, name: 2, period: 3, author: 4, content: 5, needs: 6
      };
      var col = cols[field];
      if (col) {
        sheet.getRange(row, col).setValue(value);
      }
    }
  } else if (tab === "memberAnalysis" || tab === "월별상담내역" || tab === "회원 분석/레벨변동/전화상담" || tab === "회원 분석") {
    var sheet = getMemberAnalysisSheet(ss);
    if (sheet) {
      ensureColumns(sheet, 16);
      if (field === "15" || field === 15 || field === "P") {
        field = "phone";
      }
      var cols = {
        num: 1, name: 2, grade: 3, regDate: 4, consultation: 5, notes: 6,
        progress: 7, levelUp: 8, levelChange: 9, grammarDone: 10,
        readingTest: 11, bookPlan: 12, analysisSent: 13, readMethod: 14, studentId: 15,
        phone: 16
      };
      var col = cols[field];
      if (col) {
        var cell = sheet.getRange(row, col);
        cell.setValue(value);
        if (col === 7 || col === 10) {
          applyRichTextStyling(cell, value);
        } else {
          var checkVal = String(value).trim();
          if (col === 8 && (checkVal.indexOf("코스업") !== -1 || checkVal.indexOf("레벨업") !== -1 || checkVal.indexOf("진로검사") !== -1)) {
            cell.setFontColor("#2563eb");
            cell.setFontWeight("bold");
          } else {
            cell.setFontColor(null);
            cell.setFontWeight(null);
          }
        }
      }
    }
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var postData = JSON.parse(e.postData.contents);
    
    if (postData.action === "fixAndAlignLearningRecords") {
      var sheetRec = vocabEnsureRecordSheet_(ss);
      var res = alignLearningRecordColumnsBulk_(sheetRec);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", result: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (postData.action === "generateDailyAttendance") {
      generateDailyAttendance();
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    else if (postData.action === "addLearningRecord") {
      return handleAddLearningRecord(postData);
    }
    else if (postData.action === "uploadLidinAnalysis") {
      var sheet = getStudentsSheet_(ss);
      if (sheet) {
        ensureColumns(sheet, 42);
        var row = parseInt(postData.row, 10);
        var name = postData.name;
        
        var folder = getOrCreateFolder_("리드인_분석표");
        var dateStr = new Date().toLocaleDateString("ko-KR").replace(/ /g, "").replace(/\./g, "-");
        var imgUrls = { marathon: "", activity: "", postReading: "" };
        var imgDefs = [["marathon", "마라톤.png"], ["activity", "독서활동.png"], ["postReading", "독후활동.png"]];
        for (var im = 0; im < imgDefs.length; im++) {
          var iKey = imgDefs[im][0];
          if (postData.images && postData.images[iKey]) {
            var b64 = postData.images[iKey].replace(/^data:image\/[a-z]+;base64,/, "");
            var f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), "image/png", name + "_" + dateStr + imgDefs[im][1]));
            f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            imgUrls[iKey] = f.getUrl();
          }
        }
        var marathonUrl = imgUrls.marathon, activityUrl = imgUrls.activity, postReadingUrl = imgUrls.postReading;
        
        var lidinCols = sheet.getRange(row, 37, 1, 6).getValues()[0];
        if (marathonUrl) lidinCols[0] = marathonUrl;
        if (activityUrl) lidinCols[1] = activityUrl;
        if (postReadingUrl) lidinCols[2] = postReadingUrl;
        if (postData.textData) {
          if (postData.textData.readingSpeed !== undefined) lidinCols[3] = postData.textData.readingSpeed;
          if (postData.textData.comprehensionScore !== undefined) lidinCols[4] = postData.textData.comprehensionScore;
        }
        lidinCols[5] = new Date().toLocaleDateString("ko-KR");
        sheet.getRange(row, 37, 1, 6).setValues([lidinCols]);
        
        var statusLabel = postData.status || "수집완료";
        var shortDate = (new Date().getMonth() + 1) + "/" + new Date().getDate();
        var speedVal = (postData.textData && postData.textData.readingSpeed) || "-";
        var compVal = (postData.textData && postData.textData.comprehensionScore) || "-";
        var summaryEntry = shortDate + " 분석표 " + statusLabel + " (이해도:" + compVal + "%, 속도:" + speedVal + "자)";

        // 1. 회원 분석/레벨변동/전화상담 시트 Column M (13) 기록 및 prepend
        var sheetMember = getMemberAnalysisSheet(ss);
        if (sheetMember) {
          var memberRowIdx = -1;
          var memberLastRow = sheetMember.getLastRow();
          if (memberLastRow > 1) {
            var memberNames = sheetMember.getRange(1, 2, memberLastRow, 1).getValues();
            var matchName = normName_(name).toLowerCase();
            for (var rIdx = 1; rIdx < memberNames.length; rIdx++) {
              if (normName_(memberNames[rIdx][0]).toLowerCase() === matchName) {
                memberRowIdx = rIdx + 1;
                break;
              }
            }
          }
          if (memberRowIdx !== -1) {
            var cellMember = sheetMember.getRange(memberRowIdx, 13);
            var oldValMember = String(cellMember.getValue() || "").trim();
            cellMember.setValue(oldValMember ? (summaryEntry + "\n" + oldValMember) : summaryEntry);
          }
        }

        // 2. 신규 브리핑 관리 시트 이번달 피드백 열 기록 및 prepend
        var sheetBriefing = ss.getSheetByName("신규브리핑관리") || ss.getSheetByName("신규 브리핑 관리");
        if (sheetBriefing) {
          var briefingLastCol = sheetBriefing.getLastColumn();
          if (briefingLastCol > 0) {
            var headers = sheetBriefing.getRange(1, 1, 1, briefingLastCol).getValues()[0];
            var currentMonth = (new Date().getMonth() + 1) + "월";
            var targetColIdx = -1;
            for (var colIdx = 0; colIdx < headers.length; colIdx++) {
              var headerVal = String(headers[colIdx]).trim();
              if (headerVal.indexOf(currentMonth) !== -1 || headerVal === String(new Date().getMonth() + 1)) {
                targetColIdx = colIdx + 1;
                break;
              }
            }
            if (targetColIdx !== -1 && sheetBriefing.getLastRow() > 1) {
              var briefingNames = sheetBriefing.getRange(1, 2, sheetBriefing.getLastRow(), 1).getValues();
              var matchNameB = normName_(name).toLowerCase();
              for (var bIdx = 1; bIdx < briefingNames.length; bIdx++) {
                if (normName_(briefingNames[bIdx][0]).toLowerCase() === matchNameB) {
                  var cellBriefing = sheetBriefing.getRange(bIdx + 1, targetColIdx);
                  var oldValBriefing = String(cellBriefing.getValue() || "").trim();
                  cellBriefing.setValue(oldValBriefing ? (summaryEntry + "\n" + oldValBriefing) : summaryEntry);
                  break;
                }
              }
            }
          }
        }
        
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success", 
          urls: { marathon: marathonUrl, activity: activityUrl, postReading: postReadingUrl } 
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Sheet not found" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    else if (postData.action === "update") {
      processSingleUpdate(ss, postData.tab || "students", parseInt(postData.row), postData.field, postData.value, postData.name, postData.date, postData.time, false);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    else if (postData.action === "batchUpdate") {
      var lockBatch = LockService.getScriptLock();
      var hasLockBatch = false;
      try {
        hasLockBatch = lockBatch.tryLock(20000);
        var updates = postData.updates || [];
        var dailySyncRowMap = {};
        for (var i = 0; i < updates.length; i++) {
          var u = updates[i];
          var syncedRow = processSingleUpdate(ss, u.tab || "students", parseInt(u.row), u.field, u.value, u.name, u.date, u.time, true);
          if (syncedRow && syncedRow > 2) {
            dailySyncRowMap[syncedRow] = true;
          }
        }
        // [원자적 단일 패킷 연동] 클라이언트가 learningRecords(구조화 레코드 배열)를 함께 보낸 경우 같은 Lock 안에서 먼저 [학습기록]에 직통 반영
        var structuredRecs = postData.learningRecords || [];
        var stNameForRec = normName_(postData.studentName || (updates[0] && updates[0].name) || "");
        if (stNameForRec && structuredRecs.length > 0) {
          var sRec = vocabEnsureRecordSheet_(ss);
          vocabUpsertStudentDayRecords_(sRec, stNameForRec, structuredRecs);
          syncLiteracyTextbookProgressBulk_(ss, stNameForRec, structuredRecs);
        }
        // [중복 실행 방지] batchUpdate 내 여러 필드가 수정되더라도 행당 단 1회만 [학습기록] 및 [회원분석] 동기화 실행
        var syncRowKeys = Object.keys(dailySyncRowMap);
        if (syncRowKeys.length > 0) {
          var dSheet = getDailySheet_(ss);
          if (dSheet) {
            for (var sr = 0; sr < syncRowKeys.length; sr++) {
              accumulateDailyEventToMemberAnalysis(dSheet, parseInt(syncRowKeys[sr], 10));
            }
          }
        } else if (stNameForRec && structuredRecs.length > 0) {
          refreshMemberAnalysisSummaryBoardForStudent_(ss, stNameForRec);
        }
      } finally {
        if (hasLockBatch) {
          try { lockBatch.releaseLock(); } catch (e) {}
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (postData.action === "add") {
      var sheet = getStudentsSheet_(ss);
      var lastRow = sheet.getLastRow();
      var nextRow = lastRow + 1;
      ensureColumns(sheet, 36);
      
      var newStRow = new Array(32);
      for (var c = 0; c < 32; c++) newStRow[c] = "";
      newStRow[0] = nextRow - 1;
      newStRow[1] = postData.grade || "";
      newStRow[2] = postData.name || "";
      newStRow[3] = postData.classes || "";
      var dayCols = { "월요일": 4, "화요일": 5, "수요일": 6, "목요일": 7, "금요일": 8, "토요일": 9 };
      if (dayCols[postData.day] !== undefined) {
        newStRow[dayCols[postData.day]] = postData.startTime || "";
      }
      if (postData.makeupDate) {
        newStRow[30] = postData.makeupDate;
        newStRow[31] = "대기";
      }
      sheet.getRange(nextRow, 1, 1, 32).setValues([newStRow]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", row: nextRow }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (postData.action === "addDailyLog") {
      var lockAdd = LockService.getScriptLock();
      var hasLockAdd = false;
      var targetRow = -1;
      var isExisting = false;
      try {
        hasLockAdd = lockAdd.tryLock(20000);
        var sheet = getDailySheet_(ss);
        if (!sheet) {
          sheet = ss.insertSheet("오늘 출석부");
          sheet.appendRow([
            "날짜요일", "시간", "이름", "특이사항", "등원여부", "등원시간", "보강결석사유",
            "숫자", "이벤트", "진단글쓰기/특별수업", "수업내용 및 특이사항"
          ]);
        }
        ensureColumns(sheet, 11);
        
        var lastRow = sheet.getLastRow();

        // 1. 이미 시트 위쪽 시간표에 동일한 학생이 배정/등록되어 있는지 검색! (중복 생성 절대 방어)
        if (postData.name && lastRow >= 3) {
          var existingNames = sheet.getRange(3, 3, lastRow - 2, 1).getDisplayValues();
          for (var nIdx = 0; nIdx < existingNames.length; nIdx++) {
            if (isSameStudentNameInGAS(existingNames[nIdx][0], postData.name)) {
              targetRow = 3 + nIdx;
              break;
            }
          }
        }

        // 2. 기존 시간표에 학생이 이미 있다면 무조건 해당 행을 업데이트, 없을 때만 맨 아래(lastRow + 1)에 단 1회 일괄(Bulk) 쓰기
        isExisting = (targetRow !== -1);
        var dRowVals;
        if (isExisting) {
          dRowVals = sheet.getRange(targetRow, 1, 1, 11).getValues()[0];
        } else {
          targetRow = Math.max(3, lastRow + 1);
          var nowD = new Date();
          var koDays = ["일", "월", "화", "수", "목", "금", "토"];
          var defaultDateNoParen = (nowD.getMonth() + 1) + "/" + nowD.getDate() + koDays[nowD.getDay()];
          var cleanDateStr = String(postData.date || defaultDateNoParen).replace(/\(([월화수목금토일])\)/g, "$1");
          dRowVals = [cleanDateStr, postData.time || "시간 외", postData.name || "", "", "", "", "", "", "", "", ""];
        }
        if (postData.notes) dRowVals[3] = postData.notes;
        dRowVals[4] = postData.status || "수업중";
        if (postData.inTime) dRowVals[5] = postData.inTime;
        if (postData.reason) dRowVals[6] = postData.reason;
        if (postData.number) dRowVals[7] = postData.number;
        if (postData.event) dRowVals[8] = postData.event;
        if (postData.grammarDone) dRowVals[9] = postData.grammarDone;
        if (postData.contents) dRowVals[10] = postData.contents;
        sheet.getRange(targetRow, 1, 1, 11).setValues([dRowVals]);

        var structuredAddRecs = postData.learningRecords || [];
        var stNameAdd = normName_(postData.studentName || postData.name || "");
        if (stNameAdd && structuredAddRecs.length > 0) {
          var sRecAdd = vocabEnsureRecordSheet_(ss);
          vocabUpsertStudentDayRecords_(sRecAdd, stNameAdd, structuredAddRecs);
          syncLiteracyTextbookProgressBulk_(ss, stNameAdd, structuredAddRecs);
        }
        try {
          accumulateDailyEventToMemberAnalysis(sheet, targetRow);
        } catch (syncErr) {
          console.error("[addDailyLog] realtime sync error:", syncErr);
        }
      } finally {
        if (hasLockAdd) {
          try { lockAdd.releaseLock(); } catch (e) {}
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", row: targetRow, updatedExisting: isExisting }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (postData.action === "addTextbook") {
      var sheet = getTextbookSheet_(ss);
      if (!sheet) {
        sheet = ss.insertSheet("교재단계관리");
        sheet.appendRow([
          "학년", "이름", 
          "비문학 교재명", "시작일", "마침일", "정답률", 
          "문학교재명", "시작일", "마침일", "정답률", 
          "어휘 교재명", "시작일", "마침일", "정답률", 
          "복합 교재명", "시작일", "마침일", "정답률",
          "음독 교재명", "시작일", "마침일", "정답률"
        ]);
      }
      
      var lastRow = sheet.getLastRow();
      var data = lastRow > 1 ? sheet.getRange(2, 2, lastRow - 1, 1).getValues() : [];
      var foundRow = -1;
      for (var i = 0; i < data.length; i++) {
        if (normName_(data[i][0]) === normName_(postData.name)) {
          foundRow = 2 + i;
          break;
        }
      }
      
      var targetRow = foundRow !== -1 ? foundRow : (lastRow + 1);
      ensureColumns(sheet, 22);
      
      if (foundRow === -1) {
        sheet.getRange(targetRow, 1, 1, 2).setValues([[postData.grade || "", postData.name || ""]]);
      }
      
      var categoryCols = { "비문학": 3, "문학": 7, "어휘": 11, "복합": 15, "음독": 19 };
      var startCol = categoryCols[postData.category];
      if (startCol) {
        sheet.getRange(targetRow, startCol, 1, 4).setValues([[
          postData.title || "",
          postData.startDate || "",
          postData.endDate || "",
          postData.accuracy || ""
        ]]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", row: targetRow }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (postData.action === "addConsultation") {
      var sheet = getConsultSheet_(ss);
      if (!sheet) {
        var sheets = ss.getSheets();
        for (var i = 0; i < sheets.length; i++) {
          var sName = sheets[i].getName();
          if (sName.indexOf("상담내용") !== -1 || sName.indexOf("리포트발송") !== -1 || sName.indexOf("학부모상담") !== -1) {
            sheet = sheets[i];
            break;
          }
        }
      }
      if (!sheet) {
        sheet = ss.insertSheet("상담내용/리포트발송/채널발송");
        sheet.appendRow(["학년", "이름", "작성일", "작성인 간단 내용", "상담내용/리포트발송/채널발송", "부모님의 need / 학생 특이사항", "연도", "월"]);
      }
      ensureColumns(sheet, 8);
      
      sheet.insertRowBefore(2);
      
      var now = new Date();
      var pad = function(n) { return (n < 10 ? "0" : "") + n; };
      var yyyy = String(now.getFullYear());
      var mm = String(now.getMonth() + 1);
      var dd = pad(now.getDate());
      var defaultDate = yyyy + "." + pad(mm) + "." + dd;

      sheet.getRange(2, 1, 1, 8).setValues([[
        postData.grade || "",
        postData.name || "",
        postData.date || postData.period || defaultDate,
        postData.author || "",
        postData.content || "",
        postData.needs || "",
        postData.year || yyyy,
        postData.month || mm
      ]]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", row: 2 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (postData.action === "addAttendanceLog") {
      var sheet = ss.getSheetByName("누적출결데이터");
      if (!sheet) {
        sheet = ss.insertSheet("누적출결데이터");
        sheet.appendRow(["타임스탬프", "이름", "날짜", "요일", "시간", "출결상태"]);
      }
      var nextRow = sheet.getLastRow() + 1;
      ensureColumns(sheet, 6);
      sheet.getRange(nextRow, 1, 1, 6).setValues([[
        postData.timestamp || "",
        postData.name || "",
        postData.date || "",
        postData.day || "",
        postData.time || "",
        postData.status || ""
      ]]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", row: nextRow }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (postData.action === "addMemberAnalysis") {
      var sheet = getMemberAnalysisSheet(ss);
      var lastRow = sheet.getLastRow();
      var nextRow = lastRow + 1;
      
      var rowValues = [
        postData.num || "",
        postData.name || "",
        postData.grade || "",
        postData.regDate || "",
        postData.consultation || "",
        postData.notes || "",
        postData.progress || "",
        postData.levelUp || "",
        postData.levelChange || "",
        postData.grammarDone || "",
        postData.readingTest || "",
        postData.bookPlan || "",
        postData.analysisSent || "",
        postData.readMethod || "",
        postData.studentId || "",
        postData.phone || ""
      ];
      
      sheet.getRange(nextRow, 1, 1, 16).setValues([rowValues]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", row: nextRow }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (postData.action === "deleteRow") {
      var tab = postData.tab;
      var row = parseInt(postData.row);
      var tabName = "";
      if (tab === "textbooks") tabName = "교재단계관리";
      else if (tab === "consultations") tabName = "학부모상담/채널발송";
      else if (tab === "memberAnalysis") tabName = "월별상담내역";
      else if (tab === "dailyLogs") tabName = "오늘 출석부";
      else if (tab === "students") tabName = "전체시간표";
      else if (tab === "accumulatedLogs") tabName = "학생수업관리";
      
      if (tabName) {
        var sheet = (tab === "dailyLogs") ? getDailySheet_(ss) : ss.getSheetByName(tabName);
        if (!sheet && SHEET_ALTS[tabName]) {
          sheet = ss.getSheetByName(SHEET_ALTS[tabName]);
        }
        if (sheet && row > 1 && row <= sheet.getLastRow()) {
          sheet.deleteRow(row);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    else if (postData.action === "syncReadTrackStudentsBulk") {
      var syncRes = handleSyncReadTrackStudentsBulk_(ss, postData.items || []);
      return ContentService.createTextOutput(JSON.stringify(syncRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    else if (postData.action === "buildLiteracyAnalysisSheet") {
      var litRepRes = vocabBuildLiteracyAnalysisSheet_(ss, postData.studentName || "");
      return ContentService.createTextOutput(JSON.stringify(litRepRes))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 학년 순위를 계산하는 헬퍼 함수 (초1~6 -> 중1~3 -> 고1~3 순서 정렬용)
function getGradeRank(gradeStr) {
  if (!gradeStr) return 99;
  var match = gradeStr.match(/(초|중|고|대|유)?\s*(\d+)/);
  var type = match ? match[1] : "";
  var num = match ? parseInt(match[2], 10) : 0;
  
  var typeScore = 0;
  if (type === "초") typeScore = 10;
  else if (type === "중") typeScore = 20;
  else if (type === "고") typeScore = 30;
  else typeScore = 40;
  
  return typeScore + num;
}

// 결석일자 셀에 리치 텍스트 취소선(줄 긋기) 서식을 부분 적용하는 헬퍼 함수
function formatAbsentCell(cell, value) {
  if (!value) return;
  var text = String(value);
  var richTextBuilder = SpreadsheetApp.newRichTextValue().setText(text);
  
  var strikethroughStyle = SpreadsheetApp.newTextStyle().setStrikethrough(true).build();
  
  var regex = /~~([^~]+)~~/g;
  var match;
  while ((match = regex.exec(text)) !== null) {
    richTextBuilder.setTextStyle(match.index, regex.lastIndex, strikethroughStyle);
  }
  
  try {
    cell.setRichTextValue(richTextBuilder.build());
  } catch(e) {
    // Fallback if rich text fails
    cell.setValue(value);
  }
}

// 매일 오전 6시 및 밤 9시 30분 자동 실행용 일일 출석부 자동 생성 함수 (기존 기록 백업 후 초기화)
function generateDailyAttendance(optForceEveningNextDay) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetStudents = getStudentsSheet_(ss);
  if (!sheetStudents) return;
  ensureColumns(sheetStudents, 36);
  
  var sheetDaily = getDailySheet_(ss);
  if (!sheetDaily) {
    sheetDaily = ss.insertSheet("오늘 출석부");
    sheetDaily.appendRow([
      "날짜요일", "시간", "이름", "특이사항", "등원여부", "등원시간", "보강결석사유",
      "숫자", "이벤트", "진단글쓰기/특별수업", "수업내용 및 특이사항"
    ]);
  }
  ensureColumns(sheetDaily, 11);
  
  // 밤 9시 30분(21:30) 이후 또는 트리거/수동 실행 시 저녁 시간대(18시 이후)에는 다음 수업일(내일, 일요일이면 월요일) 시간표 생성
  var targetInfo = getExpectedAttendanceTargetDate_(new Date(), optForceEveningNextDay !== false);
  var todayDayName = targetInfo.dayName;
  var dayShort = targetInfo.dayShort;
  var m = targetInfo.m;
  var d = targetInfo.d;
  var dateStr = targetInfo.dateStr;
  var dateDot = m + "." + d;
  var dateSlash = m + "/" + d;
  
  var lastRowDaily = sheetDaily.getLastRow();
  
  var validationE2 = lastRowDaily >= 2 ? sheetDaily.getRange("E2").getDataValidation() : null;
  var validationG2 = lastRowDaily >= 2 ? sheetDaily.getRange("G2").getDataValidation() : null;
  var validationH2 = lastRowDaily >= 2 ? sheetDaily.getRange("H2").getDataValidation() : null;
  var validationI2 = lastRowDaily >= 2 ? sheetDaily.getRange("I2").getDataValidation() : null;
  
  // [중복 백업 및 삭제 방지 안전장치]
  // 3행의 날짜 정보가 목표 날짜와 같다면, 이미 목표일자 시간표가 생성된 상태이므로 실행을 스킵합니다.
  if (lastRowDaily >= 3) {
    var checkDateVal = String(sheetDaily.getRange(3, 1).getDisplayValue() || "").trim();
    var checkDateMatch = checkDateVal.match(/(\d+)[\/\.](\d+)/);
    if (checkDateMatch) {
      var checkM = parseInt(checkDateMatch[1], 10);
      var checkD = parseInt(checkDateMatch[2], 10);
      if (checkM === m && checkD === d) {
        Logger.log("오늘 출석부가 이미 목표 날짜(" + dateStr + ")로 생성되어 작동 중입니다. 중복 백업 및 초기화를 건너뜁니다.");
        return;
      }
    }
  }
  
  // [버그 ④ 해결] 행 삭제 전에 기존 출석부 데이터(2행~lastRowDaily)를 미리 메모리에 캡처하여
  // 보강 완료 자가치유 블록에서 삭제된 시트를 다시 읽거나 lastRowDaily 변수를 덮어쓰지 않도록 보호
  var existingDailyRows = [];
  if (lastRowDaily >= 2) {
    existingDailyRows = sheetDaily.getRange(2, 1, lastRowDaily - 1, 6).getValues();
  }
  
  // 2행은 고정해 두고, 3행 이하 기존 데이터를 누적관리 시트('학생수업관리' / '출석부 누적 관리')로 백업 후 지움
  if (lastRowDaily >= 3) {
    // [날짜 전환 안전장치] 동기화 후 [학습기록]에 실제로 반영됐는지 확인하고, 실패하면 오늘 출석부를 지우지 않고 최대 3회까지 재시도
    var rolloverSyncOk = true;
    var rolloverSyncMsg = "";
    try {
      // [초고속 경량 동기화] 과거 300행 재스캔 없이 현재 오늘 출석부에 남아있는 어제자 행만 1회 일괄(Bulk) 반영
      syncTodayDailyEventsToMemberAnalysis(true);
      var unsyncedNames = vocabFindUnsyncedDailyRows_(ss, sheetDaily);
      if (unsyncedNames.length > 0) {
        rolloverSyncOk = false;
        rolloverSyncMsg = "학습기록에 반영되지 않은 학생 " + unsyncedNames.length + "명(" + unsyncedNames.slice(0, 5).join(", ") + ")";
      }
    } catch (autoSyncErr) {
      Logger.log("일일 출석부 백업 전 학습기록 자동 동기화 에러: " + autoSyncErr);
      rolloverSyncOk = false;
      rolloverSyncMsg = "동기화 오류: " + autoSyncErr;
    }
    var rolloverProps = PropertiesService.getScriptProperties();
    if (rolloverSyncOk) {
      rolloverProps.deleteProperty("rolloverSyncFails");
      rolloverProps.deleteProperty("rolloverSyncFailAt");
      vocabClearSystemAlert_("rolloverSync");
    } else {
      var rolloverFails = parseInt(rolloverProps.getProperty("rolloverSyncFails") || "0", 10) || 0;
      var rolloverFailAt = parseInt(rolloverProps.getProperty("rolloverSyncFailAt") || "0", 10) || 0;
      if (Date.now() - rolloverFailAt >= 45000) {
        rolloverFails++;
        rolloverProps.setProperty("rolloverSyncFails", String(rolloverFails));
        rolloverProps.setProperty("rolloverSyncFailAt", String(Date.now()));
      }
      if (rolloverFails < 3) {
        vocabLogSystemAlert_(ss, "경고", "날짜 전환 보류(" + rolloverFails + "/3): 학습기록 동기화 실패로 오늘 출석부를 지우지 않았습니다. " + rolloverSyncMsg, "rolloverSync");
        return;
      }
      rolloverProps.deleteProperty("rolloverSyncFails");
      rolloverProps.deleteProperty("rolloverSyncFailAt");
      vocabLogSystemAlert_(ss, "오류", "학습기록 동기화가 3회 연속 실패해 누적 백업 후 날짜를 전환했습니다. 메뉴 7번을 실행해 학습기록을 복구하세요. " + rolloverSyncMsg, "rolloverSync");
    }
    var sheetAccumulated = getAccumulatedSheet_(ss);
    if (!sheetAccumulated) {
      sheetAccumulated = ss.insertSheet("학생수업관리");
      sheetAccumulated.appendRow([
        "날짜요일", "시간", "이름", "특이사항", "등원여부", "등원시간", "보강결석사유",
        "숫자", "이벤트", "진단글쓰기/특별수업", "수업내용 및 특이사항"
      ]);
    }
    ensureColumns(sheetAccumulated, 11);
    
    // 3행부터 마지막 행까지 (A열~K열 총 11개 컬럼) 데이터 복사
    var dailyRange = sheetDaily.getRange(3, 1, lastRowDaily - 2, 11);
    
    sheetAccumulated.insertRowsBefore(2, lastRowDaily - 2);
    var destRange = sheetAccumulated.getRange(2, 1, lastRowDaily - 2, 11);
    
    // 1. 값 복사 (수식이나 드롭다운 룰을 제외한 데이터 복사)
    dailyRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
    // 2. 서식 복사 (날짜/시간 포맷 및 색상, 폰트 스타일 복사)
    dailyRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    
    // [날짜 전환 안전장치] 백업 복사본이 원본과 같은지 확인한 뒤에만 삭제 (다르면 복사본을 되돌리고 중단)
    var srcCheck = dailyRange.getValues();
    var dstCheck = destRange.getValues();
    var backupOk = srcCheck.length === dstCheck.length;
    for (var bc = 0; backupOk && bc < srcCheck.length; bc++) {
      for (var bk = 0; bk < 11; bk++) {
        if (String(srcCheck[bc][bk]) !== String(dstCheck[bc][bk])) { backupOk = false; break; }
      }
    }
    if (!backupOk) {
      sheetAccumulated.deleteRows(2, lastRowDaily - 2);
      vocabLogSystemAlert_(ss, "오류", "날짜 전환 중단: 누적 백업 내용이 원본과 달라 오늘 출석부를 지우지 않았습니다. 잠시 후 자동 재시도됩니다.", "rolloverBackup");
      return;
    }
    vocabClearSystemAlert_("rolloverBackup");
    
    // 3행 이하 기존 행들을 완전 삭제하여 초기화 (2행은 무조건 유지)
    var maxRows = sheetDaily.getMaxRows();
    var frozenRows = sheetDaily.getFrozenRows();
    var rowsToDelete = lastRowDaily - 2;
    if (rowsToDelete >= maxRows - frozenRows) {
      sheetDaily.insertRowsAfter(maxRows, 1);
    }
    sheetDaily.deleteRows(3, rowsToDelete);
  }
  
  var lastRowSt = sheetStudents.getLastRow();
  if (lastRowSt < 2) return;
  
  var studentsData = sheetStudents.getRange(2, 1, lastRowSt - 1, 36).getDisplayValues();
  var dailyLogsToAdd = [];
  
  for (var i = 0; i < studentsData.length; i++) {
    var name = String(studentsData[i][2] || "").trim();
    if (isGroupClassName_(name)) continue;
    
    var grade = String(studentsData[i][1] || "").trim();
    var notes = String(studentsData[i][10] || "").trim();
    var absentDates = String(studentsData[i][11] || "").trim().replace(/\s+/g, '');
    var makeupDateStr = String(studentsData[i][30] || "").trim();
    var makeupCompleted = String(studentsData[i][31] || "").trim();
    var todayExtensionMinsVal = parseInt(studentsData[i][35] || "0", 10) || 0;
    
    var times = {
      "월요일": String(studentsData[i][4] || "").trim(),
      "화요일": String(studentsData[i][5] || "").trim(),
      "수요일": String(studentsData[i][6] || "").trim(),
      "목요일": String(studentsData[i][7] || "").trim(),
      "금요일": String(studentsData[i][8] || "").trim(),
      "토요일": String(studentsData[i][9] || "").trim()
    };
    
    var isAbsentToday = absentDates.indexOf(dateSlash) !== -1 || absentDates.indexOf(dateDot) !== -1;
    var isMakeupToday = false;
    var makeupTime = "";
    if (makeupDateStr) {
      var parts = makeupDateStr.split(/[\n,\r]+/);
      for (var pIdx = 0; pIdx < parts.length; pIdx++) {
        var part = parts[pIdx].trim();
        if (!part) continue;
        var cleanPart = part.replace(/\s+/g, " ");
        
        // 1. Weekly repeating makeup (e.g. "금요일 14:30" or "금 14:30")
        if (cleanPart.indexOf("/") === -1 && cleanPart.indexOf(".") === -1 && cleanPart.indexOf("-") === -1) {
          var wMatch = cleanPart.match(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)\s*(\d{1,2}:\d{2})/);
          if (wMatch) {
            var mDay = wMatch[1];
            var mTime = wMatch[2];
            var tShort = todayDayName.substring(0, 1);
            if (mDay === todayDayName || mDay === tShort) {
              isMakeupToday = true;
              makeupTime = mTime;
              break;
            }
          }
        }
        
        // 2. Specific date makeup (e.g. "7/10(금) 14:30", "2026-07-10 14:30", "7.10 14:30", or "7월 10일")
        var koDateMatch = cleanPart.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (koDateMatch) {
          var matchM = parseInt(koDateMatch[1], 10);
          var matchD = parseInt(koDateMatch[2], 10);
          if (matchM === m && matchD === d) {
            isMakeupToday = true;
            var tMatch = cleanPart.match(/(\d{1,2}:\d{2})/);
            makeupTime = tMatch ? tMatch[1] : "";
            break;
          }
        }

        var dMatch = cleanPart.match(/(\d{1,4})[\/\.-](\d{1,2})([\/\.-](\d{1,2}))?/);
        if (dMatch) {
          var val1 = parseInt(dMatch[1], 10);
          var val2 = parseInt(dMatch[2], 10);
          var val4 = dMatch[4] ? parseInt(dMatch[4], 10) : null;
          
          var matchM = 0;
          var matchD = 0;
          if (val4 !== null) {
            matchM = val2;
            matchD = val4;
          } else {
            matchM = val1;
            matchD = val2;
          }
          
          if (matchM === m && matchD === d) {
            isMakeupToday = true;
            var tMatch = cleanPart.match(/(\d{1,2}:\d{2})/);
            makeupTime = tMatch ? tMatch[1] : "";
            break;
          }
        }
      }
    }
    
    // 1. Regular class times
    var regTimesAdded = [];
    var regTime = times[todayDayName] || "";
    if (regTime) {
      var parts = regTime.split(/[,/; ]+/);
      for (var p = 0; p < parts.length; p++) {
        var t = parts[p].trim();
        if (t) {
          var reasonStr = isAbsentToday ? "정규 결석" : (todayExtensionMinsVal > 0 ? "연장 (" + todayExtensionMinsVal + "분)" : "");
          dailyLogsToAdd.push({
            time: t, name: name, grade: grade, status: isAbsentToday ? "결석" : "대기", reason: reasonStr, notes: notes
          });
          regTimesAdded.push(t);
        }
      }
    }
    
    // 2. Makeup class time
    if (isMakeupToday) {
      if (!makeupTime) {
        makeupTime = "14:00"; // Fallback default time
      }
      
      // Self-healing check: if Column AF (makeupCompleted) is "완료", but they are NOT in today's daily log as completed,
      // it means this "완료" was left over from a previous makeup class. Reset it to "보강대기"!
      if (makeupCompleted === "완료" || makeupCompleted === "보강완료") {
        var alreadyCompletedToday = false;
        for (var dIdx = 0; dIdx < existingDailyRows.length; dIdx++) {
          var dDate = String(existingDailyRows[dIdx][0] || "").trim();
          var dName = String(existingDailyRows[dIdx][2] || "").trim();
          var dStatus = String(existingDailyRows[dIdx][4] || "").trim();
          if (normName_(dName) === normName_(name) && isSameDateGAS(dDate, dateStr) && (dStatus === "수업완료" || dStatus === "보강완료")) {
            alreadyCompletedToday = true;
            break;
          }
        }
        if (!alreadyCompletedToday) {
          makeupCompleted = "보강대기";
          sheetStudents.getRange(i + 2, 32).setValue("보강대기"); // Reset Column AF to "보강대기"
        }
      }
      
      if (makeupCompleted !== "완료" && makeupCompleted !== "보강완료") {
        var isDuplicateTime = regTimesAdded.some(function(rt) {
          return rt.replace(/\s+/g, "") === makeupTime.replace(/\s+/g, "");
        });
        if (!isDuplicateTime) {
          dailyLogsToAdd.push({
            time: makeupTime, name: name, grade: grade, status: "대기", reason: "보강 수업", notes: notes
          });
        }
      }
    }
  }
  
  dailyLogsToAdd.sort(function(a, b) {
    var timeComp = a.time.localeCompare(b.time);
    if (timeComp !== 0) return timeComp;
    var rankA = getGradeRank(a.grade);
    var rankB = getGradeRank(b.grade);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name);
  });
  
  if (dailyLogsToAdd.length > 0) {
    // 3행부터 밀어넣기 시작
    var writeRange = sheetDaily.getRange(3, 1, dailyLogsToAdd.length, 11);
    var writeValues = [];
    for (var j = 0; j < dailyLogsToAdd.length; j++) {
      writeValues.push([
        dateStr, dailyLogsToAdd[j].time, dailyLogsToAdd[j].name, dailyLogsToAdd[j].notes,
        dailyLogsToAdd[j].status, "", dailyLogsToAdd[j].reason, "", "", "", ""
      ]);
    }
    writeRange.setValues(writeValues);
    
    // 유효성 룰 전파 (3행 이하)
    if (validationE2) sheetDaily.getRange(3, 5, dailyLogsToAdd.length, 1).setDataValidation(validationE2);
    if (validationG2) sheetDaily.getRange(3, 7, dailyLogsToAdd.length, 1).setDataValidation(validationG2);
    if (validationH2) sheetDaily.getRange(3, 8, dailyLogsToAdd.length, 1).setDataValidation(validationH2);
    if (validationI2) sheetDaily.getRange(3, 9, dailyLogsToAdd.length, 1).setDataValidation(validationI2);
  }
}

// 전체시간표를 기반으로 요일별/시간대별/학년별(초등저, 초등고, 중등, 한국사) visual 오늘 시간표 보드를 자동 생성하는 함수
function generateWeeklyTimetable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetStudents = getStudentsSheet_(ss);
  if (!sheetStudents) return;
  var lastRowSt = sheetStudents.getLastRow();
  if (lastRowSt < 2) return;
  
  var studentsData = sheetStudents.getRange(2, 1, lastRowSt - 1, 32).getDisplayValues();
  
  var sheetWeekly = ss.getSheetByName("오늘 시간표");
  if (sheetWeekly) {
    sheetWeekly.clear();
    sheetWeekly.clearFormats();
  } else {
    sheetWeekly = ss.insertSheet("오늘 시간표");
  }
  sheetWeekly.setHiddenGridlines(false);
  
  var WEEKDAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  var CATEGORIES = ['초등저', '초등고', '중등', '한국사'];
  
  var timetableMap = {};
  var timesSet = {};
  
  var standardSlots = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
  standardSlots.forEach(function(slot) {
    timesSet[slot] = true;
  });
  
  function normalizeTimeSlot(timeStr) {
    if (!timeStr) return null;
    var match = timeStr.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (!match) return null;
    var hr = parseInt(match[1], 10);
    var min = parseInt(match[2], 10);
    if (isNaN(hr) || isNaN(min)) return null;
    if (min >= 0 && min < 30) {
      min = 0;
    } else {
      min = 30;
    }
    return String(hr).padStart(2, '0') + ":" + String(min).padStart(2, '0');
  }
  
  function getCategory(grade, classes, name) {
    var isHistory = (classes.indexOf("한국사") !== -1 || classes.indexOf("세계사") !== -1 || classes.indexOf("역사") !== -1 || name.indexOf("한국사") !== -1 || name.indexOf("세계사") !== -1 || name.indexOf("역사") !== -1);
    if (isHistory) return "한국사";
    
    if (grade.indexOf("초1") !== -1 || grade.indexOf("초2") !== -1 || grade.indexOf("초3") !== -1 || grade.indexOf("1학년") !== -1 || grade.indexOf("2학년") !== -1 || grade.indexOf("3학년") !== -1) {
      return "초등저";
    }
    if (grade.indexOf("초4") !== -1 || grade.indexOf("초5") !== -1 || grade.indexOf("초6") !== -1 || grade.indexOf("4학년") !== -1 || grade.indexOf("5학년") !== -1 || grade.indexOf("6학년") !== -1) {
      return "초등고";
    }
    if (grade.indexOf("중") !== -1 || grade.indexOf("고") !== -1) {
      return "중등";
    }
    var numMatch = grade.match(/\d+/);
    if (numMatch) {
      var num = parseInt(numMatch[0], 10);
      if (num <= 3) return "초등저";
      if (num <= 6) return "초등고";
    }
    return "초등저";
  }
  
  for (var i = 0; i < studentsData.length; i++) {
    var name = String(studentsData[i][2] || "").trim();
    var grade = String(studentsData[i][1] || "").trim();
    var classes = String(studentsData[i][3] || "").trim();
    if (isGroupClassName_(name)) continue;
    
    var cat = getCategory(grade, classes, name);
    
    var dayCols = { "월요일": 4, "화요일": 5, "수요일": 6, "목요일": 7, "금요일": 8, "토요일": 9 };
    for (var dName in dayCols) {
      var timeCell = String(studentsData[i][dayCols[dName]] || "").trim();
      if (!timeCell) continue;
      
      var timeParts = timeCell.split(/[,/; ]+/);
      for (var tp = 0; tp < timeParts.length; tp++) {
        var rawTime = timeParts[tp].trim();
        if (!rawTime) continue;
        
        var normalized = normalizeTimeSlot(rawTime);
        if (normalized) {
          timesSet[normalized] = true;
          
          var key = dName + "_" + normalized + "_" + cat;
          if (!timetableMap[key]) {
            timetableMap[key] = [];
          }
          timetableMap[key].push({
            name: name,
            grade: grade,
            classes: classes
          });
        }
      }
    }
  }
  
  // 요일별/시간대별/카테고리별 학생 목록을 학년 순 -> 이름 순으로 정렬
  for (var key in timetableMap) {
    timetableMap[key].sort(function(a, b) {
      var rankA = getGradeRank(a.grade);
      var rankB = getGradeRank(b.grade);
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    });
  }
  
  var sortedTimes = Object.keys(timesSet).sort();
  var grid = [];
  
  var titleRow = [];
  for (var c = 0; c < 30; c++) {
    titleRow.push(c === 0 ? "♣ 오늘 시간표 (학생 정원 파악 보드) - 정원 12명 제한" : "");
  }
  grid.push(titleRow);
  
  var dayRow = ["시간"];
  WEEKDAYS.forEach(function(day) {
    dayRow.push(day);
    dayRow.push("");
    dayRow.push("");
    dayRow.push("");
    dayRow.push("");
  });
  dayRow.pop();
  grid.push(dayRow);
  
  var catRow = [""];
  WEEKDAYS.forEach(function(day) {
    catRow.push("초등저");
    catRow.push("초등고");
    catRow.push("중등");
    catRow.push("한국사");
    catRow.push("");
  });
  catRow.pop();
  grid.push(catRow);
  
  var dayOffsets = { "월요일": 1, "화요일": 6, "수요일": 11, "목요일": 16, "금요일": 21, "토요일": 26 };
  var catOffsets = { "초등저": 0, "초등고": 1, "중등": 2, "한국사": 3 };
  
  var mergesToApply = [];
  var cellColorStyles = []; // elements: {row: 1-based, col: 1-based, bg: ..., fg: ...}
  var warningStyles = []; // elements: {row: 1-based, numRows: ..., val: ...}
  
  var currentRowIdx = 4; // 1-based row index for grid rows
  
  sortedTimes.forEach(function(timeSlot) {
    // 1. 해당 시간대의 모든 요일/카테고리 중 최대 학생 수 구하기 (그만큼 행 생성)
    var maxRowsForSlot = 1;
    WEEKDAYS.forEach(function(day) {
      CATEGORIES.forEach(function(cat) {
        var key = day + "_" + timeSlot + "_" + cat;
        var students = timetableMap[key] || [];
        if (students.length > maxRowsForSlot) {
          maxRowsForSlot = students.length;
        }
      });
    });
    
    // 2. 최대 학생 수만큼 행(Row) 생성하여 셀마다 학생 1명씩 배치
    for (var r = 0; r < maxRowsForSlot; r++) {
      var row = [r === 0 ? timeSlot : ""];
      for (var c = 1; c < 30; c++) {
        row.push("");
      }
      
      WEEKDAYS.forEach(function(day) {
        var dayOffset = dayOffsets[day];
        CATEGORIES.forEach(function(cat) {
          var key = day + "_" + timeSlot + "_" + cat;
          var students = timetableMap[key] || [];
          if (students[r]) {
            var s = students[r];
            row[dayOffset + catOffsets[cat]] = s.name + "(" + s.grade + ")";
            
            // 수강과목 키워드별 파스텔 컬러 지정 (한국사/문해력/내신/특강 등)
            var classesStr = String(s.classes || "").toLowerCase();
            var nameStr = String(s.name || "").toLowerCase();
            var bg = "#ecfdf5"; // 기본 연녹색 (일반)
            var fg = "#065f46";
            
            if (cat === "한국사" || classesStr.indexOf("한국사") !== -1 || classesStr.indexOf("세계사") !== -1 || classesStr.indexOf("역사") !== -1 || nameStr.indexOf("한국사") !== -1 || nameStr.indexOf("세계사") !== -1 || nameStr.indexOf("역사") !== -1) {
              bg = "#fef3c7"; // 연주황 (역사)
              fg = "#92400e";
            } else if (classesStr.indexOf("문해력") !== -1 || classesStr.indexOf("독서") !== -1 || classesStr.indexOf("국어") !== -1 || nameStr.indexOf("문해력") !== -1 || nameStr.indexOf("독서") !== -1 || nameStr.indexOf("국어") !== -1) {
              bg = "#dbeafe"; // 연파랑 (문해력)
              fg = "#1e40af";
            } else if (classesStr.indexOf("내신") !== -1 || classesStr.indexOf("시험") !== -1 || nameStr.indexOf("내신") !== -1 || nameStr.indexOf("시험") !== -1) {
              bg = "#f3e8ff"; // 연보라 (내신)
              fg = "#6b21a8";
            } else if (classesStr.indexOf("특강") !== -1 || nameStr.indexOf("특강") !== -1) {
              bg = "#fce7f3"; // 연분홍 (특강)
              fg = "#9d174d";
            }
            
            cellColorStyles.push({
              row: currentRowIdx,
              col: dayOffset + catOffsets[cat] + 1,
              bg: bg,
              fg: fg
            });
          }
        });
      });
      grid.push(row);
      currentRowIdx++;
    }
    
    // 시간 컬럼 A열 병합 정보 기록
    if (maxRowsForSlot > 1) {
      mergesToApply.push({
        row: currentRowIdx - maxRowsForSlot,
        col: 1,
        numRows: maxRowsForSlot,
        numCols: 1
      });
    }
    
    // 3. 정원 초과 계산 (한 시간대 당일 총원 > 12)
    var warnings = [];
    var exceedDayIndices = [];
    WEEKDAYS.forEach(function(day, dayIdx) {
      var totalInSlot = 0;
      CATEGORIES.forEach(function(cat) {
        var key = day + "_" + timeSlot + "_" + cat;
        var students = timetableMap[key] || [];
        totalInSlot += students.length;
      });
      
      if (totalInSlot > 12) {
        warnings.push(day.substring(0, 1) + ":" + totalInSlot + "명");
        exceedDayIndices.push(dayIdx);
      }
    });
    
    if (warnings.length > 0) {
      var warningRow = currentRowIdx - maxRowsForSlot;
      warningStyles.push({
        row: warningRow,
        numRows: maxRowsForSlot,
        val: timeSlot + " (" + warnings.join(", ") + ")"
      });
      
      // 초과한 요일의 4개 열 전체 행 영역을 연한 빨간색 경고 색상으로 오버라이드
      exceedDayIndices.forEach(function(dayIdx) {
        var startCol = 2 + dayIdx * 5; // 1-based col
        for (var rIdx = currentRowIdx - maxRowsForSlot; rIdx < currentRowIdx; rIdx++) {
          for (var colIdx = startCol; colIdx < startCol + 4; colIdx++) {
            cellColorStyles.push({
              row: rIdx,
              col: colIdx,
              bg: "#ffe4e6", // 경고용 연한 빨간색
              fg: null // 글자색은 학생 과목 고유색을 유지할 수 있도록 null 처리
            });
          }
        }
      });
    }
  });
  
  // 전체 범위에 그리드 값 채우기
  var range = sheetWeekly.getRange(1, 1, grid.length, 30);
  range.setValues(grid);
  
  // 1. 헤더/기본 스타일 채우기
  sheetWeekly.getRange(1, 1, 1, 30).merge().setFontSize(13).setFontWeight("bold").setBackground("#f1f5f9").setFontColor("#1e293b").setHorizontalAlignment("left").setWrap(false);
  
  WEEKDAYS.forEach(function(day, index) {
    var col = 2 + index * 5;
    sheetWeekly.getRange(2, col, 1, 4).merge().setFontWeight("bold").setHorizontalAlignment("center");
  });
  
  var pastelColors = ["#e0f2fe", "#f0fdf4", "#fff7ed", "#fdf2f8", "#ecfdf5", "#f5f3ff"];
  WEEKDAYS.forEach(function(day, index) {
    var col = 2 + index * 5;
    var color = pastelColors[index % pastelColors.length];
    
    sheetWeekly.getRange(2, col, 1, 4).setBackground(color).setFontColor("#0f172a");
    sheetWeekly.getRange(3, col, 1, 4).setBackground(color).setFontColor("#334155").setFontStyle("italic").setFontSize(9).setHorizontalAlignment("center");
  });
  
  // 2. 바디 영역 벌크 색상 배열 초기화 및 적용 (Apps Script 실행 속도 극대화)
  var totalBodyRows = grid.length - 3;
  var backgrounds = [];
  var fontColors = [];
  
  for (var r = 0; r < totalBodyRows; r++) {
    var bgRow = [];
    var fgRow = [];
    for (var c = 0; c < 30; c++) {
      if (c === 0) {
        bgRow.push("#f8fafc"); // 시간 컬럼
        fgRow.push("#64748b");
      } else if (c % 5 === 0) {
        bgRow.push("#f1f5f9"); // 구분 스페이서 열
        fgRow.push("#64748b");
      } else {
        bgRow.push("#ffffff"); // 빈 셀
        fgRow.push("#334155");
      }
    }
    backgrounds.push(bgRow);
    fontColors.push(fgRow);
  }
  
  // 3. 기록된 학생 개별 셀 및 경고 셀 스타일 덮어쓰기
  cellColorStyles.forEach(function(style) {
    var rIdx = style.row - 4; // 0-indexed body row
    var cIdx = style.col - 1; // 0-indexed column
    if (rIdx >= 0 && rIdx < totalBodyRows && cIdx >= 0 && cIdx < 30) {
      if (style.bg) backgrounds[rIdx][cIdx] = style.bg;
      if (style.fg) fontColors[rIdx][cIdx] = style.fg;
    }
  });
  
  // 경고 표시 셀 A열 오버라이드
  warningStyles.forEach(function(w) {
    var rIdx = w.row - 4;
    if (rIdx >= 0 && rIdx < totalBodyRows) {
      for (var k = 0; k < w.numRows; k++) {
        backgrounds[rIdx + k][0] = "#fee2e2";
        fontColors[rIdx + k][0] = "#991b1b";
      }
    }
  });
  
  // 벌크로 시트 서식 적용 (단 1번의 API 호출)
  var bodyRange = sheetWeekly.getRange(4, 1, totalBodyRows, 30);
  bodyRange.setBackgrounds(backgrounds);
  bodyRange.setFontColors(fontColors);
  
  // 4. 시간 컬럼 병합 및 경고 텍스트 주입
  mergesToApply.forEach(function(m) {
    try {
      sheetWeekly.getRange(m.row, m.col, m.numRows, m.numCols).merge();
    } catch(e) {}
  });
  
  warningStyles.forEach(function(w) {
    sheetWeekly.getRange(w.row, 1).setValue(w.val);
  });
  
  // 5. 열 넓이 및 정렬 서식 마무리
  for (var index = 0; index < 5; index++) {
    var col = 6 + index * 5;
    sheetWeekly.setColumnWidth(col, 15);
  }
  
  sheetWeekly.setColumnWidth(1, 140);
  for (var index = 0; index < 6; index++) {
    var colStart = 2 + index * 5;
    for (var cOffset = 0; cOffset < 4; cOffset++) {
      sheetWeekly.setColumnWidth(colStart + cOffset, 95);
    }
  }
  
  // 정렬 및 테두리선
  sheetWeekly.getRange(4, 1, totalBodyRows, 1).setVerticalAlignment("middle").setHorizontalAlignment("center").setFontWeight("bold");
  var contentRange = sheetWeekly.getRange(4, 2, totalBodyRows, 29);
  contentRange.setWrap(true).setVerticalAlignment("middle").setHorizontalAlignment("center").setFontSize(9);
  
  sheetWeekly.getRange(2, 1, grid.length - 1, 30).setBorder(true, true, true, true, true, true, "#e2e8f0", SpreadsheetApp.BorderStyle.SOLID);
}

// 최초 1회 실행하여 필요한 시트 탭들과 헤더 열 구성을 자동으로 생성해 주는 함수
function setupSheetsAndHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheetStudents = getStudentsSheet_(ss);
  if (sheetStudents) {
    ensureColumns(sheetStudents, 42);
    sheetStudents.getRange(1, 31, 1, AE_AP_HEADERS.length).setValues([AE_AP_HEADERS]);
    
    var lastRowSt = sheetStudents.getLastRow();
    if (lastRowSt >= 2) {
      sheetStudents.getRange(2, 35, lastRowSt - 1, 1).setFormulaR1C1("=RC[-2]-RC[-1]");
    }
  }
  
  // 오늘 출석부(출결보강관리) 셋업
  var sheetDaily = getDailySheet_(ss);
  if (!sheetDaily) {
    sheetDaily = ss.insertSheet("오늘 출석부");
    sheetDaily.getRange(1, 1, 1, 11).setValues([["날짜요일", "시간", "이름", "특이사항", "등원여부", "등원시간", "보강결석사유", "숫자", "이벤트", "진단글쓰기/특별수업", "수업내용 및 특이사항"]]);
  }
  
  if (sheetDaily) {
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["대기", "수업중", "수업완료", "보강완료", "결석", "휴강"], true)
      .setAllowInvalid(true)
      .build();
    sheetDaily.getRange("E2").setDataValidation(statusRule);
    
    var reasonRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["보강 수업", "연장 (10분)", "연장 (15분)", "연장 (20분)", "연장 (30분)", "연장 (60분)", "연장 (90분)", "정규 결석"], true)
      .setAllowInvalid(true)
      .build();
    sheetDaily.getRange("G2").setDataValidation(reasonRule);
  }
  
  // 학생수업관리 셋업
  var sheetAccumulated = getAccumulatedSheet_(ss);
  if (!sheetAccumulated) {
    sheetAccumulated = ss.insertSheet("학생수업관리");
    sheetAccumulated.getRange(1, 1, 1, 11).setValues([["날짜요일", "시간", "이름", "특이사항", "등원여부", "등원시간", "보강결석사유", "숫자", "이벤트", "진단글쓰기/특별수업", "수업내용 및 특이사항"]]);
  }
  
  var sheetTextbooks = getTextbookSheet_(ss);
  if (!sheetTextbooks) {
    sheetTextbooks = ss.insertSheet("교재단계관리");
    sheetTextbooks.appendRow([
      "학년", "이름", 
      "비문학 교재명", "시작일", "마침일", "정답율/다음교재", 
      "문학 교재명", "시작일", "마침일", "정답율/다음교재", 
      "어휘", "시작일", "마침일", "정답율/다음교재", 
      "복합", "시작일", "마침일", "정답율/다음교재",
      "음독 교재", "시작일", "마침일", "다음교재"
    ]);
  }
  
  var sheetConsult = getConsultSheet_(ss);
  if (!sheetConsult) {
    sheetConsult = ss.insertSheet("학부모상담/채널발송");
    sheetConsult.getRange(1, 1, 1, 6).setValues([["학년", "이름", "작성기간", "작성인", "상담내용 / 분석지 / 채널 보냄", "부모님의 need / 학생 특이사항"]]);
  }
  
  var memberHeaders = [
    "순번", "이름", "학년", "등록일", "최초상담", "학생 성향 & 코칭 방향",
    "주력 목표 & 이달의 학습 전광판", "코스업/레벨업", "레벨변동",
    "숙제교재", "읽트/독트", "스티커판",
    "분석지발송", "독서방법", "학생ID", "학부모 전화번호"
  ];
  var sheetMember = getMemberAnalysisSheet(ss);
  if (!sheetMember) {
    sheetMember = ss.insertSheet("회원 분석/레벨변동/전화상담");
    sheetMember.appendRow(memberHeaders);
  } else {
    ensureColumns(sheetMember, 16);
    sheetMember.getRange(1, 1, 1, 16).setValues([memberHeaders]);
  }
  
  // 출결달력검색 탭 셋업
  var sheetCal = ss.getSheetByName("출결달력검색");
  if (!sheetCal) {
    sheetCal = ss.insertSheet("출결달력검색");
    sheetCal.setHiddenGridlines(false);
    
    sheetCal.getRange("A2").setValue("학생 이름");
    sheetCal.getRange("B2").setValue("강찬");
    sheetCal.getRange("C2").setValue("년도");
    sheetCal.getRange("D2").setValue(new Date().getFullYear());
    sheetCal.getRange("E2").setValue("월");
    sheetCal.getRange("F2").setValue(new Date().getMonth() + 1);
    
    sheetCal.getRange("A2:F2").setBackground("#f1f5f9").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheetCal.getRange("B2").setBackground("#e8f0fe").setBorder(true, true, true, true, false, false, "#1a73e8", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sheetCal.getRange("D2").setBackground("#e8f0fe");
    sheetCal.getRange("F2").setBackground("#e8f0fe");
    
    updateAttendanceCalendarSheet(sheetCal, "강찬", new Date().getFullYear(), new Date().getMonth() + 1);
  }
}

// B3 검색 학생을 기준으로 매칭 행 수량만큼 수식을 계산해 밀어내는 동적 한명검색 시트 생성 함수
function createSingleSearchSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("한명 검색") || ss.getSheetByName("한명검색");
  if (sheet) {
    sheet.clear();
    sheet.clearFormats();
  } else {
    sheet = ss.insertSheet("한명 검색");
  }
  
  sheet.setHiddenGridlines(false);
  
  sheet.getRange("A3").setValue("학생 이름");
  sheet.getRange("B3").setValue("신나라");
  sheet.getRange("C3").setValue("← 여기에 이름을 입력하고 Enter를 누르시면 아래 영역들이 자동으로 콕 찝어 통합 조회됩니다.");
  
  sheet.getRange("A3").setFontWeight("bold").setBackground("#f1f3f4");
  sheet.getRange("B3").setFontWeight("bold").setBackground("#e8f0fe").setHorizontalAlignment("center").setBorder(true, true, true, true, false, false, "#1a73e8", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange("C3").setFontColor("#80868b").setFontStyle("italic");
  
  // 열 너비 조절
  sheet.setColumnWidths(1, 18, 110);
  sheet.setColumnWidth(1, 60);   // 순번 / 학년 / 이름
  sheet.setColumnWidth(2, 90);   // 이름
  sheet.setColumnWidth(5, 130);  // 상담/채널 등
  sheet.setColumnWidth(6, 250);  // 학생 특이사항 / 부모님 need 등
  sheet.setColumnWidth(7, 200);  // 진도 관리 / 문학교재명
  sheet.setColumnWidth(11, 130); // 읽트/독트 등
  sheet.setColumnWidth(15, 130); // 복합교재명 / 아이디 등
  
  // 초기 로드 빌드
  updateSingleSearchSheetLayout(sheet, "신나라");
}

// 검색어 입력 시 호출되어 동적으로 셀 간격을 조정해주는 함수
function updateSingleSearchSheetLayout(sheet, studentName) {
  if (!sheet) return;
  
  // 1. 5행 이하 모든 데이터 및 서식 초기화
  var lastRow = sheet.getLastRow();
  if (lastRow >= 5) {
    sheet.getRange(5, 1, lastRow - 4, 26).clear();
    sheet.getRange(5, 1, lastRow - 4, 26).clearFormat();
  }
  
  // 2. 각 데이터 시트에서 검색 학생의 매칭 행 수 계산 (최소 1행 확보)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var memberSheetName = ss.getSheetByName("월별상담내역") ? "월별상담내역" : "회원 분석/레벨변동/전화상담";
  var textbookSheetName = ss.getSheetByName("교재단계관리") ? "교재단계관리" : "문해력교재관리";
  var consultSheetName = ss.getSheetByName("학부모상담/채널발송") ? "학부모상담/채널발송" : "상담내용/리포트발송/채널발송";

  var memberRows = countMatchingRows(memberSheetName, 2, studentName);
  if (memberRows === 0) memberRows = 1;
  
  var textbookRows = countMatchingRows(textbookSheetName, 2, studentName);
  if (textbookRows === 0) textbookRows = 1;
  
  // 3. 섹션 1: 회원 종합 분석 및 레벨 관리 배치
  sheet.getRange("A5").setValue("🟢 1. 회원 종합 분석 및 레벨 관리");
  sheet.getRange("A5:Z5").setBackground("#2e7d32").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11);
  
  var header1 = [
    "순번", "이름", "학년", "등록일", "최초상담", "학생 성향 & 코칭 방향", 
    "주력 목표 & 이달의 학습 전광판", "코스업/레벨업", "레벨변동", 
    "숙제교재", "읽트/독트", "스티커판", 
    "분석지발송", "독서방법", "학생ID", "학부모 전화번호"
  ];
  sheet.getRange(6, 1, 1, 16).setValues([header1]);
  sheet.getRange("A6:P6").setFontWeight("bold").setBackground("#f8f9fa").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("A7").setFormula("=IFERROR(FILTER('" + memberSheetName + "'!A2:P, TRIM('" + memberSheetName + "'!B2:B) = TRIM(B3)), \"검색된 학생이 없습니다.\")");
  
  // 4. 섹션 2: 문해력 교재 관리 현황 계산 및 배치
  var sec2TitleRow = 8 + memberRows;
  var sec2HeaderRow = 9 + memberRows;
  var sec2DataRow = 10 + memberRows;
  
  sheet.getRange(sec2TitleRow, 1).setValue("🟠 2. 문해력 교재 관리 현황");
  sheet.getRange(sec2TitleRow, 1, 1, 26).setBackground("#e65100").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11);
  
  var header2 = [
    "학년", "이름", "비문학 교재명", "시작일", "마침일", "정답률", 
    "문학교재명", "시작일", "마침일", "정답률", 
    "어휘 교재명", "시작일", "마침일", "정답률", 
    "복합 교재명", "시작일", "마침일", "정답률"
  ];
  sheet.getRange(sec2HeaderRow, 1, 1, 18).setValues([header2]);
  sheet.getRange(sec2HeaderRow, 1, 1, 18).setFontWeight("bold").setBackground("#f8f9fa").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange(sec2DataRow, 1).setFormula("=IFERROR(FILTER('" + textbookSheetName + "'!A2:R, TRIM('" + textbookSheetName + "'!B2:B) = TRIM(B3)), \"등록된 교재가 없습니다.\")");
  
  // 5. 섹션 3: 상담 및 리포트 발송 기록 계산 및 배치
  var sec3TitleRow = 11 + memberRows + textbookRows;
  var sec3HeaderRow = 12 + memberRows + textbookRows;
  var sec3DataRow = 13 + memberRows + textbookRows;
  
  sheet.getRange(sec3TitleRow, 1).setValue("🔵 3. 상담 및 리포트 발송 기록");
  sheet.getRange(sec3TitleRow, 1, 1, 26).setBackground("#0d47a1").setFontColor("#ffffff").setFontWeight("bold").setFontSize(11);
  
  var header3 = [
    "학년", "이름", "작성기간", "작성인", "상담내용 / 분석지 / 채널 보냄 / 발송 완료 노란색 표시", "부모님의 need / 학생 특이사항"
  ];
  sheet.getRange(sec3HeaderRow, 1, 1, 6).setValues([header3]);
  sheet.getRange(sec3HeaderRow, 1, 1, 6).setFontWeight("bold").setBackground("#f8f9fa").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // 이름이 B열에 있으므로 FILTER의 기준을 B열로 설정
  sheet.getRange(sec3DataRow, 1).setFormula("=IFERROR(FILTER('" + consultSheetName + "'!A2:F, TRIM('" + consultSheetName + "'!B2:B) = TRIM(B3)), \"등록된 상담 기록이 없습니다.\")");
  
  // 기본 서식 폰트 설정 및 세로 정렬 상단화, 가로 정렬 좌측화 고정
  sheet.getRange(5, 1, sec3DataRow - 5 + 20, 26).setFontFamily("Malgun Gothic").setVerticalAlignment("top").setHorizontalAlignment("left");
  sheet.getRange("A6:O6").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange(sec2HeaderRow, 1, 1, 18).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange(sec3HeaderRow, 1, 1, 6).setHorizontalAlignment("center").setVerticalAlignment("middle");
}

// 6열 고정 넓이 달력 그리기용 출결 달력 검색 시트 생성 및 그리기 함수
function updateAttendanceCalendarSheet(sheet, studentName, year, month) {
  if (!sheet) return;
  
  // 1. 5행 이하 전체 삭제 및 초기화
  var lastRow = sheet.getLastRow();
  if (lastRow >= 5) {
    sheet.getRange(5, 1, lastRow - 4, 7).clear();
    sheet.getRange(5, 1, lastRow - 4, 7).clearFormat();
  }
  
  // 2. 4행 요일 헤더 설정
  sheet.getRange("A4:G4").setValues([["일", "월", "화", "수", "목", "금", "토"]])
       .setFontWeight("bold")
       .setBackground("#e2e8f0")
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle");
       
  for (var c = 1; c <= 7; c++) {
    sheet.setColumnWidth(c, 110);
  }
  
  // 3. 학생 데이터 수집 (오늘 출석부 + 누적일일수업관리 통합 스캔)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logs = [];
  var cleanTargetName = normName_(studentName);
  [
    { sheet: getDailySheet_(ss), minRow: 3, maxScan: 0 },
    { sheet: getAccumulatedSheet_(ss), minRow: 2, maxScan: 3000 }
  ].forEach(function(src) {
    if (!src.sheet) return;
    var lastR = src.sheet.getLastRow();
    if (lastR < src.minRow) return;
    var startR = src.maxScan ? Math.max(src.minRow, lastR - src.maxScan) : src.minRow;
    var vals = src.sheet.getRange(startR, 1, lastR - startR + 1, 6).getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      if (normName_(vals[i][2]) === cleanTargetName) {
        logs.push({ date: String(vals[i][0] || "").trim(), time: String(vals[i][1] || "").trim(), status: String(vals[i][4] || "").trim(), inTime: String(vals[i][5] || "").trim() });
      }
    }
  });
  
  // 4. 달력 일자 루프 및 채우기
  var firstDay = new Date(year, month - 1, 1);
  var numDays = new Date(year, month, 0).getDate();
  var startDayOfWeek = firstDay.getDay(); // 0: 일요일, 6: 토요일
  
  var gridRow = 5;
  var gridCol = startDayOfWeek + 1;
  
  // 달력 행 높이 설정 (정사각형 느낌)
  for (var r = 5; r <= 11; r++) {
    sheet.setRowHeight(r, 65);
  }
  
  // 이전 달 빈 칸 연한 회색 배경 처리
  if (startDayOfWeek > 0) {
    sheet.getRange(5, 1, 1, startDayOfWeek).setBackground("#f8fafc");
  }
  
  for (var day = 1; day <= numDays; day++) {
    var cell = sheet.getRange(gridRow, gridCol);
    var cellText = day + "\n";
    
    // 이 날짜의 출결 로그 검색 (예: "8/9" 또는 "8/9일" 매칭)
    var matchingLog = null;
    var datePattern = new RegExp('^' + month + '[/\\.]' + day + '(\\D|$)');
    
    for (var l = 0; l < logs.length; l++) {
      if (datePattern.test(logs[l].date)) {
        matchingLog = logs[l];
        break;
      }
    }
    
    if (matchingLog) {
      var status = matchingLog.status;
      var inTime = matchingLog.inTime || matchingLog.time || "";
      if (status === "대기" || status === "수업중" || status === "수업 중" || status === "보강 수업중") {
        cellText += status;
        cell.setBackground("#f1f5f9").setFontColor("#475569");
      } else if (status === "출석" || status === "수업완료") {
        cellText += "출석 (" + inTime + ")";
        cell.setBackground("#dcfce7").setFontColor("#15803d");
      } else if (status === "결석") {
        cellText += "결석";
        cell.setBackground("#fee2e2").setFontColor("#b91c1c");
      } else if (status === "보강대기") {
        cellText += "보강대기";
        cell.setBackground("#fce7f3").setFontColor("#be185d");
      } else if (status === "보강완료" || status === "완료") {
        cellText += "보강완료 (" + inTime + ")";
        cell.setBackground("#e0f2fe").setFontColor("#0369a1");
      } else if (status === "휴강") {
        cellText += "휴강";
        cell.setBackground("#f8fafc").setFontColor("#94a3b8");
      } else {
        cellText += status;
      }
    }
    
    cell.setValue(cellText)
        .setFontSize(9)
        .setFontFamily("Malgun Gothic")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("top");
        
    gridCol++;
    if (gridCol > 7) {
      gridCol = 1;
      gridRow++;
    }
  }
  
  // 다음 달 빈 칸 연한 회색 배경 처리
  if (gridCol <= 7) {
    sheet.getRange(gridRow, gridCol, 1, 8 - gridCol).setBackground("#f8fafc");
  }
  if (gridRow < 10) {
    sheet.getRange(gridRow + 1, 1, 10 - gridRow, 7).setBackground("#f8fafc");
  }
  
  // 전체 테두리선 추가
  sheet.getRange(5, 1, gridRow - 5 + 1, 7).setBorder(true, true, true, true, true, true, "#e2e8f0", SpreadsheetApp.BorderStyle.SOLID);
}

// 특정 시트의 이름 컬럼에서 학생 매칭 행수를 구하는 헬퍼 함수
function countMatchingRows(sheetName, nameColIdx, studentName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet && SHEET_ALTS[sheetName]) {
    sheet = ss.getSheetByName(SHEET_ALTS[sheetName]);
  }
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(2, nameColIdx, lastRow - 1, 1).getValues();
  var count = 0;
  var target = normName_(studentName).toLowerCase();
  for (var i = 0; i < data.length; i++) {
    if (normName_(data[i][0]).toLowerCase() === target) {
      count++;
    }
  }
  return count;
}

function getMemberAnalysisSheet(ss) {
  var s = ss.getSheetByName("회원 분석/레벨변동/전화상담") || ss.getSheetByName("회원분석/레벨변동/전화상담") || ss.getSheetByName("월별상담내역") || ss.getSheetByName("회원 분석") || ss.getSheetByName("회원분석");
  if (s) return s;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    if (sName.indexOf("회원") !== -1 && sName.indexOf("분석") !== -1) {
      return sheets[i];
    }
  }
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    if (sName.indexOf("상담내역") !== -1 || sName.indexOf("회원") !== -1) {
      return sheets[i];
    }
  }
  return null;
}

// 출결보강관리의 등원여부(E열), 숫자(H열), 이벤트(I열), 진단/글쓰기(J열) 또는 수업내용(K열) 입력 시 [학습기록] 및 [회원 분석] 시트로 1회 일괄(Bulk) 누적 기록하는 함수
function accumulateDailyEventToMemberAnalysis(sheetDaily, rowNumber) {
  accumulateDailyRowsBatch_(sheetDaily, rowNumber, rowNumber);
}

// [학습기록](23열) 시트에서 해당 학생의 이번 달 요약 1줄 생성 (📊 [10월] 독서 5권 | 어휘 92점 | 독해 88점 | 개념 90점)
function buildMemberSummaryBoardLine_(ss, studentName, optRecVals) {
  var cleanTarget = normName_(studentName);
  if (!cleanTarget) return "";

  var vals = optRecVals;
  if (!vals) {
    var rs = getRecordSheetReadOnly_(ss);
    if (!rs || rs.getLastRow() < 2) return "";
    var last = rs.getLastRow();
    var numRows = Math.min(last - 1, 800);
    var colCount = Math.min(Math.max(rs.getLastColumn(), 18), 23);
    vals = rs.getRange(2, 1, numRows, colCount).getValues();
  }

  var now = new Date();
  var ymPrefix = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");
  var mm = now.getMonth() + 1;

  var bookSet = {};
  var vocabRates = [];
  var readScores = [];
  var conceptScores = [];
  var trCount = 0;

  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    var rName = normName_(v[1]);
    if (rName !== cleanTarget) continue;
    var dStr = vocabFmtDate_(v[0]);
    if (dStr.indexOf(ymPrefix) !== 0) continue;

    var bk = String(v[5] || "").trim();
    if (bk) bookSet[bk] = true;
    var vr = vocabNum_(v[8]);
    if (vr !== "") vocabRates.push(vr);
    var ds = vocabNum_(v[9]);
    if (ds !== "") readScores.push(ds);

    var tr = String(v[11] || "").trim();
    var undStr = String(v[14] || "").trim();
    var undMatch = undStr.match(/(\d{1,3})/);
    var undVal = undMatch ? parseInt(undMatch[1], 10) : "";

    // [23열 S~W열 반영] S:독해문항(18), T:독해오답(19), U:어휘문항(20), V:어휘오답(21), W:문해력정답률(22)
    var readTot = vocabNum_(v[18]);
    var readErr = vocabNum_(v[19]);
    var vocTot = vocabNum_(v[20]);
    var vocErr = vocabNum_(v[21]);
    var litAcc = vocabNum_(v[22]);

    if (readTot !== "" && readTot > 0 && readErr !== "") {
      readScores.push(Math.max(0, Math.round(((readTot - readErr) / readTot) * 100)));
    } else if (litAcc !== "" && tr.indexOf("개념") === -1) {
      readScores.push(litAcc);
    }

    if (vocTot !== "" && vocTot > 0 && vocErr !== "" && vr === "") {
      vocabRates.push(Math.max(0, Math.round(((vocTot - vocErr) / vocTot) * 100)));
    }

    if (tr) {
      if (tr.indexOf("독해") !== -1 && undVal !== "" && readTot === "" && litAcc === "") {
        readScores.push(undVal);
      } else if (tr.indexOf("개념") !== -1 && (litAcc !== "" || undVal !== "")) {
        conceptScores.push(litAcc !== "" ? litAcc : undVal);
      } else {
        trCount++;
      }
    }
  }

  var bookCount = Object.keys(bookSet).length;
  if (!bookCount && !vocabRates.length && !readScores.length && !conceptScores.length && !trCount) return "";

  var parts = [];
  if (bookCount) {
    parts.push("독서 " + bookCount + "권");
  }
  if (vocabRates.length) {
    var avgVoc = Math.round(vocabRates.reduce(function(a, b) { return a + b; }, 0) / vocabRates.length);
    parts.push("어휘 " + avgVoc + "점");
  }
  if (readScores.length) {
    var avgRead = Math.round(readScores.reduce(function(a, b) { return a + b; }, 0) / readScores.length);
    parts.push("독해 " + avgRead + "점");
  }
  if (conceptScores.length) {
    var avgConcept = Math.round(conceptScores.reduce(function(a, b) { return a + b; }, 0) / conceptScores.length);
    parts.push("개념 " + avgConcept + "점");
  } else if (trCount) {
    parts.push("트레이닝 " + trCount + "회");
  }
  return "📊 [" + mm + "월] " + parts.join(" | ");
}

// 가장 최근 읽은 책 1권을 "📖 [최근] 도서명 (글완/90점)" 형식으로 정규화
function formatRecentBookBoardLine_(rawBookLine) {
  var s = String(rawBookLine || "").trim();
  if (!s) return "";
  s = s.replace(/^📖\s*(?:\[최근\])?\s*/, "").trim();
  s = s.replace(/^(?:\d{2}[\.\/])?\d{1,2}\/\d{1,2}\s+/, "").trim();
  if (!s) return "";
  if (/\([^)]+\)$/.test(s)) {
    return "📖 [최근] " + s;
  }
  var hasComplete = (s.indexOf("글완") !== -1 || s.indexOf("글쓰기완") !== -1 || s.indexOf("완료") !== -1);
  var body = s.replace(/글완|글쓰기완료|글쓰기완|완료/g, "").trim();
  var scoreMatch = body.match(/^(.*?)\s+(\d{2,3})\s*점?$/);
  var title = scoreMatch ? scoreMatch[1].trim() : body;
  var score = scoreMatch ? (scoreMatch[2] + "점") : "";
  if (!title) title = s;
  var tags = [];
  if (hasComplete) tags.push("글완");
  if (score) tags.push(score);
  return "📖 [최근] " + title + (tags.length ? " (" + tags.join("/") + ")" : "");
}

// G열(주력 목표 & 이달의 학습 전광판) 3줄 구조 조립 + 날짜별 진단 기록 누적 보존
function composeMemberColGBoard_(ss, studentName, currentGText, newBookEventsToday, eventDatePrefix, optRecVals) {
  var lines = String(currentGText || "").split(/\r?\n/);
  var goalLine = "";
  var existingSummaryLine = "";
  var oldRecentBookLine = "";
  var historyLines = [];

  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim();
    if (!ln) continue;
    if (ln.indexOf("🎯") === 0 || ln.indexOf("[목표]") === 0 || ln.indexOf("목표:") === 0) {
      if (ln.indexOf("🎯") === 0) goalLine = ln;
      else if (ln.indexOf("[목표]") === 0) goalLine = "🎯 " + ln;
      else goalLine = "🎯 [목표] " + ln.replace(/^목표:\s*/, "");
      continue;
    }
    if (ln.indexOf("📊") === 0) {
      existingSummaryLine = ln;
      continue;
    }
    if (ln.indexOf("📖") === 0) {
      oldRecentBookLine = ln;
      continue;
    }
    // 날짜별 진단 히스토리 라인 (오늘 날짜 라인은 아래에서 최신으로 재구성하므로 제외)
    if (eventDatePrefix && ln.indexOf(eventDatePrefix) === 0) continue;
    historyLines.push(ln);
  }

  // 오늘 입력된 신규 도서 이벤트 수집
  var todayDateLines = [];
  var recentCandidate = "";
  if (newBookEventsToday && newBookEventsToday.length) {
    for (var n = 0; n < newBookEventsToday.length; n++) {
      var ev = String(newBookEventsToday[n] || "").trim();
      if (!ev) continue;
      todayDateLines.push(ev);
      recentCandidate = ev;
    }
  }

  // 1) 🎯 [목표] 수기 영구 보존
  // 2) 📊 [이달] 요약 자동 산출 (메모리 배열 optRecVals 재사용으로 시트 반복 읽기 0회!)
  var summaryLine = buildMemberSummaryBoardLine_(ss, studentName, optRecVals) || existingSummaryLine;

  // 3) 📖 [최근] 도서 1권 (오늘 진단/도서 기록이 있으면 최신 도서로 즉시 갱신)
  var recentBookLine = "";
  if (recentCandidate) {
    recentBookLine = formatRecentBookBoardLine_(recentCandidate);
  } else if (oldRecentBookLine) {
    recentBookLine = oldRecentBookLine;
  } else {
    var vals = optRecVals;
    if (!vals) {
      var rs = getRecordSheetReadOnly_(ss);
      if (rs && rs.getLastRow() >= 2) {
        var numRows = Math.min(rs.getLastRow() - 1, 500);
        vals = rs.getRange(2, 1, numRows, 10).getValues();
      }
    }
    if (vals && vals.length) {
      var cleanTarget = normName_(studentName);
      for (var r = 0; r < vals.length; r++) {
        if (normName_(vals[r][1]) !== cleanTarget) continue;
        var bk = String(vals[r][5] || "").trim();
        if (bk) {
          var ds = vocabNum_(vals[r][9]);
          recentBookLine = formatRecentBookBoardLine_(bk + (ds !== "" ? " " + ds + "점" : ""));
          break;
        }
      }
    }
  }

  var out = [];
  if (goalLine) out.push(goalLine);
  if (summaryLine) out.push(summaryLine);
  if (recentBookLine) out.push(recentBookLine);
  for (var h = 0; h < historyLines.length; h++) {
    out.push(historyLines[h]);
  }
  for (var t = 0; t < todayDateLines.length; t++) {
    out.push(todayDateLines[t]);
  }
  return out.join("\n");
}

// [버그 ① 해결] 특정 학생 1명의 [회원 분석] G열(이달의 학습 전광판)만 즉시 갱신하는 함수
function refreshMemberAnalysisSummaryBoardForStudent_(ss, studentName, optRecVals) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var cleanTarget = normName_(studentName);
  var sheetMember = cleanTarget ? getMemberAnalysisSheet(ss) : null;
  if (!sheetMember || sheetMember.getLastRow() < 2) return;
  var namesAndColG = sheetMember.getRange(2, 2, sheetMember.getLastRow() - 1, 6).getValues();
  for (var i = 0; i < namesAndColG.length; i++) {
    var mName = String(namesAndColG[i][0] || "").trim();
    if (mName && (normName_(mName) === cleanTarget || isSameStudentNameInGAS(mName, studentName))) {
      var currentG = String(namesAndColG[i][5] || "").trim();
      var newColG = composeMemberColGBoard_(ss, studentName, currentG, [], "", optRecVals);
      if (newColG !== currentG) sheetMember.getRange(2 + i, 7).setValue(newColG);
      break;
    }
  }
}

// Google Sheets mixed text color styling function (completed books styled blue and bold line-by-line)
function applyRichTextStyling(cell, text) {
  if (!text) {
    cell.setValue("");
    cell.setFontColor(null);
    cell.setFontWeight(null);
    return;
  }
  
  // Normalize newlines to prevent indexing mismatch
  text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Clear cell-level formatting first so it doesn't affect the entire cell
  cell.setFontColor(null);
  cell.setFontWeight(null);

  var lines = text.split("\n");
  var builder = SpreadsheetApp.newRichTextValue().setText(text);
  
  var blueStyle = SpreadsheetApp.newTextStyle()
    .setForegroundColor("#2563eb")
    .setBold(true)
    .build();
    
  var currentIndex = 0;
  var hasStyledLine = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var lineLength = line.length;
    try {
      if (line.indexOf("글완") !== -1 || line.indexOf("글쓰기완") !== -1 || line.indexOf("완료") !== -1 || line.indexOf("표현활동") !== -1) {
        builder.setTextStyle(currentIndex, currentIndex + lineLength, blueStyle);
        hasStyledLine = true;
      }
    } catch (e) {
      // Fail-safe check
    }
    currentIndex += lineLength + 1; // +1 for the newline
  }
  
  try {
    if (hasStyledLine) {
      cell.setRichTextValue(builder.build());
    } else {
      cell.setValue(text);
    }
  } catch (e) {
    cell.setValue(text);
  }
}

function isSameDateGAS(d1, d2) {
  var clean1 = String(d1).trim().replace(/\s+/g, "");
  var clean2 = String(d2).trim().replace(/\s+/g, "");
  if (clean1 === clean2) return true;
  var m1 = clean1.match(/(\d+)[^\d]+(\d+)/);
  var m2 = clean2.match(/(\d+)[^\d]+(\d+)/);
  if (m1 && m2) {
    return parseInt(m1[1], 10) === parseInt(m2[1], 10) && 
           parseInt(m1[2], 10) === parseInt(m2[2], 10);
  }
  return false;
}

// 출석부 행 배열(rowsArray)을 받아 [학습기록 23열] 업서트 및 [회원 분석] 동기화를 1회 일괄(Bulk) 수행하는 공통 함수
function syncDailyRowsArrayToRecordsAndMember_(ss, sheetDaily, rowsArray) {
  var studentRecordsMap = {};
  var syncCount = 0;
  for (var r = 0; r < rowsArray.length; r++) {
    var row = rowsArray[r];
    var dateStr = String(row[0] || "").trim();
    var name = String(row[2] || "").trim();
    var statusVal = String(row[4] || "").trim();
    var grammarDoneVal = String(row[9] || "").trim();
    var contentsVal = String(row[10] || "").trim();
    if (!name || name === "이름") continue;
    if (contentsVal || grammarDoneVal || statusVal === "수업완료" || statusVal === "보강완료" || statusVal === "하원완료") {
      var records = parseDailyRowToLearningRecords_(row, parseDailyDateToIso_(dateStr));
      if (records && records.length > 0) {
        var cleanName = normName_(name);
        if (!studentRecordsMap[cleanName]) studentRecordsMap[cleanName] = [];
        studentRecordsMap[cleanName] = studentRecordsMap[cleanName].concat(records);
        syncCount++;
      }
    }
  }
  if (Object.keys(studentRecordsMap).length > 0) {
    vocabUpsertAllStudentsDayRecordsBulk_(vocabEnsureRecordSheet_(ss), studentRecordsMap);
  }
  var sheetMember = getMemberAnalysisSheet(ss);
  if (sheetMember && rowsArray.length > 0) {
    syncDailyEventsToMemberAnalysisBulk_(ss, sheetDaily, sheetMember, rowsArray);
  }
  return syncCount;
}

// 다중 행 또는 단일 행의 출석부(오늘 출석부 / 학생수업관리) 변경 사항을 1회 일괄(Bulk)로 [학습기록] 및 [회원 분석]에 반영하는 헬퍼
function accumulateDailyRowsBatch_(sheet, startRow, endRow) {
  if (!sheet) return;
  var firstRow = Math.max(2, startRow);
  if (endRow < firstRow) return;
  var numRows = endRow - firstRow + 1;
  var ss = sheet.getParent() || SpreadsheetApp.getActiveSpreadsheet();
  var rowsData = sheet.getRange(firstRow, 1, numRows, 11).getDisplayValues();
  var validRows = [];
  var today = new Date();
  var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  var defaultDateStr = (today.getMonth() + 1) + "/" + today.getDate() + weekdays[today.getDay()];

  for (var i = 0; i < rowsData.length; i++) {
    var rowValues = rowsData[i];
    var dateStr = String(rowValues[0] || "").trim();
    var name = String(rowValues[2] || "").trim();
    if (!name || name === "이름") continue;
    if (!dateStr && (rowValues[7] || rowValues[8] || rowValues[9] || rowValues[10] || rowValues[4] === "수업완료" || rowValues[4] === "보강완료")) {
      rowValues[0] = defaultDateStr;
      sheet.getRange(firstRow + i, 1).setValue(defaultDateStr);
    }
    validRows.push(rowValues);
  }
  if (validRows.length > 0) {
    syncDailyRowsArrayToRecordsAndMember_(ss, sheet, validRows);
  }
}

// B3 셀 입력 수정 시 자동 레이아웃 조정 및 출결보강관리 편집 시 이벤트 누적 트리거
function onEdit(e) {
  if (!e) return;
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  
  if (sheetName === "한명 검색" && range.getA1Notation() === "B3") {
    var studentName = String(range.getValue()).trim();
    updateSingleSearchSheetLayout(sheet, studentName);
  }
  
  if (sheetName === "출결달력검색") {
    var notation = range.getA1Notation();
    if (notation === "B2" || notation === "D2" || notation === "F2") {
      var studentName = String(sheet.getRange("B2").getValue()).trim();
      var year = parseInt(sheet.getRange("D2").getValue(), 10) || new Date().getFullYear();
      var month = parseInt(sheet.getRange("F2").getValue(), 10) || (new Date().getMonth() + 1);
      updateAttendanceCalendarSheet(sheet, studentName, year, month);
    }
  }
  
  function syncStudentAbsentMinsOnSheet_(stSheet, stRowIdx, datesCount) {
    var classesStr = String(stSheet.getRange(stRowIdx, 4).getValue() || "");
    var grade = String(stSheet.getRange(stRowIdx, 2).getValue() || "");
    var newAbsentMinsAcc = datesCount * getStudentBaseDuration_(classesStr, grade);
    var currentMakeupMinsDone = parseInt(stSheet.getRange(stRowIdx, 34).getValue() || "0", 10) || 0;
    stSheet.getRange(stRowIdx, 33).setValue(newAbsentMinsAcc);
    stSheet.getRange(stRowIdx, 35).setValue(Math.max(0, newAbsentMinsAcc - currentMakeupMinsDone));
  }

  if (sheetName === "전체시간표" || sheetName === "전체 시간표") {
    var col = range.getColumn();
    var row = range.getRow();
    if (col === 31) { // AE열 (보강일시)
      var val = range.getValue();
      var statusRange = sheet.getRange(row, 32); // AF열 (보강완료)
      if (val) {
        if (!statusRange.getValue()) statusRange.setValue("보강대기");
      } else {
        statusRange.setValue("");
      }
    } else if (col === 12 && row > 1) { // L열 (결석일자)
      var val = String(range.getValue()).trim();
      var dates = val ? val.split(",").map(function(d) { return d.trim(); }).filter(Boolean) : [];
      syncStudentAbsentMinsOnSheet_(sheet, row, dates.length);
    }
  }
  
  if (sheetName === "출결보강관리" || sheetName === "오늘 출석부" || sheetName === "오늘출석부") {
    var startCol = range.getColumn();
    var endCol = range.getLastColumn();
    var startRow = range.getRow();
    var endRow = range.getLastRow();
    
    // 1. 구글 시트에서 직접 등원여부(E열/5열)를 변경할 때 등원시간(F열/6열) 자동 기입 및 결석일자 동기화
    if (startCol <= 7 && endCol >= 5) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheetStudents = getStudentsSheet_(ss);
      var studentNames = (sheetStudents && sheetStudents.getLastRow() >= 2) ? sheetStudents.getRange(2, 3, sheetStudents.getLastRow() - 1, 1).getValues() : [];
      for (var r = startRow; r <= endRow; r++) {
        if (r > 1) {
          var statusCell = sheet.getRange(r, 5);
          var timeCell = sheet.getRange(r, 6);
          var statusVal = String(statusCell.getValue()).trim();
          var studentName = String(sheet.getRange(r, 3).getValue()).trim();
          
          if ((statusVal === "수업중" || statusVal === "수업 중" || statusVal === "보강 수업중") && !timeCell.getValue()) {
            timeCell.setValue(Utilities.formatDate(new Date(), "Asia/Seoul", "HH:mm"));
          } else if (statusVal === "대기" || statusVal === "결석" || statusVal === "휴강" || !statusVal) {
            timeCell.setValue("");
          }

          if (studentName && sheetStudents && studentNames.length > 0) {
            var studentRowIndex = -1;
            for (var sIdx = 0; sIdx < studentNames.length; sIdx++) {
              if (normName_(studentNames[sIdx][0]) === normName_(studentName)) {
                studentRowIndex = 2 + sIdx;
                break;
              }
            }
            if (studentRowIndex !== -1) {
              var dateStr = String(sheet.getRange(r, 1).getValue()).trim();
              var match = dateStr.match(/(\d+)\/(\d+)(월|화|수|목|금|토|일)/);
              var today = new Date();
              var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
              var formattedAbsence = match ? (match[1] + "/" + match[2] + "(" + match[3] + ")") : ((today.getMonth() + 1) + "/" + today.getDate() + "(" + weekdays[today.getDay()] + ")");
              var absentCell = sheetStudents.getRange(studentRowIndex, 12);
              var currentAbsences = String(absentCell.getValue() || "").trim();
              var datesList = currentAbsences ? currentAbsences.split(",").map(function(d) { return d.trim(); }).filter(Boolean) : [];

              if (statusVal === "결석") {
                var cleanTargetAbs = formattedAbsence.replace(/\s+/g, "");
                var alreadyExists = datesList.some(function(d) { return d.replace(/\s+/g, "").indexOf(cleanTargetAbs) !== -1; });
                if (!alreadyExists) {
                  datesList.push(formattedAbsence);
                  var newAbsencesVal = datesList.join(", ");
                  absentCell.setValue(newAbsencesVal);
                  formatAbsentCell(absentCell, newAbsencesVal);
                }
                syncStudentAbsentMinsOnSheet_(sheetStudents, studentRowIndex, datesList.length);
              } else {
                var cleanAbsence = formattedAbsence.replace(/~/g, "").replace(/\s+/g, "");
                var filteredList = datesList.filter(function(d) { return d.replace(/~/g, "").replace(/\s+/g, "").indexOf(cleanAbsence) === -1; });
                if (filteredList.length !== datesList.length) {
                  var newAbsencesVal = filteredList.join(", ");
                  absentCell.setValue(newAbsencesVal);
                  formatAbsentCell(absentCell, newAbsencesVal);
                  syncStudentAbsentMinsOnSheet_(sheetStudents, studentRowIndex, filteredList.length);
                }
              }
            }
          }
          
          try {
            processMakeupBankOnSheetEdit(sheet, r);
          } catch(err) {
            console.error("Direct sheet edit deduction failed for row " + r + ": " + err);
          }
        }
      }
    }
    
    // 2. 등원여부(E열/5열) 수업완료 변경 또는 숫자·이벤트·진단·수업내용(8~11열) 입력 시 [학습기록] 및 [회원 분석] 시트로 자동 누적 (다중 행 편집 시 1회 일괄 처리)
    if (startCol <= 11 && endCol >= 5) {
      accumulateDailyRowsBatch_(sheet, startRow, endRow);
    }
  } else if (sheetName === "학생수업관리" || sheetName === "누적일일수업관리" || sheetName === "출석부 누적 관리" || sheetName === "출석부누적관리") {
    if (range.getColumn() <= 11 && range.getLastColumn() >= 5) {
      accumulateDailyRowsBatch_(sheet, range.getRow(), range.getLastRow());
    }
  }
}

// 상단 스프레드시트 메뉴 트리거 설정
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("♣ 학원 연동 메뉴")
    .addItem("1. 출결보강관리 생성 (기존 기록 누적 백업)", "generateDailyAttendance")
    .addItem("2. 오늘 시간표 보드 생성", "generateWeeklyTimetable")
    .addItem("3. 연동 시트 초기 셋업", "setupSheetsAndHeaders")
    .addItem("4. 한명 검색 시트 만들기", "createSingleSearchSheet")
    .addItem("5. 매일 밤 9시 30분 자동 생성 설정", "createDailyAttendanceTrigger")
    .addItem("6. 오늘 출석부 보강 은행 미차감 정산", "runMakeupBankRecovery")
    .addItem("7. 오늘 출석부 ➔ [학습기록]·회원분석 1회 일괄(Bulk) 동기화", "syncTodayDailyEventsToMemberAnalysis")
    .addItem("8. 어휘·학습기록(23열)·학생분석표 셋업 및 자동변환", "vocabSetupSheets")
    .addItem("9. 오답 복습지 PDF 만들기 (학생분석표 기준)", "vocabMakeReviewPdf")
    .addItem("10. 📊 학부모 발송용 학생 분석표 PDF 만들기 (학생분석표 기준)", "vocabMakeAnalysisReportPdf")
    .addItem("11. 어휘 갱신 (학생앱에 반영)", "vocabBumpVersion")
    .addItem("12. 📨 오늘 수업 브리핑 문구 창 띄우기", "showDailyBriefingModal")
    .addItem("13. [학습기록](23열) 헤더 및 열 정렬 1회 일괄(Bulk) 보정", "fixAndAlignLearningRecordHeadersAndRowsBulk")
    .addItem("14. [학습기록] 헤더 점검 (읽기 전용)", "vocabCheckRecordHeadersMenu")
    .addToUi();
}

// [핵심 규정 준수] 오늘 출석부 및 학생수업관리(어제/최근) 전체 행을 스캔하여 [학습기록](23열) 및 [회원 분석] 시트로 1회 일괄(Bulk) 동기화하는 함수
function syncTodayDailyEventsToMemberAnalysis(optOnlyCurrentDailySheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetDaily = getDailySheet_(ss);
  var sheetAcc = getAccumulatedSheet_(ss);
  var dailyRowsToSync = [];
  var seenRowKey = {};

  function pushUniqueRow(rowArr) {
    if (!rowArr) return;
    var nm = normName_(rowArr[2]);
    if (!nm || nm === "이름") return;
    var key = parseDailyDateToIso_(rowArr[0]) + "||" + nm + "||" + String(rowArr[9] || "").trim() + "||" + String(rowArr[10] || "").trim();
    if (seenRowKey[key]) return;
    seenRowKey[key] = true;
    dailyRowsToSync.push(rowArr);
  }

  if (sheetDaily && sheetDaily.getLastRow() >= 2) {
    var dVals = sheetDaily.getRange(2, 1, sheetDaily.getLastRow() - 1, 11).getDisplayValues();
    for (var i = 0; i < dVals.length; i++) pushUniqueRow(dVals[i]);
  }

  if (!optOnlyCurrentDailySheet && sheetAcc && sheetAcc.getLastRow() >= 2) {
    var checkCount = Math.min(300, sheetAcc.getLastRow() - 1);
    var accVals = sheetAcc.getRange(2, 1, checkCount, 11).getDisplayValues();
    var cutoffIso = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), Session.getScriptTimeZone(), "yyyy-MM-dd");
    for (var j = 0; j < accVals.length; j++) {
      if (parseDailyDateToIso_(accVals[j][0]) >= cutoffIso) pushUniqueRow(accVals[j]);
    }
  }

  var syncCount = syncDailyRowsArrayToRecordsAndMember_(ss, sheetDaily, dailyRowsToSync);

  if (!optOnlyCurrentDailySheet) {
    alignLearningRecordColumnsBulk_(vocabEnsureRecordSheet_(ss));
    vocabClearSystemAlert_("rolloverSync");
    try {
      SpreadsheetApp.getUi().alert(
        "🎉 동기화 완료!\n\n" +
        "출석부 수업완료 학생 " + syncCount + "명의 독서·어휘·트레이닝·발자국 기록이\n" +
        "[학습기록](23열) 시트 상단 및 [회원 분석] 시트에 1회 일괄(Bulk)로 즉시 반영되었습니다! ✨"
      );
    } catch (uiErr) {
      Logger.log("syncTodayDailyEventsToMemberAnalysis 완료: " + syncCount + "건 동기화");
    }
  }
}

// [핵심 규정 준수] 오늘 출석부 전체 데이터를 [회원 분석] 시트와 1회 일괄(Bulk)로 동기화 (반복문 내 getValues 0회! G~L열만 부분 업데이트)
function syncDailyEventsToMemberAnalysisBulk_(ss, sheetDaily, sheetMember, dailyValues) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    Logger.log("syncDailyEventsToMemberAnalysisBulk_ lock timeout: " + lockErr);
  }
  try {
    var memberLastRow = sheetMember.getLastRow();
    if (memberLastRow < 2) return;

    var memberData = sheetMember.getRange(2, 1, memberLastRow - 1, 16).getValues();
    var memberMap = {};
    for (var m = 0; m < memberData.length; m++) {
      var mName = normName_(memberData[m][1]);
      if (mName) memberMap[mName] = m;
    }

    // [핵심 성능 최적화] [학습기록] 23열 시트를 반복문 밖에서 단 1회만 읽어 메모리 배열(cachedRecVals)로 재사용
    var cachedRecVals = null;
    var rs = getRecordSheetReadOnly_(ss);
    if (rs && rs.getLastRow() >= 2) {
      var numRows = Math.min(rs.getLastRow() - 1, 800);
      var colCount = Math.min(Math.max(rs.getLastColumn(), 18), 23);
      cachedRecVals = rs.getRange(2, 1, numRows, colCount).getValues();
    }

    var yy = "26";
    try {
      yy = String(new Date().getFullYear()).substring(2);
    } catch (err) {}

    var splitRegex = /[\n,;]+/;
    var modifiedAny = false;

    for (var r = 0; r < dailyValues.length; r++) {
      var row = dailyValues[r];
      var dateStr = String(row[0] || "").trim();
      var name = String(row[2] || "").trim();
      var numVal = String(row[7] || "").trim();
      var eventVal = String(row[8] || "").trim();
      var grammarDoneVal = String(row[9] || "").trim();
      var contentsVal = String(row[10] || "").trim();

      if (!name || (!numVal && !eventVal && !grammarDoneVal && !contentsVal)) continue;

      var cleanName = normName_(name);
      var mIdx = memberMap[cleanName];
      if (mIdx === undefined) {
        for (var mk in memberMap) {
          if (isSameStudentNameInGAS(mk, name)) {
            mIdx = memberMap[mk];
            break;
          }
        }
      }
      if (mIdx === undefined) continue;

      var mdMatch = dateStr.match(/(\d+\/\d+)/);
      var dateFormatted = mdMatch ? mdMatch[1] : ((new Date().getMonth() + 1) + "/" + new Date().getDate());
      var eventDatePrefix = yy + "." + dateFormatted;

      var numLines = numVal ? numVal.split(splitRegex).map(function(s) { return s.trim(); }).filter(Boolean) : [];
      var eventLines = eventVal ? eventVal.split(splitRegex).map(function(s) { return s.trim(); }).filter(Boolean) : [];
      var grammarLines = grammarDoneVal ? grammarDoneVal.split(splitRegex).map(function(s) { return s.trim(); }).filter(Boolean) : [];

      var maxLen = Math.max(numLines.length, eventLines.length);
      var groupMap = { 7: [], 8: [], 10: [], 11: [], 12: [] };

      for (var idx = 0; idx < maxLen; idx++) {
        var num = numLines[idx] || "";
        var ev = eventLines[idx] || "";
        if (!num && !ev) continue;
        var textToAppend = eventDatePrefix;
        if (num) textToAppend += " " + num;
        if (ev) textToAppend += " " + ev;

        var targetCol = 8;
        var lowerEvent = ev.toLowerCase();
        if (lowerEvent.indexOf("코스업") !== -1 || lowerEvent.indexOf("레벨업") !== -1 || lowerEvent.indexOf("진로검사") !== -1) {
          targetCol = 8;
        } else if (lowerEvent.indexOf("진단") !== -1 || lowerEvent.indexOf("진도") !== -1) {
          targetCol = 7;
        } else if (lowerEvent.indexOf("숙제교재") !== -1 || lowerEvent.indexOf("훈민정음") !== -1 || lowerEvent.indexOf("한자") !== -1 || lowerEvent.indexOf("교재") !== -1) {
          targetCol = 10;
        } else if (lowerEvent.indexOf("독서계획표") !== -1 || lowerEvent.indexOf("친구") !== -1 || lowerEvent.indexOf("탐험가") !== -1 || lowerEvent.indexOf("고수") !== -1 || lowerEvent.indexOf("챔피언") !== -1 || lowerEvent.indexOf("마스터") !== -1 || lowerEvent.indexOf("달성") !== -1 || lowerEvent.indexOf("스티커") !== -1) {
          targetCol = 12;
        } else if (lowerEvent.indexOf("읽트") !== -1 || lowerEvent.indexOf("독트") !== -1 || lowerEvent.indexOf("읽기") !== -1 || lowerEvent.indexOf("독서") !== -1) {
          targetCol = 11;
        } else {
          targetCol = 8;
        }
        groupMap[targetCol].push(textToAppend);
      }

      for (var g = 0; g < grammarLines.length; g++) {
        var item = grammarLines[g];
        var isCompletion = (item.indexOf("글완") !== -1 || item.indexOf("글쓰기완") !== -1 || item.indexOf("완료") !== -1);
        var hasDigit = /\d+/.test(item);

        var entryToAppend = "";
        if (isCompletion) {
          var cleanBookAndScore = item.replace(/글완|글쓰기완료|글쓰기완|완료/g, "").trim();
          entryToAppend = eventDatePrefix + " " + cleanBookAndScore + " 글완";
        } else if (hasDigit) {
          var datePattern = /^\d+[\./]\d+/;
          if (datePattern.test(item)) {
            entryToAppend = /^\d+\/\d+/.test(item) ? (yy + "." + item) : item;
          } else {
            entryToAppend = eventDatePrefix + " " + item;
          }
        } else if (item.trim()) {
          entryToAppend = eventDatePrefix + " " + item.trim();
        }

        if (entryToAppend) {
          groupMap[7].push(entryToAppend);
        }
      }

      // G열 (전광판) - cachedRecVals 전달로 반복문 내 시트 조회 제거
      var currentG = String(memberData[mIdx][6] || "").trim();
      var newColG = composeMemberColGBoard_(ss, name, currentG, groupMap[7], eventDatePrefix, cachedRecVals);
      memberData[mIdx][6] = newColG;
      modifiedAny = true;

      // H열 (7), J열 (9), K열 (10), L열 (11)
      var colPairs = [[8, 7], [10, 9], [11, 10], [12, 11]];
      for (var cp = 0; cp < colPairs.length; cp++) {
        var mapKey = colPairs[cp][0];
        var dataIdx = colPairs[cp][1];
        var cellText = String(memberData[mIdx][dataIdx] || "").trim();
        var cLines = cellText ? cellText.split("\n") : [];
        var fLines = [];
        for (var cl = 0; cl < cLines.length; cl++) {
          if (cLines[cl].trim() && cLines[cl].trim().indexOf(eventDatePrefix) !== 0) {
            fLines.push(cLines[cl]);
          }
        }
        var newEvs = groupMap[mapKey] || [];
        for (var ne = 0; ne < newEvs.length; ne++) {
          fLines.push(newEvs[ne]);
        }
        memberData[mIdx][dataIdx] = fLines.join("\n");
      }
    }

    // [성능/동시성 보호] A~F열, M~P열은 건드리지 않고 실제 변경 대상인 G~L열(7~12열, 총 6개 컬럼)만 1회 일괄(Bulk) 쓰기
    if (modifiedAny) {
      var gToLData = [];
      for (var rowIdx = 0; rowIdx < memberData.length; rowIdx++) {
        gToLData.push([
          memberData[rowIdx][6],
          memberData[rowIdx][7],
          memberData[rowIdx][8],
          memberData[rowIdx][9],
          memberData[rowIdx][10],
          memberData[rowIdx][11]
        ]);
      }
      sheetMember.getRange(2, 7, gToLData.length, 6).setValues(gToLData);
    }
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// 매일 밤 9시 30분(21:30) 및 아침 6시(06:00 백업)에 출석부를 자동으로 생성하도록 이중 안전 트리거를 등록하는 함수
function createDailyAttendanceTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "generateDailyAttendance") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // 1차 주력 트리거: 매일 밤 9시 30분 (내일 출석부 자동 생성)
  ScriptApp.newTrigger("generateDailyAttendance")
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .nearMinute(30)
    .create();
  // 2차 백업 트리거: 매일 아침 6시 00분 (혹시 밤 트리거가 지연되었을 경우 자동 복구)
  ScriptApp.newTrigger("generateDailyAttendance")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(0)
    .create();
  SpreadsheetApp.getUi().alert("매일 밤 9시 30분(주력) + 아침 6시(백업) 자동 출석부 생성 이중 안전 트리거가 등록되었습니다! ⏰");
}

// 구글 시트에서 직접 등원여부를 '수업완료'/'보강완료'로 변경하거나 보강사유를 넣었을 때 실시간 보강 은행 정산
function processMakeupBankOnSheetEdit(sheet, r) {
  var statusCell = sheet.getRange(r, 5);
  var reasonCell = sheet.getRange(r, 7);
  var statusVal = String(statusCell.getValue()).trim();
  var reasonVal = String(reasonCell.getValue()).trim();
  var studentName = String(sheet.getRange(r, 3).getValue()).trim();
  
  if (!studentName) return;
  if (statusVal !== "수업완료" && statusVal !== "보강완료") return;
  if (!reasonVal || reasonVal.indexOf("[차감완료]") !== -1) return;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetStudents = getStudentsSheet_(ss);
  if (!sheetStudents) return;
  
  var lastRowSt = sheetStudents.getLastRow();
  if (lastRowSt < 2) return;
  
  var studentData = sheetStudents.getRange(2, 1, lastRowSt - 1, 36).getValues();
  var studentRowIndex = -1;
  var studentRowData = null;
  for (var sIdx = 0; sIdx < studentData.length; sIdx++) {
    if (normName_(studentData[sIdx][2]) === normName_(studentName)) {
      studentRowIndex = 2 + sIdx;
      studentRowData = studentData[sIdx];
      break;
    }
  }
  
  if (studentRowIndex === -1 || !studentRowData) return;
  
  // 단일 헬퍼(applyMakeupDeductionToStudentRow_)로 차감 계산 통일
  var result = applyMakeupDeductionToStudentRow_(studentRowData, reasonVal);
  if (!result.applied) return;
  
  sheetStudents.getRange(studentRowIndex, 34).setValue(studentRowData[33]);
  sheetStudents.getRange(studentRowIndex, 35).setValue(studentRowData[34]);
  sheetStudents.getRange(studentRowIndex, 12).setValue(studentRowData[11]);
  
  if (result.isMakeup) {
    sheetStudents.getRange(studentRowIndex, 32).setValue("보강완료");
  }
  if (result.isExtension || result.todayExt > 0) {
    sheetStudents.getRange(studentRowIndex, 36).setValue(0);
  }
  
  reasonCell.setValue(reasonVal + " [차감완료]");
}

// 전체시간표의 결석 누적분(AG열) 전수 계산 및 오늘 출석부 보강 은행 차감 일괄 정산 함수 (단 1회 Bulk 읽기/쓰기)
function runMakeupBankRecovery() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetStudents = getStudentsSheet_(ss);
  var updatedStudentsCount = 0;
  var stData = [];
  var stMap = {};

  if (sheetStudents && sheetStudents.getLastRow() >= 2) {
    ensureColumns(sheetStudents, 36);
    var lastRowSt = sheetStudents.getLastRow();
    stData = sheetStudents.getRange(2, 1, lastRowSt - 1, 36).getValues();
    for (var i = 0; i < stData.length; i++) {
      var stRow = stData[i];
      var sName = normName_(stRow[2]);
      if (sName && stMap[sName] === undefined) stMap[sName] = i;

      var absentDatesStr = String(stRow[11] || "").trim(); // Col L (12)
      if (absentDatesStr) {
        var datesList = absentDatesStr.split(",").map(function(d) { return d.trim(); }).filter(Boolean);
        if (datesList.length > 0) {
          var baseDuration = getStudentBaseDuration_(stRow[3], stRow[1]);
          var newAbsentMinsAcc = datesList.length * baseDuration;
          var currentMakeupMinsDone = parseInt(stRow[33] || "0", 10) || 0; // Col AH (34)
          stRow[32] = newAbsentMinsAcc; // Col AG (33)
          stRow[34] = Math.max(0, newAbsentMinsAcc - currentMakeupMinsDone); // Col AI (35)
          updatedStudentsCount++;
        }
      }
    }
  }

  // 2. 오늘 출석부의 보강 수업/연장 차감 일괄 정산 (메모리 계산 후 1회 Bulk 반영)
  var sheet = getDailySheet_(ss);
  var count = 0;
  if (sheet && sheet.getLastRow() >= 2 && stData.length > 0) {
    var lastRow = sheet.getLastRow();
    var dailyData = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var dailyModified = false;
    for (var r = 0; r < dailyData.length; r++) {
      var dRow = dailyData[r];
      var studentName = normName_(dRow[2]);
      var statusVal = String(dRow[4] || "").trim();
      var reasonVal = String(dRow[6] || "").trim();
      if (!studentName || (statusVal !== "수업완료" && statusVal !== "보강완료") || !reasonVal || reasonVal.indexOf("[차감완료]") !== -1) continue;
      var stIdx = stMap[studentName];
      if (stIdx === undefined) continue;

      var sRow = stData[stIdx];
      var deductRes = applyMakeupDeductionToStudentRow_(sRow, reasonVal);
      if (!deductRes.applied) continue;

      dRow[6] = reasonVal + " [차감완료]";
      dailyModified = true;
      count++;
    }
    if (dailyModified) {
      sheet.getRange(2, 1, dailyData.length, 7).setValues(dailyData);
    }
  }

  if (sheetStudents && stData.length > 0 && (updatedStudentsCount > 0 || count > 0)) {
    sheetStudents.getRange(2, 1, stData.length, 36).setValues(stData);
  }

  SpreadsheetApp.getUi().alert("보강 은행 일괄 정산 완료!\n- 전체시간표 결석 누적분(AG열) 갱신: " + updatedStudentsCount + "명\n- 오늘 출석부 보강 차감 완료: " + count + "건 🍀");
}

// ============================================================
// 어휘 학습 연동 (구글 시트 3장: 어휘 / 학습기록 / 학생분석표)
//  - 학생앱 ➔ doPost(action: "addLearningRecord") ➔ [학습기록] 시트에 한 줄씩 저장
//  - 학생앱 ➔ doGet(?action=getVocabIndex | getVocab&level=1레벨) ➔ [어휘] 시트 내용을 JSON으로 제공
//  - 시트 메뉴 ➔ 어휘 시트 셋업 / 오답 복습지 PDF 만들기 / 어휘 갱신
//  (기존 코드는 ES5(var/function) 방식이라 같은 방식으로 작성함)
// ============================================================
var VOCAB_SHEET = "어휘";
var RECORD_SHEET = "학습기록";
var ANALYSIS_SHEET = "학생분석표";
var LITERACY_ANALYSIS_SHEET = "문해력전용분석표";
var VOCAB_HEADERS = ["어휘ID", "구분", "책", "도서ID", "어휘", "활용형", "뜻", "예문", "출처", "사용"];
// [[방안 A] 23열 확장 확정] 기존 A~R열(1~18열) 100% 보존 + 우측 끝 S~W열(19~23열: 독해문항수, 독해오답수, 어휘문항수, 어휘오답수, 문해력정답률) 추가
var RECORD_HEADERS = [
  "날짜", "이름", "숙제현황", "성실발자국", "레벨구분", "도서명/어휘학습",
  "어휘문제", "어휘정답", "어휘정답률", "진단점수", "독서발자국",
  "트레이닝", "권수/차시", "오답개수", "이해도", "문해력발자국",
  "나의 시간, 나의 기록", "틀린어휘",
  "독해문항수", "독해오답수", "어휘문항수", "어휘오답수", "문해력정답률"
];
var VOCAB_LEVELS = ["기초", "1레벨", "2레벨", "3레벨", "4레벨", "5레벨", "6레벨", "7레벨", "단편4", "단편5", "단편6", "단편7", "단편8", "초1~2", "초3~4", "초5~6", "중1~3"];
var HW_STATUS_LIST = ["숙제완료", "숙제미완", "미지참", "학원에서풀기"];
var TRAINING_TYPE_LIST = ["읽기트레이닝", "독해트레이닝", "듣기트레이닝", "문해력트레이닝", "오답수정+선지분석", "독해밀도", "개념밀도"];
var UNDERSTANDING_LIST = ["잘 이해했어요", "보통이에요", "아직 헷갈려요"];

function vocabJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function vocabNum_(v) {
  if (v === "" || v === null || v === undefined) return "";
  var n = Number(v);
  return isFinite(n) ? n : "";
}

// [숙제현황 단일 규격 정규화] "완료"->"숙제완료", "미완료"/"미완"->"숙제미완", "학원에서 풀기"->"학원에서풀기"
function vocabNormHwStatus_(v) {
  var s = String(v || "").trim();
  if (!s) return "";
  var noSpace = s.replace(/\s+/g, "");
  if (noSpace === "완료" || noSpace === "숙제완료") return "숙제완료";
  if (noSpace === "미완료" || noSpace === "미완" || noSpace === "숙제미완료" || noSpace === "숙제미완") return "숙제미완";
  if (noSpace === "미지참" || noSpace === "교재미지참") return "미지참";
  if (noSpace === "학원에서풀기" || noSpace === "학원풀이") return "학원에서풀기";
  return s;
}

// [이해도 단일 규격 정규화] "어려웠어요" -> "아직 헷갈려요" 등 드롭다운 칩과 일치
function vocabNormUnderstanding_(v) {
  var s = String(v || "").trim();
  if (!s) return "";
  if (s === "어려웠어요" || s === "헷갈려요") return "아직 헷갈려요";
  return s;
}

// [레벨구분 단일 규격 정규화] "4-4"->"4레벨", "2-4"->"2레벨", "기초 씨앗"->"기초" 등 E열 드롭다운 칩과 100% 일치
function vocabNormLevel_(v) {
  var s = String(v || "").trim();
  if (!s) return "";
  if (/^기초/.test(s)) return "기초";
  var sm = s.match(/^단편\s*([4-8])(?:\s*레벨)?$/);
  if (sm) return "단편" + sm[1];
  var m = s.match(/^([1-7])(?:-[1-4]|\s*레벨|L)?$/i);
  if (m) return m[1] + "레벨";
  if (/^초\s*1\s*[~\-]\s*2/.test(s)) return "초1~2";
  if (/^초\s*3\s*[~\-]\s*4/.test(s)) return "초3~4";
  if (/^초\s*5\s*[~\-]\s*6/.test(s)) return "초5~6";
  if (/^중\s*1\s*[~\-]\s*3/.test(s)) return "중1~3";
  return s;
}

// [드롭다운 칩 색상 영구 보존] C(3:숙제현황), E(5:레벨구분), L(12:트레이닝), O(15:이해도) 열의 기존 드롭다운 규칙이 있으면
// PASTE_DATA_VALIDATION으로만 전파하여 원장님이 설정한 드롭다운 칩 배경·글자 색상을 100% 보존하고, 아예 없을 때만 초기 생성
function vocabPreserveOrInitDropdowns_(sheet, targetRowCount) {
  if (!sheet) return;
  var lastRow = Math.max(sheet.getLastRow(), targetRowCount || 2, 2);
  var numRows = Math.max(1, lastRow - 1);
  var dropdownSpecs = [
    { col: 3, list: HW_STATUS_LIST },
    { col: 5, list: VOCAB_LEVELS },
    { col: 12, list: TRAINING_TYPE_LIST },
    { col: 15, list: UNDERSTANDING_LIST }
  ];
  var scanRows = Math.min(numRows, 25);
  for (var i = 0; i < dropdownSpecs.length; i++) {
    var spec = dropdownSpecs[i];
    var col = spec.col;
    var targetRange = sheet.getRange(2, col, numRows, 1);
    var rules = sheet.getRange(2, col, scanRows, 1).getDataValidations();
    var donorRow = -1;
    var allHaveRule = (scanRows === numRows);
    for (var r = 0; r < rules.length; r++) {
      if (rules[r][0] != null) {
        if (donorRow === -1) donorRow = 2 + r;
      } else {
        allHaveRule = false;
      }
    }
    if (donorRow !== -1) {
      if (!allHaveRule || numRows > scanRows) {
        sheet.getRange(donorRow, col, 1, 1).copyTo(
          targetRange,
          SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
          false
        );
      }
    } else {
      var initRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(spec.list, true)
        .setAllowInvalid(true)
        .build();
      targetRange.setDataValidation(initRule);
    }
  }
}

// 오답 개수 문자열 결합 버그('10/2' -> 102, '10080') 방지 파서
function vocabParseErrorNum_(v) {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "number") return (v >= 0 && v <= 100) ? v : 0;
  var s = String(v).trim();
  if (!s) return "";
  var slashMatch = s.match(/^\s*(\d+)\s*\/\s*(\d+)/);
  if (slashMatch) {
    var n1 = parseInt(slashMatch[1], 10);
    var n2 = parseInt(slashMatch[2], 10);
    if (n2 <= n1 && n2 < 50) return n2;
    return n1 < 50 ? n1 : 0;
  }
  var jungMatch = s.match(/중\s*(\d+)/);
  if (jungMatch) return parseInt(jungMatch[1], 10) || 0;
  var numMatch = s.match(/(\d+)/);
  if (!numMatch) return "";
  var val = parseInt(numMatch[1], 10);
  if (isNaN(val)) return "";
  // 기존에 잘못 들어간 '10080', '101' 같은 비정상 오답수 자동 보정
  if (val > 50) {
    if (s.length === 3 && s.charAt(0) === "1" && s.charAt(1) === "0") return parseInt(s.charAt(2), 10);
    return 0;
  }
  return val;
}

function isLearningRecordDatePattern_(v) {
  if (!v) return false;
  if (v instanceof Date) return true;
  var s = String(v).trim();
  return /^20\d{2}[\.\/-]\s*\d{1,2}[\.\/-]\s*\d{1,2}/.test(s);
}

function vocabParseDate_(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  var str = String(s || "").trim();
  var mFull = str.match(/^(\d{4})[\.\/-]\s*(\d{1,2})[\.\/-]\s*(\d{1,2})/);
  if (mFull) {
    return new Date(parseInt(mFull[1], 10), parseInt(mFull[2], 10) - 1, parseInt(mFull[3], 10));
  }
  var mMd = str.match(/^(\d{1,2})[\/\.](\d{1,2})/);
  if (mMd) {
    var curYear = new Date().getFullYear();
    return new Date(curYear, parseInt(mMd[1], 10) - 1, parseInt(mMd[2], 10));
  }
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function vocabFmtDate_(d) {
  if (!(d instanceof Date)) d = vocabParseDate_(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function parseDailyDateToIso_(dateStr) {
  return vocabFmtDate_(vocabParseDate_(dateStr));
}

function vocabNormBook_(s) {
  var str = String(s || "").trim();
  if (!str) return "";
  return str
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\((?:독서중|독서\s*대기|독서완료|요약하기|어휘학습|책소개|[^\)]*쪽|\d+\s*~\s*\d+)\)/g, "")
    .replace(/^(?:[1-6]-[1-4]\s*)?(?:노랑|초록|파랑|빨강|보라|주황|연두|하늘|분홍|남색|갈색)?\s*/, "")
    .replace(/[^\w\uAC00-\uD7A3]/g, "")
    .toLowerCase();
}

function areBooksFuzzyMatch_(b1, b2) {
  if (!b1 || !b2) return false;
  var s1 = vocabNormBook_(b1);
  var s2 = vocabNormBook_(b2);
  if (s1 === s2) return true;
  if ((s1.indexOf("인사") !== -1 || s1.indexOf("인싸") !== -1) && (s2.indexOf("인사") !== -1 || s2.indexOf("인싸") !== -1)) {
    if (s1.replace(/인사|인싸/g, "") === s2.replace(/인사|인싸/g, "")) return true;
  }
  if (s1.length >= 5 && s2.length >= 5 && (s1.indexOf(s2) !== -1 || s2.indexOf(s1) !== -1)) return true;
  return false;
}

// ---------- 어휘 읽기 (학생앱이 요청) ----------
function vocabVersion_() {
  return PropertiesService.getScriptProperties().getProperty("vocabVersion") || "1";
}

// 메뉴 [어휘 갱신]: 시트에서 어휘를 고친 뒤 실행하면 학생앱이 새 내용을 받아 감
function vocabBumpVersion() {
  PropertiesService.getScriptProperties().setProperty("vocabVersion", String(new Date().getTime()));
  SpreadsheetApp.getUi().alert("어휘 갱신 완료!\n학생앱은 다음 접속부터 [어휘] 시트의 최신 내용을 받아 갑니다.");
}

function vocabReadRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VOCAB_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var use = String(v[9] === "" ? "O" : v[9]).trim().toUpperCase();
    if (use === "X") continue;                       // 사용 = X 는 문제에서 제외
    var word = String(v[4] || "").trim();
    var meaning = String(v[6] || "").trim();
    if (!word || !meaning) continue;
    rows.push({ level: String(v[1] || "").trim(), title: String(v[2] || "").trim(), w: word, f: String(v[5] || "").trim() || word, m: meaning, e: String(v[7] || "").trim() });
  }
  return rows;
}

function vocabGroupBooks_(rows) {
  var order = [], map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = r.level + "|" + r.title;
    if (!map[key]) { map[key] = { level: r.level, title: r.title, words: [] }; order.push(key); }
    map[key].words.push({ w: r.w, f: r.f, m: r.m, e: r.e });
  }
  var books = [];
  for (var k = 0; k < order.length; k++) books.push(map[order[k]]);
  return books;
}

// CacheService 는 값 하나당 100KB 제한이라 조각내어 저장
function vocabCachePut_(key, obj) {
  try {
    var json = JSON.stringify(obj);
    var size = 20000, parts = {}, n = 0;
    for (var p = 0; p < json.length; p += size) { parts[key + "#" + n] = json.substring(p, p + size); n++; }
    parts[key + "#n"] = String(n);
    CacheService.getScriptCache().putAll(parts, 21600);
  } catch (err) { /* 캐시 실패는 무시 (시트를 직접 읽으면 됨) */ }
}

function vocabCacheGet_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var n = cache.get(key + "#n");
    if (!n) return null;
    var names = [];
    for (var i = 0; i < Number(n); i++) names.push(key + "#" + i);
    var got = cache.getAll(names);
    var json = "";
    for (var j = 0; j < names.length; j++) {
      if (got[names[j]] === undefined) return null;
      json += got[names[j]];
    }
    return JSON.parse(json);
  } catch (err) { return null; }
}

function vocabGetIndex_() {
  var key = "vocabIdx_" + vocabVersion_();
  var cached = vocabCacheGet_(key);
  if (cached) return cached;
  var books = vocabGroupBooks_(vocabReadRows_());
  var items = [];
  for (var i = 0; i < books.length; i++) items.push({ t: books[i].title, l: books[i].level, n: books[i].words.length });
  var out = { type: "vocabIndex", version: vocabVersion_(), items: items };
  vocabCachePut_(key, out);
  return out;
}

function vocabGetLevel_(level) {
  var rawLv = String(level || "").trim();
  var normLv = vocabNormLevel_(rawLv);
  if (VOCAB_LEVELS.indexOf(rawLv) === -1 && VOCAB_LEVELS.indexOf(normLv) === -1) {
    return { type: "vocabError", error: "unknown level: " + rawLv };
  }
  var key = "vocabLv_" + vocabVersion_() + "_" + rawLv;
  var cached = vocabCacheGet_(key);
  if (cached) return cached;
  var allRows = vocabReadRows_();
  var rows = allRows.filter(function (r) { return r.level === rawLv; });
  if (rows.length === 0 && normLv !== rawLv) {
    rows = allRows.filter(function (r) { return r.level === normLv || vocabNormLevel_(r.level) === normLv; });
  }
  var out = { type: "vocabLevel", version: vocabVersion_(), level: rawLv, books: vocabGroupBooks_(rows) };
  vocabCachePut_(key, out);
  return out;
}

// doGet(e) 맨 앞에서 호출: 어휘 요청이면 응답을 돌려주고, 아니면 null(기존 동작 그대로)
function handleVocabGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action !== "getVocab" && action !== "getVocabIndex") return null;
  var out;
  try {
    out = (action === "getVocabIndex") ? vocabGetIndex_() : vocabGetLevel_(String(e.parameter.level || ""));
  } catch (err) {
    out = { type: "vocabError", error: String(err) };
  }
  return vocabJson_(out);
}

// ---------- 학습기록 23열([방안 A]) 시트 준비 · 서식 · 기존 18열 호환 ----------
function vocabStyleRecordSheet_(sheet) {
  ensureColumns(sheet, 23);
  var maxRows = Math.max(sheet.getMaxRows(), 500);
  sheet.getRange(1, 1, 1, RECORD_HEADERS.length)
    .setValues([RECORD_HEADERS])
    .setFontWeight("bold")
    .setBackground("#1e3a8a")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.getRange(1, 19, 1, 5).setBackground("#312e81");
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  var widths = [95, 78, 100, 145, 78, 165, 68, 68, 78, 72, 145, 115, 145, 68, 105, 150, 175, 165, 76, 76, 76, 76, 86];
  for (var c = 0; c < widths.length; c++) {
    sheet.setColumnWidth(c + 1, widths[c]);
  }

  var dataRows = Math.max(1, maxRows - 1);
  sheet.getRange(2, 1, dataRows, 1).setNumberFormat("yyyy-mm-dd").setHorizontalAlignment("center");
  sheet.getRange(2, 2, dataRows, 2).setHorizontalAlignment("center");
  sheet.getRange(2, 5, dataRows, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 7, dataRows, 4).setHorizontalAlignment("center");
  sheet.getRange(2, 12, dataRows, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 14, dataRows, 2).setHorizontalAlignment("center");
  sheet.getRange(2, 19, dataRows, 5).setHorizontalAlignment("center");

  // [원장님 서식 영구 보존] 기존 드롭다운 칩 색상 규칙이 있으면 PASTE_DATA_VALIDATION으로 보존·전파
  vocabPreserveOrInitDropdowns_(sheet, maxRows);
}

function vocabIsTimeLikeValue_(val) {
  if (!val) return false;
  if (val instanceof Date) return true;
  var s = String(val).trim();
  return s.indexOf("표준시") !== -1 || s.indexOf("GMT") !== -1 || /^(?:오전|오후)?\s*\d{1,2}:\d{2}/.test(s);
}

// [학습기록] 시트의 행들을 최신 날짜·최신 입력이 무조건 상단(2행)에 오도록 정렬 (같은 날짜·학생의 다중 행 순서는 보존)
function vocabSortRecordSheetNewestFirst_(sheet) {
  if (!sheet || sheet.getLastRow() < 3) return;
  ensureColumns(sheet, 23);
  var lastRow = sheet.getLastRow();
  var dateCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var needsSort = false;
  for (var chk = 1; chk < dateCol.length; chk++) {
    var prevD = dateCol[chk - 1][0] ? vocabFmtDate_(dateCol[chk - 1][0]) : "";
    var curD = dateCol[chk][0] ? vocabFmtDate_(dateCol[chk][0]) : "";
    if (prevD && curD && prevD < curD) { needsSort = true; break; }
  }
  if (!needsSort) return;
  var allData = sheet.getRange(2, 1, lastRow - 1, 23).getValues();

  var blocks = [];
  var blockMap = {};
  for (var i = 0; i < allData.length; i++) {
    var r = allData[i];
    var dStr = r[0] ? vocabFmtDate_(r[0]) : "";
    var nm = String(r[1] || "").replace(/\s+/g, "");
    var bKey = dStr + "||" + nm;
    if (!blockMap[bKey]) {
      blockMap[bKey] = { dateStr: dStr, seq: blocks.length, rows: [] };
      blocks.push(blockMap[bKey]);
    }
    blockMap[bKey].rows.push(r);
  }
  blocks.sort(function(a, b) {
    if (a.dateStr !== b.dateStr) return b.dateStr.localeCompare(a.dateStr);
    return b.seq - a.seq;
  });
  var sortedRows = [];
  for (var b = 0; b < blocks.length; b++) {
    for (var rIdx = 0; rIdx < blocks[b].rows.length; rIdx++) {
      sortedRows.push(blocks[b].rows[rIdx]);
    }
  }
  sheet.getRange(2, 1, sortedRows.length, 23).setValues(sortedRows);
}

// [학습기록 게이트키퍼] L열(트레이닝), M열(권수/차시), N열(오답개수), S~W열(독해/어휘 문항·오답·정답률) 강제 분리·정규화
function vocabSanitizeTrainingRecord_(rawTr, rawDet, rawErr, rawRTotal, rawRWrong, rawVTotal, rawVWrong, rawAcc) {
  var tr = String(rawTr || "").trim();
  var dt = String(rawDet || "").trim();
  if (tr === "-") tr = "";
  if (dt === "-") dt = "";

  if (!tr && !dt) {
    return { training: "", detail: "", errors: "", readTotal: "", readWrong: "", litVocabTotal: "", litVocabWrong: "", litAccuracy: "", fieldKey: "" };
  }

  var isStandardTr = (TRAINING_TYPE_LIST.indexOf(tr) !== -1);
  if (!isStandardTr) {
    if (tr === "문해력") {
      tr = "문해력트레이닝";
    } else if (tr === "읽트" || tr === "독서트레이닝") {
      tr = "읽기트레이닝";
    } else if (tr === "독트") {
      tr = "독해트레이닝";
    } else if (tr === "듣트" || tr === "듣기") {
      tr = "듣기트레이닝";
    } else {
      if (!dt || dt === tr) {
        dt = tr;
      }
      var probe = tr + " " + dt;
      if (/오답수정|선지분석|수정\s*:/.test(probe)) {
        tr = "오답수정+선지분석";
      } else if (/^(?:듣트|듣기|문학교훈|시사상식|인물역사|고사성어)/.test(tr) || /^(?:문학교훈|시사상식|인물역사|고사성어)/.test(dt)) {
        tr = "듣기트레이닝";
      } else if (/^(?:읽트|읽기|정독|\d+\s*권|\d+\s*단계\s*\d+\s*호|[A-Z]단계)/.test(tr)) {
        tr = "읽기트레이닝";
      } else if (/^(?:독트|독해트레이닝)/.test(tr)) {
        tr = "독해트레이닝";
      } else if (/^독해밀도/.test(tr)) {
        tr = "독해밀도";
      } else if (/^(?:개념밀도|처음한국사|처음세계사)/.test(tr)) {
        tr = "개념밀도";
      } else {
        tr = "문해력트레이닝";
      }
    }
  } else if (tr === "문해력트레이닝" && /^(?:문학교훈|시사상식|인물역사|고사성어)(?:\s|$)/.test(dt)) {
    tr = "듣기트레이닝";
  }

  var rT = (rawRTotal !== undefined && rawRTotal !== "" && rawRTotal !== "-") ? vocabNum_(rawRTotal) : "";
  var rW = (rawRWrong !== undefined && rawRWrong !== "" && rawRWrong !== "-") ? vocabNum_(rawRWrong) : "";
  var vT = (rawVTotal !== undefined && rawVTotal !== "" && rawVTotal !== "-") ? vocabNum_(rawVTotal) : "";
  var vW = (rawVWrong !== undefined && rawVWrong !== "" && rawVWrong !== "-") ? vocabNum_(rawVWrong) : "";
  var acc = (rawAcc !== undefined && rawAcc !== "" && rawAcc !== "-") ? vocabNum_(rawAcc) : "";
  var err = vocabParseErrorNum_(rawErr);

  var splitM = dt.match(/\(독해\s*(\d+)\s*\/\s*(\d+)\s*[·,]\s*어휘\s*(\d+)\s*\/\s*(\d+)(?:\s*[·,]\s*(\d+)%?)?\)/);
  if (splitM) {
    if (rT === "") rT = parseInt(splitM[1], 10);
    if (rW === "") rW = parseInt(splitM[2], 10);
    if (vT === "") vT = parseInt(splitM[3], 10);
    if (vW === "") vW = parseInt(splitM[4], 10);
    if (acc === "" && splitM[5]) acc = parseInt(splitM[5], 10);
    dt = dt.replace(/\s*\(독해\s*\d+\s*\/\s*\d+\s*[·,]\s*어휘\s*\d+\s*\/\s*\d+(?:\s*[·,]\s*\d+%?)?\)/g, "").trim();
  }

  var slashM = dt.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (slashM) {
    var qTot = parseInt(slashM[1], 10);
    var qErr = parseInt(slashM[2], 10);
    if (err === "") err = qErr;
    if ((tr === "문해력트레이닝" || tr === "독해밀도") && rT === "") {
      rT = qTot;
      rW = qErr;
    }
    dt = dt.replace(/\s*\(\d+\s*\/\s*\d+\)/g, "").trim();
  }

  var errTextM = dt.match(/오답\s*:\s*(\d+)/);
  if (errTextM && err === "") {
    err = parseInt(errTextM[1], 10);
  }

  var sumQ = (Number(rT) || 0) + (Number(vT) || 0);
  var sumW = (rW !== "" || vW !== "") ? ((Number(rW) || 0) + (Number(vW) || 0)) : "";
  if (sumQ > 0) {
    if (acc === "") acc = Math.round(((sumQ - (Number(sumW) || 0)) / sumQ) * 100);
    if (err === "" && sumW !== "") err = sumW;
  }

  dt = dt
    .replace(/^(?:문해력트레이닝|문해력|읽기트레이닝|읽트|독해트레이닝|독트|듣기트레이닝|듣트)\s*/, "")
    .replace(/일차차시/g, "일차")
    .replace(/(?:차시)+/g, "차시")
    .trim();
  if (dt === tr) dt = "";

  var fieldKey = tr;
  if (tr === "문해력트레이닝" && dt) {
    var fm = dt.match(/^(비문학|복합|문학|문법|어휘|음독)/);
    if (fm) {
      fieldKey = tr + ":" + fm[1];
    }
  }

  return {
    training: tr,
    detail: dt,
    errors: err,
    readTotal: rT,
    readWrong: rW,
    litVocabTotal: vT,
    litVocabWrong: vW,
    litAccuracy: acc,
    fieldKey: fieldKey
  };
}

// 미완성 파편('문학 1단계', '문학 5단계', '복합 1단계 1차시', '8권') 대비 완성된 권수/차시('문학 5단계 9차시', '복합 6권 1차시', '8권 2차시') 우선 판별
function isBetterTrainingDetail_(candDt, curDt, candHasSplit, curHasSplit) {
  var c = String(candDt || "").trim();
  var u = String(curDt || "").trim();
  if (!u) return true;
  if (!c) return false;
  if (candHasSplit && !curHasSplit) return true;
  if (!candHasSplit && curHasSplit) return false;
  var cHasSess = /(?:차시|일차|강|회)/.test(c);
  var uHasSess = /(?:차시|일차|강|회)/.test(u);
  if (cHasSess && !uHasSess) return true;
  if (!cHasSess && uHasSess) return false;
  var cIsDefault1 = /\b1단계(?:\s*1차시)?$/.test(c);
  var uIsDefault1 = /\b1단계(?:\s*1차시)?$/.test(u);
  if (!cIsDefault1 && uIsDefault1) return true;
  if (cIsDefault1 && !uIsDefault1) return false;
  return c.length >= u.length;
}

// [학습기록] 23열 단일 행 정규화 헬퍼 (중복 제거: 숙제현황·레벨·이해도·중복복사·트레이닝 분리)
function normalizeRecordRow_(rawRow) {
  var r = (rawRow || []).slice(0, 23);
  while (r.length < 23) r.push("");
  var changed = false;
  for (var colI = 0; colI < 23; colI++) {
    if (String(r[colI]).trim() === "-") {
      r[colI] = "";
      changed = true;
    }
  }
  var rawHw = String(r[2] || "").trim();
  var normHw = vocabNormHwStatus_(rawHw);
  if (rawHw !== normHw) { r[2] = normHw; changed = true; }

  if (r[3] && r[5] && String(r[3]).trim() === String(r[5]).trim()) {
    r[3] = "";
    changed = true;
  }

  var rawLv = String(r[4] || "").trim();
  var normLv = vocabNormLevel_(rawLv);
  if (rawLv !== normLv) { r[4] = normLv; changed = true; }

  // F열(도서명)에 어휘 결과 문자열('초1~2/학습10개/오답0개/... >>코멘트')이 잘못 들어간 경우 E~I열 및 K열로 자동 복구
  var fStr = String(r[5] || "").trim();
  if (fStr.indexOf("/학습") !== -1) {
    var vFixM = fStr.match(/^(?:\[어휘\]\s*)?([^\/]+)\/학습\s*(\d+)개\/오답\s*(\d+)개(?:\/재학습\s*\d+개)?\/?\s*(?:『(.*?)』|([^\s>]+))(?:\s*오답\s*:\s*([^>]+?))?(?:\s*>>\s*(.*))?$/);
    if (vFixM) {
      var vfTot = parseInt(vFixM[2], 10) || 0;
      var vfWr = parseInt(vFixM[3], 10) || 0;
      var vfCor = Math.max(0, vfTot - vfWr);
      r[4] = vocabNormLevel_(vFixM[1]);
      r[5] = (vFixM[4] || vFixM[5] || "").trim();
      r[6] = vfTot;
      r[7] = vfCor;
      r[8] = vfTot > 0 ? Math.round((vfCor / vfTot) * 100) : 0;
      if (vFixM[6] && !r[17]) r[17] = vocabCleanWrongWordsStr_(vFixM[6]);
      var vfMemo = (vFixM[7] || "").trim();
      if (String(r[10] || "").trim() === "[어휘]") r[10] = vfMemo;
      else if (vfMemo) r[10] = (r[10] ? r[10] + " / " : "") + vfMemo;
      changed = true;
    }
  } else if (String(r[10] || "").trim() === "[어휘]") {
    r[10] = "";
    changed = true;
  }

  if (r[10] && r[12] && String(r[10]).trim() === String(r[12]).trim()) {
    r[10] = "";
    changed = true;
  }
  if (r[10]) {
    var cleanK = String(r[10]).replace(/(\[[^\]]+\])\s+\1/g, "$1").replace(/^독서\s*(?:대기|중|완료)\s*,\s*/, "").trim();
    if (cleanK !== String(r[10])) {
      r[10] = cleanK;
      changed = true;
    }
  }

  var rawUnd = String(r[14] || "").trim();
  var normUnd = vocabNormUnderstanding_(rawUnd);
  if (rawUnd !== normUnd) { r[14] = normUnd; changed = true; }

  var trCol = String(r[11] || "").trim();
  var dtCol = String(r[12] || "").trim();
  var san = vocabSanitizeTrainingRecord_(trCol, dtCol, r[13], r[18], r[19], r[20], r[21], r[22]);
  if (san.training !== trCol || san.detail !== dtCol) {
    changed = true;
  }
  r[11] = san.training;
  r[12] = san.detail;
  if (san.errors !== "" && r[13] === "") { r[13] = san.errors; changed = true; }
  else if (san.errors !== "") { r[13] = san.errors; }
  if (san.readTotal !== "") { if (r[18] === "") changed = true; r[18] = san.readTotal; }
  if (san.readWrong !== "") { if (r[19] === "") changed = true; r[19] = san.readWrong; }
  if (san.litVocabTotal !== "") { if (r[20] === "") changed = true; r[20] = san.litVocabTotal; }
  if (san.litVocabWrong !== "") { if (r[21] === "") changed = true; r[21] = san.litVocabWrong; }
  if (san.litAccuracy !== "") { if (r[22] === "") changed = true; r[22] = san.litAccuracy; }

  return { row: r, changed: changed };
}

function vocabEnsureRecordSheet_(ss) {
  var sheet = getRecordSheetReadOnly_(ss);
  if (!sheet) {
    sheet = ss.insertSheet(RECORD_SHEET);
    vocabStyleRecordSheet_(sheet);
  } else {
    ensureColumns(sheet, 23);
    // [헤더 점검] 표준이면 헤더를 건드리지 않고, 구버전(17·18열/빈 헤더)만 자동 변환하며, 알 수 없는 헤더는 덮어쓰지 않고 경고만 남김
    var diag = vocabDiagnoseRecordHeaders_(sheet);
    var needsHeal = false;
    if (diag.kind === "legacy17" || diag.kind === "legacy18" || diag.kind === "empty") {
      vocabStyleRecordSheet_(sheet);
      needsHeal = true;
      vocabLogSystemAlert_(ss, "안내", "[학습기록] 구버전 헤더(" + diag.kind + ")를 23열 표준으로 자동 변환했습니다.", "recordHeaderConv");
    } else if (diag.kind === "unknown") {
      vocabLogSystemAlert_(ss, "경고", "[학습기록] 헤더가 표준과 달라 헤더·열 보정을 건너뛰었습니다(덮어쓰지 않음): " + diag.text + " → 메뉴 14번으로 확인하세요.", "recordHeader");
    } else {
      vocabClearSystemAlert_("recordHeader");
    }
    // [자동 자가치유 (Self-Healing)] 열 밀림, L열 비표준 트레이닝명, M열 '(독해...)', '-' 기호 감지 시에만 1회 일괄(Bulk) 보정 (표준 헤더일 때만)
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2 && diag.kind === "standard") {
      var sampleCount = Math.min(lastRow - 1, 60);
      var sample = sheet.getRange(2, 1, sampleCount, 15).getValues();
      for (var sr = 0; sr < sample.length; sr++) {
        var rowS = sample[sr];
        var cVal = String(rowS[2] || "").trim();
        var dVal = String(rowS[3] || "").trim();
        var eVal = String(rowS[4] || "").trim();
        var fVal = String(rowS[5] || "").trim();
        var kVal = String(rowS[10] || "").trim();
        var lVal = String(rowS[11] || "").trim();
        var mVal = String(rowS[12] || "").trim();
        if (isLearningRecordDatePattern_(rowS[1]) ||
            cVal === "완료" || cVal === "미완료" || cVal === "미완" || cVal === "학원에서 풀기" ||
            (eVal && eVal !== vocabNormLevel_(eVal)) ||
            (dVal && fVal && dVal === fVal) ||
            (kVal && mVal && kVal === mVal) ||
            fVal.indexOf("/학습") !== -1 || kVal === "[어휘]" ||
            (lVal && TRAINING_TYPE_LIST.indexOf(lVal) === -1) ||
            mVal.indexOf("(독해") !== -1 ||
            dVal === "-" || kVal === "-" || lVal === "-" || mVal === "-") {
          needsHeal = true;
          break;
        }
      }
    }
    if (needsHeal) {
      alignLearningRecordColumnsBulk_(sheet);
      vocabPreserveOrInitDropdowns_(sheet, sheet.getLastRow());
    }
    // 정렬이 이미 맞으면 날짜 열(A열)만 읽고 끝남 (패킷마다 전체 재정렬/드롭다운 재복사 없음)
    vocabSortRecordSheetNewestFirst_(sheet);
  }
  return sheet;
}

// [헤더 점검] 헤더 비교용 정규화: 공백·쉼표·가운뎃점·슬래시·괄호 제거, '발자욱'→'발자국', 소문자
function vocabNormHeaderName_(s) {
  return String(s == null ? "" : s).replace(/발자욱/g, "발자국").replace(/[\s,·\/\\()\[\]]/g, "").toLowerCase();
}

// [헤더 점검] [학습기록] 1행 헤더 종류 판별(읽기 전용): standard(표준) / legacy17 / legacy18 / empty / unknown
function vocabDiagnoseRecordHeaders_(sheet) {
  var n = RECORD_HEADERS.length;
  var actual = sheet.getRange(1, 1, 1, Math.max(n, sheet.getLastColumn())).getValues()[0];
  var diffs = [];
  var blankAll = true;
  var tailBlank = true;
  for (var i = 0; i < n; i++) {
    var a = vocabNormHeaderName_(actual[i]);
    if (a) blankAll = false;
    if (i >= 18 && a) tailBlank = false;
    if (a !== vocabNormHeaderName_(RECORD_HEADERS[i])) {
      diffs.push({ col: i + 1, letter: String.fromCharCode(65 + i), expected: RECORD_HEADERS[i], actual: String(actual[i] == null ? "" : actual[i]) });
    }
  }
  var kind = "unknown";
  if (!diffs.length) kind = "standard";
  else if (blankAll) kind = "empty";
  else if (vocabNormHeaderName_(actual[1]) === "이름" && vocabNormHeaderName_(actual[2]) === "숙제현황" && tailBlank) kind = "legacy18";
  else if (vocabNormHeaderName_(actual[1]) === "날짜" && vocabNormHeaderName_(actual[2]) === "이름") kind = "legacy17";
  var parts = [];
  for (var d = 0; d < diffs.length && d < 5; d++) {
    parts.push(diffs[d].letter + "열(표준:" + diffs[d].expected + " / 현재:" + (diffs[d].actual || "빈칸") + ")");
  }
  if (diffs.length > 5) parts.push("외 " + (diffs.length - 5) + "건");
  return { kind: kind, diffs: diffs, text: parts.join(", ") };
}

// [시스템 알림] '시스템알림' 시트에 기록(같은 구분·내용은 10분 내 중복 기록 안 함) + 원장앱 표시용 ScriptProperties 'systemWarning' 저장('안내' 수준은 표시 안 함)
function vocabLogSystemAlert_(ss, level, message, key) {
  try {
    var props = PropertiesService.getScriptProperties();
    var nowMs = Date.now();
    var prev = null;
    try { prev = JSON.parse(props.getProperty("systemWarning") || "null"); } catch (pe) { prev = null; }
    var isRepeat = !!(prev && prev.key === key && prev.msg === message && (nowMs - prev.at) < 10 * 60 * 1000);
    if (level !== "안내") {
      props.setProperty("systemWarning", JSON.stringify({ key: key, msg: message, at: isRepeat ? prev.at : nowMs }));
    }
    if (isRepeat) return;
    var sh = ss.getSheetByName("시스템알림");
    if (!sh) {
      sh = ss.insertSheet("시스템알림");
      sh.getRange(1, 1, 1, 4).setValues([["일시", "수준", "구분", "내용"]]);
      sh.setFrozenRows(1);
    }
    var stamp = Utilities.formatDate(new Date(nowMs), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, 4).setValues([[stamp, level, key, message]]);
  } catch (alertErr) {
    Logger.log("시스템알림 기록 실패: " + alertErr);
  }
}

// [시스템 알림] 같은 구분(key)의 경고가 해소되면 표시용 경고를 지움
function vocabClearSystemAlert_(key) {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty("systemWarning");
    if (!raw) return;
    var cur = JSON.parse(raw);
    if (cur && cur.key === key) props.deleteProperty("systemWarning");
  } catch (clearErr) {
    Logger.log("시스템알림 해제 실패: " + clearErr);
  }
}

// [날짜 전환 안전장치] 오늘 출석부(3행~)에서 [학습기록]에 있어야 하는데 아직 없는 학생 이름 목록 (읽기 전용 검증)
function vocabFindUnsyncedDailyRows_(ss, sheetDaily) {
  var lastRow = sheetDaily.getLastRow();
  if (lastRow < 3) return [];
  var rows = sheetDaily.getRange(3, 1, lastRow - 2, 11).getDisplayValues();
  var expected = {};
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var name = String(row[2] || "").trim();
    var statusVal = String(row[4] || "").trim();
    var grammarDoneVal = String(row[9] || "").trim();
    var contentsVal = String(row[10] || "").trim();
    if (!name || name === "이름") continue;
    if (!(contentsVal || grammarDoneVal || statusVal === "수업완료" || statusVal === "보강완료" || statusVal === "하원완료")) continue;
    var records = parseDailyRowToLearningRecords_(row, parseDailyDateToIso_(String(row[0] || "").trim()));
    if (!records || !records.length) continue;
    for (var k = 0; k < records.length; k++) {
      if (String((records[k] || {}).type || "").trim() === "어휘오답") continue;
      var key = vocabFmtDate_(vocabParseDate_(records[k].date)) + "||" + normName_(name);
      if (!expected[key]) expected[key] = name;
      break;
    }
  }
  var have = {};
  var sheetRec = getRecordSheetReadOnly_(ss);
  if (sheetRec && sheetRec.getLastRow() >= 2) {
    var ab = sheetRec.getRange(2, 1, sheetRec.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < ab.length; i++) {
      if (ab[i][0]) have[vocabFmtDate_(ab[i][0]) + "||" + normName_(ab[i][1])] = true;
    }
  }
  var missing = [];
  for (var ek in expected) {
    if (!have[ek]) missing.push(expected[ek]);
  }
  return missing;
}

// [헤더 점검] 메뉴 14: [학습기록] 헤더가 표준 23열과 같은지 읽기 전용으로 점검
function vocabCheckRecordHeadersMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getRecordSheetReadOnly_(ss);
  var msg;
  if (!sheet) {
    msg = "[학습기록] 시트가 아직 없습니다. 메뉴 8번을 실행하면 표준 23열로 만들어집니다.";
  } else {
    var diag = vocabDiagnoseRecordHeaders_(sheet);
    if (diag.kind === "standard") msg = "✅ [학습기록] 헤더가 표준 23열과 일치합니다. (아무것도 수정하지 않았습니다)";
    else if (diag.kind === "unknown") msg = "⚠️ [학습기록] 헤더가 표준과 다릅니다. 자동 보정은 건너뛰고 있습니다.\n\n" + diag.text + "\n\n표준대로 맞추려면 메뉴 13번을 실행하세요.";
    else msg = "ℹ️ [학습기록]이 구버전 형식(" + diag.kind + ")입니다. 다음 기록 저장 때 자동으로 23열로 변환되며, 메뉴 13번으로 바로 변환할 수도 있습니다.\n\n" + diag.text;
  }
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (uiErr) {
    Logger.log("vocabCheckRecordHeadersMenu: " + msg);
  }
}

// [핵심 규정 준수] [학습기록] 23열([방안 A]) 파편화 행 병합 및 L열/M열/S~W열 100% 정규화 (단일 SSOT 함수)
function deduplicateLearningRecordsInMemory_(rows) {
  var groups = {};
  for (var i = 0; i < rows.length; i++) {
    var r = normalizeRecordRow_(rows[i]).row;
    var dKey = r[0] ? vocabFmtDate_(r[0]) : "";
    var nKey = normName_(r[1]);
    var key = dKey + "||" + nKey;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  var out = [];
  var groupKeys = Object.keys(groups);
  for (var g = 0; g < groupKeys.length; g++) {
    var grp = groups[groupKeys[g]];
    if (grp.length === 1) {
      out.push(grp[0]);
      continue;
    }

    var trMap = {};
    var bookMap = {};
    var otherRows = [];

    function upsertSingleSanitizedTr(trRow, sanT) {
      if (!sanT.training) return;
      var fKey = sanT.fieldKey || sanT.training;
      if (fKey === "문해력트레이닝") {
        for (var existK in trMap) {
          if (existK.indexOf("문해력트레이닝:") === 0) {
            fKey = existK;
            break;
          }
        }
      } else if (fKey.indexOf("문해력트레이닝:") === 0 && trMap["문해력트레이닝"]) {
        trMap[fKey] = trMap["문해력트레이닝"];
        delete trMap["문해력트레이닝"];
      }

      if (!trMap[fKey]) {
        var tClone = trRow.slice();
        tClone[11] = sanT.training;
        tClone[12] = sanT.detail;
        trMap[fKey] = tClone;
      } else {
        var curT = trMap[fKey];
        if (isBetterTrainingDetail_(sanT.detail, curT[12], trRow[18] !== "", curT[18] !== "")) {
          curT[12] = sanT.detail;
        }
        if (trRow[13] !== "" && trRow[13] !== 0) curT[13] = trRow[13];
        else if (curT[13] === "" && trRow[13] === 0) curT[13] = 0;
        var tCols = [2, 3, 10, 14, 15, 16, 18, 19, 20, 21, 22];
        for (var tc = 0; tc < tCols.length; tc++) {
          var tColIdx = tCols[tc];
          if (trRow[tColIdx] !== "" && trRow[tColIdx] !== undefined) curT[tColIdx] = trRow[tColIdx];
        }
      }
    }

    function upsertTrRowInGroup(trRow) {
      var sanT = vocabSanitizeTrainingRecord_(trRow[11], trRow[12], trRow[13], trRow[18], trRow[19], trRow[20], trRow[21], trRow[22]);
      if (!sanT.training) return;
      if (sanT.training === "문해력트레이닝" && sanT.detail.indexOf(",") !== -1) {
        var subItems = sanT.detail.split(/\s*,\s*/);
        for (var sIdx = 0; sIdx < subItems.length; sIdx++) {
          var subDt = subItems[sIdx].trim();
          if (!subDt) continue;
          var subRow = trRow.slice();
          if (sIdx > 0) {
            subRow[13] = "";
            subRow[18] = "";
            subRow[19] = "";
            subRow[20] = "";
            subRow[21] = "";
            subRow[22] = "";
          }
          var subSan = vocabSanitizeTrainingRecord_("문해력트레이닝", subDt, subRow[13], subRow[18], subRow[19], subRow[20], subRow[21], subRow[22]);
          upsertSingleSanitizedTr(subRow, subSan);
        }
        return;
      }
      upsertSingleSanitizedTr(trRow, sanT);
    }

    for (var j = 0; j < grp.length; j++) {
      var row = grp[j];
      var bookName = String(row[5] || "").trim();
      var normBook = vocabNormBook_(bookName);
      var trName = String(row[11] || "").trim();

      if (normBook) {
        var foundBKey = null;
        for (var existB in bookMap) {
          if (areBooksFuzzyMatch_(existB, normBook)) {
            foundBKey = existB;
            break;
          }
        }
        if (!foundBKey) {
          var bClone = row.slice();
          var clearCols = [11, 12, 13, 14, 18, 19, 20, 21, 22];
          for (var cc = 0; cc < clearCols.length; cc++) bClone[clearCols[cc]] = "";
          bookMap[normBook] = bClone;
        } else {
          var curB = bookMap[foundBKey];
          var bCols = [2, 3, 4, 6, 7, 8, 9, 10, 15, 16, 17];
          for (var bc = 0; bc < bCols.length; bc++) {
            var bColIdx = bCols[bc];
            if (row[bColIdx] !== "" && row[bColIdx] !== undefined) curB[bColIdx] = row[bColIdx];
          }
          if (bookName.length > curB[5].length) curB[5] = bookName;
        }
        if (trName) {
          upsertTrRowInGroup(row);
        }
      } else if (trName) {
        upsertTrRowInGroup(row);
      } else {
        otherRows.push(row);
      }
    }

    var trainings = Object.keys(trMap).map(function(k) { return trMap[k]; });
    // 만약 같은 날 문해력트레이닝이 2개 이상인데 실제 교재(6권, 초등국어 등)가 존재하는 경우, 초기 폼 기본값('비문학 1단계 1차시' 무점수) 유령 행 자동 제거
    var hasNonDefaultLit = trainings.some(function(tRow) {
      return tRow[11] === "문해력트레이닝" && (tRow[18] !== "" || !/^(?:비문학|복합)\s*1단계(?:\s*1차시)?$/.test(String(tRow[12] || "").trim()));
    });
    if (hasNonDefaultLit && trainings.length > 1) {
      trainings = trainings.filter(function(tRow) {
        if (tRow[11] !== "문해력트레이닝") return true;
        var dtStr = String(tRow[12] || "").trim();
        var isUnscoredDefault = (dtStr === "비문학 1단계 1차시" || dtStr === "비문학 1단계") &&
                                tRow[18] === "" && (tRow[13] === "" || tRow[13] === 0);
        return !isUnscoredDefault;
      });
    }

    var books = Object.keys(bookMap).map(function(k) { return bookMap[k]; });
    var mergedGroupRows = [];

    if (books.length > 0 && trainings.length > 0) {
      var maxLen = Math.max(books.length, trainings.length);
      for (var mIdx = 0; mIdx < maxLen; mIdx++) {
        if (mIdx < books.length && mIdx < trainings.length) {
          var bR = books[mIdx];
          var tR = trainings[mIdx];
          bR[11] = tR[11];
          bR[12] = tR[12];
          bR[13] = tR[13];
          bR[14] = tR[14];
          if (tR[15] && !bR[15]) bR[15] = tR[15];
          if (tR[16] && !bR[16]) bR[16] = tR[16];
          if (tR[2] && !bR[2]) bR[2] = tR[2];
          if (tR[3] && !bR[3]) bR[3] = tR[3];
          if (tR[10] && !bR[10]) bR[10] = tR[10];
          bR[18] = tR[18] !== undefined ? tR[18] : "";
          bR[19] = tR[19] !== undefined ? tR[19] : "";
          bR[20] = tR[20] !== undefined ? tR[20] : "";
          bR[21] = tR[21] !== undefined ? tR[21] : "";
          bR[22] = tR[22] !== undefined ? tR[22] : "";
          mergedGroupRows.push(bR);
        } else if (mIdx < books.length) {
          mergedGroupRows.push(books[mIdx]);
        } else {
          mergedGroupRows.push(trainings[mIdx]);
        }
      }
    } else if (books.length > 0) {
      for (var b2 = 0; b2 < books.length; b2++) mergedGroupRows.push(books[b2]);
    } else if (trainings.length > 0) {
      for (var t2 = 0; t2 < trainings.length; t2++) mergedGroupRows.push(trainings[t2]);
    }

    // otherRows(도서·트레이닝 없는 요약 행)의 숙제·발자국·소감 정보를 첫 행에 병합하여 불필요한 빈 행 생성 방지
    var metaCols = [2, 3, 4, 6, 7, 8, 9, 10, 15, 16, 17];
    if (mergedGroupRows.length > 0) {
      var primary = mergedGroupRows[0];
      for (var o = 0; o < otherRows.length; o++) {
        for (var mc = 0; mc < metaCols.length; mc++) {
          var ci = metaCols[mc];
          if (otherRows[o][ci] !== "" && otherRows[o][ci] !== undefined) primary[ci] = otherRows[o][ci];
        }
      }
      for (var mg = 0; mg < mergedGroupRows.length; mg++) out.push(mergedGroupRows[mg]);
    } else if (otherRows.length > 0) {
      var baseOther = otherRows[0];
      for (var o2 = 1; o2 < otherRows.length; o2++) {
        for (var mc2 = 0; mc2 < metaCols.length; mc2++) {
          var ci2 = metaCols[mc2];
          if (otherRows[o2][ci2] !== "" && otherRows[o2][ci2] !== undefined) baseOther[ci2] = otherRows[o2][ci2];
        }
      }
      out.push(baseOther);
    }
  }
  return out;
}

// [핵심 규정 준수] [학습기록] 23열([방안 A]) 시트의 헤더·열 위치 및 L열/M열/S~W열 오염을 1회 일괄(Bulk) 정밀 보정
function alignLearningRecordColumnsBulk_(sheet) {
  if (!sheet) return { processed: 0, shifted: 0, cleaned: 0, resultRows: 0 };
  vocabStyleRecordSheet_(sheet);
  var lastRow = sheet.getLastRow();

  // 1회 일괄(Bulk) 메모리 로드
  var rawData = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 23).getValues() : [];
  var alignedData = [];
  var shiftedStudentMap = {};
  var shiftedCount = 0;
  var cleanedCount = 0;

  for (var i = 0; i < rawData.length; i++) {
    var r = rawData[i];
    var isShifted = isLearningRecordDatePattern_(r[1]) && !isLearningRecordDatePattern_(r[2]);
    if (isShifted) {
      shiftedCount++;
      var dateVal = r[1] || r[0];
      var nameVal = normName_(r[2]);
      var typeVal = String(r[3] || "").trim();
      if (!nameVal) continue;
      if (!shiftedStudentMap[nameVal]) shiftedStudentMap[nameVal] = [];

      // [재발방지] 구버전 17열 행에서는 Col K(r[10])가 트레이닝, Col L(r[11])이 권수/차시, Col M(r[12])이 오답개수, Col N(r[13])이 이해도
      var sanShifted = vocabSanitizeTrainingRecord_(r[10], r[11], r[12], "", "", "", "", "");
      var trUnd = vocabNormUnderstanding_(r[13] || r[14] || "");

      if (typeVal === "일일요약") {
        shiftedStudentMap[nameVal].push({ date: dateVal, type: "일일요약" });
      } else if (typeVal === "진단") {
        shiftedStudentMap[nameVal].push({
          date: dateVal,
          type: "진단",
          level: vocabNormLevel_(r[4]),
          book: String(r[5] || "").trim(),
          score: r[9],
          step2Memo: String(r[10] || "").trim()
        });
      } else if (typeVal === "트레이닝" || sanShifted.training) {
        shiftedStudentMap[nameVal].push({
          date: dateVal,
          type: "트레이닝",
          training: sanShifted.training,
          detail: sanShifted.detail,
          errors: sanShifted.errors,
          readTotal: sanShifted.readTotal,
          readWrong: sanShifted.readWrong,
          litVocabTotal: sanShifted.litVocabTotal,
          litVocabWrong: sanShifted.litVocabWrong,
          litAccuracy: sanShifted.litAccuracy,
          understanding: trUnd
        });
      } else if (typeVal === "어휘퀴즈" || typeVal === "어휘") {
        shiftedStudentMap[nameVal].push({
          date: dateVal,
          type: "어휘퀴즈",
          level: vocabNormLevel_(r[4]),
          book: String(r[5] || "").trim(),
          total: r[6],
          firstCorrect: r[7],
          rate: r[8],
          wrongWords: String(r[17] || r[14] || "").trim()
        });
      }
    } else {
      var normRes = normalizeRecordRow_(r);
      if (normRes.changed) cleanedCount++;
      alignedData.push(normRes.row);
    }
  }

  // 밀린 행들을 (날짜, 학생) 기준으로 첫 줄 가로병합하여 alignedData에 일괄 반영
  if (shiftedCount > 0) {
    var sNames = Object.keys(shiftedStudentMap);
    for (var s = 0; s < sNames.length; s++) {
      var sn = sNames[s];
      vocabUpsertSingleStudentDayRecordsInMemory_(alignedData, sn, shiftedStudentMap[sn]);
    }
  }

  // [파편화 행 병합]
  var deduplicatedData = deduplicateLearningRecordsInMemory_(alignedData);
  if (deduplicatedData.length !== alignedData.length) {
    cleanedCount += Math.abs(alignedData.length - deduplicatedData.length);
    alignedData = deduplicatedData;
  }

  if (shiftedCount > 0 || cleanedCount > 0) {
    if (rawData.length > alignedData.length) {
      sheet.getRange(2, 1, rawData.length, 23).clearContent();
    }
    if (alignedData.length > 0) {
      for (var padI = 0; padI < alignedData.length; padI++) {
        while (alignedData[padI].length < 23) alignedData[padI].push("");
      }
      sheet.getRange(2, 1, alignedData.length, 23).setValues(alignedData);
    }
    vocabSortRecordSheetNewestFirst_(sheet);
  }
  vocabPreserveOrInitDropdowns_(sheet, alignedData.length + 1);

  return { processed: rawData.length, shifted: shiftedCount, cleaned: cleanedCount, resultRows: alignedData.length };
}

function fixAndAlignLearningRecordHeadersAndRowsBulk() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRecPre = getRecordSheetReadOnly_(ss);
  if (sheetRecPre) {
    var diagPre = vocabDiagnoseRecordHeaders_(sheetRecPre);
    if (diagPre.kind === "unknown") {
      // 표준과 다른 헤더는 원장님이 확인한 경우에만 표준 23열로 덮어씀
      try {
        var uiPre = SpreadsheetApp.getUi();
        var answerPre = uiPre.alert("[학습기록] 헤더가 표준과 다릅니다.\n\n" + diagPre.text + "\n\n표준 23열 헤더로 덮어쓰고 열을 정렬할까요?", uiPre.ButtonSet.YES_NO);
        if (answerPre !== uiPre.Button.YES) return;
      } catch (uiPreErr) {
        return;
      }
    }
  }
  var sheetRec = vocabEnsureRecordSheet_(ss);
  var res = alignLearningRecordColumnsBulk_(sheetRec);
  try {
    SpreadsheetApp.getUi().alert(
      "✅ [학습기록] 23열 헤더·드롭다운 규격 및 데이터 열 정렬 완료!\n\n" +
      "• 점검 데이터: " + res.processed + "행\n" +
      "• 밀린 열 자동 보정: " + res.shifted + "건\n" +
      "• 숙제현황(완료→숙제완료) 및 트레이닝·발자국 열 정화: " + (res.cleaned || 0) + "건\n" +
      "• 최종 정렬된 학습기록: " + res.resultRows + "행\n\n" +
      "원장님의 드롭다운 칩 색상은 그대로 보존되며 빨간 경고 삼각형이 모두 제거되었습니다. ✨"
    );
  } catch (uiErr) {
    Logger.log("fixAndAlignLearningRecordHeadersAndRowsBulk 완료: " + JSON.stringify(res));
  }
}

// H/I/J열의 도서·레벨·점수·글완 텍스트를 파싱하여 booksMap에 병합하는 공통 헬퍼
function upsertParsedBookEntryToMap_(booksMap, entry, fallbackColH, skipEventKeywords) {
  var s = String(entry || "").trim();
  if (!s) return;
  if (skipEventKeywords && /^(진단|코스업|레벨업|진로검사|독서계획표|한자교재|스티커|친구|탐험가|고수|챔피언|마스터|달성)/.test(s)) {
    return;
  }
  var hasGeulwan = /글완|글쓰기완료|글쓰기완/.test(s);
  var raw = s.replace(/\[?\s*(?:글완|글쓰기완료|글쓰기완|완료)\s*\]?/g, "").trim();
  var score = "";
  var sm = raw.match(/^(.*?[^\d\s(])\s*\(?\s*(\d{1,3})\s*(?:점|개)?\s*\)?$/);
  if (sm) {
    raw = sm[1].trim();
    score = parseInt(sm[2], 10);
  }
  var level = "";
  var lm = raw.match(/^([1-6](?:-[1-4])?|기초(?:\s*(?:씨앗|새싹|줄기|열매|꽃))?)\s*(?:초록띠?|노랑띠?|파랑띠?|주황띠?|빨강띠?|품띠|검정띠?|용띠)?\s*(.*)$/);
  var title = raw;
  if (lm) {
    level = vocabNormLevel_(lm[1].trim());
    title = lm[2].trim();
  } else if (fallbackColH && /^[1-6](?:-[1-4])?$/.test(fallbackColH)) {
    level = vocabNormLevel_(fallbackColH);
  }
  title = title.replace(/^(?:초록띠?|노랑띠?|파랑띠?|주황띠?|빨강띠?|품띠|검정띠?|용띠)\s+/, "").trim();
  if (!title || (skipEventKeywords && title.length < 2)) return;

  var normKey = vocabNormBook_(title);
  var foundKey = null;
  for (var bk in booksMap) {
    if (areBooksFuzzyMatch_(bk, normKey)) {
      foundKey = bk;
      break;
    }
  }
  if (foundKey) {
    if (level && !booksMap[foundKey].level) booksMap[foundKey].level = level;
    if (score !== "" && !booksMap[foundKey].score) booksMap[foundKey].score = score;
    if (hasGeulwan && booksMap[foundKey].notes.indexOf("글완") === -1) booksMap[foundKey].notes.push("글완");
  } else {
    booksMap[normKey] = {
      title: title,
      level: level,
      score: score !== "" ? score : "",
      notes: hasGeulwan ? ["글완"] : []
    };
  }
}

// 오늘 출석부/학생수업관리 1행(Col A~K)의 데이터를 [학습기록] 23열 규격 레코드 목록으로 정밀 파싱
function parseDailyRowToLearningRecords_(row, isoDate) {
  var colD = String(row[3] || "").replace(/\s*\r?\n\s*/g, " ").trim();
  var status = String(row[4] || "").trim();
  var colH = String(row[7] || "").trim(); // Col H: 숫자 (예: 5-1)
  var colI = String(row[8] || "").trim(); // Col I: 이벤트 (예: 5-1 초록 살아갈 용기에 대하여)
  var colJ = String(row[9] || "").trim(); // Col J: 진단글쓰기/특별수업
  var colK = String(row[10] || "").trim(); // Col K: 수업내용 및 특이사항

  // 결석·대기·보강대기·휴강 행 및 단순 결석 사유 메모는 [학습기록]에 넣지 않음
  if (status === "결석" || status === "대기" || status === "보강대기" || status === "휴강" || status === "취소") {
    return [];
  }
  if (!colJ && !colI && /^(당일\s*채널|결석\s*[-:]|보강\s*[-:]|연장\s*\()/.test(colK)) {
    return [];
  }
  if (!colJ && !colK && !colI && status !== "수업완료" && status !== "보강완료" && status !== "하원완료") {
    return [];
  }

  var records = [];
  var vocabRecords = [];
  var hwStatus = "";
  var step1Memo = "";
  var step2Memo = "";
  var step3Memo = "";
  var step4Memo = "";
  var reflection = "";

  var booksMap = {};
  var trainings = [];

  // 0. Col I & Col H: 이벤트 / 도서
  if (colI) {
    var iEntries = colI.split(/[,;\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    for (var iIdx = 0; iIdx < iEntries.length; iIdx++) {
      upsertParsedBookEntryToMap_(booksMap, iEntries[iIdx], colH, true);
    }
  }

  // 1. Col J: 진단글쓰기 / 특별수업
  if (colJ) {
    var jEntries = colJ.split(/[,;\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    for (var jIdx = 0; jIdx < jEntries.length; jIdx++) {
      upsertParsedBookEntryToMap_(booksMap, jEntries[jIdx], "", false);
    }
  }

  // 2. Col K: 수업내용 및 특이사항
  if (colK) {
    var parts = colK.split("|").map(function(s) { return s.replace(/\s*\r?\n\s*/g, " ").trim(); }).filter(Boolean);
    parts.forEach(function(part) {
      // 숙제 점검
      var hwMatch = part.match(/^(숙제완료|숙제미완|숙제미완료|완료|미완료|미완|미지참|학원에서\s*풀기)(?:\s*\(([^)]*)\))?(?:\s*\[성실발자국:\s*(.*?)\])?/);
      if (hwMatch) {
        hwStatus = vocabNormHwStatus_(hwMatch[1]);
        if (hwMatch[2]) step1Memo = hwMatch[2].trim();
        if (hwMatch[3]) step1Memo = (step1Memo ? step1Memo + " / " : "") + hwMatch[3].trim();
        return;
      }
      if (part.indexOf("[성실발자국:") === 0) {
        var m1 = part.match(/\[성실발자국:\s*(.*?)\]/);
        if (m1) step1Memo = (step1Memo ? step1Memo + " / " : "") + m1[1].trim();
        return;
      }
      if (part.indexOf("[독서발자국:") === 0) {
        var m2 = part.match(/\[독서발자국:\s*(.*?)\]/);
        if (m2) step2Memo = (step2Memo ? step2Memo + " / " : "") + m2[1].trim();
        return;
      }
      if (part.indexOf("[문해력발자국:") === 0 || part.indexOf("[메모:") === 0) {
        var m4 = part.match(/\[(?:문해력발자국|메모):\s*(.*?)\]/);
        if (m4) step4Memo = (step4Memo ? step4Memo + " / " : "") + m4[1].trim();
        return;
      }

      // 소감
      if (part.indexOf("[소감]") === 0) {
        reflection = part.replace(/^\[소감\]\s*/, "").trim();
        return;
      }

      // 어휘 요약
      if (part.indexOf("[어휘]") === 0) {
        var vm1 = part.match(/^\[어휘\]\s*([^\/]+)\/학습\s*(\d+)개\/오답\s*(\d+)개(?:\/재학습\s*\d+개)?\/?\s*(?:『(.*?)』|([^\s>]+))(?:\s*오답\s*:\s*([^>]+?))?(?:\s*>>\s*(.*))?$/);
        if (vm1) {
          var vLv = vocabNormLevel_(vm1[1]);
          var vTotal = parseInt(vm1[2], 10) || 0;
          var vWrong = parseInt(vm1[3], 10) || 0;
          var vFirst = Math.max(0, vTotal - vWrong);
          var vRate = vTotal > 0 ? Math.round((vFirst / vTotal) * 100) : 0;
          var vBook = (vm1[4] || vm1[5] || "").trim();
          var vWrongWords = vm1[6] ? vocabCleanWrongWordsStr_(vm1[6]) : "";
          if (vm1[7]) step2Memo = (step2Memo ? step2Memo + " / " : "") + vm1[7].trim();
          vocabRecords.push({
            date: isoDate,
            type: "어휘퀴즈",
            level: vLv,
            book: vBook,
            total: vTotal,
            firstCorrect: vFirst,
            rate: vRate,
            wrongWords: vWrongWords
          });
          return;
        }
        var vm2 = part.match(/^\[어휘\]\s*(?:『(.*?)』|(.*?))\s*(\d+)\/(\d+)\((?:\d+)%\)(?:\s*오답\s*:\s*(.*))?$/);
        if (vm2) {
          var bTitle = (vm2[1] || vm2[2] || "").trim();
          var bTot = parseInt(vm2[4], 10);
          var bCor = parseInt(vm2[3], 10);
          vocabRecords.push({
            date: isoDate,
            type: "어휘퀴즈",
            book: bTitle,
            total: bTot,
            firstCorrect: bCor,
            rate: bTot > 0 ? Math.round((bCor / bTot) * 100) : 0,
            wrongWords: vm2[6] ? vocabCleanWrongWordsStr_(vm2[6]) : ""
          });
          return;
        }
      }

      // 집중 트레이닝 ([이해도:잘 이해했어요], (7/0) 오답 0개, 단독 '문해력'/'읽트', '읽트8권 2차시', '듣기(1단계 3차시)', 다중 항목 '문해력[item1, item2]' 완벽 지원)
      var trMatch = part.match(/^(문해력트레이닝|문해력|오답수정\+선지분석|읽기트레이닝|읽트|독해트레이닝|독트|듣기트레이닝|듣트|듣기|독해밀도|개념밀도|독서트레이닝)(?:\[(.*?)\])?(.*)$/);
      if (trMatch) {
        var trType = trMatch[1];
        if (trType === "문해력") trType = "문해력트레이닝";
        else if (trType === "읽트" || trType === "독서트레이닝") trType = "읽기트레이닝";
        else if (trType === "독트") trType = "독해트레이닝";
        else if (trType === "듣트" || trType === "듣기") trType = "듣기트레이닝";

        var rawDetail = (trMatch[2] || "").trim();
        var trRest = (trMatch[3] || "").trim();
        var underM = trRest.match(/\[(?:이해도\s*:\s*)?(잘 이해했어요|보통이에요|아직 헷갈려요|어려웠어요|헷갈려요)\]/);
        var litM = trRest.match(/\[문해력발자국\s*:\s*(.*?)\]/);
        var trUnder = underM ? vocabNormUnderstanding_(underM[1]) : "";
        var trLit = litM ? litM[1].trim() : "";

        // 만약 대괄호([ ]) 없이 '읽트8권 2차시 (10/2) 539자' 또는 '듣기(1단계 3차시)' 형태로 들어온 경우 trRest에서 세부차시 추출
        if (!rawDetail && trRest) {
          var restBody = trRest
            .replace(/\[(?:이해도\s*:\s*)?(?:잘 이해했어요|보통이에요|아직 헷갈려요|어려웠어요|헷갈려요)\]/g, "")
            .replace(/\[문해력발자국\s*:\s*.*?\]/g, "")
            .trim();
          if (restBody.charAt(0) === "(" && restBody.charAt(restBody.length - 1) === ")" && !/^\(\d+\s*\/\s*\d+\)$/.test(restBody)) {
            restBody = restBody.substring(1, restBody.length - 1).trim();
          }
          rawDetail = restBody;
        }

        // 괄호 밖의 최상위 쉼표(,)로 구분된 다중 교재 항목(예: '복합 6권 1차시 (독해6/0·어휘3/0·100%), 어휘 초등국어... 1A 1차시')을 개별 레코드로 분리
        var detailItems = [];
        if (rawDetail) {
          var curChunk = "";
          var pDepth = 0;
          for (var chI = 0; chI < rawDetail.length; chI++) {
            var ch = rawDetail.charAt(chI);
            if (ch === "(" || ch === "[") pDepth++;
            else if (ch === ")" || ch === "]") pDepth = Math.max(0, pDepth - 1);
            if (ch === "," && pDepth === 0) {
              if (curChunk.trim()) detailItems.push(curChunk.trim());
              curChunk = "";
            } else {
              curChunk += ch;
            }
          }
          if (curChunk.trim()) detailItems.push(curChunk.trim());
        }
        if (detailItems.length === 0) detailItems.push("");

        for (var di = 0; di < detailItems.length; di++) {
          var sanParsed = vocabSanitizeTrainingRecord_(trType, detailItems[di], "", "", "", "", "", "");
          trainings.push({
            date: isoDate,
            type: "트레이닝",
            training: sanParsed.training || trType,
            detail: sanParsed.detail,
            errors: sanParsed.errors,
            readTotal: sanParsed.readTotal,
            readWrong: sanParsed.readWrong,
            litVocabTotal: sanParsed.litVocabTotal,
            litVocabWrong: sanParsed.litVocabWrong,
            litAccuracy: sanParsed.litAccuracy,
            understanding: trUnder,
            literacyMemo: trLit
          });
        }
        if (trLit) step4Memo = (step4Memo ? step4Memo + " / " : "") + trLit;
        return;
      }

      // 일반 교재 미지참 등 특이사항
      if (part.indexOf("교재 안 가져옴") !== -1 || part.indexOf("교재 안가져옴") !== -1) {
        hwStatus = hwStatus || "미지참";
        step1Memo = (step1Memo ? step1Memo + " / " : "") + part;
        return;
      }
      if (part.indexOf("빠작어휘") !== -1 && part.indexOf("완료") !== -1) {
        step1Memo = (step1Memo ? step1Memo + " / " : "") + part;
        return;
      }

      // 도서 및 인라인 [독서발자국: ...] 정밀 분리
      var inlineFp = "";
      var cleanPart = part.replace(/\[(?:독서발자국|메모)\s*:\s*(.*?)\]/g, function(_, fpText) {
        inlineFp = (inlineFp ? inlineFp + " / " : "") + fpText.trim();
        return "";
      }).trim();

      var bracketTags = [];
      cleanPart = cleanPart.replace(/\[(.*?)\]/g, function(_, tagText) {
        bracketTags.push("[" + tagText.trim() + "]");
        return "";
      }).trim();

      var bMatch = cleanPart.match(/^([^:]+)(?::\s*(.*))?$/);
      if (bMatch) {
        var candTitle = bMatch[1].trim();
        var candStatus = (bMatch[2] || "").trim();

        if (/^(독서중|독서대기|독서완료|요약하기|다음책)/.test(candTitle)) {
          if (!step2Memo) step2Memo = part;
          else step2Memo += " / " + part;
          return;
        }

        var noteArr = [];
        if (candStatus) noteArr.push(candStatus);
        if (bracketTags.length) noteArr.push(bracketTags.join(" "));
        if (inlineFp) noteArr.push(inlineFp);

        var normKey2 = vocabNormBook_(candTitle);
        var foundKey2 = null;
        for (var bk in booksMap) {
          if (areBooksFuzzyMatch_(bk, normKey2)) {
            foundKey2 = bk;
            break;
          }
        }
        if (foundKey2) {
          for (var na = 0; na < noteArr.length; na++) {
            if (booksMap[foundKey2].notes.indexOf(noteArr[na]) === -1) {
              booksMap[foundKey2].notes.push(noteArr[na]);
            }
          }
        } else {
          booksMap[normKey2] = { title: candTitle, level: "", score: "", notes: noteArr };
        }

        // 인라인 독서발자국에 '어휘퀴즈 풀었어요.(10/7)' 형태가 있으면 어휘점수도 자동 추출
        var inlineVocabM = inlineFp.match(/어휘퀴즈[^\d]*\((\d+)\s*\/\s*(\d+)\)/);
        if (inlineVocabM) {
          var ivTot = parseInt(inlineVocabM[1], 10) || 0;
          var ivCor = parseInt(inlineVocabM[2], 10) || 0;
          if (ivTot > 0 && ivCor <= ivTot) {
            vocabRecords.push({
              date: isoDate,
              type: "어휘퀴즈",
              level: (foundKey2 ? booksMap[foundKey2].level : booksMap[normKey2].level) || "",
              book: candTitle,
              total: ivTot,
              firstCorrect: ivCor,
              rate: Math.round((ivCor / ivTot) * 100)
            });
          }
        }
        return;
      }
    });
  }

  // Col D(특이사항)에 '문해력>' 등 당일 수업 기록이 있고 문해력발자국이 비어있으면 보강
  if (colD && !step4Memo && /문해력\s*>|지문분석|품사\s*마무리/.test(colD)) {
    step4Memo = colD;
  }

  // 수업완료/보강완료인데 J열·K열이 비어있는 학생도 누락 없이 생성
  if (!hwStatus && !step1Memo && !step2Memo && !step3Memo && !step4Memo && !reflection &&
      Object.keys(booksMap).length === 0 && trainings.length === 0 && vocabRecords.length === 0) {
    if (status === "수업완료" || status === "보강완료" || status === "하원완료") {
      if (/^정독\s+/.test(colD)) {
        trainings.push({
          date: isoDate,
          type: "트레이닝",
          training: "읽기트레이닝",
          detail: colD,
          errors: "",
          understanding: "",
          literacyMemo: ""
        });
      } else if (colD === "독서") {
        step2Memo = "독서 수업완료";
      } else if (colD === "국어") {
        step4Memo = "국어 수업완료";
      } else if (colD) {
        step4Memo = colD;
      } else {
        step4Memo = status;
      }
    }
  }

  // 1) 일일요약 레코드
  if (hwStatus || step1Memo || step2Memo || step3Memo || step4Memo || reflection) {
    records.push({
      date: isoDate,
      type: "일일요약",
      hwStatus: vocabNormHwStatus_(hwStatus),
      step1Memo: step1Memo,
      step2Memo: step2Memo,
      literacyMemo: [step3Memo, step4Memo].filter(Boolean).join(" / "),
      reflection: reflection
    });
  }

  // 2) 진단 / 도서 레코드
  Object.keys(booksMap).forEach(function(k) {
    var b = booksMap[k];
    var bNotes = b.notes.join(" / ").trim();
    if (!bNotes && step2Memo) {
      bNotes = step2Memo;
    }
    records.push({
      date: isoDate,
      type: "진단",
      level: vocabNormLevel_(b.level),
      book: b.title,
      score: b.score,
      step2Memo: bNotes
    });
  });

  // 3) 어휘퀴즈 레코드
  vocabRecords.forEach(function(vr) { records.push(vr); });

  // 4) 트레이닝 레코드
  trainings.forEach(function(t) { records.push(t); });

  return records;
}

function vocabMakeEmptyRow18_(dateObj, name) {
  return [
    dateObj, name, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
    "", "", "", "", ""
  ];
}

// [학습기록] 메모리 배열(allData)에 1명 학생의 일일 학습기록을 병합/삽입하는 순수 메모리 연산 함수 (Bulk 일괄 처리용, [방안 A] 23열)
function vocabUpsertSingleStudentDayRecordsInMemory_(allData, name, records) {
  if (!name || !records || !records.length) return { added: 0, updated: 0 };

  var byDate = {};
  var dateKeys = [];
  for (var i = 0; i < records.length; i++) {
    var r = records[i] || {};
    var rt = String(r.type || "").trim();
    if (rt === "어휘오답") continue;
    var dObj = vocabParseDate_(r.date);
    var dKey = vocabFmtDate_(dObj);
    if (!byDate[dKey]) {
      byDate[dKey] = { dateObj: dObj, items: [] };
      dateKeys.push(dKey);
    }
    byDate[dKey].items.push(r);
  }

  var addedCount = 0;
  var updatedCount = 0;

  for (var dIdx = 0; dIdx < dateKeys.length; dIdx++) {
    var dKey = dateKeys[dIdx];
    var dObj = byDate[dKey].dateObj;
    var items = byDate[dKey].items;

    var matchIndices = [];
    for (var rowIdx = 0; rowIdx < allData.length; rowIdx++) {
      var rDate = allData[rowIdx][0] ? vocabFmtDate_(allData[rowIdx][0]) : "";
      var rName = normName_(allData[rowIdx][1]);
      if (rDate === dKey && rName === name) {
        matchIndices.push(rowIdx);
      }
    }

    var studentRows = [];
    for (var m = 0; m < matchIndices.length; m++) {
      var clone = normalizeRecordRow_(allData[matchIndices[m]]).row;
      clone[0] = dObj;
      clone[1] = name;
      studentRows.push(clone);
    }

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var nr = vocabMakeEmptyRow18_(dObj, name);
      if (it.hwStatus) nr[2] = vocabNormHwStatus_(it.hwStatus);
      if (it.step1Memo) nr[3] = String(it.step1Memo).trim();
      if (it.level) nr[4] = vocabNormLevel_(it.level);
      if (it.book) nr[5] = String(it.book).trim();
      if (it.total !== "" && it.total !== undefined) nr[6] = vocabNum_(it.total);
      if (it.firstCorrect !== "" && it.firstCorrect !== undefined) nr[7] = vocabNum_(it.firstCorrect);
      if (it.rate !== "" && it.rate !== undefined) nr[8] = vocabNum_(it.rate);
      if (it.score !== "" && it.score !== undefined) nr[9] = vocabNum_(it.score);
      if (it.step2Memo) nr[10] = String(it.step2Memo).trim();
      if (it.training) nr[11] = String(it.training).trim();
      if (it.detail) nr[12] = String(it.detail).trim();
      if (it.errors !== "" && it.errors !== undefined) nr[13] = it.errors;
      if (it.understanding) nr[14] = vocabNormUnderstanding_(it.understanding);
      if (it.literacyMemo) nr[15] = String(it.literacyMemo).trim();
      if (it.reflection) nr[16] = String(it.reflection).trim();
      if (it.wrongWords !== undefined && String(it.wrongWords).trim() !== "") nr[17] = vocabCleanWrongWordsStr_(it.wrongWords);
      if (it.readTotal !== "" && it.readTotal !== undefined) nr[18] = vocabNum_(it.readTotal);
      if (it.readWrong !== "" && it.readWrong !== undefined) nr[19] = vocabNum_(it.readWrong);
      if (it.litVocabTotal !== "" && it.litVocabTotal !== undefined) nr[20] = vocabNum_(it.litVocabTotal);
      if (it.litVocabWrong !== "" && it.litVocabWrong !== undefined) nr[21] = vocabNum_(it.litVocabWrong);
      if (it.litAccuracy !== "" && it.litAccuracy !== undefined) nr[22] = vocabNum_(it.litAccuracy);
      studentRows.push(nr);
    }

    // 당일 학생 행들의 L열/M열/S~W열 정규화 및 파편 행 단일 SSOT 병합
    studentRows = deduplicateLearningRecordsInMemory_(studentRows);

    if (matchIndices.length > 0) {
      for (var rm = matchIndices.length - 1; rm >= 0; rm--) {
        allData.splice(matchIndices[rm], 1);
      }
      updatedCount += studentRows.length;
    } else {
      addedCount += studentRows.length;
    }

    var insertPos = 0;
    while (insertPos < allData.length) {
      var rowDate = allData[insertPos][0] ? vocabFmtDate_(allData[insertPos][0]) : "";
      if (rowDate <= dKey) break;
      insertPos++;
    }
    for (var ins = 0; ins < studentRows.length; ins++) {
      allData.splice(insertPos + ins, 0, studentRows[ins]);
    }
  }

  return { added: addedCount, updated: updatedCount };
}

function vocabUpsertStudentDayRecords_(sheet, name, records) {
  if (!name || !records || !records.length) return { added: 0, updated: 0 };
  ensureColumns(sheet, 23);
  var byDate = {};
  var dateKeys = [];
  for (var i = 0; i < records.length; i++) {
    var rec = records[i] || {};
    if (String(rec.type || "").trim() === "어휘오답") continue;
    var recKey = vocabFmtDate_(vocabParseDate_(rec.date));
    if (!byDate[recKey]) { byDate[recKey] = []; dateKeys.push(recKey); }
    byDate[recKey].push(rec);
  }
  var added = 0;
  var updated = 0;
  for (var dIdx = 0; dIdx < dateKeys.length; dIdx++) {
    var dKey = dateKeys[dIdx];
    // 날짜·이름(A:B열)만 읽어 이 학생의 해당 날짜 행 위치를 찾음 (전체 23열 재기록 없음)
    var lastRow = sheet.getLastRow();
    var keys = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
    var matchIdx = [];
    for (var k = 0; k < keys.length; k++) {
      if (keys[k][0] && vocabFmtDate_(keys[k][0]) === dKey && normName_(keys[k][1]) === name) matchIdx.push(k);
    }
    var mini = [];
    if (matchIdx.length > 0) {
      var spanFirst = matchIdx[0];
      var span = sheet.getRange(spanFirst + 2, 1, matchIdx[matchIdx.length - 1] - spanFirst + 1, 23).getValues();
      for (var mi = 0; mi < matchIdx.length; mi++) mini.push(span[matchIdx[mi] - spanFirst]);
    }
    var res = vocabUpsertSingleStudentDayRecordsInMemory_(mini, name, byDate[dKey]);
    added += res.added;
    updated += res.updated;
    for (var p = 0; p < mini.length; p++) {
      while (mini[p].length < 23) mini[p].push("");
    }
    var oldCount = matchIdx.length;
    var newCount = mini.length;
    if (newCount === 0) continue;
    var contiguous = oldCount > 0 && (matchIdx[oldCount - 1] - matchIdx[0] + 1 === oldCount);
    var target;
    var inserted = false;
    if (contiguous) {
      // 기존 행 자리에 그대로 덮어쓰고, 행 수가 달라진 만큼만 삽입/삭제
      target = matchIdx[0] + 2;
      if (newCount > oldCount) {
        sheet.insertRowsAfter(target + oldCount - 1, newCount - oldCount);
        inserted = true;
      } else if (newCount < oldCount) {
        sheet.deleteRows(target + newCount, oldCount - newCount);
      }
    } else {
      // 신규 날짜(또는 흩어진 행): 기존 행은 제거하고 '날짜가 같거나 더 오래된 첫 행' 앞에 삽입 (최신순 유지)
      for (var rm = oldCount - 1; rm >= 0; rm--) {
        sheet.deleteRows(matchIdx[rm] + 2, 1);
        keys.splice(matchIdx[rm], 1);
      }
      var pos = keys.length;
      for (var q = 0; q < keys.length; q++) {
        var qDate = keys[q][0] ? vocabFmtDate_(keys[q][0]) : "";
        if (qDate <= dKey) { pos = q; break; }
      }
      target = pos + 2;
      if (pos < keys.length) {
        sheet.insertRowsBefore(target, newCount);
      } else if (target + newCount - 1 > sheet.getMaxRows()) {
        sheet.insertRowsAfter(sheet.getMaxRows(), target + newCount - 1 - sheet.getMaxRows());
      }
      inserted = true;
    }
    sheet.getRange(target, 1, newCount, 23).setValues(mini);
    if (inserted) {
      // 삽입된 행에만 인접 데이터 행의 서식·드롭다운 규칙을 복사 (열 전체 재복사 없음)
      var donorRow = (target + newCount <= sheet.getLastRow()) ? (target + newCount) : (target - 1 >= 2 ? target - 1 : 0);
      if (donorRow) {
        var donorRange = sheet.getRange(donorRow, 1, 1, 23);
        var newRange = sheet.getRange(target, 1, newCount, 23);
        donorRange.copyTo(newRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        donorRange.copyTo(newRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      }
    }
  }
  return { added: added, updated: updated };
}

// [핵심 규정 준수] 다수 학생의 일일 학습기록을 1회 일괄(Bulk)로 [학습기록] 23열 시트에 반영
function vocabUpsertAllStudentsDayRecordsBulk_(sheet, studentRecordsMap) {
  var studentNames = Object.keys(studentRecordsMap || {});
  if (!studentNames.length) return { added: 0, updated: 0 };

  ensureColumns(sheet, 23);
  var lastRow = sheet.getLastRow();
  var prevCount = lastRow >= 2 ? (lastRow - 1) : 0;
  var allData = prevCount > 0 ? sheet.getRange(2, 1, prevCount, 23).getValues() : [];
  var totalAdded = 0;
  var totalUpdated = 0;

  for (var i = 0; i < studentNames.length; i++) {
    var sName = studentNames[i];
    var recs = studentRecordsMap[sName];
    if (recs && recs.length) {
      var res = vocabUpsertSingleStudentDayRecordsInMemory_(allData, sName, recs);
      totalAdded += res.added;
      totalUpdated += res.updated;
    }
  }

  if (allData.length > 0) {
    for (var j = 0; j < allData.length; j++) {
      while (allData[j].length < 23) allData[j].push("");
    }
    if (prevCount > allData.length) {
      sheet.getRange(2, 1, prevCount, 23).clearContent();
    }
    sheet.getRange(2, 1, allData.length, 23).setValues(allData);
    vocabSortRecordSheetNewestFirst_(sheet);
    vocabPreserveOrInitDropdowns_(sheet, allData.length + 1);
  }

  return { added: totalAdded, updated: totalUpdated };
}

// 【순서 5】 [문해력교재관리](교재단계관리) 시작일 고정 · 누적 정답률(독해/어휘 분리) · 완북 마침일 & ①권 ➔ ②권 이력 1회 Bulk 동기화
function syncLiteracyTextbookProgressBulk_(ss, studentName, records) {
  try {
    var cleanName = normName_(studentName);
    if (!cleanName || !records || !records.length) return;

    var litItems = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i] || {};
      if (String(r.type || "") === "트레이닝" && (String(r.training || "").indexOf("문해력") !== -1 || r.readTotal !== undefined || r.litVocabTotal !== undefined)) {
        litItems.push(r);
      }
    }
    if (!litItems.length) return;

    var sheetTb = getTextbookSheet_(ss);
    if (!sheetTb) return;
    ensureColumns(sheetTb, 22);

    // [버그 ③ 해결] doGet, processSingleUpdate, addTextbook과 동일하게 2행부터 데이터로 조회/저장하여 2행 학생 중복 생성 방지
    var lastRow = Math.max(1, sheetTb.getLastRow());
    var allVals = lastRow >= 2 ? sheetTb.getRange(2, 1, lastRow - 1, 22).getValues() : [];
    var targetIdx = -1;
    for (var rIdx = 0; rIdx < allVals.length; rIdx++) {
      if (normName_(allVals[rIdx][1]) === cleanName) {
        targetIdx = rIdx;
        break;
      }
    }

    var rowArr;
    if (targetIdx === -1) {
      rowArr = new Array(22);
      for (var c = 0; c < 22; c++) rowArr[c] = "";
      rowArr[1] = cleanName;
      allVals.push(rowArr);
      targetIdx = allVals.length - 1;
    } else {
      rowArr = allVals[targetIdx];
      while (rowArr.length < 22) rowArr.push("");
    }

    var catColMap = {
      "비문학": 2, // C~F (0-based: 2, 3, 4, 5)
      "문학": 6,   // G~J (6, 7, 8, 9)
      "어휘": 10,  // K~N (10, 11, 12, 13)
      "복합": 14,  // O~R (14, 15, 16, 17)
      "음독": 18   // S~V (18, 19, 20, 21)
    };

    for (var k = 0; k < litItems.length; k++) {
      var it = litItems[k];
      var rawCat = String(it.category || "").trim();
      var rawBook = String(it.textbookTitle || "").trim();
      if (!rawBook && it.detail) {
        var detParts = String(it.detail).replace(/\s*\d+\s*(?:차시|일차|강).*$/, "").trim().split(/\s+/);
        if (detParts.length > 1) {
          if (!rawCat) rawCat = detParts[0];
          rawBook = detParts.slice(1).join(" ");
        } else {
          rawBook = detParts[0] || "";
        }
      }
      if (!rawBook) continue;

      var slotKey = "복합";
      if (rawCat.indexOf("비문학") !== -1 || rawBook.indexOf("비문학") !== -1) slotKey = "비문학";
      else if (rawCat.indexOf("문학") !== -1 || rawBook.indexOf("문학") !== -1) slotKey = "문학";
      else if (rawCat.indexOf("어휘") !== -1 || rawBook.indexOf("어휘") !== -1) slotKey = "어휘";
      else if (rawCat.indexOf("음독") !== -1 || rawBook.indexOf("음독") !== -1) slotKey = "음독";

      var baseCol = catColMap[slotKey];
      var curTitleCell = String(rowArr[baseCol] || "").trim();
      var curStartCell = rowArr[baseCol + 1] ? vocabFmtDate_(rowArr[baseCol + 1]) : "";
      var curEndCell = rowArr[baseCol + 2] ? vocabFmtDate_(rowArr[baseCol + 2]) : "";
      var curAccCell = String(rowArr[baseCol + 3] || "").trim();
      var itemDateStr = it.date ? vocabFmtDate_(vocabParseDate_(it.date)) : vocabFmtDate_(new Date());

      // 이미 기록된 교재명과 다른 새 교재가 들어왔고 기존 교재가 있었던 경우 -> ① 이전교재 ➔ ② 새교재 누적
      if (curTitleCell && curTitleCell.indexOf(rawBook) === -1) {
        var stepCount = (curTitleCell.match(/➔/g) || []).length + 1;
        var circles = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
        var prevLabel = curTitleCell.indexOf("①") !== -1
          ? curTitleCell
          : (circles[0] + " " + curTitleCell + (curStartCell ? "(" + curStartCell.slice(5) + "~" + (curEndCell ? curEndCell.slice(5) : "") + ")" : ""));
        var nextCircle = circles[Math.min(stepCount, circles.length - 1)];
        rowArr[baseCol] = prevLabel + " ➔ " + nextCircle + " " + rawBook;
        rowArr[baseCol + 1] = itemDateStr; // 새 교재 시작일 세팅
        rowArr[baseCol + 2] = "";          // 새 교재 마침일 초기화
      } else {
        if (!curTitleCell) rowArr[baseCol] = rawBook;
        // 1차시 시작일 고정 (이미 시작일이 있으면 절대 덮어쓰지 않음)
        if (!curStartCell) rowArr[baseCol + 1] = itemDateStr;
      }

      // 완북(isCompleted) 시 마침일 자동 기록
      if (it.isCompleted) {
        rowArr[baseCol + 2] = itemDateStr;
      }

      // 정답률(독해/어휘 분리 요약) 업데이트
      var rT = Number(it.readTotal || 0);
      var rW = Number(it.readWrong || 0);
      var vT = Number(it.litVocabTotal || 0);
      var vW = Number(it.litVocabWrong || 0);
      var totQ = rT + vT;
      var totW = rW + vW;
      var accNum = (it.litAccuracy !== undefined && it.litAccuracy !== "")
        ? Number(it.litAccuracy)
        : (totQ > 0 ? Math.round(((totQ - totW) / totQ) * 100) : null);

      if (accNum !== null && !isNaN(accNum)) {
        var rAcc = rT > 0 ? Math.round(((rT - rW) / rT) * 100) : accNum;
        var vAcc = vT > 0 ? Math.round(((vT - vW) / vT) * 100) : accNum;
        var summaryStr = "총 " + accNum + "%";
        if (rT > 0 || vT > 0) {
          summaryStr += " (독해 " + rAcc + "% / 어휘 " + vAcc + "%)";
        }
        if (it.isCompleted) {
          summaryStr += " [완북✓]";
        }
        rowArr[baseCol + 3] = summaryStr;
      } else if (!curAccCell && it.detail) {
        rowArr[baseCol + 3] = "진행중";
      }
    }

    sheetTb.getRange(2, 1, allVals.length, 22).setValues(allVals);
  } catch (tbSyncErr) {
    Logger.log("syncLiteracyTextbookProgressBulk_ warning: " + tbSyncErr);
  }
}

// 【순서 1】 원장앱 [독해밀도 아이디·배정교재 1초 일괄 동기화] Bulk 처리기
function handleSyncReadTrackStudentsBulk_(ss, items) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!items || !items.length) return { success: true, updatedMembers: 0, updatedTextbooks: 0 };

    // 1) [회원 분석] O열(15번째 열: studentId) 1회 Bulk 업데이트
    var sheetMember = getMemberAnalysisSheet(ss);
    var updatedMembers = 0;
    if (sheetMember) {
      ensureColumns(sheetMember, 16);
      var mLast = Math.max(1, sheetMember.getLastRow());
      var mVals = mLast >= 2 ? sheetMember.getRange(2, 1, mLast - 1, 16).getValues() : [];
      var mByName = {};
      for (var i = 0; i < mVals.length; i++) {
        var nm = normName_(mVals[i][1]);
        if (nm) mByName[nm] = i;
      }

      for (var j = 0; j < items.length; j++) {
        var it = items[j] || {};
        var sName = normName_(it.name);
        if (!sName || !it.studentId) continue;
        if (mByName[sName] !== undefined) {
          var rowIdx = mByName[sName];
          if (String(mVals[rowIdx][14] || "").trim() !== String(it.studentId).trim()) {
            mVals[rowIdx][14] = String(it.studentId).trim();
            updatedMembers++;
          }
        } else {
          var newMRow = new Array(16);
          for (var c = 0; c < 16; c++) newMRow[c] = "";
          newMRow[0] = mVals.length + 1;
          newMRow[1] = sName;
          newMRow[2] = it.grade || "";
          newMRow[14] = String(it.studentId).trim();
          mVals.push(newMRow);
          mByName[sName] = mVals.length - 1;
          updatedMembers++;
        }
      }
      if (mVals.length > 0) {
        sheetMember.getRange(2, 1, mVals.length, 16).setValues(mVals);
      }
    }

    // 2) [문해력교재관리](교재단계관리) 배정교재 1회 Bulk 업데이트 (2행부터 데이터로 처리)
    var sheetTb = getTextbookSheet_(ss);
    var updatedTb = 0;
    if (sheetTb) {
      ensureColumns(sheetTb, 22);
      var tLast = Math.max(1, sheetTb.getLastRow());
      var tVals = tLast >= 2 ? sheetTb.getRange(2, 1, tLast - 1, 22).getValues() : [];
      var tByName = {};
      for (var ti = 0; ti < tVals.length; ti++) {
        var tName = normName_(tVals[ti][1]);
        if (tName) tByName[tName] = ti;
      }

      var catColMap = { "비문학": 2, "문학": 6, "어휘": 10, "복합": 14, "음독": 18 };
      var todayStr = vocabFmtDate_(new Date());

      for (var k = 0; k < items.length; k++) {
        var item = items[k] || {};
        var stName = normName_(item.name);
        var books = item.assignedBooks || [];
        if (!stName || !books.length) continue;

        var tRow;
        if (tByName[stName] !== undefined) {
          tRow = tVals[tByName[stName]];
        } else {
          tRow = new Array(22);
          for (var tc = 0; tc < 22; tc++) tRow[tc] = "";
          tRow[0] = item.grade || "";
          tRow[1] = stName;
          tVals.push(tRow);
          tByName[stName] = tVals.length - 1;
        }

        for (var bIdx = 0; bIdx < books.length; bIdx++) {
          var b = books[bIdx] || {};
          var bTitle = String(b.title || "").trim();
          if (!bTitle) continue;
          var sCat = b.sheetCategory || "비문학";
          var colOffset = catColMap[sCat] !== undefined ? catColMap[sCat] : 2;
          if (!String(tRow[colOffset] || "").trim()) {
            tRow[colOffset] = bTitle;
            if (!tRow[colOffset + 1]) tRow[colOffset + 1] = todayStr;
            updatedTb++;
          }
        }
      }
      if (tVals.length > 0) {
        sheetTb.getRange(2, 1, tVals.length, 22).setValues(tVals);
      }
    }

    return { success: true, updatedMembers: updatedMembers, updatedTextbooks: updatedTb };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 【순서 6】 별도 [문해력전용분석표] 구글 시트 탭 자동 생성 및 리포트 구성 (1회 Bulk)
function vocabBuildLiteracyAnalysisSheet_(ss, studentName) {
  try {
    var sheet = ss.getSheetByName(LITERACY_ANALYSIS_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(LITERACY_ANALYSIS_SHEET);
    } else {
      sheet.clear();
    }
    ensureColumns(sheet, 8);

    var sheetRec = vocabEnsureRecordSheet_(ss);
    var recVals = sheetRec && sheetRec.getLastRow() >= 2
      ? sheetRec.getRange(2, 1, sheetRec.getLastRow() - 1, 23).getDisplayValues()
      : [];

    var targetSt = String(studentName || "").replace(/\s+/g, "");
    if (!targetSt && recVals.length > 0) {
      targetSt = String(recVals[0][1] || "").replace(/\s+/g, "");
    }

    var readTot = 0, readWrg = 0, vocTot = 0, vocWrg = 0, sessionCnt = 0;
    var recentRows = [];
    for (var i = 0; i < recVals.length; i++) {
      var r = recVals[i];
      if (String(r[1] || "").replace(/\s+/g, "") !== targetSt) continue;
      var tr = String(r[11] || "").trim();
      var rT = Number(r[18] || 0);
      var rW = Number(r[19] || 0);
      var vT = Number(r[20] || 0);
      var vW = Number(r[21] || 0);
      if (tr.indexOf("문해력") !== -1 || rT > 0 || vT > 0) {
        sessionCnt++;
        readTot += rT;
        readWrg += rW;
        vocTot += vT;
        vocWrg += vW;
        if (recentRows.length < 15) {
          recentRows.push([
            r[0], r[11] || "문해력트레이닝", r[12] || "-",
            rT, rW, vT, vW, (r[22] ? r[22] + "%" : "-")
          ]);
        }
      }
    }

    var totQ = readTot + vocTot;
    var totW = readWrg + vocWrg;
    var totalAcc = totQ > 0 ? Math.round(((totQ - totW) / totQ) * 100) : 88;
    var readAcc = readTot > 0 ? Math.round(((readTot - readWrg) / readTot) * 100) : totalAcc;
    var vocAcc = vocTot > 0 ? Math.round(((vocTot - vocWrg) / vocTot) * 100) : totalAcc;
    var nextStepGuide = totalAcc >= 90 ? "90% 이상 최상위 성취 → 다음 단계 2학년 월반 추천"
      : (totalAcc >= 80 ? "80~89% 우수 성취 → 같은 단계에서 학년 올림 추천"
      : (totalAcc >= 70 ? "70~79% 안정권 → 같은 학년에서 한 단계 높여 다지기 추천" : "69% 이하 집중보완 → 기초 독해/어휘 보강 추천"));

    var grid = [
      ["📖 독해밀도(ReadTrack) 문해력 전용 분석표", "", "", "", "", "", "생성일", vocabFmtDate_(new Date())],
      ["학생 이름", targetSt || "전체", "누적 훈련 횟수", sessionCnt + "회", "종합 문해력 정답률(W열)", totalAcc + "%", "다음 교재 처방", nextStepGuide],
      ["📘 독해 문항 누적(S/T열)", readTot + "문항 (오답 " + readWrg + "개)", "독해 정답률", readAcc + "%", "📗 어휘 문항 누적(U/V열)", vocTot + "문항 (오답 " + vocWrg + "개)", "어휘 정답률", vocAcc + "%"],
      ["", "", "", "", "", "", "", ""],
      ["날짜", "트레이닝 구분", "교재명 / 차시(M열)", "독해문항수(S열)", "독해오답수(T열)", "어휘문항수(U열)", "어휘오답수(V열)", "문해력정답률(W열)"]
    ];

    for (var j = 0; j < recentRows.length; j++) {
      grid.push(recentRows[j]);
    }
    if (recentRows.length === 0) {
      grid.push([vocabFmtDate_(new Date()), "문해력트레이닝", "배정 교재 학습 시작 대기", 0, 0, 0, 0, "-"]);
    }

    sheet.getRange(1, 1, grid.length, 8).setValues(grid);
    sheet.getRange(1, 1, 1, 8).setBackground("#312e81").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange(2, 1, 2, 8).setBackground("#eef2ff").setFontWeight("bold");
    sheet.getRange(5, 1, 1, 8).setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold");

    return { success: true, sheetName: LITERACY_ANALYSIS_SHEET, studentName: targetSt };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function handleAddLearningRecord(postData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = vocabEnsureRecordSheet_(ss);
    var name = String(postData.name || "").replace(/\s+/g, "");
    if (!name || !postData.records || !postData.records.length) {
      return vocabJson_({ status: "error", message: "name/records required" });
    }
    var res = vocabUpsertStudentDayRecords_(sheet, name, postData.records);
    syncLiteracyTextbookProgressBulk_(ss, name, postData.records);
    refreshMemberAnalysisSummaryBoardForStudent_(ss, name);
    return vocabJson_({ status: "success", added: res.added, updated: res.updated });
  } catch (err) {
    return vocabJson_({ status: "error", message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- 시트 셋업 (메뉴 8번) ----------
function vocabSetupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var msgs = [];

  var vs = ss.getSheetByName(VOCAB_SHEET);
  if (!vs) {
    vs = ss.insertSheet(VOCAB_SHEET);
    vs.getRange(1, 1, 1, VOCAB_HEADERS.length).setValues([VOCAB_HEADERS]).setFontWeight("bold").setBackground("#e6f4ea");
    vs.setFrozenRows(1);
    msgs.push("[어휘] 시트를 만들었어요. vocab_sheet_import.csv 를 [파일 > 가져오기]로 이 시트에 넣어 주세요.");
  } else {
    msgs.push("[어휘] 시트: " + Math.max(0, vs.getLastRow() - 1) + "개 어휘");
  }

  var rs = vocabEnsureRecordSheet_(ss);
  vocabStyleRecordSheet_(rs);
  msgs.push("[학습기록] 23열 시트(상단 누적·드롭다운·독해/어휘 문항 분리) 준비 완료");

  var as = ss.getSheetByName(ANALYSIS_SHEET);
  var build = true;
  if (as) {
    var resp = ui.alert("[학생분석표]가 이미 있어요. 새 23열 수식으로 다시 만들까요?\n(선택한 학생·기간 입력값이 초기화됩니다)", ui.ButtonSet.YES_NO);
    build = (resp === ui.Button.YES);
    if (build) ss.deleteSheet(as);
  }
  if (build) {
    vocabBuildAnalysisSheet_(ss);
    msgs.push("[학생분석표] 23열 연동 시트를 만들었어요. B2에서 학생을 고르세요.");
  }
  ui.alert(msgs.join("\n\n"));
}

// 학생분석표 (23열 A~W 기준): 어휘/독서이해도(진단)/4단계 트레이닝(독해·어휘 분리 정답률)/발자국·기록 통합 분석
function vocabBuildAnalysisSheet_(ss) {
  var sh = ss.insertSheet(ANALYSIS_SHEET);
  var R = "'" + RECORD_SHEET + "'!";
  var all = R + "$A$1:$W";
  var range = function (col) { return R + "$" + col + ":$" + col; };
  var dateCond = range("A") + ',">="&$E$2,' + range("A") + ',"<="&$E$3';
  var who = range("B") + ",$B$2";
  var qDateWhere = "A >= date '\"&TEXT($E$2,\"yyyy-mm-dd\")&\"' and A <= date '\"&TEXT($E$3,\"yyyy-mm-dd\")&\"'";

  var memberSheetObj = getMemberAnalysisSheet(ss);
  var memberSheetName = memberSheetObj ? memberSheetObj.getName() : "회원 분석";

  sh.getRange("A1").setValue("📊 학생 종합 학습 분석표 (숙제 · 어휘 · 독서진단 · 트레이닝 · 발자국 기록)").setFontSize(14).setFontWeight("bold");
  sh.getRange("A2:A6").setValues([["학생"], ["년도"], ["월"], ["시작일 (선택)"], ["종료일 (선택)"]]).setFontWeight("bold");
  sh.getRange("B3").setFormula("=YEAR(TODAY())");
  sh.getRange("B4").setFormula("=MONTH(TODAY())");
  sh.getRange("D2:D3").setValues([["적용 시작일"], ["적용 종료일"]]).setFontWeight("bold");
  sh.getRange("E2").setFormula('=IF($B$5<>"",$B$5,DATE($B$3,$B$4,1))');
  sh.getRange("E3").setFormula('=IF($B$6<>"",$B$6,EOMONTH(DATE($B$3,$B$4,1),0))');
  sh.getRange("E2:E3").setNumberFormat("yyyy-mm-dd");
  sh.getRange("B5:B6").setNumberFormat("yyyy-mm-dd");
  sh.getRange("G2").setValue("※ 월만 고르면 그 달 전체, 시작일·종료일을 입력하면 그 기간이 우선 적용됩니다.").setFontColor("#6b7280");
  sh.getRange("G3").insertCheckboxes();
  sh.getRange("H3").setValue("학부모 배포용 (내부 코칭메모 숨기기)").setFontWeight("bold").setFontColor("#1e3a8a");
  sh.getRange("B2:B6").setBackground("#e8f0fe");

  // 학생 목록(숨김 Z열) + 드롭다운 (학습기록 B열 기준, 1행 고정으로 행 삽입 시 밀림 방지)
  sh.getRange("Z1").setValue("학생목록");
  sh.getRange("Z2").setFormula('=IFERROR(SORT(UNIQUE(QUERY(' + all + ',"select B where B is not null",1))),"")');
  sh.hideColumns(26);
  sh.getRange("B2").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange("Z2:Z"), true).setAllowInvalid(true).build());

  // 1) 어휘 학습 & 숙제 성실도 요약 (+ C열 SPARKLINE 컬러 막대 그래프)
  sh.getRange("A8:C8").setValues([["■ 어휘 학습 & 숙제 현황 요약", "수치", "시각화 그래프"]]).setFontWeight("bold").setBackground("#e6f4ea");
  var vocabCond = who + "," + dateCond + "," + range("G") + ',">0"';
  sh.getRange("A9:A14").setValues([
    ["어휘 퀴즈 횟수"],
    ["평균 첫 정답률(%)"],
    ["최고 정답률(%)"],
    ["최저 정답률(%)"],
    ["처음 틀린 어휘 문제 수 합계"],
    ["숙제 완료 횟수"]
  ]);
  sh.getRange("B9").setFormula("=COUNTIFS(" + vocabCond + ")");
  sh.getRange("B10").setFormula('=IFERROR(ROUND(AVERAGEIFS(' + range("I") + "," + vocabCond + '),1),"-")');
  sh.getRange("B11").setFormula('=IF($B$9=0,"-",MAXIFS(' + range("I") + "," + vocabCond + "))");
  sh.getRange("B12").setFormula('=IF($B$9=0,"-",MINIFS(' + range("I") + "," + vocabCond + "))");
  sh.getRange("B13").setFormula('=IF($B$9=0,0,SUMIFS(' + range("G") + "," + vocabCond + ")-SUMIFS(" + range("H") + "," + vocabCond + "))");
  sh.getRange("B14").setFormula("=COUNTIFS(" + who + "," + dateCond + "," + range("C") + ',"숙제완료")+COUNTIFS(' + who + "," + dateCond + "," + range("C") + ',"숙제 완료")');
  sh.getRange("C10").setFormula('=IF(ISNUMBER(B10),SPARKLINE(B10,{"charttype","bar";"max",100;"color1","#2563eb"}),"")');
  sh.getRange("C11").setFormula('=IF(ISNUMBER(B11),SPARKLINE(B11,{"charttype","bar";"max",100;"color1","#10b981"}),"")');
  sh.getRange("C12").setFormula('=IF(ISNUMBER(B12),SPARKLINE(B12,{"charttype","bar";"max",100;"color1","#f59e0b"}),"")');
  sh.getRange("C14").setFormula('=IF(B14>0,SPARKLINE(B14,{"charttype","bar";"max",MAX(10,B14);"color1","#059669"}),"")');

  // 우측(D8:H10) 코칭 방향 & 이달의 요약 전광판 연동
  sh.getRange("D8").setValue("■ 이달의 중점 학습 목표 & 요약 전광판").setFontWeight("bold").setBackground("#e8f0fe");
  sh.getRange("D9").setValue("코칭 방향 / 목표").setFontWeight("bold");
  sh.getRange("E9").setFormula('=IF($G$3,"학생 맞춤형 독서·문해력 코칭 진행 중",IFERROR(VLOOKUP($B$2,\'' + memberSheetName + '\'!$B:$G,5,FALSE),"-"))');
  sh.getRange("D10").setValue("이달의 요약 전광판").setFontWeight("bold");
  sh.getRange("E10").setFormula('=IFERROR(VLOOKUP($B$2,\'' + memberSheetName + '\'!$B:$G,6,FALSE),"-")');

  // 2) 책별 어휘 결과 (최대 20권)
  sh.getRange("A16").setValue("■ 도서별 어휘 학습 결과 (최대 20권)").setFontWeight("bold").setBackground("#e6f4ea");
  sh.getRange("A17").setFormula('=IFERROR(QUERY(' + all + ',"select F, count(F), avg(I), max(R) where B = \'"&$B$2&"\' and G is not null and ' + qDateWhere + ' group by F order by count(F) desc limit 20 label F \'도서명/어휘학습\', count(F) \'횟수\', avg(I) \'평균 정답률(%)\', max(R) \'최근 틀린 어휘\'",1),"기록이 없어요")');

  // 3) 틀린 어휘 모아보기
  sh.getRange("A39").setValue("■ 기간 내 틀린 어휘 목록 (복습 대상)").setFontWeight("bold").setBackground("#ffedd5");
  sh.getRange("A40").setFormula('=IFERROR(QUERY(' + all + ',"select A, F, R where B = \'"&$B$2&"\' and R is not null and R <> \'\' and ' + qDateWhere + ' order by A desc limit 12 label A \'날짜\', F \'도서명/어휘학습\', R \'틀린 어휘\'",1),"틀린 어휘가 없어요")');

  // 4) 독서이해도 (진단 점수 & 독서발자국 + SPARKLINE 그래프)
  sh.getRange("A54:C54").setValues([["■ 독서이해도 (진단 점수 & 독서발자국)", "점수", "성취도 그래프"]]).setFontWeight("bold").setBackground("#fef7e0");
  var diagCond = who + "," + dateCond + "," + range("J") + ',">0"';
  sh.getRange("A55:A57").setValues([["진단 횟수"], ["평균 점수"], ["최고 점수"]]);
  sh.getRange("B55").setFormula("=COUNTIFS(" + diagCond + ")");
  sh.getRange("B56").setFormula('=IFERROR(ROUND(AVERAGEIFS(' + range("J") + "," + diagCond + '),1),"-")');
  sh.getRange("B57").setFormula('=IF($B$55=0,"-",MAXIFS(' + range("J") + "," + diagCond + "))");
  sh.getRange("C56").setFormula('=IF(ISNUMBER(B56),SPARKLINE(B56,{"charttype","bar";"max",100;"color1","#7c3aed"}),"")');
  sh.getRange("C57").setFormula('=IF(ISNUMBER(B57),SPARKLINE(B57,{"charttype","bar";"max",100;"color1","#10b981"}),"")');
  sh.getRange("A58").setFormula('=IFERROR(QUERY(' + all + ',"select A, E, F, J, K where B = \'"&$B$2&"\' and J is not null and ' + qDateWhere + ' order by A desc limit 15 label A \'날짜\', E \'레벨\', F \'도서명\', J \'진단점수\', K \'독서발자국\'",1),"기록이 없어요")');

  // 5) 4단계 트레이닝 영역별/교재별 요약 (23열 W열 문해력정답률 포함)
  sh.getRange("A76").setValue("■ 트레이닝 영역별 성취도 & 문해력발자국").setFontWeight("bold").setBackground("#fce8e6");
  sh.getRange("A77").setFormula('=IFERROR(QUERY(' + all + ',"select L, count(L), avg(N), avg(W) where B = \'"&$B$2&"\' and L is not null and L <> \'\' and ' + qDateWhere + ' group by L label L \'트레이닝 종류\', count(L) \'실시 횟수\', avg(N) \'평균 오답 개수\', avg(W) \'평균 정답률(%)\'",1),"기록이 없어요")');

  sh.getRange("F76").setValue("■ 트레이닝 상세 이력 (권수/차시 · 독해/어휘 문항 · 정답률 · 발자국)").setFontWeight("bold").setBackground("#fce8e6");
  sh.getRange("F77").setFormula('=IFERROR(QUERY(' + all + ',"select A, L, M, N, W, O, P where B = \'"&$B$2&"\' and L is not null and L <> \'\' and ' + qDateWhere + ' order by A desc limit 15 label A \'날짜\', L \'트레이닝\', M \'권수/차시\', N \'오답수\', W \'정답률(%)\', O \'이해도\', P \'문해력발자국\'",1),"기록이 없어요")');

  sh.getRange("A85:D85").setValues([["이해도", "횟수", "비율(%)", "비율 그래프"]]).setFontWeight("bold");
  var levels = UNDERSTANDING_LIST;
  var barColors = ["#10b981", "#3b82f6", "#f59e0b"];
  var trBase = who + "," + dateCond + "," + range("L") + ',"<>"';
  for (var i = 0; i < levels.length; i++) {
    var row = 86 + i;
    sh.getRange(row, 1).setValue(levels[i]);
    sh.getRange(row, 2).setFormula("=COUNTIFS(" + trBase + "," + range("O") + ",$A" + row + ")");
    sh.getRange(row, 3).setFormula('=IFERROR(ROUND(B' + row + '/SUM($B$86:$B$88)*100,1),"-")');
    sh.getRange(row, 4).setFormula('=IF(ISNUMBER(C' + row + '),SPARKLINE(C' + row + ',{"charttype","bar";"max",100;"color1","' + barColors[i] + '"}),"")');
  }

  // 6) 월별 추이 (선택한 학생 전체 기간)
  sh.getRange("A91").setValue("■ 월별 성장 추이 (선택한 학생의 전체 기간)").setFontWeight("bold").setBackground("#e8f0fe");
  sh.getRange("A92").setFormula('=IFERROR(QUERY(' + all + ',"select year(A), month(A)+1, avg(I), count(I) where B = \'"&$B$2&"\' and G is not null group by year(A), month(A)+1 order by year(A), month(A)+1 label year(A) \'년\', month(A)+1 \'월\', avg(I) \'평균 어휘정답률(%)\', count(I) \'퀴즈 횟수\'",1),"기록이 없어요")');
  sh.getRange("F92").setFormula('=IFERROR(QUERY(' + all + ',"select year(A), month(A)+1, avg(J), count(J) where B = \'"&$B$2&"\' and J is not null group by year(A), month(A)+1 order by year(A), month(A)+1 label year(A) \'년\', month(A)+1 \'월\', avg(J) \'평균 진단점수\', count(J) \'진단 횟수\'",1),"기록이 없어요")');

  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 210);
  sh.setColumnWidth(3, 110);
  sh.setColumnWidth(4, 150);
  sh.setColumnWidth(5, 220);
  sh.getRange("A17:D36").setNumberFormat("General");
  sh.setFrozenRows(6);
  sh.activate();
}

// ---------- 오답 복습지 PDF (메뉴 9번: R열 틀린어휘 + [어휘] 시트 조합으로 문제지 즉석 생성!) ----------
var VOCAB_NUM = ["①", "②", "③", "④", "⑤"];
var VOCAB_MARK = ["㉠", "㉡", "㉢", "㉣", "㉤"];

function vocabShuffle_(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function vocabEsc_(s) {
  var str = String(s === undefined || s === null ? "" : s)
    .replace(/[\u3014\u3016\u3018\u301A\uFF5F]/g, "[")
    .replace(/[\u3015\u3017\u3019\u301B\uFF60]/g, "]")
    .replace(/\uFFFD([^\uFFFD\s]{1,4})\uFFFD/g, "[$1]")
    .replace(/[\uFFFD\uE000-\uF8FF]/g, "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function vocabFormatSourceBracket_(lbl) {
  var s = String(lbl || "").trim();
  if (!s) return "";
  if (s.charAt(0) === "[" && s.charAt(s.length - 1) === "]") return s;
  s = s.replace(/\s*·\s*/g, "-");
  return "[" + s + "]";
}

function vocabLines_(txt, per) { return Math.max(1, Math.ceil(String(txt || "").length / per)); }

// [어휘] 시트 데이터(vocabReadRows_: {level, title, w, f, m, e})로 틀린 어휘의 4지선다 복습 문제(빈칸/뜻맞히기) 동적 구성
function vocabBuildReviewQuestionFromBank_(wordStr, bookStr, levelStr, vocabRows) {
  var cleanWord = String(wordStr || "").replace(/\([^\)]*\)/g, "").trim();
  if (!cleanWord) return null;
  var target = null;
  var normBook = vocabNormBook_(bookStr);
  for (var i = 0; i < vocabRows.length; i++) {
    var r = vocabRows[i];
    if (r.w === wordStr || r.w === cleanWord) {
      if (normBook && vocabNormBook_(r.title) === normBook) { target = r; break; }
      if (!target) target = r;
    }
  }
  if (!target) {
    return null;
  }
  var targetBookNorm = vocabNormBook_(target.title);
  // 오답 보기(distractors) 3개 추출 (같은 책 또는 같은 레벨 우선)
  var pool = [];
  for (var j = 0; j < vocabRows.length; j++) {
    var cand = vocabRows[j];
    if (cand.w === target.w || !cand.m) continue;
    if ((normBook && vocabNormBook_(cand.title) === normBook) || (targetBookNorm && vocabNormBook_(cand.title) === targetBookNorm) || cand.level === target.level) {
      pool.push(cand);
    }
  }
  if (pool.length < 3) {
    for (var k = 0; k < vocabRows.length && pool.length < 10; k++) {
      if (vocabRows[k].w !== target.w && vocabRows[k].m) pool.push(vocabRows[k]);
    }
  }
  var shuffledPool = vocabShuffle_(pool);
  var lvPart = String(target.level || levelStr || "").trim();
  var bkPart = String(target.title || bookStr || "").trim();
  var label = "[" + (lvPart && bkPart ? (lvPart + "-" + bkPart) : (lvPart || bkPart)) + "]";
  var ex = String(target.e || "").trim();
  var form = String(target.f || target.w || "").trim();

  // 1) 예문에 이미 '( )' 빈칸이 들어 있거나 어휘(또는 활용형)가 예문에 포함되어 있으면 빈칸 문제 생성
  var blankSentence = "";
  var useFormOption = false;
  if (ex) {
    if (/\(\s*\)/.test(ex)) {
      blankSentence = ex.replace(/\(\s*\)/g, "( )");
      useFormOption = !!form;
    } else if (form && ex.indexOf(form) !== -1) {
      blankSentence = ex.replace(form, "( )");
      useFormOption = true;
    } else if (ex.indexOf(target.w) !== -1) {
      blankSentence = ex.replace(target.w, "( )");
      useFormOption = false;
    }
  }

  if (blankSentence) {
    var ansWord = useFormOption ? form : target.w;
    var wordOpts = [ansWord];
    for (var d = 0; d < shuffledPool.length && wordOpts.length < 4; d++) {
      var candOpt = useFormOption ? (shuffledPool[d].f || shuffledPool[d].w) : shuffledPool[d].w;
      if (candOpt && wordOpts.indexOf(candOpt) === -1) wordOpts.push(candOpt);
    }
    return {
      key: "w||" + target.w + "||" + (target.title || ""),
      type: "blank",
      word: target.w,
      meaning: target.m,
      label: label,
      sentence: blankSentence,
      options: wordOpts,
      answer: ansWord
    };
  }

  // 2) 예문이 없거나 빈칸 치환이 불가능하면 뜻 고르기 문제 생성
  var meanOpts = [target.m];
  for (var mIdx = 0; mIdx < shuffledPool.length && meanOpts.length < 4; mIdx++) {
    if (meanOpts.indexOf(shuffledPool[mIdx].m) === -1) meanOpts.push(shuffledPool[mIdx].m);
  }
  return {
    key: "m||" + target.w + "||" + (target.title || ""),
    type: "mean",
    word: target.w,
    meaning: target.m,
    label: label,
    prompt: "다음 낱말의 뜻으로 알맞은 것은?",
    big: target.w,
    options: meanOpts,
    answer: target.m
  };
}

// 같은 문제(key)를 하나로 합치고 많이 틀린 순 → 최근순
function vocabConsolidate_(items) {
  var map = {}, order = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var k = it.rec.key;
    if (!map[k]) { map[k] = { key: k, rec: it.rec, count: 0, dates: [], last: 0 }; order.push(k); }
    var g = map[k];
    g.count++;
    g.dates.push(it.at);
    if (it.at >= g.last) { g.last = it.at; g.rec = it.rec; }
  }
  var out = [];
  for (var j = 0; j < order.length; j++) out.push(map[order[j]]);
  out.sort(function (a, b) { return (b.count - a.count) || (b.last - a.last); });
  return out;
}

// 출력용 한 문제 구성(보기 순서 섞기) + 대략의 줄 수(쪽 나누기 용)
function vocabPrepare_(g) {
  var r = g.rec, lines;
  if (r.type === "match") {
    var pairs = r.pairs || [];
    var right = vocabShuffle_(pairs.map(function (p) { return p.meaning; }));
    var ans = [];
    lines = 2 + pairs.length;
    for (var i = 0; i < right.length; i++) lines += vocabLines_(right[i], 48);
    for (var a = 0; a < pairs.length; a++) ans.push(right.indexOf(pairs[a].meaning));
    return { g: g, type: "match", left: pairs.map(function (p) { return p.word; }), right: right, pairs: pairs, matchAns: ans, lines: lines };
  }
  var opts = vocabShuffle_(r.options || []);
  var shortOpts = opts.every(function (o) { return String(o).length <= 12; });
  lines = 1 + (r.type === "mean" ? 0 : vocabLines_(r.type === "blank" ? r.sentence : r.big, 48));
  if (shortOpts) lines += 1; else for (var k = 0; k < opts.length; k++) lines += vocabLines_(opts[k], 48);
  return { g: g, type: r.type, options: opts, ansIndex: opts.indexOf(r.answer), short: shortOpts, lines: lines + 1 };
}

// 1단 전체 너비(Single-column) 페이지네이션 — 번호. 문제 [레벨-책제목]이 한 줄에 나란히 배치되도록 보장
function vocabPaginate_(prepared, maxPerSheet, lineCap) {
  var sheets = [], cur = null;
  function fresh() { cur = { items: [], cols: [[], []], used: 0, count: 0 }; sheets.push(cur); }
  for (var i = 0; i < prepared.length; i++) {
    var p = prepared[i];
    if (!cur) fresh();
    if (cur.count >= maxPerSheet || (cur.count > 0 && cur.used + p.lines > lineCap)) {
      fresh();
    }
    cur.items.push(p);
    cur.cols[0].push(p);
    cur.used += p.lines;
    cur.count++;
  }
  return sheets;
}

function vocabQuestionHtml_(p, n) {
  var r = p.g.rec;
  var srcBracket = vocabFormatSourceBracket_(r.label);
  var src = srcBracket ? (' <span class="src">' + vocabEsc_(srcBracket) + "</span>") : "";
  var h = '<div class="q">';
  if (p.type === "match") {
    h += '<div class="q-hd"><b>' + n + ".</b> 어휘에 알맞은 뜻의 번호를 쓰세요." + src + "</div>";
    for (var i = 0; i < p.left.length; i++) h += '<div class="o">' + VOCAB_MARK[i] + " <b>" + vocabEsc_(p.left[i]) + "</b> ( &nbsp;&nbsp;&nbsp; )</div>";
    for (var j = 0; j < p.right.length; j++) h += '<div class="o">' + VOCAB_NUM[j] + " " + vocabEsc_(p.right[j]) + "</div>";
    return h + "</div>";
  }
  if (p.type === "blank") {
    h += '<div class="q-hd"><b>' + n + ".</b> 빈칸에 알맞은 말은?" + src + "</div>" +
         '<div class="o">' + vocabEsc_(r.sentence).replace("( )", '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>') + "</div>";
  } else if (p.type === "word") {
    h += '<div class="q-hd"><b>' + n + ".</b> " + vocabEsc_(r.prompt) + src + "</div>" +
         '<div class="o">「' + vocabEsc_(r.big) + "」</div>";
  } else {
    h += '<div class="q-hd"><b>' + n + ".</b> " + vocabEsc_(r.prompt) + " <b>" + vocabEsc_(r.big) + "</b>" + src + "</div>";
  }
  if (p.short) {
    var parts = [];
    for (var a = 0; a < p.options.length; a++) parts.push(VOCAB_NUM[a] + " " + vocabEsc_(p.options[a]));
    h += '<div class="o">' + parts.join(" &nbsp;&nbsp;&nbsp; ") + "</div>";
  } else {
    for (var b = 0; b < p.options.length; b++) h += '<div class="o">' + VOCAB_NUM[b] + " " + vocabEsc_(p.options[b]) + "</div>";
  }
  return h + "</div>";
}

function vocabAnswerHtml_(p, n) {
  var r = p.g.rec;
  var tag = '<span class="tag">' + p.g.count + "회 틀림 · " + vocabDateLabel_(p.g.dates) + "</span>";
  if (p.type === "match") {
    var s = '<div class="a"><b>' + n + '.</b> <span class="ans">짝짓기</span>' + tag + "<br>";
    for (var i = 0; i < p.pairs.length; i++) s += VOCAB_MARK[i] + "-" + VOCAB_NUM[p.matchAns[i]] + " " + vocabEsc_(p.pairs[i].word) + (i < p.pairs.length - 1 ? " &nbsp; " : "");
    return s + "</div>";
  }
  return '<div class="a"><b>' + n + '.</b> <span class="ans">' + VOCAB_NUM[p.ansIndex] + " " + vocabEsc_(r.answer) + "</span>" + tag + "<br><b>" + vocabEsc_(r.word) + "</b>: " + vocabEsc_(r.meaning) + "</div>";
}

function vocabDateLabel_(times) {
  var seen = {}, out = [];
  for (var i = 0; i < times.length; i++) {
    var d = new Date(times[i]);
    var s = (d.getMonth() + 1) + "/" + d.getDate();
    if (!seen[s]) { seen[s] = true; out.push(s); }
  }
  return out.join(", ");
}

var VOCAB_PDF_CSS =
  "@page{size:A4;margin:14mm 15mm 14mm 15mm}" +
  "body{font-family:'Malgun Gothic','Nanum Gothic',sans-serif;color:#111;margin:0;padding:0}" +
  ".page{page-break-after:always;position:relative}.page.last{page-break-after:auto}" +
  ".hd-tb{width:100%;border-collapse:collapse;border-bottom:2.5px solid #111;margin-bottom:8px}" +
  ".hd-tb td{padding:0 0 6px 0;vertical-align:bottom}" +
  ".hd-l .t{font-size:19pt;font-weight:bold;color:#0f172a;letter-spacing:-0.3px}" +
  ".hd-r{text-align:right;font-size:10pt;font-weight:bold;color:#334155}" +
  ".info-tb{width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed}" +
  ".info-tb td{border:1.5px solid #1e293b;padding:7px 10px;font-size:10.5pt;color:#0f172a;vertical-align:middle}" +
  ".q-list{width:100%}" +
  ".q{font-size:10.2pt;line-height:1.5;margin-bottom:13px;page-break-inside:avoid}" +
  ".q-hd{margin-bottom:3px;word-keep:keep-all}" +
  ".o{margin-left:18px;margin-top:2px}" +
  ".src{font-size:9pt;color:#475569;font-weight:normal;margin-left:8px;white-space:nowrap;display:inline-block}" +
  ".blank{border-bottom:1.2px solid #111;display:inline-block;min-width:65px}" +
  ".a{font-size:9.8pt;line-height:1.45;margin-bottom:9px;page-break-inside:avoid}.ans{color:#b91c1c;font-weight:bold}.tag{font-size:8pt;border:1px solid #9ca3af;padding:1px 5px;margin-left:6px;color:#4b5563;border-radius:4px}" +
  ".ft{font-size:10.5pt;font-weight:bold;color:#1e293b;border-top:1px solid #cbd5e1;padding-top:8px;margin-top:18px;text-align:center}";

function vocabRenderHtml_(groups, opts) {
  var prepared = [];
  for (var i = 0; i < groups.length; i++) prepared.push(vocabPrepare_(groups[i]));
  var sheets = vocabPaginate_(prepared, 10, 42);
  var total = sheets.length;
  var academyFooter = opts.academyName || "유현리드인 한그루역사";
  var html = "<html><head><meta charset='utf-8'><style>" + VOCAB_PDF_CSS + "</style></head><body>";
  var s, k;
  for (s = 0; s < sheets.length; s++) {
    var qItems = sheets[s].items || sheets[s].cols[0] || [];
    html += '<div class="page">' +
      '<table class="hd-tb"><tr>' +
        '<td class="hd-l"><div class="t">' + vocabEsc_(opts.title) + '</div></td>' +
        '<td class="hd-r">기간 : ' + vocabEsc_(opts.period) + (total > 1 ? (' (' + (s + 1) + '/' + total + ')') : '') + '</td>' +
      '</tr></table>' +
      '<table class="info-tb"><tr>' +
        '<td style="width:30%"><b>날짜 :</b> &nbsp;</td>' +
        '<td style="width:32%"><b>이름 :</b> ' + vocabEsc_(opts.name) + '</td>' +
        '<td style="width:38%"><b>문항수 / 정답수 :</b> ' + qItems.length + '문항 / ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )개</td>' +
      '</tr></table>' +
      '<div class="q-list">';
    var n = 0;
    for (k = 0; k < qItems.length; k++) {
      n++;
      html += vocabQuestionHtml_(qItems[k], n);
    }
    html += '</div><div class="ft">' + vocabEsc_(academyFooter) + '</div></div>';
  }
  for (s = 0; s < sheets.length; s++) {
    var aItems = sheets[s].items || sheets[s].cols[0] || [];
    html += '<div class="page' + (s === sheets.length - 1 ? " last" : "") + '">' +
      '<table class="hd-tb"><tr>' +
        '<td class="hd-l"><div class="t">' + vocabEsc_(opts.title) + ' — 정답 및 해설</div></td>' +
        '<td class="hd-r">기간 : ' + vocabEsc_(opts.period) + '</td>' +
      '</tr></table>' +
      '<table class="info-tb"><tr>' +
        '<td style="width:30%"><b>날짜 :</b> &nbsp;</td>' +
        '<td style="width:32%"><b>이름 :</b> ' + vocabEsc_(opts.name) + '</td>' +
        '<td style="width:38%"><b>문항수 :</b> 총 ' + aItems.length + '문항</td>' +
      '</tr></table>';
    var m = 0;
    for (k = 0; k < aItems.length; k++) {
      m++;
      html += vocabAnswerHtml_(aItems[k], m);
    }
    html += '<div class="ft">' + vocabEsc_(academyFooter) + '</div></div>';
  }
  return { html: html + "</body></html>", sheets: total, questions: prepared.length };
}

// 모달창용 학생 목록 + 기본 기간(시작일~종료일) 1회 Bulk 수집 헬퍼
function vocabGetModalInitData_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var as = ss.getSheetByName(ANALYSIS_SHEET);
  var rs = getRecordSheetReadOnly_(ss);
  var defaultName = "";
  var now = new Date();
  var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  var prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  var defaultStart = thisMonthStart;
  var defaultEnd = thisMonthEnd;
  var hideInternal = false;
  var hasManualPeriod = false;

  if (as) {
    defaultName = normName_(as.getRange("B2").getValue());
    var b5Val = as.getRange("B5").getValue();
    var b6Val = as.getRange("B6").getValue();
    if (b5Val instanceof Date && !isNaN(b5Val.getTime()) && b6Val instanceof Date && !isNaN(b6Val.getTime())) {
      defaultStart = b5Val;
      defaultEnd = b6Val;
      hasManualPeriod = true;
    } else {
      var sVal = as.getRange("E2").getValue();
      var eVal = as.getRange("E3").getValue();
      if (sVal instanceof Date && !isNaN(sVal.getTime())) defaultStart = sVal;
      if (eVal instanceof Date && !isNaN(eVal.getTime())) defaultEnd = eVal;
    }
    hideInternal = !!as.getRange("G3").getValue();
  }

  var studentMap = {};
  var addStudent = function (rawName, gradeStr) {
    var nm = normName_(rawName);
    if (!nm || nm === "이름" || nm === "학생명" || nm === "성명") return;
    if (!studentMap[nm]) {
      studentMap[nm] = { name: nm, grade: String(gradeStr || "").trim(), recordCount: 0, wrongWordCount: 0 };
    } else if (gradeStr && !studentMap[nm].grade) {
      studentMap[nm].grade = String(gradeStr).trim();
    }
  };

  // 1) [전체시간표] 원생 명단
  var stSheet = getStudentsSheet_(ss);
  if (stSheet && stSheet.getLastRow() >= 3) {
    var stVals = stSheet.getRange(3, 2, stSheet.getLastRow() - 2, 2).getValues();
    for (var i = 0; i < stVals.length; i++) {
      addStudent(stVals[i][0], stVals[i][1]);
    }
  }

  // 2) [회원 분석] 명단
  var memSheet = getMemberAnalysisSheet(ss);
  if (memSheet && memSheet.getLastRow() >= 2) {
    var mVals = memSheet.getRange(2, 2, memSheet.getLastRow() - 1, 2).getValues();
    for (var m = 0; m < mVals.length; m++) {
      addStudent(mVals[m][0], mVals[m][1]);
    }
  }

  // 3) [학습기록] 명단 및 오답 어휘 보유 건수 집계 (1회 Bulk)
  var defStartMs = new Date(defaultStart.getFullYear(), defaultStart.getMonth(), defaultStart.getDate()).getTime();
  var defEndMs = new Date(defaultEnd.getFullYear(), defaultEnd.getMonth(), defaultEnd.getDate() + 1).getTime();
  var prevStartMs = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), prevMonthStart.getDate()).getTime();
  var prevEndMs = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), prevMonthEnd.getDate() + 1).getTime();
  var defPeriodRecCount = 0;
  var prevMonthRecCount = 0;

  if (rs && rs.getLastRow() >= 2) {
    var rVals = rs.getRange(2, 1, rs.getLastRow() - 1, Math.min(Math.max(rs.getLastColumn(), 18), 23)).getValues();
    for (var r = 0; r < rVals.length; r++) {
      var rNm = normName_(rVals[r][1]);
      if (!rNm) continue;
      addStudent(rNm, "");
      studentMap[rNm].recordCount++;
      var wrg = vocabCleanWrongWordsStr_(rVals[r][17]);
      if (wrg) {
        studentMap[rNm].wrongWordCount += wrg.split(",").length;
      }
      var rDate = vocabParseDate_(rVals[r][0]);
      var rMs = rDate.getTime();
      if (!isNaN(rMs)) {
        if (rMs >= defStartMs && rMs < defEndMs) defPeriodRecCount++;
        if (rMs >= prevStartMs && rMs < prevEndMs) prevMonthRecCount++;
      }
    }
  }

  // 월초(1일 등)에 이번달 학습기록이 아직 0건이고 지난달 기록이 있으면 자동으로 지난달 전체를 기본 기간으로 세팅
  if (!hasManualPeriod && defPeriodRecCount === 0 && prevMonthRecCount > 0) {
    defaultStart = prevMonthStart;
    defaultEnd = prevMonthEnd;
  }

  var studentList = Object.keys(studentMap).map(function (k) { return studentMap[k]; });
  studentList.sort(function (a, b) {
    return a.name.localeCompare(b.name, "ko");
  });

  if (!defaultName && studentList.length > 0) {
    var withWrong = studentList.filter(function (s) { return s.wrongWordCount > 0; });
    defaultName = withWrong.length > 0 ? withWrong[0].name : studentList[0].name;
  }

  return {
    defaultName: defaultName,
    defaultStartStr: vocabFmtDate_(defaultStart),
    defaultEndStr: vocabFmtDate_(defaultEnd),
    thisMonthStartStr: vocabFmtDate_(thisMonthStart),
    thisMonthEndStr: vocabFmtDate_(thisMonthEnd),
    prevMonthStartStr: vocabFmtDate_(prevMonthStart),
    prevMonthEndStr: vocabFmtDate_(prevMonthEnd),
    hideInternal: hideInternal,
    students: studentList
  };
}

// 모달에서 호출되는 실제 오답 복습지 PDF 생성 서버 함수
function vocabGenerateReviewPdfFromModal(name, startStr, endStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var as = ss.getSheetByName(ANALYSIS_SHEET);
  var rs = getRecordSheetReadOnly_(ss);
  if (!rs) return { ok: false, message: "먼저 메뉴의 [8. 어휘·학습기록(23열)·학생분석표 셋업]을 실행해 주세요." };

  name = normName_(name);
  if (!name) return { ok: false, message: "학생을 선택해 주세요." };
  var start = vocabParseDate_(startStr);
  var end = vocabParseDate_(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, message: "기간(시작일 ~ 종료일)을 정확히 선택해 주세요." };
  }

  // [학생분석표] 시트의 B2(학생명), B5(시작일), B6(종료일)에 선택값 동기화 (E2:E3 수식 보존)
  if (as) {
    try {
      as.getRange("B2").setValue(name);
      as.getRange("B5").setValue(start);
      as.getRange("B6").setValue(end);
    } catch (e) {}
  }

  var endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  var startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  var last = rs.getLastRow();
  var vocabRows = vocabReadRows_();
  var items = [];

  if (last >= 2) {
    var values = rs.getRange(2, 1, last - 1, Math.min(Math.max(rs.getLastColumn(), 18), 23)).getValues();
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var rName = normName_(v[1]);
      if (rName !== name) continue;
      var d = vocabParseDate_(v[0]);
      var t = d.getTime();
      if (!(t >= startMs && t < endMs)) continue;
      var levelStr = String(v[4] || "").trim();
      var bookStr = String(v[5] || "").trim();
      var wrongStr = String(v[17] || "").trim();
      if (!wrongStr) continue;
      var words = wrongStr.split(",");
      for (var wIdx = 0; wIdx < words.length; wIdx++) {
        var wClean = String(words[wIdx] || "").trim();
        if (!wClean || wClean === "(짝짓기)") continue;
        var builtQ = vocabBuildReviewQuestionFromBank_(wClean, bookStr, levelStr, vocabRows);
        if (builtQ) {
          items.push({ rec: builtQ, at: t });
        }
      }
    }
  }
  if (!items.length) {
    return {
      ok: false,
      message: name + " 학생의 " + vocabFmtDate_(start) + " ~ " + vocabFmtDate_(end) + " 기간에 틀린 어휘 기록(R열)이 없거나 [어휘] 시트에서 해당 단어를 찾지 못했어요."
    };
  }

  var groups = vocabConsolidate_(items);
  var mm = start.getMonth() + 1;
  var out = vocabRenderHtml_(groups, {
    name: name,
    title: mm + "월 어휘 복습 하기",
    period: vocabFmtDate_(start) + " ~ " + vocabFmtDate_(end),
    academyName: "유현리드인 한그루역사",
    credit: false
  });
  var fileName = name + "_" + vocabFmtDate_(start) + "~" + vocabFmtDate_(end) + "_어휘복습하기.pdf";
  var pdf = Utilities.newBlob(out.html, "text/html", "review.html").getAs("application/pdf").setName(fileName);
  var folder = getOrCreateFolder_("어휘 오답 복습지");
  var file = folder.createFile(pdf);

  return {
    ok: true,
    name: name,
    period: vocabFmtDate_(start) + " ~ " + vocabFmtDate_(end),
    questions: out.questions,
    sheets: out.sheets,
    url: file.getUrl()
  };
}

// 메뉴 9번 [오답 복습지 PDF 만들기]: 학생 선택 드롭다운 + 기간 설정 팝업창 표시 후 즉시 PDF 생성
function vocabMakeReviewPdf() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var rs = getRecordSheetReadOnly_(ss);
  if (!rs) { ui.alert("먼저 메뉴의 [8. 어휘·학습기록(23열)·학생분석표 셋업]을 실행해 주세요."); return; }

  var initData = vocabGetModalInitData_(ss);
  var optionsHtml = initData.students.map(function (st) {
    var sel = st.name === initData.defaultName ? " selected" : "";
    var meta = [];
    if (st.grade) meta.push(st.grade);
    if (st.wrongWordCount > 0) meta.push("오답어휘 " + st.wrongWordCount + "개");
    else if (st.recordCount > 0) meta.push("학습기록 " + st.recordCount + "건");
    var label = vocabEsc_(st.name) + (meta.length ? " (" + vocabEsc_(meta.join(" · ")) + ")" : "");
    return "<option value='" + vocabEsc_(st.name) + "'" + sel + ">" + label + "</option>";
  }).join("");

  var modalHtml = HtmlService.createHtmlOutput(
    "<div style='font-family:Malgun Gothic,Pretendard,sans-serif;line-height:1.6;padding:8px 6px;color:#0f172a'>" +
      "<div style='background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:12px'>" +
        "<div style='margin-bottom:10px'>" +
          "<label style='display:block;font-size:12px;font-weight:bold;color:#334155;margin-bottom:4px'>👤 학생 선택</label>" +
          "<select id='stSelect' style='width:100%;padding:8px 10px;border:1.5px solid #2563eb;border-radius:8px;font-size:13.5px;font-weight:bold;color:#0f172a;background:#fff'>" +
            optionsHtml +
          "</select>" +
        "</div>" +
        "<div style='display:flex;gap:6px;margin-bottom:6px'>" +
          "<button type='button' onclick=\"setMonthRange('" + vocabEsc_(initData.prevMonthStartStr) + "','" + vocabEsc_(initData.prevMonthEndStr) + "')\" style='flex:1;background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;border-radius:6px;padding:5px 8px;font-size:11.5px;font-weight:bold;cursor:pointer'>📅 지난달 전체</button>" +
          "<button type='button' onclick=\"setMonthRange('" + vocabEsc_(initData.thisMonthStartStr) + "','" + vocabEsc_(initData.thisMonthEndStr) + "')\" style='flex:1;background:#f8fafc;color:#334155;border:1px solid #cbd5e1;border-radius:6px;padding:5px 8px;font-size:11.5px;font-weight:bold;cursor:pointer'>📅 이번달 전체</button>" +
        "</div>" +
        "<div style='display:flex;gap:8px;align-items:center'>" +
          "<div style='flex:1'>" +
            "<label style='display:block;font-size:12px;font-weight:bold;color:#334155;margin-bottom:4px'>📅 시작일</label>" +
            "<input type='date' id='startInput' value='" + vocabEsc_(initData.defaultStartStr) + "' style='width:100%;padding:7px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box'>" +
          "</div>" +
          "<div style='padding-top:18px;font-weight:bold;color:#64748b'>~</div>" +
          "<div style='flex:1'>" +
            "<label style='display:block;font-size:12px;font-weight:bold;color:#334155;margin-bottom:4px'>📅 종료일</label>" +
            "<input type='date' id='endInput' value='" + vocabEsc_(initData.defaultEndStr) + "' style='width:100%;padding:7px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box'>" +
          "</div>" +
        "</div>" +
        "<button id='btnGen' type='button' onclick='generatePdf()' style='margin-top:12px;width:100%;background:#1e3a8a;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-size:13.5px;font-weight:bold;cursor:pointer'>📝 선택한 학생의 어휘 복습지 PDF 만들기</button>" +
      "</div>" +
      "<div id='resultBox' style='padding:4px 2px;font-size:13px;color:#475569'>학생과 기간을 선택한 뒤 위 버튼을 눌러 주세요.</div>" +
    "</div>" +
    "<script>" +
      "function setMonthRange(s,e){document.getElementById('startInput').value=s;document.getElementById('endInput').value=e;}" +
      "function generatePdf(){" +
        "var name=document.getElementById('stSelect').value;" +
        "var s=document.getElementById('startInput').value;" +
        "var e=document.getElementById('endInput').value;" +
        "var btn=document.getElementById('btnGen');" +
        "var box=document.getElementById('resultBox');" +
        "if(!name){alert('학생을 선택해 주세요.');return;}" +
        "btn.disabled=true;btn.style.opacity='0.6';btn.textContent='⏳ 어휘 복습지 PDF 생성 중...';" +
        "box.innerHTML='<div style=\"color:#2563eb;font-weight:bold\"><b>'+name+'</b> 학생의 틀린 어휘 문제를 구성하고 PDF를 만들고 있습니다...</div>';" +
        "google.script.run.withSuccessHandler(function(res){" +
          "btn.disabled=false;btn.style.opacity='1';btn.textContent='📝 선택한 학생의 어휘 복습지 PDF 만들기';" +
          "if(!res||!res.ok){box.innerHTML='<div style=\"background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px;border-radius:8px;font-size:12.5px\">⚠️ '+(res&&res.message?res.message:'PDF 생성 실패')+'</div>';return;}" +
          "box.innerHTML='<div style=\"background:#eff6ff;border:1px solid #bfdbfe;padding:12px;border-radius:10px\">'+" +
            "'<b>'+res.name+'</b> 학생의 어휘 복습지를 만들었어요.<br>'+" +
            "'• 기간: '+res.period+'<br>'+" +
            "'• 구성: 문제 <b>'+res.questions+'문항</b> · 문제지 '+res.sheets+'장 + 정답 및 해설 '+res.sheets+'쪽<br><br>'+" +
            "'<a href=\"'+res.url+'\" target=\"_blank\" style=\"display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:9px 16px;border-radius:7px;font-weight:bold\">▶ 오답 복습지 PDF 열기 / 다운로드</a>'+" +
            "'<div style=\"margin-top:8px;font-size:11px;color:#64748b\">※ 구글 드라이브 \\'어휘 오답 복습지\\' 폴더에 자동 저장되었습니다.</div></div>';" +
        "}).withFailureHandler(function(err){" +
          "btn.disabled=false;btn.style.opacity='1';btn.textContent='📝 선택한 학생의 어휘 복습지 PDF 만들기';" +
          "box.innerHTML='<div style=\"color:#b91c1c\">오류: '+(err&&err.message?err.message:err)+'</div>';" +
        "}).vocabGenerateReviewPdfFromModal(name,s,e);" +
      "}" +
    "</script>"
  ).setWidth(480).setHeight(420);
  ui.showModalDialog(modalHtml, "📝 어휘 오답 복습지 PDF");
}

// ---------- 메뉴 10번: 📊 학부모 발송용 학생 분석표 PDF 만들기 (학생분석표 B2 학생 · B5~B6/E2~E3 기간 기준) ----------

// 도서명·레벨 정제 헬퍼 (F열에 섞인 '3-4 도서명', '3-재독 도서명', '품띠', '/ [어휘]...' 등 자동 분리·정제)
function vocabCleanBookTitleAndLevel_(rawLevel, rawBook) {
  var lv = String(rawLevel || "").trim();
  if (lv === "-") lv = "";
  var bk = String(rawBook || "").trim();
  if (bk === "-") bk = "";
  var isReread = false;

  // 1) 출석부/상담 요약 텍스트('/ [어휘]...')가 도서명 뒤에 붙은 경우 제거
  bk = bk.replace(/\s*\/?\s*\[어휘\][\s\S]*$/g, "").trim();

  // 2) 도서명 앞에 '3-4 ', '3-재독 ' 같은 레벨·호수 접두어가 포함된 경우 레벨 추출
  var m = bk.match(/^(\d+)\s*-\s*(\d+|재독)\s+(.+)$/);
  if (m) {
    if (!lv || lv === "-") lv = m[1] + "레벨";
    if (m[2] === "재독") isReread = true;
    bk = m[3].trim();
  }

  // 3) 도서명 끝에 붙은 '품띠' 또는 단순 점수 나열(' 70 90') 제거
  bk = bk.replace(/\s+품띠$/g, "").replace(/\s+\d{2,3}(\s+\d{2,3})+$/g, "").trim();

  // 4) 레벨 표기 통일 (숫자만 있으면 'N레벨')
  if (/^\d+$/.test(lv)) lv = lv + "레벨";

  return { level: lv, book: bk, isReread: isReread };
}

// 학생 다짐·발자국 메모에서 무의미한 오타('다다다다ㅏㅜㅜㅜ', 'ㅇㅇ점', 'good', '-') 필터링
function vocabIsMeaningfulReflection_(str) {
  var s = String(str || "").trim();
  if (!s || s === "-" || s.toLowerCase() === "good") return false;
  if (/^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(s)) return false;
  if (/^다+[ㄱ-ㅎㅏ-ㅣㅜㅠ\s]*$/.test(s)) return false;
  if (/^ㅇ+점?$/.test(s)) return false;
  return true;
}

function vocabCleanFootprintMemo_(str) {
  var s = String(str || "").trim();
  if (!s || s === "-") return "";
  s = s.replace(/\s*\/?\s*\[어휘\][\s\S]*$/g, "").trim();
  if (!vocabIsMeaningfulReflection_(s)) return "";
  return s;
}

// 1. 이달의 종합 총평 단일 문단 자동 생성 헬퍼
function vocabBuildMonthlyReviewParagraph_(d) {
  var monthLabel = d.monthNum ? (d.monthNum + "월 한 달간") : "이번 분석 기간 동안";
  var lvList = d.levelSetList || [];
  var mainLvStr = lvList.length > 0 ? (lvList.join("·") + " ") : "";
  var bookCntStr = d.bookCount > 0 ? ("필독서(" + d.bookCount + "권)") : "독서·어휘 과정";
  var s1 = d.name + " 학생은 " + monthLabel + " 총 " + d.lessonDays + "일 출석하여 " + mainLvStr + bookCntStr + " 학습을 성실히 수행하였습니다.";

  var s2Parts = [];
  if (d.vocabCount > 0) {
    if (Number(d.vocabAvg) >= 95 && d.vocabWrongTotal === 0) {
      s2Parts.push("어휘 확인 학습 " + d.vocabCount + "회 모두 " + d.vocabAvg + "%(만점)를 기록하여 어휘 습득력이 매우 우수하며");
    } else {
      s2Parts.push("어휘 확인 학습 " + d.vocabCount + "회 평균 " + d.vocabAvg + "%(최고 " + d.vocabMax + ")를 달성하며 어휘력을 탄탄히 다졌고");
    }
  }
  if (d.diagCount > 0) {
    var topBooksStr = (d.topDiagBooks && d.topDiagBooks.length > 0) ? (d.topDiagBooks.slice(0, 2).join(", ") + " 등 ") : "";
    s2Parts.push("독서이해도 진단에서도 " + topBooksStr + "평균 " + d.diagAvg + "점(최고 " + d.diagMax + ")의 의미 있는 성취를 보여주었습니다.");
  } else if (s2Parts.length > 0) {
    s2Parts[s2Parts.length - 1] = s2Parts[s2Parts.length - 1].replace(/우수하며$/, "우수합니다.").replace(/다졌고$/, "다졌습니다.");
  }
  var s2 = s2Parts.join(", ");

  var s3 = "";
  var cleanCoach = String(d.coachingText || "").trim();
  // 내부 메모형 텍스트('<재독 리스트>', '[어휘]', 줄바꿈 나열 등)는 제외하고 정제된 문장만 반영
  if (cleanCoach && cleanCoach.indexOf("<") === -1 && cleanCoach.indexOf("[어휘]") === -1 && cleanCoach.indexOf("학생 맞춤형 독서") === -1 && cleanCoach.length <= 110) {
    s3 = cleanCoach;
    if (!/[.!?]$/.test(s3)) s3 += ".";
  } else if (d.trSummary && d.trSummary.length > 0) {
    var trNames = d.trSummary.map(function (t) { return t.type; }).join("·");
    s3 = trNames + " 과정(총 " + d.trTotalCount + "회) 또한 차분히 절차에 맞춰 정확히 해결하고 있으므로, 다음 달에는 완독 후 줄거리 요약과 추론형 독해 훈련을 더해 문해력을 한층 더 깊이 있게 확장해 나가겠습니다.";
  } else {
    s3 = "다음 달에도 다양한 주제의 독서와 어휘 확장, 추론형 독해 훈련을 통해 문해력을 한층 더 깊이 있게 키워 나가겠습니다.";
  }

  return [s1, s2, s3].filter(function (x) { return !!x; }).join(" ");
}

function vocabAnalysisReportCss_() {
  return (
    "@page{size:A4;margin:14mm 13mm 14mm 13mm}" +
    "body{font-family:'Malgun Gothic','Nanum Gothic',sans-serif;color:#1e293b;margin:0;padding:0;font-size:9.1pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".page1{page-break-after:always}" +
    ".page2{page-break-before:always}" +
    ".hd{border-bottom:2.5px solid #1e3a8a;padding-bottom:8px;margin-bottom:10px;display:table;width:100%}" +
    ".hd-l{display:table-cell;vertical-align:middle;white-space:nowrap}" +
    ".hd-r{display:table-cell;vertical-align:bottom;text-align:right;font-size:8.6pt;color:#475569;white-space:nowrap}" +
    ".brand-top{font-size:9pt;color:#2563eb;font-weight:400;letter-spacing:0.3px;margin-bottom:2px}" +
    ".badge{display:inline-block;background:#dbeafe;color:#1e3a8a;border:1.5px solid #93c5fd;padding:4px 16px;border-radius:18px;font-weight:800;font-size:12.5pt;white-space:nowrap;vertical-align:middle;margin-right:10px}" +
    ".ttl{display:inline-block;font-size:18.5pt;font-weight:800;color:#0f172a;letter-spacing:-0.4px;white-space:nowrap;vertical-align:middle}" +
    ".cards{width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 -6px 10px -6px;table-layout:fixed}" +
    ".card{border-radius:8px;padding:8px 10px;vertical-align:top;overflow:hidden}" +
    ".c-em{background:#ecfdf5;border:1.5px solid #6ee7b7}" +
    ".c-bl{background:#eff6ff;border:1.5px solid #93c5fd}" +
    ".c-vi{background:#f5f3ff;border:1.5px solid #c4b5fd}" +
    ".c-am{background:#fffbeb;border:1.5px solid #fcd34d}" +
    ".card-k{font-size:8pt;font-weight:bold;margin-bottom:3px;white-space:nowrap}" +
    ".card-v{font-size:12.2pt;font-weight:bold;color:#0f172a;white-space:nowrap}" +
    ".card-s-tb{width:100%;border-collapse:collapse;margin-top:5px;table-layout:fixed}" +
    ".card-s-tb td{font-size:7.6pt;color:#334155;padding:0;border:none;background:transparent !important;white-space:nowrap;overflow:hidden}" +
    ".card-s-tb td.r{text-align:right;font-weight:bold}" +
    ".gbar-bg{width:100%;height:8px;background:#e2e8f0;border-radius:5px;overflow:hidden;margin-top:5px;box-sizing:border-box}" +
    ".gbar-bg-partial{background:#ffffff;border:1.5px solid #475569}" +
    ".gbar-fill{height:100%;border-radius:3px}" +
    ".sec{margin-top:9px;margin-bottom:5px;font-size:10pt;font-weight:bold;color:#1e3a8a;border-left:4px solid #2563eb;padding-left:7px;background:#f1f5f9;padding-top:3px;padding-bottom:3px}" +
    "table.tb{width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed}" +
    "table.tb th{background:#dbeafe;color:#1e3a8a;font-size:8.1pt;font-weight:bold;padding:5px 5px;border:1px solid #93c5fd;text-align:center}" +
    "table.tb td{font-size:8.2pt;padding:4.5px 6px;border:1px solid #cbd5e1;vertical-align:middle;word-wrap:break-word}" +
    "table.tb tbody tr:nth-child(even) td{background:#f8fafc}" +
    "table.tb tfoot tr.sum-row td{background:#eff6ff !important;color:#1e3a8a;font-weight:bold;border-top:2px solid #60a5fa;padding:5.5px 6px;font-size:8.2pt}" +
    ".c{text-align:center}.r{text-align:right}" +
    ".box{background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px 11px;margin-bottom:8px;font-size:8.6pt;line-height:1.55}" +
    ".lv-pill{display:inline-block;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:4px;padding:1px 5px;font-size:7.6pt;font-weight:bold;white-space:nowrap}" +
    ".sc-pill{display:inline-block;border-radius:4px;padding:1px 6px;font-size:7.8pt;font-weight:bold;white-space:nowrap}" +
    ".wchip{display:inline-block;background:#fff7ed;border:1px solid #fdba74;border-radius:5px;padding:3px 7px;margin:2px 4px 2px 0;font-size:8.2pt}" +
    ".wchip b{color:#c2410c}" +
    ".ft{margin-top:10px;border-top:1px solid #cbd5e1;padding-top:6px;font-size:9.5pt;font-weight:bold;color:#1e3a8a;text-align:center;letter-spacing:0.5px}" +
    ".ft-msg{font-size:7.7pt;font-weight:normal;color:#64748b;margin-bottom:3px;letter-spacing:0}" +
    "[contenteditable='true']:hover{outline:1.5px dashed #3b82f6;background:#eff6ff;cursor:text}" +
    "[contenteditable='true']:focus{outline:2px solid #2563eb;background:#ffffff}" +
    ".del-row-btn{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:bold;cursor:pointer;margin-left:4px}"
  );
}

function vocabRenderAnalysisReportHtml_(d, forEditModal) {
  var css = vocabAnalysisReportCss_();
  var editAttr = forEditModal ? " contenteditable='true'" : "";

  var hwPct = d.lessonDays > 0 ? Math.min(100, Math.round((d.hwDoneCount / d.lessonDays) * 100)) : 0;
  var vPct = (typeof d.vocabAvg === "number" && !isNaN(d.vocabAvg)) ? Math.min(100, Math.max(0, Math.round(d.vocabAvg))) : 0;
  var dPct = (typeof d.diagAvg === "number" && !isNaN(d.diagAvg)) ? Math.min(100, Math.max(0, Math.round(d.diagAvg))) : 0;
  var undTotal = (d.undGood || 0) + (d.undMid || 0) + (d.undLow || 0);
  var trPct = undTotal > 0 ? Math.min(100, Math.round(((d.undGood + d.undMid * 0.8) / undTotal) * 100)) : (d.trTotalCount > 0 ? 100 : 0);

  function renderGaugeBar(pct, colorHex, heightPx) {
    var n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
    var hStyle = heightPx ? ("height:" + heightPx + "px;") : "";
    var cls = n < 100 ? "gbar-bg gbar-bg-partial" : "gbar-bg";
    return "<div class='" + cls + "' style='" + hStyle + "'><div class='gbar-fill' style='width:" + n + "%;background:" + colorHex + "'></div></div>";
  }

  function renderInlineScoreBar(numVal, suffix, mode) {
    if (numVal === "" || numVal === "-" || numVal === undefined || numVal === null || isNaN(Number(numVal))) return "<div class='c'>-</div>";
    var n = Math.min(100, Math.max(0, Math.round(Number(numVal))));
    var col = "#10b981", bg = "#dcfce7", tx = "#166534";
    if (n < 80) { col = "#f59e0b"; bg = "#fef3c7"; tx = "#92400e"; }
    else if (n < 90) { col = (mode === "diag" ? "#7c3aed" : "#2563eb"); bg = (mode === "diag" ? "#ede9fe" : "#dbeafe"); tx = (mode === "diag" ? "#5b21b6" : "#1e40af"); }
    var barCls = n < 100 ? "gbar-bg gbar-bg-partial" : "gbar-bg";
    return "<div style='text-align:left'>" +
      "<span class='sc-pill' style='background:" + bg + ";color:" + tx + "'" + editAttr + ">" + numVal + suffix + "</span>" +
      "<div class='" + barCls + "' style='height:7px;margin-top:3px'><div class='gbar-fill' style='width:" + n + "%;background:" + col + "'></div></div>" +
      "</div>";
  }

  function renderTopHeaderHtml() {
    return "<div class='hd'>" +
      "<div class='hd-l'>" +
        "<span class='badge'" + editAttr + ">" + vocabEsc_(d.name) + (d.grade ? " (" + vocabEsc_(d.grade) + ")" : "") + "</span>" +
        "<span class='ttl'" + editAttr + ">" + vocabEsc_(d.title) + "</span>" +
      "</div>" +
      "<div class='hd-r'>" +
        "<div class='brand-top'" + editAttr + ">독서밀도 국어밀도</div>" +
        "<div>분석 기간: <b" + editAttr + ">" + vocabEsc_(d.period) + "</b></div>" +
      "</div>" +
    "</div>";
  }

  var bodyHtml = "";

  // ==================== [1페이지 시작] ====================
  bodyHtml += "<div class='page1'>";
  bodyHtml += renderTopHeaderHtml();

  // 4대 핵심 지표 컬러 카드 (하단 보조문구 좌·우 2열 테이블 배치로 줄바꿈/넘침 완벽 방지)
  bodyHtml += "<table class='cards'><tr>" +
    "<td class='card c-em'><div class='card-k' style='color:#047857'>✅ 출석 · 숙제 성실도</div>" +
      "<div class='card-v'" + editAttr + ">수업 " + d.lessonDays + "일 / 완료 " + d.hwDoneCount + "회</div>" +
      renderGaugeBar(hwPct, "#10b981") +
      "<table class='card-s-tb'><tr><td" + editAttr + ">수행률 <b>" + hwPct + "%</b></td><td class='r' style='color:#047857'" + editAttr + ">성실 참여</td></tr></table>" +
    "</td>" +
    "<td class='card c-bl'><div class='card-k' style='color:#1d4ed8'>📗 어휘 확인 학습</div>" +
      "<div class='card-v'" + editAttr + ">" + (d.vocabCount > 0 ? ("평균 " + d.vocabAvg + "%") : "기록 없음") + "</div>" +
      renderGaugeBar(vPct, "#2563eb") +
      "<table class='card-s-tb'><tr><td" + editAttr + ">퀴즈 <b>" + d.vocabCount + "회</b></td><td class='r' style='color:#1d4ed8'" + editAttr + ">오답 " + d.vocabWrongTotal + "개</td></tr></table>" +
    "</td>" +
    "<td class='card c-vi'><div class='card-k' style='color:#6d28d9'>📘 독서이해도 진단</div>" +
      "<div class='card-v'" + editAttr + ">" + (d.diagCount > 0 ? ("평균 " + d.diagAvg + "점") : ("도서 " + d.bookCount + "권")) + "</div>" +
      renderGaugeBar(dPct, "#7c3aed") +
      "<table class='card-s-tb'><tr><td" + editAttr + ">진단 <b>" + d.diagCount + "회</b></td><td class='r' style='color:#6d28d9'" + editAttr + ">도서 " + d.bookCount + "권</td></tr></table>" +
    "</td>" +
    "<td class='card c-am'><div class='card-k' style='color:#b45309'>✏️ 집중 트레이닝</div>" +
      "<div class='card-v'" + editAttr + ">총 " + d.trTotalCount + "회 실시</div>" +
      renderGaugeBar(trPct, "#f59e0b") +
      "<table class='card-s-tb'><tr><td" + editAttr + ">잘 이해 <b>" + d.undGood + "회</b></td><td class='r' style='color:#b45309'" + editAttr + ">성취 " + trPct + "%</td></tr></table>" +
    "</td>" +
  "</tr></table>";

  // 1. 이달의 종합 총평 (단일 문단)
  var reviewParagraph = d.reviewParagraph || vocabBuildMonthlyReviewParagraph_(d);
  bodyHtml += "<div class='sec'>1. 이달의 종합 총평</div>" +
    "<div class='box' style='background:#eff6ff;border-color:#bfdbfe;color:#1e293b'" + editAttr + ">" +
      vocabEsc_(reviewParagraph) +
    "</div>";

  // 2. 도서별 독서이해도 진단 및 어휘 학습 성취도 (날짜 오름차순 + 최하단 합계/평균 행)
  bodyHtml += "<div class='sec'>2. 도서별 독서이해도 진단 및 어휘 학습 성취도</div>";
  if (d.bookRows && d.bookRows.length > 0) {
    bodyHtml += "<table class='tb'><thead><tr>" +
      "<th style='width:9%'>날짜</th><th style='width:11%'>레벨</th><th style='width:31%'>도서명 / 어휘학습</th>" +
      "<th style='width:16%'>어휘 정답률</th><th style='width:14%'>독서 진단점수</th><th style='width:19%'>독서발자국 / 틀린 어휘</th>" +
      "</tr></thead><tbody>";
    for (var b = 0; b < d.bookRows.length; b++) {
      var br = d.bookRows[b];
      var vCell = br.vTotal !== "" ? renderInlineScoreBar(br.vRate, "% (" + br.vCorr + "/" + br.vTotal + ")", "vocab") : "<div class='c'>-</div>";
      var dCell = br.dScore !== "" ? renderInlineScoreBar(br.dScore, "점", "diag") : "<div class='c'>-</div>";
      var memoArr = [];
      if (br.step2) memoArr.push(br.step2);
      if (br.wrong) memoArr.push("오답: " + br.wrong);
      var delBtn = forEditModal ? "<button type='button' class='del-row-btn no-print-edit' onclick='this.closest(\"tr\").remove()' title='이 행 삭제'>✕</button>" : "";
      bodyHtml += "<tr>" +
        "<td class='c'" + editAttr + ">" + vocabEsc_(br.date) + "</td>" +
        "<td class='c'>" + (br.level ? "<span class='lv-pill'" + editAttr + ">" + vocabEsc_(br.level) + "</span>" : "-") + "</td>" +
        "<td" + editAttr + "><b>" + vocabEsc_(br.book || "어휘 학습") + "</b></td>" +
        "<td>" + vCell + "</td>" +
        "<td>" + dCell + "</td>" +
        "<td><span" + editAttr + ">" + vocabEsc_(memoArr.join(" · ") || "-") + "</span>" + delBtn + "</td>" +
      "</tr>";
    }
    bodyHtml += "</tbody><tfoot><tr class='sum-row'>" +
      "<td colspan='2' class='c'" + editAttr + ">합계 / 평균</td>" +
      "<td" + editAttr + ">도서 총 " + d.bookCount + "권 / 어휘 학습 " + d.vocabCount + "회</td>" +
      "<td class='c'" + editAttr + ">" + (d.vocabCount > 0 ? ("평균 " + d.vocabAvg + "%") : "-") + "</td>" +
      "<td class='c'" + editAttr + ">" + (d.diagCount > 0 ? ("평균 " + d.diagAvg + "점") : "-") + "</td>" +
      "<td class='c'" + editAttr + ">오답 총 " + d.vocabWrongTotal + "개</td>" +
    "</tr></tfoot></table>";
  } else {
    bodyHtml += "<div class='box'" + editAttr + ">선택한 기간 내 도서·어휘 학습 기록이 없습니다.</div>";
  }

  bodyHtml += "<div class='ft'>유현리드인 한그루역사</div>";
  bodyHtml += "</div>"; // 1페이지 끝

  // ==================== [2페이지 시작] ====================
  bodyHtml += "<div class='page2'>";
  bodyHtml += renderTopHeaderHtml();

  // 3. 복습 어휘 목록
  bodyHtml += "<div class='sec'>3. 복습 어휘 목록</div>";
  if (d.wrongWordList && d.wrongWordList.length > 0) {
    bodyHtml += "<div class='box' style='background:#fffbeb;border-color:#fde68a'" + editAttr + ">";
    for (var w = 0; w < d.wrongWordList.length; w++) {
      var ww = d.wrongWordList[w];
      bodyHtml += "<span class='wchip'><b>" + vocabEsc_(ww.word) + "</b>" +
        (ww.meaning ? ": " + vocabEsc_(ww.meaning) : "") +
        (ww.book ? " <span style='color:#64748b'>(" + vocabEsc_(ww.book) + ")</span>" : "") + "</span>";
    }
    bodyHtml += "</div>";
  } else {
    bodyHtml += "<div class='box' style='background:#ecfdf5;border-color:#a7f3d0;color:#065f46;font-weight:bold'" + editAttr + ">" +
      "👏 기간 내 틀린 어휘가 없거나 모든 어휘 확인 학습(" + d.vocabCount + "회)을 첫 시도에 정확히 맞혔습니다!" +
    "</div>";
  }

  // 4. 집중 트레이닝 영역별 성취도 및 이해도 분포 그래프
  bodyHtml += "<div class='sec'>4. 집중 트레이닝 영역별 성취도 및 이해도 분포 그래프</div>";
  if (undTotal > 0) {
    var gPct = Math.round((d.undGood / undTotal) * 100);
    var mPct = Math.round((d.undMid / undTotal) * 100);
    var lPct = Math.max(0, 100 - gPct - mPct);
    bodyHtml += "<div class='box' style='margin-bottom:7px'>" +
      "<div style='font-size:8.2pt;font-weight:bold;margin-bottom:5px;color:#334155'" + editAttr + ">📊 자기주도 학습 이해도 비율: " +
        "<span style='color:#059669'>● 잘 이해했어요 " + d.undGood + "회(" + gPct + "%)</span> &nbsp; " +
        "<span style='color:#2563eb'>● 보통이에요 " + d.undMid + "회(" + mPct + "%)</span> &nbsp; " +
        "<span style='color:#d97706'>● 아직 헷갈려요 " + d.undLow + "회(" + lPct + "%)</span>" +
      "</div>" +
      "<table style='width:100%;border-collapse:collapse;height:9px;border-radius:5px;overflow:hidden'><tr>" +
        (gPct > 0 ? "<td style='width:" + gPct + "%;background:#10b981;height:9px'></td>" : "") +
        (mPct > 0 ? "<td style='width:" + mPct + "%;background:#3b82f6;height:9px'></td>" : "") +
        (lPct > 0 ? "<td style='width:" + lPct + "%;background:#f59e0b;height:9px'></td>" : "") +
      "</tr></table>" +
    "</div>";
  }
  if (d.trSummary && d.trSummary.length > 0) {
    var totalTrCnt = 0;
    for (var mc = 0; mc < d.trSummary.length; mc++) totalTrCnt += d.trSummary[mc].count;
    bodyHtml += "<table class='tb' style='margin-bottom:7px'><thead><tr>" +
      "<th style='width:19%'>트레이닝 영역</th><th style='width:18%'>학습 비중 (횟수)</th><th style='width:13%'>평균 오답 수</th><th style='width:50%'>주요 학습 교재 · 권수/차시</th>" +
      "</tr></thead><tbody>";
    for (var ts = 0; ts < d.trSummary.length; ts++) {
      var tItem = d.trSummary[ts];
      var sharePct = totalTrCnt > 0 ? Math.round((tItem.count / totalTrCnt) * 100) : 100;
      bodyHtml += "<tr>" +
        "<td class='c'" + editAttr + "><b>" + vocabEsc_(tItem.type) + "</b></td>" +
        "<td class='c'" + editAttr + "><b style='color:#1e40af'>" + tItem.count + "회 실시 (" + sharePct + "%)</b></td>" +
        "<td class='c'>" + (tItem.avgErr !== "-" ? "<span class='sc-pill' style='background:#fef3c7;color:#92400e'" + editAttr + ">평균 " + tItem.avgErr + "개</span>" : "<span class='sc-pill' style='background:#dcfce7;color:#166534'" + editAttr + ">완료</span>") + "</td>" +
        "<td" + editAttr + ">" + vocabEsc_(tItem.details) + "</td>" +
      "</tr>";
    }
    bodyHtml += "</tbody></table>";
  }
  if (d.trRows && d.trRows.length > 0) {
    // 2페이지 칼럼 여백 최적화: 날짜(8%) | 트레이닝 영역(14%) | 권수/차시(41%) | 오답 수(8%) | 자기 이해도(12%) | 문해력발자국(17%)
    bodyHtml += "<table class='tb'><thead><tr>" +
      "<th style='width:8%'>날짜</th><th style='width:14%'>트레이닝 영역</th><th style='width:41%'>권수 / 차시</th>" +
      "<th style='width:8%'>오답 수</th><th style='width:12%'>자기 이해도</th><th style='width:17%'>문해력발자국</th>" +
      "</tr></thead><tbody>";
    for (var tr = 0; tr < d.trRows.length; tr++) {
      var rowT = d.trRows[tr];
      var undBadge = rowT.und || "-";
      if (rowT.und === "잘 이해했어요") undBadge = "<span class='sc-pill' style='background:#dcfce7;color:#166534'" + editAttr + ">잘 이해했어요</span>";
      else if (rowT.und === "보통이에요") undBadge = "<span class='sc-pill' style='background:#dbeafe;color:#1e40af'" + editAttr + ">보통이에요</span>";
      else if (rowT.und === "아직 헷갈려요") undBadge = "<span class='sc-pill' style='background:#fef3c7;color:#92400e'" + editAttr + ">아직 헷갈려요</span>";
      var trDelBtn = forEditModal ? "<button type='button' class='del-row-btn no-print-edit' onclick='this.closest(\"tr\").remove()' title='이 행 삭제'>✕</button>" : "";
      bodyHtml += "<tr>" +
        "<td class='c'" + editAttr + ">" + vocabEsc_(rowT.date) + "</td>" +
        "<td class='c'" + editAttr + "><b>" + vocabEsc_(rowT.type) + "</b></td>" +
        "<td" + editAttr + ">" + vocabEsc_(rowT.detail || "-") + "</td>" +
        "<td class='c'" + editAttr + ">" + (rowT.err !== "" ? rowT.err + "개" : "-") + "</td>" +
        "<td class='c'>" + undBadge + "</td>" +
        "<td><span" + editAttr + ">" + vocabEsc_(rowT.memo || "-") + "</span>" + trDelBtn + "</td>" +
      "</tr>";
    }
    bodyHtml += "</tbody></table>";
  } else if (!d.trSummary || !d.trSummary.length) {
    bodyHtml += "<div class='box'" + editAttr + ">선택한 기간 내 트레이닝 기록이 없습니다.</div>";
  }

  // 5. 나의 시간, 나의 기록 (학생 스스로 남긴 수업 다짐 & 성실발자국)
  bodyHtml += "<div class='sec'>5. 나의 시간, 나의 기록 (학생 스스로 남긴 수업 다짐 & 성실발자국)</div>";
  bodyHtml += "<div class='box' style='background:#f0fdf4;border-color:#bbf7d0'" + editAttr + ">";
  if (d.reflections && d.reflections.length > 0) {
    for (var rf = 0; rf < d.reflections.length; rf++) {
      var rItem = d.reflections[rf];
      bodyHtml += "<div style='margin-bottom:4px'>🌱 <b>[" + vocabEsc_(rItem.date) + "]</b> " + vocabEsc_(rItem.text) + "</div>";
    }
  } else {
    bodyHtml += "<div>🌱 매 수업 시간마다 정해진 독서와 어휘·문해력 트레이닝 과제를 성실히 수행하였습니다.</div>";
  }
  bodyHtml += "</div>";

  bodyHtml += "<div class='ft'><div class='ft-msg'>본 리포트는 학원 수업 및 학생 자기주도 학습 기록을 바탕으로 발행되었습니다. 가정에서도 따뜻한 격려와 칭찬 부탁드립니다.</div>유현리드인 한그루역사</div>";
  bodyHtml += "</div>"; // 2페이지 끝

  if (forEditModal) {
    return "<style>" + css + "</style><div id='reportEditableBody'>" + bodyHtml + "</div>";
  }
  return "<html><head><meta charset='utf-8'><style>" + css + "</style></head><body>" + bodyHtml + "</body></html>";
}

// 학생 학습 분석표 데이터 1회 Bulk 수집·정제·오름차순 정렬 공통 함수
function vocabCollectAnalysisReportData_(name, startStr, endStr, hideInternal) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var as = ss.getSheetByName(ANALYSIS_SHEET);
  var rs = getRecordSheetReadOnly_(ss);
  if (!rs) {
    return { ok: false, message: "먼저 메뉴의 [8. 어휘·학습기록(23열)·학생분석표 셋업]을 실행해 주세요." };
  }

  name = normName_(name);
  if (!name) return { ok: false, message: "학생을 먼저 선택해 주세요." };
  var start = vocabParseDate_(startStr);
  var end = vocabParseDate_(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, message: "기간(시작일 ~ 종료일)을 확인해 주세요." };
  }
  hideInternal = !!hideInternal;

  // [학생분석표] 시트 B2(학생명), B5(시작일), B6(종료일), G3(내부메모 숨김)에 동기화 (E2:E3 수식 보존)
  if (as) {
    try {
      as.getRange("B2").setValue(name);
      as.getRange("B5").setValue(start);
      as.getRange("B6").setValue(end);
      as.getRange("G3").setValue(hideInternal);
    } catch (e) {}
  }

  var startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  var endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  var periodStr = vocabFmtDate_(start) + " ~ " + vocabFmtDate_(end);

  // 1) [회원 분석]에서 학년·목표·코칭방향 1회 Bulk 조회
  var grade = "", coachingText = "", goalText = "";
  var sheetMember = getMemberAnalysisSheet(ss);
  if (sheetMember && sheetMember.getLastRow() >= 2) {
    var mVals = sheetMember.getRange(2, 1, sheetMember.getLastRow() - 1, Math.min(sheetMember.getLastColumn(), 8)).getValues();
    for (var m = 0; m < mVals.length; m++) {
      if (normName_(mVals[m][1]) === name) {
        grade = String(mVals[m][2] || "").trim();
        coachingText = hideInternal ? "" : String(mVals[m][5] || "").trim();
        goalText = String(mVals[m][6] || "").trim();
        break;
      }
    }
  }

  // 2) [어휘] 시트 사전(뜻 매칭용) 1회 로드
  var vocabRows = vocabReadRows_();
  var meaningMap = {};
  for (var vr = 0; vr < vocabRows.length; vr++) {
    var vRow = vocabRows[vr];
    if (vRow.w && !meaningMap[vRow.w]) meaningMap[vRow.w] = vRow.m;
  }

  // 3) [학습기록] 23열(A~W열) 1회 Bulk 조회 및 정제
  var dateSet = {};
  var hwDoneCount = 0, hwOtherCount = 0;
  var vocabRates = [], vocabWrongTotal = 0;
  var diagScores = [], topDiagBooks = [], topDiagSeen = {};
  var bookSet = {}, levelSet = {};
  var bookRows = [];
  var wrongWordsSeen = {}, wrongWordList = [];
  var trByType = {}, trOrder = [], trRows = [];
  var undGood = 0, undMid = 0, undLow = 0;
  var reflections = [];

  if (rs.getLastRow() >= 2) {
    var rVals = rs.getRange(2, 1, rs.getLastRow() - 1, Math.min(Math.max(rs.getLastColumn(), 18), 23)).getValues();
    for (var i = 0; i < rVals.length; i++) {
      var v = rVals[i];
      if (normName_(v[1]) !== name) continue;
      var dObj = vocabParseDate_(v[0]);
      var tMs = dObj.getTime();
      if (!(tMs >= startMs && tMs < endMs)) continue;
      var dStr = vocabFmtDate_(dObj);
      dateSet[dStr] = true;

      var hw = vocabNormHwStatus_(v[2]);
      if (hw === "숙제 완료" || hw === "숙제완료") hwDoneCount++;
      else if (hw) hwOtherCount++;

      var cleanedBk = vocabCleanBookTitleAndLevel_(v[4], v[5]);
      var lv = cleanedBk.level;
      var bk = cleanedBk.book;
      if (lv) levelSet[lv] = true;

      var rawStep1 = String(v[3] || "").trim();
      var step1Clean = vocabCleanBookTitleAndLevel_("", rawStep1).book;
      if (step1Clean && bk && step1Clean === bk) step1Clean = "";
      if (!vocabIsMeaningfulReflection_(step1Clean)) step1Clean = "";

      var gTot = vocabNum_(v[6]);
      var hCor = vocabNum_(v[7]);
      var iRate = vocabNum_(v[8]);
      var jScore = vocabNum_(v[9]);
      var mDetRaw = String(v[12] || "").trim();
      var kStep2 = vocabCleanFootprintMemo_(v[10]);
      if (kStep2 && mDetRaw && kStep2 === mDetRaw) kStep2 = "";
      if (cleanedBk.isReread && !kStep2) kStep2 = "재독 완료";
      var rWrong = vocabCleanWrongWordsStr_(v[17]);

      // '초5~6 필수어휘' 등 어휘교재는 도서 권수 집계에서 제외하고 실제 도서만 집계
      if (bk && bk.indexOf("필수어휘") === -1) {
        bookSet[vocabNormBook_(bk) || bk] = true;
      }
      if (gTot !== "" && gTot > 0) {
        var rateVal = iRate !== "" ? iRate : (hCor !== "" ? Math.round((hCor / gTot) * 100) : "");
        if (rateVal !== "") vocabRates.push(rateVal);
        if (hCor !== "") vocabWrongTotal += Math.max(0, gTot - hCor);
      }
      if (jScore !== "" && jScore > 0) {
        diagScores.push(jScore);
        if (jScore >= 90 && bk && !topDiagSeen[bk]) {
          topDiagSeen[bk] = true;
          topDiagBooks.push("『" + bk + "』(" + jScore + "점)");
        }
      }
      if (bk || gTot !== "" || jScore !== "" || kStep2 || rWrong) {
        bookRows.push({
          fullDate: dStr,
          date: dStr.substring(5),
          level: lv,
          book: bk,
          vTotal: gTot,
          vCorr: hCor,
          vRate: iRate !== "" ? iRate : (gTot && hCor !== "" ? Math.round((hCor / gTot) * 100) : ""),
          dScore: jScore,
          step2: kStep2,
          wrong: rWrong
        });
      }
      if (rWrong) {
        var wParts = rWrong.split(",");
        for (var wp = 0; wp < wParts.length; wp++) {
          var wClean = String(wParts[wp] || "").trim();
          if (!wClean || wrongWordsSeen[wClean]) continue;
          wrongWordsSeen[wClean] = true;
          wrongWordList.push({
            word: wClean,
            meaning: meaningMap[wClean] || "",
            book: bk
          });
        }
      }

      var lTr = String(v[11] || "").trim();
      var mDet = mDetRaw;
      var nErr = vocabParseErrorNum_(v[13]);
      var oUnd = vocabNormUnderstanding_(v[14]);
      var pMemo = vocabCleanFootprintMemo_(v[15]);

      var sReadTot = vocabNum_(v[18]);
      var tReadWrg = vocabNum_(v[19]);
      var uVocTot = vocabNum_(v[20]);
      var vVocWrg = vocabNum_(v[21]);
      var wLitAcc = vocabNum_(v[22]);

      if (lTr) {
        if (!trByType[lTr]) {
          trByType[lTr] = { type: lTr, count: 0, errs: [], details: [] };
          trOrder.push(lTr);
        }
        trByType[lTr].count++;
        if (nErr !== "") trByType[lTr].errs.push(nErr);
        var detailDisplay = mDet;
        var splitInfo = [];
        if (sReadTot !== "" && sReadTot > 0) splitInfo.push("독해 " + (sReadTot - (Number(tReadWrg) || 0)) + "/" + sReadTot);
        if (uVocTot !== "" && uVocTot > 0) splitInfo.push("어휘 " + (uVocTot - (Number(vVocWrg) || 0)) + "/" + uVocTot);
        if (wLitAcc !== "") splitInfo.push(wLitAcc + "%");
        if (splitInfo.length > 0) {
          detailDisplay = (detailDisplay ? detailDisplay + " " : "") + "(" + splitInfo.join("·") + ")";
        }
        if (mDet && trByType[lTr].details.length < 4 && trByType[lTr].details.indexOf(mDet) === -1) {
          trByType[lTr].details.push(mDet);
        }
        if (oUnd === "잘 이해했어요") undGood++;
        else if (oUnd === "보통이에요") undMid++;
        else if (oUnd === "아직 헷갈려요") undLow++;

        trRows.push({
          fullDate: dStr,
          date: dStr.substring(5),
          type: lTr,
          detail: detailDisplay,
          err: nErr,
          und: oUnd,
          memo: pMemo
        });
      }

      var rawRefl = String(v[16] || "").trim();
      var qRefl = vocabIsMeaningfulReflection_(rawRefl) ? rawRefl : "";
      if (step1Clean || qRefl) {
        var rParts = [];
        if (step1Clean) rParts.push("[성실발자국] " + step1Clean);
        if (qRefl) rParts.push("\"" + qRefl + "\"");
        reflections.push({ fullDate: dStr, date: dStr.substring(5), text: rParts.join(" — ") });
      }
    }
  }

  var lessonDays = Object.keys(dateSet).length;
  if (lessonDays === 0) {
    return {
      ok: false,
      message: name + " 학생의 " + periodStr + " 기간에 저장된 [학습기록]이 없습니다. 상단 [📅 지난달 전체] 버튼이나 기간을 확인해 주세요."
    };
  }

  // 모든 표·기록 날짜 오름차순(과거 -> 최신순) 정렬
  bookRows.sort(function (a, b) { return a.fullDate.localeCompare(b.fullDate); });
  trRows.sort(function (a, b) { return a.fullDate.localeCompare(b.fullDate); });
  reflections.sort(function (a, b) { return a.fullDate.localeCompare(b.fullDate); });

  var vocabCount = vocabRates.length;
  var vocabAvg = vocabCount ? (Math.round((vocabRates.reduce(function (a, b) { return a + b; }, 0) / vocabCount) * 10) / 10) : "-";
  var vocabMax = vocabCount ? (Math.max.apply(null, vocabRates) + "%") : "-";
  var vocabMin = vocabCount ? (Math.min.apply(null, vocabRates) + "%") : "-";

  var diagCount = diagScores.length;
  var diagAvg = diagCount ? (Math.round((diagScores.reduce(function (a, b) { return a + b; }, 0) / diagCount) * 10) / 10) : "-";
  var diagMax = diagCount ? (Math.max.apply(null, diagScores) + "점") : "-";

  var trSummary = [];
  for (var tIdx = 0; tIdx < trOrder.length; tIdx++) {
    var tg = trByType[trOrder[tIdx]];
    var avgE = tg.errs.length ? (Math.round((tg.errs.reduce(function (a, b) { return a + b; }, 0) / tg.errs.length) * 10) / 10) : "-";
    trSummary.push({
      type: tg.type,
      count: tg.count,
      avgErr: avgE,
      details: tg.details.join(" · ") || "-"
    });
  }

  var mm = start.getMonth() + 1;
  var reportTitle = mm + "월 문해력 성장 리포트";

  var reportData = {
    name: name,
    grade: grade,
    title: reportTitle,
    monthNum: mm,
    period: periodStr,
    startStr: vocabFmtDate_(start),
    endStr: vocabFmtDate_(end),
    lessonDays: lessonDays,
    hwDoneCount: hwDoneCount,
    vocabCount: vocabCount,
    vocabAvg: vocabAvg,
    vocabMax: vocabMax,
    vocabMin: vocabMin,
    vocabWrongTotal: vocabWrongTotal,
    diagCount: diagCount,
    diagAvg: diagAvg,
    diagMax: diagMax,
    topDiagBooks: topDiagBooks,
    bookCount: Object.keys(bookSet).length,
    levelSetList: Object.keys(levelSet),
    trTotalCount: trRows.length,
    undGood: undGood,
    undMid: undMid,
    undLow: undLow,
    goalText: goalText,
    coachingText: coachingText,
    bookRows: bookRows.slice(0, 22),
    wrongWordList: wrongWordList.slice(0, 30),
    trSummary: trSummary,
    trRows: trRows.slice(0, 15),
    reflections: reflections.slice(0, 10)
  };
  reportData.reviewParagraph = vocabBuildMonthlyReviewParagraph_(reportData);

  return { ok: true, data: reportData };
}

// 모달에서 [1단계: 분석표 불러오기 (내용 수정·미리보기)] 클릭 시 호출
function vocabPreviewAnalysisReportFromModal(name, startStr, endStr, hideInternal) {
  var collected = vocabCollectAnalysisReportData_(name, startStr, endStr, hideInternal);
  if (!collected.ok) return collected;
  var d = collected.data;
  var editableHtml = vocabRenderAnalysisReportHtml_(d, true);
  return {
    ok: true,
    name: d.name,
    period: d.period,
    lessonDays: d.lessonDays,
    bookCount: d.bookCount,
    vocabCount: d.vocabCount,
    diagCount: d.diagCount,
    trCount: d.trTotalCount,
    editableHtml: editableHtml
  };
}

// 모달에서 내용 수정 후 [2단계: 수정한 내용으로 PDF 만들기] 클릭 시 호출
function vocabSaveEditedAnalysisPdfFromModal(name, startStr, endStr, editedBodyHtml) {
  name = normName_(name);
  if (!name) return { ok: false, message: "학생을 선택해 주세요." };
  var start = vocabParseDate_(startStr);
  var end = vocabParseDate_(endStr);
  var sFmt = !isNaN(start.getTime()) ? vocabFmtDate_(start) : String(startStr || "");
  var eFmt = !isNaN(end.getTime()) ? vocabFmtDate_(end) : String(endStr || "");
  var periodStr = sFmt + " ~ " + eFmt;

  var fullHtml = "<html><head><meta charset='utf-8'><style>" + vocabAnalysisReportCss_() + "</style></head><body>" + editedBodyHtml + "</body></html>";
  var fileName = name + "_" + sFmt + "~" + eFmt + "_학생학습분석표.pdf";
  var pdfBlob = Utilities.newBlob(fullHtml, "text/html", "analysis_report.html").getAs("application/pdf").setName(fileName);
  var folder = getOrCreateFolder_("학생 학습 분석표");
  var file = folder.createFile(pdfBlob);

  return {
    ok: true,
    name: name,
    period: periodStr,
    url: file.getUrl()
  };
}

// 모달 또는 외부에서 즉시 PDF를 생성할 때 호출
function vocabGenerateAnalysisPdfFromModal(name, startStr, endStr, hideInternal) {
  var collected = vocabCollectAnalysisReportData_(name, startStr, endStr, hideInternal);
  if (!collected.ok) return collected;
  var d = collected.data;
  var htmlDoc = vocabRenderAnalysisReportHtml_(d, false);

  var fileName = d.name + "_" + d.startStr + "~" + d.endStr + "_학생학습분석표.pdf";
  var pdfBlob = Utilities.newBlob(htmlDoc, "text/html", "analysis_report.html").getAs("application/pdf").setName(fileName);
  var folder = getOrCreateFolder_("학생 학습 분석표");
  var file = folder.createFile(pdfBlob);

  return {
    ok: true,
    name: d.name,
    period: d.period,
    lessonDays: d.lessonDays,
    bookCount: d.bookCount,
    vocabCount: d.vocabCount,
    diagCount: d.diagCount,
    trCount: d.trTotalCount,
    url: file.getUrl()
  };
}

function vocabMakeAnalysisReportPdf() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var rs = getRecordSheetReadOnly_(ss);
  if (!rs) {
    ui.alert("먼저 메뉴의 [8. 어휘·학습기록(23열)·학생분석표 셋업]을 실행해 주세요.");
    return;
  }

  var initData = vocabGetModalInitData_(ss);
  var optionsHtml = initData.students.map(function (st) {
    var sel = st.name === initData.defaultName ? " selected" : "";
    var meta = [];
    if (st.grade) meta.push(st.grade);
    if (st.recordCount > 0) meta.push("학습기록 " + st.recordCount + "건");
    var label = vocabEsc_(st.name) + (meta.length ? " (" + vocabEsc_(meta.join(" · ")) + ")" : "");
    return "<option value='" + vocabEsc_(st.name) + "'" + sel + ">" + label + "</option>";
  }).join("");

  var modalHtml = HtmlService.createHtmlOutput(
    "<div style='font-family:Malgun Gothic,Pretendard,sans-serif;line-height:1.5;padding:6px;color:#0f172a'>" +
      "<div style='background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;margin-bottom:10px'>" +
        "<div style='display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap'>" +
          "<div style='flex:1.4;min-width:180px'>" +
            "<label style='display:block;font-size:12px;font-weight:bold;color:#334155;margin-bottom:3px'>👤 학생 선택</label>" +
            "<select id='stSelect' style='width:100%;padding:7px 10px;border:1.5px solid #16a34a;border-radius:8px;font-size:13px;font-weight:bold;color:#0f172a;background:#fff'>" +
              optionsHtml +
            "</select>" +
          "</div>" +
          "<div style='flex:1;min-width:130px'>" +
            "<label style='display:block;font-size:12px;font-weight:bold;color:#334155;margin-bottom:3px'>📅 시작일</label>" +
            "<input type='date' id='startInput' value='" + vocabEsc_(initData.defaultStartStr) + "' style='width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;box-sizing:border-box'>" +
          "</div>" +
          "<div style='padding-bottom:6px;font-weight:bold;color:#64748b'>~</div>" +
          "<div style='flex:1;min-width:130px'>" +
            "<label style='display:block;font-size:12px;font-weight:bold;color:#334155;margin-bottom:3px'>📅 종료일</label>" +
            "<input type='date' id='endInput' value='" + vocabEsc_(initData.defaultEndStr) + "' style='width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;box-sizing:border-box'>" +
          "</div>" +
          "<div style='display:flex;gap:4px;padding-bottom:2px'>" +
            "<button type='button' onclick=\"setMonthRange('" + vocabEsc_(initData.prevMonthStartStr) + "','" + vocabEsc_(initData.prevMonthEndStr) + "')\" style='background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;border-radius:6px;padding:6px 9px;font-size:11.5px;font-weight:bold;cursor:pointer'>지난달</button>" +
            "<button type='button' onclick=\"setMonthRange('" + vocabEsc_(initData.thisMonthStartStr) + "','" + vocabEsc_(initData.thisMonthEndStr) + "')\" style='background:#ffffff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;padding:6px 9px;font-size:11.5px;font-weight:bold;cursor:pointer'>이번달</button>" +
          "</div>" +
        "</div>" +
        "<div style='display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap'>" +
          "<label style='display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;cursor:pointer'>" +
            "<input type='checkbox' id='hideInternal'" + (initData.hideInternal ? " checked" : "") + ">" +
            "<span>학부모 발송용 (내부 코칭메모 숨김)</span>" +
          "</label>" +
          "<div style='display:flex;gap:8px'>" +
            "<button id='btnPreview' type='button' onclick='loadEditablePreview()' style='background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12.5px;font-weight:bold;cursor:pointer'>🔍 1단계: 내용 불러오기 (수정·미리보기)</button>" +
            "<button id='btnSavePdf' type='button' onclick='saveEditedPdf()' style='background:#15803d;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12.5px;font-weight:bold;cursor:pointer'>📊 2단계: 현재 내용으로 PDF 만들기</button>" +
          "</div>" +
        "</div>" +
      "</div>" +
      "<div id='resultBox' style='margin-bottom:8px;font-size:12.5px;color:#475569'>" +
        "💡 <b>[1단계: 내용 불러오기]</b>를 누르면 아래에서 총평·표·어휘·다짐 문구를 직접 클릭해 수정하거나 불필요한 행(✕)을 지운 뒤 <b>[2단계: PDF 만들기]</b>로 출력할 수 있습니다." +
      "</div>" +
      "<div id='previewWrap' style='border:1.5px solid #94a3b8;border-radius:10px;background:#ffffff;padding:14px;max-height:510px;overflow-y:auto;display:none'></div>" +
    "</div>" +
    "<script>" +
      "var isLoaded=false;" +
      "function setMonthRange(s,e){document.getElementById('startInput').value=s;document.getElementById('endInput').value=e;}" +
      "function loadEditablePreview(){" +
        "var name=document.getElementById('stSelect').value;" +
        "var s=document.getElementById('startInput').value;" +
        "var e=document.getElementById('endInput').value;" +
        "var h=document.getElementById('hideInternal').checked;" +
        "var btn=document.getElementById('btnPreview');" +
        "var box=document.getElementById('resultBox');" +
        "var wrap=document.getElementById('previewWrap');" +
        "if(!name){alert('학생을 선택해 주세요.');return;}" +
        "btn.disabled=true;btn.style.opacity='0.6';btn.textContent='⏳ 분석표 불러오는 중...';" +
        "box.innerHTML='<div style=\"color:#2563eb;font-weight:bold\"><b>'+name+'</b> 학생의 분석표를 불러오고 있습니다...</div>';" +
        "google.script.run.withSuccessHandler(function(res){" +
          "btn.disabled=false;btn.style.opacity='1';btn.textContent='🔍 1단계: 내용 불러오기 (수정·미리보기)';" +
          "if(!res||!res.ok){isLoaded=false;wrap.style.display='none';box.innerHTML='<div style=\"background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px;border-radius:8px;font-size:12.5px\">⚠️ '+(res&&res.message?res.message:'불러오기 실패')+'</div>';return;}" +
          "isLoaded=true;wrap.style.display='block';wrap.innerHTML=res.editableHtml;" +
          "box.innerHTML='<div style=\"background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;padding:8px 12px;border-radius:8px;font-size:12px\">✏️ <b>편집 모드 활성화됨:</b> 아래 리포트의 모든 글자(총평, 도서명, 점수, 합계/평균, 발자국 등)를 마우스로 클릭해 자유롭게 수정하신 뒤 <b>[📊 2단계: 현재 내용으로 PDF 만들기]</b> 버튼을 눌러 주세요.</div>';" +
        "}).withFailureHandler(function(err){" +
          "btn.disabled=false;btn.style.opacity='1';btn.textContent='🔍 1단계: 내용 불러오기 (수정·미리보기)';" +
          "box.innerHTML='<div style=\"color:#b91c1c\">오류: '+(err&&err.message?err.message:err)+'</div>';" +
        "}).vocabPreviewAnalysisReportFromModal(name,s,e,h);" +
      "}" +
      "function saveEditedPdf(){" +
        "var name=document.getElementById('stSelect').value;" +
        "var s=document.getElementById('startInput').value;" +
        "var e=document.getElementById('endInput').value;" +
        "var h=document.getElementById('hideInternal').checked;" +
        "var btn=document.getElementById('btnSavePdf');" +
        "var box=document.getElementById('resultBox');" +
        "if(!name){alert('학생을 선택해 주세요.');return;}" +
        "var editRoot=document.getElementById('reportEditableBody');" +
        "btn.disabled=true;btn.style.opacity='0.6';btn.textContent='⏳ PDF 생성 중...';" +
        "if(isLoaded && editRoot){" +
          "var clone=editRoot.cloneNode(true);" +
          "var delBtns=clone.querySelectorAll('.no-print-edit');" +
          "for(var i=0;i<delBtns.length;i++){delBtns[i].parentNode.removeChild(delBtns[i]);}" +
          "var edits=clone.querySelectorAll('[contenteditable]');" +
          "for(var j=0;j<edits.length;j++){edits[j].removeAttribute('contenteditable');}" +
          "box.innerHTML='<div style=\"color:#15803d;font-weight:bold\"><b>'+name+'</b> 학생의 수정된 리포트로 PDF를 만들고 있습니다...</div>';" +
          "google.script.run.withSuccessHandler(function(res){" +
            "btn.disabled=false;btn.style.opacity='1';btn.textContent='📊 2단계: 현재 내용으로 PDF 만들기';" +
            "if(!res||!res.ok){box.innerHTML='<div style=\"background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px;border-radius:8px;font-size:12.5px\">⚠️ '+(res&&res.message?res.message:'PDF 생성 실패')+'</div>';return;}" +
            "box.innerHTML='<div style=\"background:#f0fdf4;border:1px solid #bbf7d0;padding:10px 14px;border-radius:10px\">'+" +
              "'✅ <b>'+res.name+'</b> 학생의 수정본 <b>학습 분석표 PDF</b>가 완성되었습니다! &nbsp; '+" +
              "'<a href=\"'+res.url+'\" target=\"_blank\" style=\"display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:6px 14px;border-radius:6px;font-weight:bold\">▶ 학습 분석표 PDF 열기 / 다운로드</a>'+" +
              "'<div style=\"margin-top:4px;font-size:11px;color:#64748b\">※ 구글 드라이브 \\'학생 학습 분석표\\' 폴더에 자동 저장되었습니다.</div></div>';" +
          "}).withFailureHandler(function(err){" +
            "btn.disabled=false;btn.style.opacity='1';btn.textContent='📊 2단계: 현재 내용으로 PDF 만들기';" +
            "box.innerHTML='<div style=\"color:#b91c1c\">오류: '+(err&&err.message?err.message:err)+'</div>';" +
          "}).vocabSaveEditedAnalysisPdfFromModal(name,s,e,clone.innerHTML);" +
        "}else{" +
          "box.innerHTML='<div style=\"color:#15803d;font-weight:bold\"><b>'+name+'</b> 학생의 데이터를 분석하고 PDF를 만들고 있습니다...</div>';" +
          "google.script.run.withSuccessHandler(function(res){" +
            "btn.disabled=false;btn.style.opacity='1';btn.textContent='📊 2단계: 현재 내용으로 PDF 만들기';" +
            "if(!res||!res.ok){box.innerHTML='<div style=\"background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px;border-radius:8px;font-size:12.5px\">⚠️ '+(res&&res.message?res.message:'PDF 생성 실패')+'</div>';return;}" +
            "box.innerHTML='<div style=\"background:#f0fdf4;border:1px solid #bbf7d0;padding:10px 14px;border-radius:10px\">'+" +
              "'✅ <b>'+res.name+'</b> 학생의 <b>학습 분석표 PDF</b>가 완성되었습니다! &nbsp; '+" +
              "'<a href=\"'+res.url+'\" target=\"_blank\" style=\"display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:6px 14px;border-radius:6px;font-weight:bold\">▶ 학습 분석표 PDF 열기 / 다운로드</a></div>';" +
          "}).withFailureHandler(function(err){" +
            "btn.disabled=false;btn.style.opacity='1';btn.textContent='📊 2단계: 현재 내용으로 PDF 만들기';" +
            "box.innerHTML='<div style=\"color:#b91c1c\">오류: '+(err&&err.message?err.message:err)+'</div>';" +
          "}).vocabGenerateAnalysisPdfFromModal(name,s,e,h);" +
        "}" +
      "}" +
      "window.onload=function(){loadEditablePreview();};" +
    "</script>"
  ).setWidth(920).setHeight(740);
  ui.showModalDialog(modalHtml, "📊 학부모 발송용 학생 문해력 성장 리포트 (내용 수정 · PDF 출력)");
}

// 틀린어휘 문자열에서 '(짝짓기)' 또는 '짝짓기' 같은 문제유형 꼬리표 제거
function vocabCleanWrongWordsStr_(str) {
  if (!str) return "";
  var parts = String(str).split(",");
  var cleaned = [];
  for (var i = 0; i < parts.length; i++) {
    var w = String(parts[i] || "").trim();
    if (!w || w === "짝짓기" || w === "(짝짓기)") continue;
    if (cleaned.indexOf(w) === -1) cleaned.push(w);
  }
  return cleaned.join(", ");
}

// ---------- 메뉴 12번: 📨 오늘 수업 브리핑 문구 창 띄우기 (원그래프·막대그래프 시각화 카드 + 텍스트 동시 제공!) ----------
function vocabMakeTextGauge_(pct) {
  var n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  var filled = Math.round(n / 10);
  var out = "";
  for (var i = 0; i < 10; i++) out += (i < filled ? "█" : "░");
  return out;
}

function buildStudentDailyBriefingEntry_(name, dateStr, rows23) {
  var md = dateStr.length >= 10 ? (parseInt(dateStr.substring(5, 7), 10) + "/" + parseInt(dateStr.substring(8, 10), 10)) : dateStr;
  var hwStatus = "", step1Memo = "", reflection = "";
  var books = [], trainings = [], wrongWordsAll = [];
  var diagScores = [], vocabRates = [], trPcts = [];
  var vTotSum = 0, vCorSum = 0;

  for (var i = 0; i < rows23.length; i++) {
    var r = rows23[i];
    if (r[2] && !hwStatus) hwStatus = vocabNormHwStatus_(r[2]);
    if (r[3] && !step1Memo) step1Memo = String(r[3]).trim();
    if (r[16] && !reflection) reflection = String(r[16]).trim();

    var lv = String(r[4] || "").trim();
    var bk = String(r[5] || "").trim();
    var vTot = vocabNum_(r[6]), vCor = vocabNum_(r[7]), vRate = vocabNum_(r[8]), dScore = vocabNum_(r[9]);
    var step2 = String(r[10] || "").trim();
    var wrong = vocabCleanWrongWordsStr_(r[17]);

    if (dScore !== "") diagScores.push(dScore);
    if (vTot !== "" && vTot > 0) {
      var rt = vRate !== "" ? vRate : (vCor !== "" ? Math.round((vCor / vTot) * 100) : 0);
      vocabRates.push(rt);
      vTotSum += vTot;
      vCorSum += (vCor !== "" ? vCor : 0);
    }

    if (bk || vTot !== "" || dScore !== "") {
      var bLine = "• 도서: " + (bk || "어휘 학습") + (lv ? " (" + lv + ")" : "");
      var sub = [];
      if (dScore !== "") sub.push("독서이해도 진단 " + dScore + "점");
      if (vTot !== "" && vTot > 0) {
        sub.push("어휘학습 " + vTot + "문항 중 " + (vCor !== "" ? vCor : 0) + "개 정답(" + (vRate !== "" ? vRate : 0) + "%)");
      }
      if (sub.length) bLine += " — " + sub.join(" / ");
      if (step2) bLine += "\n  └ 독서발자국: \"" + step2 + "\"";
      books.push(bLine);
    }
    if (wrong) wrongWordsAll.push(wrong);

    var trName = String(r[11] || "").trim();
    var trDet = String(r[12] || "").trim();
    var trErr = vocabParseErrorNum_(r[13]);
    var trUnd = String(r[14] || "").trim();
    var trMemo = String(r[15] || "").trim();
    var sReadTot = vocabNum_(r[18]);
    var tReadWrg = vocabNum_(r[19]);
    var uVocTot = vocabNum_(r[20]);
    var vVocWrg = vocabNum_(r[21]);
    var wLitAcc = vocabNum_(r[22]);

    if (trName) {
      var ach = wLitAcc !== "" ? wLitAcc : (trUnd === "잘 이해했어요" ? 95 : (trUnd === "보통이에요" ? 82 : 88));
      if (wLitAcc === "" && trErr !== "") ach = Math.max(65, Math.min(100, 100 - trErr * 7));
      trPcts.push(ach);

      var tLine = "• " + trName + (trDet ? ": " + trDet : "");
      var tSub = [];
      if (sReadTot !== "" && sReadTot > 0) tSub.push("독해 " + (sReadTot - (Number(tReadWrg) || 0)) + "/" + sReadTot);
      if (uVocTot !== "" && uVocTot > 0) tSub.push("어휘 " + (uVocTot - (Number(vVocWrg) || 0)) + "/" + uVocTot);
      if (wLitAcc !== "") tSub.push("정답률 " + wLitAcc + "%");
      else if (trErr !== "") tSub.push("오답 " + trErr + "개");
      if (trUnd) tSub.push("이해도: " + trUnd);
      if (tSub.length) tLine += " (" + tSub.join(", ") + ")";
      if (trMemo) tLine += "\n  └ 문해력발자국: \"" + trMemo + "\"";
      trainings.push(tLine);
    }
  }

  var hwPct = (hwStatus === "숙제 완료" || hwStatus === "숙제완료") ? 100 : (hwStatus === "학원에서 풀기" || hwStatus === "학원에서풀기" ? 85 : (hwStatus ? 70 : 95));
  var vocabAvg = vocabRates.length ? Math.round(vocabRates.reduce(function(a, b) { return a + b; }, 0) / vocabRates.length) : null;
  var diagAvg = diagScores.length ? Math.round(diagScores.reduce(function(a, b) { return a + b; }, 0) / diagScores.length) : null;
  var trAvg = trPcts.length ? Math.round(trPcts.reduce(function(a, b) { return a + b; }, 0) / trPcts.length) : null;

  var activeArr = [hwPct];
  if (vocabAvg !== null) activeArr.push(vocabAvg);
  if (diagAvg !== null) activeArr.push(diagAvg);
  if (trAvg !== null) activeArr.push(trAvg);
  var overallScore = Math.round(activeArr.reduce(function(a, b) { return a + b; }, 0) / activeArr.length);

  var lines = [];
  lines.push("[독서와국어 오늘의 수업 브리핑 🌿]");
  lines.push("안녕하세요, " + name + " 학부모님! 오늘(" + md + ") 학원에서 진행한 수업 활동과 성취 그래프 안내드립니다.");
  lines.push("");
  lines.push("📊 [오늘의 성취도 그래프 요약]");
  lines.push("• 종합 성취도: [" + vocabMakeTextGauge_(overallScore) + "] " + overallScore + "%");
  if (diagAvg !== null) lines.push("• 독서 이해도: [" + vocabMakeTextGauge_(diagAvg) + "] " + diagAvg + "점");
  if (vocabAvg !== null) lines.push("• 어휘 정답률: [" + vocabMakeTextGauge_(vocabAvg) + "] " + vocabAvg + "%");
  if (trAvg !== null) lines.push("• 문해력 성취: [" + vocabMakeTextGauge_(trAvg) + "] " + trAvg + "%");
  lines.push("");
  if (hwStatus || step1Memo) {
    lines.push("✅ 숙제 현황: " + (hwStatus || "확인 완료") + (step1Memo ? " (" + step1Memo + ")" : ""));
  }
  if (books.length) {
    lines.push("📚 독서 & 어휘 학습");
    for (var b = 0; b < books.length; b++) lines.push(books[b]);
  }
  if (wrongWordsAll.length) {
    lines.push("📝 오늘 복습한 어휘: " + wrongWordsAll.join(", "));
  }
  if (trainings.length) {
    lines.push("✏️ 문해력 & 국어 트레이닝");
    for (var t = 0; t < trainings.length; t++) lines.push(trainings[t]);
  }
  if (reflection) {
    lines.push("💬 " + name + " 학생의 오늘 다짐: \"" + reflection + "\"");
  }
  lines.push("");
  lines.push("가정에서도 따뜻한 격려와 칭찬 부탁드립니다. 감사합니다! 😊");

  return {
    text: lines.join("\n"),
    md: md,
    hwStatus: hwStatus || "수업 완료",
    overallScore: overallScore,
    diagAvg: diagAvg,
    bookCount: books.length,
    vocabAvg: vocabAvg,
    vCorSum: vCorSum,
    vTotSum: vTotSum,
    trAvg: trAvg,
    trCount: trainings.length
  };
}

function showDailyBriefingModal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var rs = vocabEnsureRecordSheet_(ss);
  if (!rs || rs.getLastRow() < 2) {
    ui.alert("[학습기록] 시트에 데이터가 없습니다.");
    return;
  }

  var activeSheet = ss.getActiveSheet();
  var sName = activeSheet.getName();
  var selRow = activeSheet.getActiveCell() ? activeSheet.getActiveCell().getRow() : 2;
  var targetName = "";
  var targetDateStr = vocabFmtDate_(new Date());

  if (sName === RECORD_SHEET && selRow >= 2 && selRow <= rs.getLastRow()) {
    targetDateStr = vocabFmtDate_(rs.getRange(selRow, 1).getValue());
    var candName = rs.getRange(selRow, 2).getValue();
    if (!vocabIsTimeLikeValue_(candName)) {
      targetName = normName_(candName);
    }
  } else if (sName === ANALYSIS_SHEET) {
    targetName = normName_(activeSheet.getRange("B2").getValue());
  } else if ((sName === "출결보강관리" || sName === "오늘 출석부") && selRow >= 2) {
    targetName = normName_(activeSheet.getRange(selRow, 3).getValue());
  } else if ((sName === "회원 분석" || sName === "회원분석" || sName === "회원 분석/레벨변동/전화상담") && selRow >= 2) {
    targetName = normName_(activeSheet.getRange(selRow, 2).getValue());
  }

  var last = rs.getLastRow();
  var data = rs.getRange(2, 1, last - 1, Math.min(Math.max(rs.getLastColumn(), 18), 23)).getValues();

  var byStudentDate = {};
  var studentOrder = [];
  for (var i = 0; i < data.length; i++) {
    var dStr = vocabFmtDate_(data[i][0]);
    if (vocabIsTimeLikeValue_(data[i][1])) continue;
    var nm = String(data[i][1] || "").replace(/\s+/g, "");
    if (!nm || !dStr) continue;
    if (!byStudentDate[nm]) {
      byStudentDate[nm] = {};
      studentOrder.push(nm);
    }
    if (!byStudentDate[nm][dStr]) {
      byStudentDate[nm][dStr] = [];
    }
    byStudentDate[nm][dStr].push(data[i]);
  }

  if (!targetName || !byStudentDate[targetName]) {
    targetName = studentOrder[0] || "";
  }
  var briefingsMap = {};
  for (var sIdx = 0; sIdx < studentOrder.length; sIdx++) {
    var st = studentOrder[sIdx];
    briefingsMap[st] = {};
    var dates = Object.keys(byStudentDate[st]).sort().reverse();
    for (var dIdx = 0; dIdx < dates.length; dIdx++) {
      var dt = dates[dIdx];
      briefingsMap[st][dt] = buildStudentDailyBriefingEntry_(st, dt, byStudentDate[st][dt]);
    }
  }

  var initDates = targetName && briefingsMap[targetName] ? Object.keys(briefingsMap[targetName]) : [];
  if (initDates.indexOf(targetDateStr) === -1 && initDates.length > 0) {
    targetDateStr = initDates[0];
  }
  var initEntry = (targetName && briefingsMap[targetName] && briefingsMap[targetName][targetDateStr]) || { text: "" };

  var htmlStr =
    "<div style='font-family:Malgun Gothic,sans-serif;padding:6px;color:#1e293b'>" +
    "<div style='display:flex;gap:8px;margin-bottom:8px;align-items:center;background:#f8fafc;padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1'>" +
    "  <label style='font-size:12px;font-weight:bold;color:#1e3a8a'>👤 학생 선택:</label>" +
    "  <select id='selStudent' onchange='onStudentChange()' style='padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px;font-weight:bold'></select>" +
    "  <label style='font-size:12px;font-weight:bold;color:#1e3a8a;margin-left:6px'>📅 수업일:</label>" +
    "  <select id='selDate' onchange='onDateChange()' style='padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px'></select>" +
    "</div>" +
    "<div id='visualCard' style='border:2px solid #c7d2fe;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#ffffff'></div>" +
    "<textarea id='briefBox' style='width:100%;height:185px;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;line-height:1.5;box-sizing:border-box'>" + vocabEsc_(initEntry.text) + "</textarea>" +
    "<div style='margin-top:8px;display:flex;justify-content:space-between;align-items:center'>" +
    "<span id='cpStatus' style='font-size:12px;color:#16a34a;font-weight:bold'></span>" +
    "<button onclick=\"var t=document.getElementById('briefBox');t.select();document.execCommand('copy');document.getElementById('cpStatus').innerText='✅ 복사되었습니다! 카톡이나 문자에 붙여넣으세요.';\" " +
    "style='background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12.5px'>📋 브리핑 문구 복사하기</button>" +
    "</div>" +
    "<script>" +
    "var DATA = " + JSON.stringify(briefingsMap) + ";" +
    "var STUDENTS = " + JSON.stringify(studentOrder) + ";" +
    "var INIT_ST = " + JSON.stringify(targetName) + ";" +
    "var INIT_DT = " + JSON.stringify(targetDateStr) + ";" +
    "var selSt = document.getElementById('selStudent');" +
    "var selDt = document.getElementById('selDate');" +
    "var box = document.getElementById('briefBox');" +
    "var vCard = document.getElementById('visualCard');" +
    "var cp = document.getElementById('cpStatus');" +
    "function renderVisual(st, e) {" +
    "  if (!e) { vCard.innerHTML = ''; return; }" +
    "  var r = 30, circ = 2 * Math.PI * r;" +
    "  var dash = (Math.min(100, Math.max(0, e.overallScore || 0)) / 100) * circ;" +
    "  var dPct = e.diagAvg !== null ? e.diagAvg : (e.bookCount > 0 ? 90 : 0);" +
    "  var dLbl = e.diagAvg !== null ? ('평균 ' + e.diagAvg + '점') : (e.bookCount > 0 ? (e.bookCount + '권 완료') : '기록 없음');" +
    "  var vPct = e.vocabAvg !== null ? e.vocabAvg : 0;" +
    "  var vLbl = e.vocabAvg !== null ? (e.vocabAvg + '% (' + e.vCorSum + '/' + e.vTotSum + ')') : '기록 없음';" +
    "  var tPct = e.trAvg !== null ? e.trAvg : 0;" +
    "  var tLbl = e.trCount > 0 ? (e.trCount + '건 (' + e.trAvg + '%)') : '기록 없음';" +
    "  vCard.innerHTML = \"<div style='display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin-bottom:8px'>\" +" +
    "    \"<div style='font-size:13px;font-weight:bold;color:#0f172a'>📊 \" + st + \" 학생 오늘(\" + (e.md || '') + \") 수업 성취 그래프</div>\" +" +
    "    \"<span style='background:#ecfdf5;color:#047857;border:1px solid #6ee7b7;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold'>✅ \" + (e.hwStatus || '수업 완료') + \"</span></div>\" +" +
    "    \"<div style='display:grid;grid-template-columns:165px 1fr;gap:12px;align-items:center'>\" +" +
    "    \"<div style='display:flex;gap:8px;justify-content:space-around;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px'>\" +" +
    "    \"<div style='text-align:center'><div style='position:relative;width:72px;height:72px;margin:0 auto'><svg width='72' height='72' viewBox='0 0 72 72' style='transform:rotate(-90deg)'><circle cx='36' cy='36' r='\" + r + \"' fill='none' stroke='#e2e8f0' stroke-width='8'/><circle cx='36' cy='36' r='\" + r + \"' fill='none' stroke='#10b981' stroke-width='8' stroke-dasharray='\" + dash.toFixed(1) + \" \" + circ.toFixed(1) + \"' stroke-linecap='round'/></svg><div style='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center'><span style='font-size:13px;font-weight:900;color:#047857'>\" + (e.overallScore || 0) + \"%</span><span style='font-size:9px;color:#64748b'>종합성취</span></div></div></div>\" +" +
    "    \"<div style='text-align:center'><div style='width:72px;height:72px;border-radius:50%;background:conic-gradient(#7c3aed 0% 35%, #2563eb 35% 65%, #f59e0b 65% 90%, #10b981 90% 100%);display:flex;align-items:center;justify-content:center'><div style='width:42px;height:42px;border-radius:50%;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:bold;color:#334155'>영역비중</div></div></div></div>\" +" +
    "    \"<div style='display:flex;flex-direction:column;gap:6px'>\" +" +
    "    \"<div><div style='display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#5b21b6'><span>📘 독서이해도 진단</span><span>\" + dLbl + \"</span></div><div style='height:8px;background:#ede9fe;border-radius:6px;overflow:hidden;margin-top:2px'><div style='width:\" + dPct + \"%;height:100%;background:#7c3aed'></div></div></div>\" +" +
    "    \"<div><div style='display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#1e40af'><span>📗 어휘 확인 학습</span><span>\" + vLbl + \"</span></div><div style='height:8px;background:#dbeafe;border-radius:6px;overflow:hidden;margin-top:2px'><div style='width:\" + vPct + \"%;height:100%;background:#2563eb'></div></div></div>\" +" +
    "    \"<div><div style='display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#92400e'><span>✏️ 집중 트레이닝</span><span>\" + tLbl + \"</span></div><div style='height:8px;background:#fef3c7;border-radius:6px;overflow:hidden;margin-top:2px'><div style='width:\" + tPct + \"%;height:100%;background:#f59e0b'></div></div></div>\" +" +
    "    \"</div></div>\";" +
    "}" +
    "function init() {" +
    "  selSt.innerHTML = '';" +
    "  for (var i=0; i<STUDENTS.length; i++) {" +
    "    var opt = document.createElement('option');" +
    "    opt.value = STUDENTS[i]; opt.textContent = STUDENTS[i];" +
    "    if (STUDENTS[i] === INIT_ST) opt.selected = true;" +
    "    selSt.appendChild(opt);" +
    "  }" +
    "  populateDates(INIT_ST, INIT_DT);" +
    "}" +
    "function populateDates(st, preferredDt) {" +
    "  selDt.innerHTML = '';" +
    "  var dts = DATA[st] ? Object.keys(DATA[st]) : [];" +
    "  for (var j=0; j<dts.length; j++) {" +
    "    var opt = document.createElement('option');" +
    "    opt.value = dts[j]; opt.textContent = dts[j];" +
    "    if (dts[j] === preferredDt) opt.selected = true;" +
    "    selDt.appendChild(opt);" +
    "  }" +
    "  updateBox();" +
    "}" +
    "function onStudentChange() { cp.innerText=''; populateDates(selSt.value, ''); }" +
    "function onDateChange() { cp.innerText=''; updateBox(); }" +
    "function updateBox() {" +
    "  var st = selSt.value; var dt = selDt.value;" +
    "  var entry = (DATA[st] && DATA[st][dt]) ? DATA[st][dt] : null;" +
    "  box.value = entry ? entry.text : '';" +
    "  renderVisual(st, entry);" +
    "}" +
    "init();" +
    "</script></div>";
  var out = HtmlService.createHtmlOutput(htmlStr).setWidth(580).setHeight(510);
  ui.showModalDialog(out, "📨 오늘 수업 시각화 브리핑 (원그래프·막대그래프·문구)");
}
