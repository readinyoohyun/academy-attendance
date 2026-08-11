# 학원 출결 및 보강 시스템 개발 시스템 규칙 (GEMINI Rules)

본 규칙은 학원 출결, 보강 은행, 연장 수업 및 SMS 알림 시스템 개발 시 반드시 준수해야 하는 엔지니어링 지침입니다.

---

## 🚨 1. 3각 교차 검증 (Cross-Client Synchronization)
학원 시스템은 **[구글 시트 데이터베이스] ➡️ [원장앱 (PC/모바일)] ➡️ [학생 태블릿 Kiosk]** 간의 실시간 연동이 필수적입니다.
* 출결, 보강 차감, 수업 시간 연장 로직을 수정할 때 단일 기기(원장앱)만 검증하지 마십시오.
* 반드시 아래 파일들을 함께 대조 분석하고 동시 수정해야 합니다.
  - 원장앱 대시보드 로직: [`dashboard-manager.js`](file:///C:/Users/new99/OneDrive/바탕 화면/academy-attendance/dashboard-manager.js)
  - 학생 태블릿 Kiosk 로직: [`kiosk.html`](file:///C:/Users/new99/OneDrive/바탕 화면/academy-attendance/kiosk.html)
  - 구글 시트 연동 웹훅 로직: [`index.html` (doPost/doGet)](file:///C:/Users/new99/OneDrive/바탕 화면/academy-attendance/index.html)
  - 공통 API 전송 모듈: [`api.js`](file:///C:/Users/new99/OneDrive/바탕 화면/academy-attendance/api.js)

## 📡 2. API 데이터 구조 매핑 검증
* Kiosk(`kiosk.html`) 또는 원장앱에서 구글 시트로 데이터를 보낼 때, 전송하는 JSON 페이로드의 키(예: `reason`)와 수신하는 구글 Apps Script(`index.html` 내 `doPost`)의 열 저장 매핑이 완전히 일치하는지 변수명을 1:1로 검증하십시오.

## ⏳ 3. 동기화 시차 및 레이스 컨디션 예외 처리
* Kiosk와 원장앱 간의 구글 시트 데이터 리로드 주기는 60초입니다.
* 등원 정보가 미처 동기화되지 않은 상태에서 연장 처리가 되거나 하원이 일어나는 시나리오를 대비하여, `todayExtensionMins` 및 `makeupMinsDone` 연산 시 로컬 값과 전송 대기 중인 서버 값을 안전하게 상호보완할 수 있는 방어적 코드(Fallback)를 반드시 설계에 포함해야 합니다.
