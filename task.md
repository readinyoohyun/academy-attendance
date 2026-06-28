# 출결 앱 고도화 및 구글 시트 연동 개선 작업 체크리스트

- [x] 1단계: 보강대기 및 결석 상태 카드 시각적 구분 강화
  - [x] `style.css`에서 `--color-makeup` (Vibrant Pink, `#ec4899`) 및 `--color-absent` (Bright Red, `#dc2626`) 색상 변수 대비율 조정
  - [x] 모든 학생 카드 좌측에 5px 두께의 선명한 상태 바 세로선 (`border-left: 5px solid ...`) 추가 적용하여 형태적으로 구분 명확화
- [x] 2단계: 기존 '누적일일수업관리' 시트 직접 연동 및 누적 로직 개선
  - [x] `setupSheetsAndHeaders()`에서 기존 시트의 이름을 강제로 바꾸던 리네이밍 규칙 제거
  - [x] 사용자가 기존에 사용 중인 '누적일일수업관리' 시트 그 위로 prepending(상단 누적) 방식으로 데이터를 백업하도록 백업 로직 최적화
  - [x] 오늘 출석부 백업 시 2행(헤더 바로 아래)에 `insertRowsBefore(2, length)` 명령으로 삽입해 최신순으로 위에 데이터가 쌓이도록 조치
- [x] 3단계: 시간당 30분 단위 보강 및 등록 시간 지원
  - [x] 보강등록 시 시간 선택기(`#inputCrmAttendanceTime`) 및 신규등록 시간 선택기(`#inputRegTime`), `#selectTime` 모두에 10:00부터 30분 단위 옵션(10:00, 10:30, 11:00, 11:30 ... 20:30)을 제공
- [x] 4단계: CRM 출석 통계 연동 및 오류 방어
  - [x] CRM 화면에서 attendance rate 계산 시, 삭제되어 빈 배열이 되는 `attendanceLogs` 대신 실제 Google Sheets와 연동 중인 `accumulatedLogs`와 당일 `dailyLogs` 데이터를 실시간 병합하여 비율을 연산하도록 교체
  - [x] `dashboard-manager.js`에서 호출하는 비존재 API인 `addAttendanceLogToGoogleSheets` 호출 제거로 런타임 오류 방어
- [x] 5단계: 열 너비 마우스 드래그 조절 기능 전면 제거 ("출결앱입니다")
  - [x] 태블릿 및 모바일 기기의 터치 환경 사용성을 고려하여 `sheet-sim.js` 및 `style.css`에서 테이블 크기 조절 핸들(`.resize-handle` 바 및 이벤트)을 전면 제외
- [x] 6단계: 최종 동작 검증 및 패키징
  - [x] Edge headless CDP console 로그 검출 스크립트 실행으로 자바스크립트 구문 및 작동 오류 무결성 검증
  - [x] 바탕화면의 개발 폴더, scratch 백업, `academy-attendance.zip` 압축 파일 삼원 동기화 및 갱신 배포 완료
