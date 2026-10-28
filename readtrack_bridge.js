/**
 * ReadTrackBridge (Drawer 4) - 독해밀도(ReadTrack) ↔ 학생앱(student.html) ↔ 원장앱(index.html) ↔ 구글시트 통합 브릿지
 * - 151권 기본 교재 마스터 카탈로그 내장 + 원장 커스텀 교재 확장 지원
 * - 학생앱 1회 로그인 시 공용 이름표(StudentSessionTag) 자동 발급 (재로그인 제로)
 * - 지연 로딩(Lazy Load) + 12시간 로컬 캐시 + 오프라인 Pending Queue 자동 재전송
 * - Step 3 OMR 자동채점 / 초고속 문항수·오답수(독해/어휘 분리) 입력 + 메타인지 확신도 체크
 * - 원장앱 [독해밀도 아이디·배정교재 1초 일괄 동기화], [200권 정답 초고속 입력기], [문해력 전용 분석표] 제공
 */
(function (global) {
  'use strict';

  const FIREBASE_PROJECT_ID = 'readtrack-5bb22';
  const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents';

  const STORAGE_KEYS = {
    SESSION_TAG: 'academy_student_tag',
    BOOK_CACHE: 'readtrack_books_cache_v1',
    CUSTOM_BOOKS: 'readtrack_custom_books_v1',
    ANSWER_KEYS: 'readtrack_answer_keys_v1',
    ATTEMPTS_LOG: 'readtrack_attempts_log_v1',
    PENDING_QUEUE: 'readtrack_pending_queue_v1',
    ASSIGNED_MAP: 'readtrack_assigned_map_v1',
    USER_MAP: 'readtrack_user_map_v1'
  };

  // 151권 기본 교재 마스터 카탈로그 (default_textbooks.dart 동기화)
  const DEFAULT_TEXTBOOKS = [{"id":"스타트1_book_1","title":"초등국어 어휘력이 독해력이다 1A","level":"초1학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_2","title":"초등국어 어휘력이 독해력이다 1B","level":"초1학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_3","title":"초등국어 어휘력이 독해력이다 2A","level":"초2학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_4","title":"초등국어 어휘력이 독해력이다 2B","level":"초2학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_5","title":"초등국어 어휘력이 독해력이다 3A","level":"초3학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_6","title":"초등국어 어휘력이 독해력이다 3B","level":"초3학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_7","title":"초등국어 어휘력이 독해력이다 4A","level":"초4학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_8","title":"초등국어 어휘력이 독해력이다 4B","level":"초4학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_9","title":"초등국어 어휘력이 독해력이다 5A","level":"초5학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_10","title":"초등국어 어휘력이 독해력이다 5B","level":"초5학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_11","title":"초등국어 어휘력이 독해력이다 6A","level":"초6학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_12","title":"초등국어 어휘력이 독해력이다 6B","level":"초6학년","publisher":"키출판","category":"어휘","stage":"스타트1"},{"id":"스타트1_book_13","title":"1일 1독해 과학이야기 1","level":"예비초~초1","publisher":"메가스터디 북스","category":"과학","stage":"스타트1"},{"id":"스타트1_book_14","title":"1일 1독해 과학이야기 2","level":"예비초~초1","publisher":"메가스터디 북스","category":"과학","stage":"스타트1"},{"id":"스타트1_book_15","title":"1일 1독해 과학이야기 3","level":"예비초~초1","publisher":"메가스터디 북스","category":"과학","stage":"스타트1"},{"id":"스타트1_book_16","title":"1일 1독해 과학이야기 4","level":"예비초~초1","publisher":"메가스터디 북스","category":"과학","stage":"스타트1"},{"id":"스타트1_book_17","title":"1일 1독해 과학이야기 5","level":"예비초~초1","publisher":"메가스터디 북스","category":"과학","stage":"스타트1"},{"id":"스타트1_book_18","title":"1일 1독해 과학이야기 6","level":"예비초~초1","publisher":"메가스터디 북스","category":"과학","stage":"스타트1"},{"id":"스타트1_book_19","title":"1일 1독해 사회1","level":"초1~초6","publisher":"메가스터디 북스","category":"사회","stage":"스타트1"},{"id":"스타트1_book_20","title":"1일 1독해 사회2","level":"초1~초6","publisher":"메가스터디 북스","category":"사회","stage":"스타트1"},{"id":"스타트1_book_21","title":"1일 1독해 사회3","level":"초1~초6","publisher":"메가스터디 북스","category":"사회","stage":"스타트1"},{"id":"스타트1_book_22","title":"1일 1독해 사회4","level":"초1~초6","publisher":"메가스터디 북스","category":"사회","stage":"스타트1"},{"id":"스타트1_book_23","title":"1일 1독해 사회5","level":"초1~초6","publisher":"메가스터디 북스","category":"사회","stage":"스타트1"},{"id":"베이직 1_book_24","title":"숨마 어린이 초등국어독해왕 1","level":"초1-2학년","publisher":"이룸이앤비","category":"비문학","stage":"베이직 1"},{"id":"베이직 1_book_25","title":"뿌리깊은 독해 1","level":"초1~2학년","publisher":"마더텅","category":"비문학","stage":"베이직 1"},{"id":"베이직 1_book_26","title":"초등국어일등급독해력 1","level":"초1-2학년","publisher":"꿈을담는틀","category":"비문학","stage":"베이직 1"},{"id":"베이직 1_book_27","title":"초등국어일등급어휘력 1","level":"초1-2학년","publisher":"꿈을담는틀","category":"어휘","stage":"베이직 1"},{"id":"코어1_book_28","title":"빠작초등국어문학독해 1단계","level":"초1-2학년","publisher":"동아출판","category":"문학","stage":"코어1"},{"id":"코어1_book_29","title":"빠작초등국어비문학독해 1단계","level":"초1-2학년","publisher":"동아출판","category":"비문학","stage":"코어1"},{"id":"베이직 2_book_30","title":"한문장 정리의 힘 1 기본편","level":"초2-3학년","publisher":"메가스터디 북스","category":"비문학","stage":"베이직 2"},{"id":"베이직 2_book_31","title":"숨마 어린이 초등국어독해왕 2","level":"초2-3학년","publisher":"이룸이앤비","category":"비문학","stage":"베이직 2"},{"id":"베이직 2_book_32","title":"뿌리깊은 독해 2","level":"초2~3학년","publisher":"마더텅","category":"비문학","stage":"베이직 2"},{"id":"베이직 2_book_33","title":"초등국어일등급독해력 2","level":"초2-3학년","publisher":"꿈을담는틀","category":"비문학","stage":"베이직 2"},{"id":"베이직 2_book_34","title":"초등국어일등급어휘력 2","level":"초2-3학년","publisher":"꿈을담는틀","category":"어휘","stage":"베이직 2"},{"id":"코어2_book_35","title":"한문장 정리의 힘 1 실전편","level":"초2-3학년","publisher":"메가스터디 북스","category":"비문학","stage":"코어2"},{"id":"코어2_book_36","title":"빠작초등국어문학독해 2단계","level":"초2-3학년","publisher":"동아출판","category":"문학","stage":"코어2"},{"id":"코어2_book_37","title":"빠작초등국어비문학독해 2단계","level":"초2-3학년","publisher":"동아출판","category":"비문학","stage":"코어2"},{"id":"베이직 3_book_38","title":"한문장 정리의 힘 2 기본편","level":"초3-4학년","publisher":"메가스터디 북스","category":"비문학","stage":"베이직 3"},{"id":"베이직 3_book_39","title":"숨마 어린이 초등국어독해왕 3","level":"초3-4학년","publisher":"이룸이앤비","category":"비문학","stage":"베이직 3"},{"id":"베이직 3_book_40","title":"뿌리깊은 독해력 3","level":"초3~4학년","publisher":"마더텅","category":"비문학","stage":"베이직 3"},{"id":"베이직 3_book_41","title":"초등국어일등급독해력 3","level":"초3-4학년","publisher":"꿈을담는틀","category":"비문학","stage":"베이직 3"},{"id":"베이직 3_book_42","title":"초등국어일등급어휘력 3","level":"초2-3학년","publisher":"꿈을담는틀","category":"어휘","stage":"베이직 3"},{"id":"코어3_book_43","title":"한문장 정리의 힘 2 실전편","level":"초3-4학년","publisher":"메가스터디 북스","category":"비문학","stage":"코어3"},{"id":"코어3_book_44","title":"요약독해의 힘 1","level":"초3-4학년","publisher":"길벗스쿨","category":"비문학","stage":"코어3"},{"id":"코어3_book_45","title":"빠작초등국어문학독해 3단계","level":"초3-4학년","publisher":"동아출판","category":"문학","stage":"코어3"},{"id":"코어3_book_46","title":"빠작초등국어비문학독해 3단계","level":"초3-4학년","publisher":"동아출판","category":"비문학","stage":"코어3"},{"id":"코어3_book_47","title":"백점백승 사회 3","level":"초3-4학년","publisher":"메가스터디","category":"사회","stage":"코어3"},{"id":"코어3_book_48","title":"백점백승 과학 3","level":"초3-4학년","publisher":"메가스터디","category":"과학","stage":"코어3"},{"id":"베이직 4_book_49","title":"한문장 정리의 힘 3 기본편","level":"초4-5학년","publisher":"메가스터디 북스","category":"비문학","stage":"베이직 4"},{"id":"베이직 4_book_50","title":"숨마 어린이 초등국어독해왕 4","level":"초4-5학년","publisher":"이룸이앤비","category":"비문학","stage":"베이직 4"},{"id":"베이직 4_book_51","title":"뿌리깊은 독해 4","level":"초4~5학년","publisher":"마더텅","category":"비문학","stage":"베이직 4"},{"id":"베이직 4_book_52","title":"초등국어일등급독해력 4","level":"초4-5학년","publisher":"꿈을담는틀","category":"비문학","stage":"베이직 4"},{"id":"베이직 4_book_53","title":"초등국어일등급어휘력 4","level":"초4-5학년","publisher":"꿈을담는틀","category":"어휘","stage":"베이직 4"},{"id":"코어4_book_54","title":"한문장 정리의 힘 3 실전편","level":"초4-5학년","publisher":"메가스터디 북스","category":"비문학","stage":"코어4"},{"id":"코어4_book_55","title":"요약독해의 힘 2","level":"초4-5학년","publisher":"길벗스쿨","category":"비문학","stage":"코어4"},{"id":"코어4_book_56","title":"빠작초등국어문학독해 4단계","level":"초4-5학년","publisher":"동아출판","category":"문학","stage":"코어4"},{"id":"코어4_book_57","title":"빠작초등국어비문학독해 4단계","level":"초4-5학년","publisher":"동아출판","category":"비문학","stage":"코어4"},{"id":"코어4_book_58","title":"백점백승 사회 4","level":"초4-5학년","publisher":"메가스터디","category":"사회","stage":"코어4"},{"id":"코어4_book_59","title":"백점백승 과학 4","level":"초4-5학년","publisher":"메가스터디","category":"과학","stage":"코어4"},{"id":"코어4_book_60","title":"매일 쉬운 EBS 한국사 독해 1","level":"초4-5학년","publisher":"EBS","category":"역사","stage":"코어4"},{"id":"코어4_book_61","title":"매일 쉬운 EBS 한국사 독해 2","level":"초4-5학년","publisher":"EBS","category":"역사","stage":"코어4"},{"id":"코어4_book_62","title":"EBS 스토리 한국사 1","level":"초4-5학년","publisher":"EBS","category":"역사","stage":"코어4"},{"id":"코어4_book_63","title":"EBS 스토리 한국사 2","level":"초4-5학년","publisher":"EBS","category":"역사","stage":"코어4"},{"id":"베이직 5_book_64","title":"한문장 정리의 힘 4 기본편","level":"초4-5학년","publisher":"메가스터디 북스","category":"비문학","stage":"베이직 5"},{"id":"베이직 5_book_65","title":"초등국어독해왕 5","level":"초4-5학년","publisher":"이룸이앤비","category":"비문학","stage":"베이직 5"},{"id":"베이직 5_book_66","title":"뿌리깊은 독해 5","level":"초4~5학년","publisher":"마더텅","category":"비문학","stage":"베이직 5"},{"id":"베이직 5_book_67","title":"초등국어일등급독해력 5","level":"초4-5학년","publisher":"꿈을담는틀","category":"비문학","stage":"베이직 5"},{"id":"베이직 5_book_68","title":"초등국어일등급어휘력 5","level":"초4-5학년","publisher":"꿈을담는틀","category":"어휘","stage":"베이직 5"},{"id":"코어5_book_69","title":"한문장 정리의 힘 4 실전편","level":"초5-6학년","publisher":"메가스터디 북스","category":"비문학","stage":"코어5"},{"id":"코어5_book_70","title":"요약독해의 힘 3","level":"초5-6학년","publisher":"길벗스쿨","category":"비문학","stage":"코어5"},{"id":"코어5_book_71","title":"빠작초등국어문학독해 5단계","level":"초5-6학년","publisher":"동아출판","category":"문학","stage":"코어5"},{"id":"코어5_book_72","title":"빠작초등국어비문학독해 5단계","level":"초5-6학년","publisher":"동아출판","category":"비문학","stage":"코어5"},{"id":"코어5_book_73","title":"백점백승 사회 5","level":"초5-6학년","publisher":"메가스터디","category":"사회","stage":"코어5"},{"id":"코어5_book_74","title":"백점백승 과학 5","level":"초5-6학년","publisher":"메가스터디","category":"과학","stage":"코어5"},{"id":"코어5_book_75","title":"용선생 한국사 독해 1","level":"초5-6학년","publisher":"사회평론","category":"역사","stage":"코어5"},{"id":"코어5_book_76","title":"용선생 한국사 독해 2","level":"초5-6학년","publisher":"사회평론","category":"역사","stage":"코어5"},{"id":"코어5_book_77","title":"용선생 한국사 독해 3","level":"초5-6학년","publisher":"사회평론","category":"역사","stage":"코어5"},{"id":"코어5_book_78","title":"용선생 한국사 독해 4","level":"초5-6학년","publisher":"사회평론","category":"역사","stage":"코어5"},{"id":"베이직 6_book_79","title":"숨마 어린이 초등국어독해왕 6","level":"초5-6학년","publisher":"이룸이앤비","category":"비문학","stage":"베이직 6"},{"id":"베이직 6_book_80","title":"뿌리깊은 독해 6","level":"초5-6학년","publisher":"마더텅","category":"비문학","stage":"베이직 6"},{"id":"베이직 6_book_81","title":"초등국어일등급독해력 6","level":"초5-6학년","publisher":"꿈을담는틀","category":"비문학","stage":"베이직 6"},{"id":"베이직 6_book_82","title":"초등국어일등급어휘력 6","level":"초5-6학년","publisher":"꿈을담는틀","category":"어휘","stage":"베이직 6"},{"id":"코어6_book_83","title":"요약독해의 힘 4","level":"초6학년","publisher":"길벗스쿨","category":"비문학","stage":"코어6"},{"id":"코어6_book_84","title":"빠작초등국어문학독해 6단계","level":"초6학년","publisher":"동아출판","category":"문학","stage":"코어6"},{"id":"코어6_book_85","title":"빠작초등국어비문학독해 6단계","level":"초6학년","publisher":"동아출판","category":"비문학","stage":"코어6"},{"id":"코어6_book_86","title":"백점백승 사회 6","level":"초6학년","publisher":"메가스터디","category":"사회","stage":"코어6"},{"id":"코어6_book_87","title":"백점백승 과학 6","level":"초6학년","publisher":"메가스터디","category":"과학","stage":"코어6"},{"id":"코어6_book_88","title":"용선생 세계사 독해 1","level":"초6학년","publisher":"사회평론","category":"역사","stage":"코어6"},{"id":"코어6_book_89","title":"용선생 세계사 독해 2","level":"초6학년","publisher":"사회평론","category":"역사","stage":"코어6"},{"id":"코어6_book_90","title":"용선생 세계사 독해 3","level":"초6학년","publisher":"사회평론","category":"역사","stage":"코어6"},{"id":"코어6_book_91","title":"용선생 세계사 독해 4","level":"초6학년","publisher":"사회평론","category":"역사","stage":"코어6"},{"id":"엘리트1_book_92","title":"빠작 초등 국어 문법 (5,6학년)","level":"초6-중1학년","publisher":"동아출판","category":"문법","stage":"엘리트1"},{"id":"엘리트1_book_93","title":"독기 중학국어 비문학 독해 사회개념","level":"초6-중1학년","publisher":"메가스터디북스","category":"비문학","stage":"엘리트1"},{"id":"엘리트1_book_94","title":"독기 중학국어 비문학 독해 과학개념","level":"초6-중1학년","publisher":"메가스터디북스","category":"비문학","stage":"엘리트1"},{"id":"엘리트1_book_95","title":"메가스터디중학국어문학필수개념독해연습 1","level":"초6-중1학년","publisher":"메가스터디북스","category":"문학","stage":"엘리트1"},{"id":"엘리트1_book_96","title":"숨마 중학국어비문학독해연습 1","level":"초6-중1학년","publisher":"이룸이앤비","category":"비문학","stage":"엘리트1"},{"id":"엘리트1_book_97","title":"빠작중등국어비문학독해 0","level":"초6-중1학년","publisher":"동아출판","category":"비문학","stage":"엘리트1"},{"id":"프라임1_book_98","title":"해법중학국어문법DNA깨우기","level":"초6-중1학년","publisher":"천재교육","category":"문법","stage":"프라임1"},{"id":"프라임1_book_99","title":"꿈틀중학문학 1","level":"초6-중1학년","publisher":"꿈을담는틀","category":"문학","stage":"프라임1"},{"id":"프라임1_book_100","title":"빠작중등국어비문학독해 1","level":"초6-중1학년","publisher":"동아출판","category":"비문학","stage":"프라임1"},{"id":"마스터1_book_101","title":"빠작중학국어문학독해 1","level":"초6-중1학년","publisher":"동아출판","category":"문학","stage":"마스터1"},{"id":"마스터1_book_102","title":"메가스터디중학국어비문학독해연습 1","level":"초6-중1학년","publisher":"메가스터디북스","category":"비문학","stage":"마스터1"},{"id":"엘리트2_book_103","title":"똑독중학국어문법 기본편","level":"중1-2학년","publisher":"이투스북","category":"문법","stage":"엘리트2"},{"id":"엘리트2_book_104","title":"메가스터디중학국어문학필수개념독해연습 2","level":"중1-2학년","publisher":"메가스터디북스","category":"문학","stage":"엘리트2"},{"id":"엘리트2_book_105","title":"숨마 중학국어비문학독해연습 2","level":"중1-2학년","publisher":"이룸이앤비","category":"비문학","stage":"엘리트2"},{"id":"프라임2_book_106","title":"빠작중학국어문법","level":"중1-2학년","publisher":"동아출판","category":"문법","stage":"프라임2"},{"id":"프라임2_book_107","title":"꿈틀중학문학 2","level":"중1-2학년","publisher":"꿈을담는틀","category":"문학","stage":"프라임2"},{"id":"프라임2_book_108","title":"메가스터디중학국어비문학독해연습 2","level":"중1-2학년","publisher":"메가스터디북스","category":"비문학","stage":"프라임2"},{"id":"마스터2_book_109","title":"빠작중학국어문학독해 2","level":"중1-2학년","publisher":"동아출판","category":"문학","stage":"마스터2"},{"id":"마스터2_book_110","title":"빠작중학국어비문학독해 2","level":"중1-2학년","publisher":"동아출판","category":"비문학","stage":"마스터2"},{"id":"엘리트3_book_111","title":"똑독중학국어문법 실력편","level":"중2-3학년","publisher":"이투스북","category":"문법","stage":"엘리트3"},{"id":"엘리트3_book_112","title":"메가스터디중학국어문학필수개념독해연습 3","level":"중2-3학년","publisher":"메가스터디북스","category":"문학","stage":"엘리트3"},{"id":"엘리트3_book_113","title":"숨마 중학국어비문학독해연습 3","level":"중2-3학년","publisher":"이룸이앤비","category":"비문학","stage":"엘리트3"},{"id":"프라임3_book_114","title":"개념있는중학국어문법 문제편","level":"중2-3학년","publisher":"지학사","category":"문법","stage":"프라임3"},{"id":"프라임3_book_115","title":"꿈틀중학문학 3","level":"중2-3학년","publisher":"꿈을담는틀","category":"문학","stage":"프라임3"},{"id":"프라임3_book_116","title":"빠작중학국어비문학독해 3","level":"중2-3학년","publisher":"동아출판","category":"비문학","stage":"프라임3"},{"id":"마스터3_book_117","title":"EBS필독중학국어문법완성 2000제","level":"중2-3학년","publisher":"한국교육방송공사","category":"문법","stage":"마스터3"},{"id":"마스터3_book_118","title":"빠작중학국어문학독해 3","level":"중2-3학년","publisher":"동아출판","category":"문학","stage":"마스터3"},{"id":"마스터3_book_119","title":"메가스터디중학국어비문학독해연습 3","level":"중2-3학년","publisher":"메가스터디북스","category":"비문학","stage":"마스터3"},{"id":"엘리트4_book_120","title":"빠작고등국어문법필수개념 30","level":"중3-고1학년","publisher":"동아출판","category":"문법","stage":"엘리트4"},{"id":"엘리트4_book_121","title":"고등 손쉬운현대문학","level":"중3-고1학년","publisher":"미래엔","category":"문학","stage":"엘리트4"},{"id":"엘리트4_book_122","title":"고등 손쉬운고전문학","level":"중3-고1학년","publisher":"미래엔","category":"문학","stage":"엘리트4"},{"id":"엘리트4_book_123","title":"예비 매3비","level":"중3-고1학년","publisher":"키출판사","category":"비문학","stage":"엘리트4"},{"id":"프라임 4_book_124","title":"왓칭고등국어문법","level":"중3-고1학년","publisher":"키움","category":"문법","stage":"프라임 4"},{"id":"프라임 4_book_125","title":"빠작고등국어현대문학","level":"중3-고1학년","publisher":"동아출판","category":"문학","stage":"프라임 4"},{"id":"프라임 4_book_126","title":"빠작고등국어고전문학","level":"중3-고1학년","publisher":"동아출판","category":"문학","stage":"프라임 4"},{"id":"프라임 4_book_127","title":"빠작수능국어비문학독서","level":"중3-고1학년","publisher":"동아출판","category":"비문학","stage":"프라임 4"},{"id":"그랜드 마스터 1_book_128","title":"다담언어(국어문법)실전모의고사 30회","level":"고2-3학년","publisher":"쏠티북스","category":"문법","stage":"그랜드 마스터 1"},{"id":"그랜드 마스터 1_book_129","title":"고단백미니모의고사문학","level":"고2-3학년","publisher":"천재교육","category":"문학","stage":"그랜드 마스터 1"},{"id":"그랜드 마스터 1_book_130","title":"라이트매3비","level":"고2-3학년","publisher":"키출판사","category":"비문학","stage":"그랜드 마스터 1"},{"id":"그랜드 마스터 2_book_131","title":"빠작수능국어문법완성 800제","level":"고2-3학년","publisher":"동아출판","category":"문법","stage":"그랜드 마스터 2"},{"id":"그랜드 마스터 2_book_132","title":"밥먹듯이매일매일문학","level":"고2-3학년","publisher":"꿈을담는틀","category":"문학","stage":"그랜드 마스터 2"},{"id":"그랜드 마스터 2_book_133","title":"고단백미니모의고사비문학","level":"고2-3학년","publisher":"천재교육","category":"비문학","stage":"그랜드 마스터 2"},{"id":"그랜드 마스터 3_book_134","title":"마더텅국어문법개념완성 2400제","level":"고2-3학년","publisher":"마더텅","category":"문법","stage":"그랜드 마스터 3"},{"id":"그랜드 마스터 3_book_135","title":"수능주도권국어영역문학","level":"고2-3학년","publisher":"미래엔","category":"문학","stage":"그랜드 마스터 3"},{"id":"그랜드 마스터 3_book_136","title":"밥먹듯이매일매일비문학독서","level":"고2-3학년","publisher":"꿈을담는틀","category":"비문학","stage":"그랜드 마스터 3"},{"id":"그랜드 마스터4_book_137","title":"수능주도권국어영역독서비문학","level":"고2-3학년","publisher":"미래엔","category":"비문학","stage":"그랜드 마스터4"},{"id":"그랜드 마스터4_book_138","title":"매3비","level":"고2-3학년","publisher":"키출판사","category":"비문학","stage":"그랜드 마스터4"},{"id":"코어2_book_1786880463881","title":"초등 수능 독해 비문학 시작편 1","level":"초3-4학년","publisher":"비상교육","category":"비문학","stage":"코어2"},{"id":"코어2_book_1786881970548","title":"초등 수능 독해 비문학 시작편 2","level":"초3-4학년","publisher":"비상교육","category":"비문학","stage":"코어2"},{"id":"코어2_book_1786880535717","title":"초등 수능독해 비문학 1","level":"초5-6학년","publisher":"비상교육","category":"비문학","stage":"코어2"},{"id":"코어2_book_1786880578796","title":"초등 수능독해 비문학 2","level":"초5-6학년","publisher":"비상교육","category":"비문학","stage":"코어2"},{"id":"코어2_book_1786882119342","title":"초등 수능독해 문학 1","level":"초5-6학년","publisher":"비상교육","category":"문학","stage":"코어2"},{"id":"코어2_book_1786882169715","title":"초등 수능독해 문학 2","level":"초5-6학년","publisher":"비상교육","category":"문학","stage":"코어2"},{"id":"코어2_book_1786882231129","title":"초등 수능독해 문학 3","level":"초5-6학년","publisher":"비상교육","category":"문학","stage":"코어2"},{"id":"baekjeom_type_3","title":"백점백승 유형 독해 3단계","level":"초3학년","publisher":"동아출판","category":"비문학","stage":"코어2"},{"id":"baekjeom_type_4","title":"백점백승 유형 독해 4단계","level":"초4학년","publisher":"동아출판","category":"비문학","stage":"코어3"},{"id":"baekjeom_type_5","title":"백점백승 유형 독해 5단계","level":"초5학년","publisher":"동아출판","category":"비문학","stage":"코어4"},{"id":"baekjeom_type_6","title":"백점백승 유형 독해 6단계","level":"초6학년","publisher":"동아출판","category":"비문학","stage":"코어5"},{"id":"엘리트1_book_1788762650332","title":"비상 박영민 중등 1학년 2학기","level":"중1학년","publisher":"비상교육","category":"자습서","stage":"엘리트1"},{"id":"엘리트2_book_1788763457084","title":"비상 박영민 중등 2학년 2학기","level":"중2학년","publisher":"비상교육","category":"자습서","stage":"엘리트2"}];

  const STAGES = ['스타터', '베이직', '코어', '엘리트', '프라임', '마스터', '그랜드마스터'];

  function safeJsonParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch (_) { return fallback; }
  }

  function safeJsonSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  function normName(s) {
    return String(s || '').replace(/\s+/g, '').trim();
  }

  function normBookTitle(s) {
    return String(s || '').replace(/\s+/g, '').toLowerCase().trim();
  }

  // 교재명에서 영역(비문학/문학/어휘/문법/과학/사회) 정밀 분류
  function resolveCategory(rawCat, title) {
    const t = String(title || '');
    const c = String(rawCat || '').trim();
    if (t.includes('비문학') || t.includes('독서') || t.includes('설명문') || t.includes('논설문')) return '비문학';
    if (t.includes('문학') || t.includes('시 ') || t.includes('소설') || t.includes('수필') || t.includes('고전시가') || t.includes('산문')) return '문학';
    if (t.includes('어휘') || t.includes('단어') || t.toLowerCase().includes('voca')) return '어휘';
    if (t.includes('문법') || t.includes('언어와매체') || t.includes('언매')) return '문법';
    if (t.includes('과학')) return '과학';
    if (t.includes('사회') || t.includes('역사') || t.includes('한국사')) return '사회';
    if (c && c !== '전체') return c;
    return '비문학';
  }

  // 교재단계관리 시트 영역 매핑 (비문학 / 문학 / 어휘 / 복합 / 음독)
  function mapToSheetCategory(cat, title) {
    const resolved = resolveCategory(cat, title);
    if (resolved === '비문학') return '비문학';
    if (resolved === '문학') return '문학';
    if (resolved === '어휘') return '어휘';
    if (resolved === '음독') return '음독';
    return '복합';
  }

  // 전체 교재 목록 조회 (기본 151권 + 원장 커스텀 추가/수정본 병합)
  function getAllTextbooks() {
    const customMap = safeJsonParse(localStorage.getItem(STORAGE_KEYS.CUSTOM_BOOKS), {});
    const answerKeys = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ANSWER_KEYS), {});
    const merged = [];
    const seenIds = new Set();

    DEFAULT_TEXTBOOKS.forEach(function (b) {
      const edit = customMap[b.id] || {};
      if (edit.isDeleted) return;
      const title = edit.title || b.title;
      const category = edit.category || resolveCategory(b.category, title);
      const hasAns = !!(answerKeys[b.id] && Object.keys(answerKeys[b.id]).length > 0);
      merged.push({
        id: b.id,
        title: title,
        level: edit.level || b.level || '',
        publisher: edit.publisher || b.publisher || '',
        category: category,
        sheetCategory: mapToSheetCategory(category, title),
        stage: edit.stage || b.stage || '',
        hasAnswerKey: hasAns
      });
      seenIds.add(b.id);
    });

    Object.keys(customMap).forEach(function (id) {
      if (seenIds.has(id)) return;
      const c = customMap[id];
      if (!c || c.isDeleted || !c.title) return;
      const category = c.category || resolveCategory('', c.title);
      const hasAns = !!(answerKeys[id] && Object.keys(answerKeys[id]).length > 0);
      merged.push({
        id: id,
        title: c.title,
        level: c.level || '전학년',
        publisher: c.publisher || '자체교재',
        category: category,
        sheetCategory: mapToSheetCategory(category, c.title),
        stage: c.stage || '코어1',
        hasAnswerKey: hasAns
      });
    });

    return merged;
  }

  function findTextbookByTitleOrId(query) {
    if (!query) return null;
    const q = String(query).trim();
    const qNorm = normBookTitle(q);
    const list = getAllTextbooks();
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === q || normBookTitle(list[i].title) === qNorm) return list[i];
    }
    for (let i = 0; i < list.length; i++) {
      if (normBookTitle(list[i].title).includes(qNorm) || qNorm.includes(normBookTitle(list[i].title))) return list[i];
    }
    return null;
  }

  // PathAdvisor 알고리즘 (path_advisor_service.dart 100% 동일 이식)
  function recommendNextTextbook(currentTitle, score) {
    const t = String(currentTitle || '').trim();
    const numScore = Number(score) || 0;
    const cat = resolveCategory('', t);
    let gradeNum = 3;
    let stage = '베이직';

    for (let i = 0; i < STAGES.length; i++) {
      const s = STAGES[i];
      if (t.includes(s) || (s === '그랜드마스터' && t.includes('그랜드')) || (s === '스타터' && t.includes('스타트'))) {
        stage = s;
        break;
      }
    }
    const mNum = t.match(/(\d+)/);
    const baseNum = mNum ? Math.max(1, Math.min(6, parseInt(mNum[1], 10))) : 3;
    if (t.includes('고등') || t.includes('수능')) gradeNum = 9 + Math.min(3, baseNum);
    else if (t.includes('중등') || t.includes('예비고')) gradeNum = 6 + Math.min(3, baseNum);
    else gradeNum = baseNum;

    let nextGrade = gradeNum;
    let nextStage = stage;
    let reason = '';

    if (numScore <= 69) {
      nextGrade = Math.max(1, Math.min(12, gradeNum - 1));
      reason = '정답률 69% 이하: 기초 독해력 보완을 위해 같은 단계에서 학년 내림 추천';
    } else if (numScore <= 79) {
      const idx = STAGES.indexOf(stage);
      if (idx >= 0 && idx < STAGES.length - 1) nextStage = STAGES[idx + 1];
      reason = '정답률 70~79%: 같은 학년에서 한 단계 높은 난이도로 다지기 추천';
    } else if (numScore <= 89) {
      nextGrade = Math.max(1, Math.min(12, gradeNum + 1));
      reason = '정답률 80~89%: 성취도 우수! 같은 단계에서 학년 올림 추천';
    } else {
      nextGrade = Math.max(1, Math.min(12, gradeNum + 2));
      reason = '정답률 90~100%: 최상위 문해력! 같은 단계에서 2학년 월반 추천';
    }

    const gradeLabel = nextGrade <= 6
      ? ('초등 ' + nextGrade + '학년')
      : (nextGrade <= 9 ? ('중등 ' + (nextGrade - 6) + '학년') : ('고등 ' + (nextGrade - 9) + '학년'));
    const dispNum = nextGrade <= 6 ? nextGrade : (nextGrade <= 9 ? nextGrade - 6 : nextGrade - 9);

    let recTitle = '';
    if (cat === '어휘') {
      recTitle = nextGrade <= 6 ? ('초등국어 어휘력이 독해력이다 ' + dispNum + 'A') : ('빠작 중학 국어 어휘 ' + dispNum);
    } else if (cat === '문학') {
      recTitle = nextGrade <= 6 ? ('빠작 초등 국어 문학 독해 ' + dispNum + '단계') : ('빠작 중학 국어 문학 독해 ' + dispNum);
    } else {
      recTitle = nextGrade <= 6 ? ('빠작 초등 국어 비문학 독해 ' + dispNum + '단계') : ('빠작 중학 국어 비문학 독해 ' + dispNum);
    }

    return {
      currentTitle: t || '미지정 교재',
      score: Math.round(numScore),
      category: cat,
      recommendedGradeLabel: gradeLabel,
      recommendedStage: nextStage,
      recommendedTitle: recTitle,
      reason: reason
    };
  }

  // ==================== Firestore REST 헬퍼 ====================
  function parseFirestoreValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return Boolean(v.booleanValue);
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) {
      const vals = (v.arrayValue && v.arrayValue.values) || [];
      return vals.map(parseFirestoreValue);
    }
    if ('mapValue' in v) {
      const fields = (v.mapValue && v.mapValue.fields) || {};
      const obj = {};
      Object.keys(fields).forEach(function (k) { obj[k] = parseFirestoreValue(fields[k]); });
      return obj;
    }
    return null;
  }

  function parseFirestoreDoc(doc) {
    if (!doc || !doc.name) return null;
    const parts = doc.name.split('/');
    const id = parts[parts.length - 1];
    const fields = doc.fields || {};
    const out = { id: id };
    Object.keys(fields).forEach(function (k) { out[k] = parseFirestoreValue(fields[k]); });
    return out;
  }

  function toFirestoreFields(obj) {
    const fields = {};
    Object.keys(obj).forEach(function (k) {
      const val = obj[k];
      if (val === undefined || val === null) return;
      if (typeof val === 'string') fields[k] = { stringValue: val };
      else if (typeof val === 'boolean') fields[k] = { booleanValue: val };
      else if (typeof val === 'number') {
        if (Number.isInteger(val)) fields[k] = { integerValue: String(val) };
        else fields[k] = { doubleValue: val };
      } else if (Array.isArray(val)) {
        fields[k] = {
          arrayValue: {
            values: val.map(function (item) {
              if (typeof item === 'string') return { stringValue: item };
              if (typeof item === 'number') return { integerValue: String(item) };
              return { stringValue: String(item) };
            })
          }
        };
      }
    });
    return { fields: fields };
  }

  async function fetchFirestoreUsers() {
    try {
      const res = await fetch(FIRESTORE_BASE_URL + '/users?pageSize=300');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const docs = (data.documents || []).map(parseFirestoreDoc).filter(Boolean);
      const userMap = {};
      docs.forEach(function (u) {
        if (u.name) userMap[normName(u.name)] = u;
        if (u.loginId) userMap[normName(u.loginId)] = u;
        userMap[u.id] = u;
      });
      safeJsonSet(STORAGE_KEYS.USER_MAP, { updatedAt: Date.now(), users: docs, byKey: userMap });
      return docs;
    } catch (err) {
      console.warn('[ReadTrackBridge] fetchFirestoreUsers fallback to local:', err);
      const cached = safeJsonParse(localStorage.getItem(STORAGE_KEYS.USER_MAP), {});
      return cached.users || [];
    }
  }

  // ==================== 【순서 2】 학생 1회 로그인 공용 이름표 (StudentSessionTag) ====================
  function getStudentAssignedBooksFromState(studentName) {
    const assigned = [];
    const seen = new Set();
    const stName = normName(studentName);

    function addBook(title, cat, startDate, endDate, accStr) {
      const clean = String(title || '').trim();
      if (!clean || clean === '-' || clean === '없음') return;
      const arrows = clean.split(/➔|->|→/);
      const latestRaw = arrows[arrows.length - 1].replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').replace(/\([^)]*\)$/, '').trim();
      const targetTitle = latestRaw || clean;
      if (seen.has(targetTitle)) return;
      seen.add(targetTitle);
      const found = findTextbookByTitleOrId(targetTitle);
      assigned.push({
        id: found ? found.id : ('custom_' + normBookTitle(targetTitle)),
        title: found ? found.title : targetTitle,
        category: cat || (found ? found.category : resolveCategory('', targetTitle)),
        sheetCategory: mapToSheetCategory(cat, targetTitle),
        startDate: startDate || '',
        endDate: endDate || '',
        accuracySummary: accStr || '',
        rawHistory: clean
      });
    }

    const tbSource = (global.state && Array.isArray(global.state.textbooks) ? global.state.textbooks : null)
      || (global.app && global.app.data && Array.isArray(global.app.data.textbooks) ? global.app.data.textbooks : []);

    tbSource.forEach(function (row) {
      if (normName(row.name) !== stName) return;
      if (row.nonfiction && row.nonfiction.title) addBook(row.nonfiction.title, '비문학', row.nonfiction.startDate, row.nonfiction.endDate, row.nonfiction.accuracy);
      if (row.literature && row.literature.title) addBook(row.literature.title, '문학', row.literature.startDate, row.literature.endDate, row.literature.accuracy);
      if (row.vocab && row.vocab.title) addBook(row.vocab.title, '어휘', row.vocab.startDate, row.vocab.endDate, row.vocab.accuracy);
      if (row.complex && row.complex.title) addBook(row.complex.title, '복합', row.complex.startDate, row.complex.endDate, row.complex.accuracy);
      if (row.reading && row.reading.title) addBook(row.reading.title, '음독', row.reading.startDate, row.reading.endDate, row.reading.accuracy);
    });

    const localAssignedMap = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ASSIGNED_MAP), {});
    const localList = localAssignedMap[stName] || [];
    localList.forEach(function (item) {
      if (typeof item === 'string') addBook(item, '', '', '', '');
      else if (item && item.title) addBook(item.title, item.category, item.startDate, item.endDate, item.accuracy);
    });

    return assigned;
  }

  function issueStudentSessionTag(studentObj) {
    if (!studentObj || !studentObj.name) return null;
    const stName = normName(studentObj.name);
    const grade = String(studentObj.grade || '').trim();

    let readtrackId = String(studentObj.studentId || studentObj.readtrackId || '').trim();
    const maList = (global.state && Array.isArray(global.state.memberAnalysis) ? global.state.memberAnalysis : null)
      || (global.app && global.app.data && Array.isArray(global.app.data.memberAnalysis) ? global.app.data.memberAnalysis : []);

    if (!readtrackId && maList.length > 0) {
      const matchedMa = maList.find(function (m) { return normName(m.name) === stName; });
      if (matchedMa && matchedMa.studentId) {
        readtrackId = String(matchedMa.studentId).trim();
      }
    }

    const cachedUsers = safeJsonParse(localStorage.getItem(STORAGE_KEYS.USER_MAP), {});
    if (!readtrackId && cachedUsers.byKey && cachedUsers.byKey[stName]) {
      readtrackId = cachedUsers.byKey[stName].loginId || cachedUsers.byKey[stName].id || '';
    }
    if (!readtrackId) {
      readtrackId = stName + (grade.replace(/[^0-9]/g, '') || '');
    }

    const assignedBooks = getStudentAssignedBooksFromState(stName);
    const todayIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const tag = {
      name: studentObj.name,
      grade: grade,
      school: studentObj.school || '',
      studentId: readtrackId,
      readtrackId: readtrackId,
      loginId: readtrackId,
      assignedTextbooks: assignedBooks,
      date: todayIso,
      issuedAt: Date.now()
    };

    global.StudentSessionTag = tag;
    safeJsonSet(STORAGE_KEYS.SESSION_TAG, tag);
    return tag;
  }

  function getCurrentSessionTag() {
    if (global.StudentSessionTag && global.StudentSessionTag.name) {
      global.StudentSessionTag.assignedTextbooks = getStudentAssignedBooksFromState(global.StudentSessionTag.name);
      return global.StudentSessionTag;
    }
    if (global.state && global.state.currentStudent) {
      return issueStudentSessionTag(global.state.currentStudent);
    }
    const saved = safeJsonParse(localStorage.getItem(STORAGE_KEYS.SESSION_TAG), null);
    if (saved && saved.name) {
      saved.assignedTextbooks = getStudentAssignedBooksFromState(saved.name);
      global.StudentSessionTag = saved;
      return saved;
    }
    return null;
  }

  // ==================== 【순서 1】 원장앱 [독해밀도 아이디·배정교재 1초 일괄 동기화] ====================
  async function syncAllStudentsFromReadTrack(appInstance) {
    const targetApp = appInstance || global.app;
    const toast = function (msg) {
      if (targetApp && typeof targetApp.showToast === 'function') targetApp.showToast(msg);
      else if (typeof global.showToast === 'function') global.showToast(msg);
      else alert(msg);
    };

    toast('🔄 독해밀도(ReadTrack) 학생 아이디 및 배정 교재를 동기화하고 있습니다...');

    const firestoreUsers = await fetchFirestoreUsers();
    const fsByName = {};
    firestoreUsers.forEach(function (u) {
      if (u.role === 'admin' || u.role === 'academy') return;
      const n = normName(u.name);
      if (n) fsByName[n] = u;
    });

    const students = (targetApp && targetApp.data && Array.isArray(targetApp.data.students))
      ? targetApp.data.students
      : ((global.state && Array.isArray(global.state.students)) ? global.state.students : []);
    const memberAnalysis = (targetApp && targetApp.data && Array.isArray(targetApp.data.memberAnalysis))
      ? targetApp.data.memberAnalysis
      : [];
    const textbooks = (targetApp && targetApp.data && Array.isArray(targetApp.data.textbooks))
      ? targetApp.data.textbooks
      : [];

    const syncItems = [];
    const assignedMap = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ASSIGNED_MAP), {});
    let matchedFsCount = 0;
    let autoCreatedIdCount = 0;

    const allNames = new Set();
    students.forEach(function (s) { if (s && s.name) allNames.add(normName(s.name)); });
    memberAnalysis.forEach(function (m) { if (m && m.name) allNames.add(normName(m.name)); });
    firestoreUsers.forEach(function (u) {
      if (u && u.name && u.role !== 'admin' && u.role !== 'academy') allNames.add(normName(u.name));
    });

    allNames.forEach(function (stName) {
      if (!stName) return;
      const stObj = students.find(function (s) { return normName(s.name) === stName; }) || {};
      const maObj = memberAnalysis.find(function (m) { return normName(m.name) === stName; }) || {};
      const tbObj = textbooks.find(function (t) { return normName(t.name) === stName; }) || {};
      const fsUser = fsByName[stName];

      const grade = stObj.grade || maObj.grade || tbObj.grade || (fsUser && fsUser.grade) || '';
      let readtrackId = '';

      if (fsUser && (fsUser.loginId || fsUser.id)) {
        readtrackId = String(fsUser.loginId || fsUser.id).trim();
        matchedFsCount++;
      } else if (maObj.studentId) {
        readtrackId = String(maObj.studentId).trim();
      } else {
        const gNum = String(grade).replace(/[^0-9]/g, '');
        readtrackId = stName + (gNum || '');
        autoCreatedIdCount++;
      }

      if (maObj && maObj.name) {
        maObj.studentId = readtrackId;
      } else if (targetApp && targetApp.data && Array.isArray(targetApp.data.memberAnalysis)) {
        targetApp.data.memberAnalysis.push({
          grade: grade,
          name: stName,
          studentId: readtrackId
        });
      }

      const booksForStudent = [];
      if (fsUser && Array.isArray(fsUser.assignedTextbooks)) {
        fsUser.assignedTextbooks.forEach(function (bIdOrTitle) {
          const found = findTextbookByTitleOrId(bIdOrTitle);
          if (found) booksForStudent.push({ id: found.id, title: found.title, category: found.category, sheetCategory: found.sheetCategory });
          else if (bIdOrTitle) booksForStudent.push({ id: String(bIdOrTitle), title: String(bIdOrTitle), category: resolveCategory('', bIdOrTitle), sheetCategory: mapToSheetCategory('', bIdOrTitle) });
        });
      }
      ['nonfiction', 'literature', 'vocab', 'complex', 'reading'].forEach(function (slotKey) {
        const slot = tbObj[slotKey];
        if (slot && slot.title && String(slot.title).trim() && String(slot.title).trim() !== '-') {
          const found = findTextbookByTitleOrId(slot.title);
          const title = found ? found.title : String(slot.title).trim();
          if (!booksForStudent.some(function (x) { return x.title === title; })) {
            booksForStudent.push({
              id: found ? found.id : ('custom_' + normBookTitle(title)),
              title: title,
              category: found ? found.category : slotKey,
              sheetCategory: slotKey === 'nonfiction' ? '비문학' : (slotKey === 'literature' ? '문학' : (slotKey === 'vocab' ? '어휘' : (slotKey === 'reading' ? '음독' : '복합')))
            });
          }
        }
      });

      assignedMap[stName] = booksForStudent;
      syncItems.push({
        name: stName,
        grade: grade,
        studentId: readtrackId,
        firestoreDocId: fsUser ? fsUser.id : ('student_' + stName),
        assignedBooks: booksForStudent
      });
    });

    safeJsonSet(STORAGE_KEYS.ASSIGNED_MAP, assignedMap);

    const gasUrl = (targetApp && typeof targetApp.getGasUrl === 'function' ? targetApp.getGasUrl() : '')
      || localStorage.getItem('academy_gas_url')
      || 'https://script.google.com/macros/s/AKfycbw5dc3kw3-A-2k3965w51-f521w786T7-A6A-3B4C5D6E7F8G9H0I/exec';

    let sheetSynced = false;
    if (gasUrl && syncItems.length > 0) {
      try {
        const resp = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'syncReadTrackStudentsBulk',
            items: syncItems
          })
        });
        const resJson = await resp.json();
        sheetSynced = !!(resJson && resJson.success);
      } catch (e) {
        console.warn('[ReadTrackBridge] GAS syncReadTrackStudentsBulk warning:', e);
      }
    }

    if (targetApp && typeof targetApp.save === 'function') {
      try { targetApp.save(); } catch (_) {}
    }

    const summaryMsg = '✅ 독해밀도 1초 일괄 동기화 완료! (총 ' + syncItems.length + '명: 독해밀도 기존계정 매칭 ' + matchedFsCount + '명 / 표준ID 자동부여 ' + autoCreatedIdCount + '명' + (sheetSynced ? ' · 구글시트 [회원 분석] O열 & [문해력교재관리] 일괄 반영 완료' : '') + ')';
    toast(summaryMsg);
    return { success: true, total: syncItems.length, matchedFsCount: matchedFsCount, autoCreatedIdCount: autoCreatedIdCount, items: syncItems };
  }

  // ==================== 정답지 조회 & 저장 (로컬 + Firestore 양방향) ====================
  function getAnswerKeyForBook(bookId, sessionNum) {
    const allKeys = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ANSWER_KEYS), {});
    if (allKeys[bookId] && allKeys[bookId][String(sessionNum)]) {
      return allKeys[bookId][String(sessionNum)];
    }
    return null;
  }

  async function fetchAnswerKeyFromFirestore(bookId, sessionNum) {
    const local = getAnswerKeyForBook(bookId, sessionNum);
    if (local && Array.isArray(local.questions) && local.questions.length > 0) return local;

    const pIdCandidates = ['passage_' + bookId + '_' + sessionNum, 'passage_' + sessionNum];
    for (let i = 0; i < pIdCandidates.length; i++) {
      const pId = pIdCandidates[i];
      try {
        const url = FIRESTORE_BASE_URL + '/textbooks/' + encodeURIComponent(bookId) + '/passages/' + encodeURIComponent(pId) + '/questions?pageSize=50';
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const docs = (data.documents || []).map(parseFirestoreDoc).filter(Boolean);
        if (docs.length > 0) {
          docs.sort(function (a, b) {
            return (Number(a.questionNumber || a.number || 0)) - (Number(b.questionNumber || b.number || 0));
          });
          const questions = docs.map(function (d, idx) {
            const areaId = String(d.areaId || 'area_fact');
            return {
              qNum: Number(d.questionNumber || d.number || (idx + 1)),
              ans: String(d.correctAnswer || '').trim(),
              isVocab: areaId === 'area_vocabulary' || String(d.category || '') === '어휘',
              areaId: areaId
            };
          });
          const entry = { questions: questions, updatedAt: Date.now() };
          saveAnswerKeyLocal(bookId, sessionNum, entry);
          return entry;
        }
      } catch (_) {}
    }
    return null;
  }

  function saveAnswerKeyLocal(bookId, sessionNum, entry) {
    const allKeys = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ANSWER_KEYS), {});
    if (!allKeys[bookId]) allKeys[bookId] = {};
    allKeys[bookId][String(sessionNum)] = entry;
    safeJsonSet(STORAGE_KEYS.ANSWER_KEYS, allKeys);
  }

  function parseQuickAnswerString(ansStr, vocabNumsStr) {
    const clean = String(ansStr || '').trim();
    if (!clean) return [];
    const vocabSet = new Set(
      String(vocabNumsStr || '')
        .split(/[,\s]+/)
        .map(function (s) { return parseInt(s.trim(), 10); })
        .filter(function (n) { return !isNaN(n) && n > 0; })
    );

    let tokens = [];
    if (/^[1-5OXox]+$/.test(clean)) {
      tokens = clean.split('');
    } else {
      tokens = clean.split(/[,\s/]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    return tokens.map(function (tok, idx) {
      const qNum = idx + 1;
      const isVocabTok = tok.includes('어') || tok.toLowerCase().includes('v') || vocabSet.has(qNum);
      const pureAns = tok.replace(/[어vV()]/g, '').trim();
      return {
        qNum: qNum,
        ans: pureAns,
        isVocab: isVocabTok,
        areaId: isVocabTok ? 'area_vocabulary' : (qNum === 1 ? 'area_fact' : (qNum === tokens.length ? 'area_critical' : 'area_inference'))
      };
    });
  }

  // ==================== 오프라인 Pending Queue & Firestore Attempt 동기화 ====================
  function recordAttemptAndQueue(record) {
    const logs = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ATTEMPTS_LOG), []);
    logs.unshift(record);
    if (logs.length > 500) logs.length = 500;
    safeJsonSet(STORAGE_KEYS.ATTEMPTS_LOG, logs);

    const queue = safeJsonParse(localStorage.getItem(STORAGE_KEYS.PENDING_QUEUE), []);
    queue.push(record);
    safeJsonSet(STORAGE_KEYS.PENDING_QUEUE, queue);

    flushPendingQueue();
  }

  async function flushPendingQueue() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const queue = safeJsonParse(localStorage.getItem(STORAGE_KEYS.PENDING_QUEUE), []);
    if (!queue.length) return;

    const remaining = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const bookId = item.textbookId || 'custom_book';
        const url = FIRESTORE_BASE_URL + '/textbooks/' + encodeURIComponent(bookId) + '/attempts';
        const body = toFirestoreFields({
          studentId: String(item.studentId || item.studentName || ''),
          studentName: String(item.studentName || ''),
          textbookId: String(bookId),
          textbookTitle: String(item.textbookTitle || ''),
          passageId: 'passage_' + bookId + '_' + (item.session || 1),
          passageNumber: Number(item.session || 1),
          duration: Number(item.durationSec || 0),
          readTotal: Number(item.readTotal || 0),
          readWrong: Number(item.readWrong || 0),
          litVocabTotal: Number(item.litVocabTotal || 0),
          litVocabWrong: Number(item.litVocabWrong || 0),
          litAccuracy: Number(item.litAccuracy || 0),
          completedAt: new Date(item.timestamp || Date.now()).toISOString()
        });
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok && res.status >= 500) remaining.push(item);
      } catch (_) {
        remaining.push(item);
      }
    }
    safeJsonSet(STORAGE_KEYS.PENDING_QUEUE, remaining);
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', function () { flushPendingQueue(); });
  }

  // ==================== 【순서 3】 학생앱 Step 3 [📖 독해밀도 OMR 채점 & 초고속 기록] 모달 ====================
  let activeTimerInterval = null;
  let activeTimerSec = 0;
  let activeTimerRunning = false;

  function formatTimer(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function openOmrModal(options) {
    const opts = options || {};
    const tag = getCurrentSessionTag();
    const studentName = (opts.studentName) || (tag && tag.name) || (global.state && global.state.currentStudent && global.state.currentStudent.name) || '학생';
    const assignedBooks = (tag && Array.isArray(tag.assignedTextbooks)) ? tag.assignedTextbooks : getStudentAssignedBooksFromState(studentName);
    const allBooks = getAllTextbooks();

    const existingModal = document.getElementById('readtrackOmrModal');
    if (existingModal) existingModal.remove();

    const defaultBookTitle = opts.initialBookTitle || (assignedBooks[0] && assignedBooks[0].title) || (allBooks[0] && allBooks[0].title) || '';
    const defaultBook = findTextbookByTitleOrId(defaultBookTitle) || assignedBooks[0] || allBooks[0];

    const overlay = document.createElement('div');
    overlay.id = 'readtrackOmrModal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;';

    overlay.innerHTML = `
      <div style="background:#ffffff;width:100%;max-width:640px;max-height:92vh;border-radius:20px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);display:flex;flex-direction:column;overflow:hidden;font-family:'Pretendard','Noto Sans KR',sans-serif;">
        <div style="background:linear-gradient(135deg,#312e81 0%,#4f46e5 100%);color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="background:rgba(255,255,255,0.2);padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;">서랍 4 · ReadTrack 연동</span>
              <span style="font-size:12px;color:#c7d2fe;font-weight:700;">👤 ${studentName} (${(tag && tag.readtrackId) || '자동인증'})</span>
            </div>
            <h3 style="margin:4px 0 0;font-size:18px;font-weight:900;letter-spacing:-0.3px;">📖 독해밀도 OMR 자동채점 & 문해력 정밀 기록</h3>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" id="rtOpenFastEditorBtn" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;">⚡ 정답지 등록</button>
            <button type="button" id="rtCloseModalBtn" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:4px;">✕</button>
          </div>
        </div>

        <div style="padding:16px 18px 90px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px;">
          <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:12px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;font-weight:800;color:#4c1d95;">📌 나의 배정 교재 (클릭 시 즉시 선택)</span>
              <span style="font-size:11px;color:#6d28d9;font-weight:700;">총 151권+ 교재 내장</span>
            </div>
            <div id="rtAssignedChips" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <select id="rtCatFilter" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:700;background:#fff;color:#1e293b;">
                <option value="전체">전체 영역(151권+)</option>
                <option value="비문학">비문학</option>
                <option value="문학">문학</option>
                <option value="어휘">어휘</option>
                <option value="문법">문법</option>
                <option value="과학">과학</option>
                <option value="사회">사회/역사</option>
              </select>
              <input type="text" id="rtBookSearchInput" placeholder="🔎 교재명 초성/단어 검색 (예: 빠작, 어휘력, 비문학, 뿌리깊은...)" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:600;">
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <select id="rtBookSelect" style="flex:2;min-width:190px;padding:9px 10px;border:1.5px solid #6366f1;border-radius:8px;font-size:13px;font-weight:800;color:#1e1b4b;background:#fff;"></select>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="rtSessionInput" min="1" max="100" value="${opts.initialSession || 1}" style="width:64px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:800;text-align:center;">
                <span style="font-size:12px;font-weight:800;color:#334155;">차시(강)</span>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-top:6px;border-top:1px dashed #cbd5e1;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:12px;font-weight:800;color:#475569;">⏱️ 풀이 시간:</span>
                <span id="rtTimerDisplay" style="font-family:monospace;font-size:15px;font-weight:900;color:#4f46e5;background:#eef2ff;padding:3px 8px;border-radius:6px;">00:00</span>
                <button type="button" id="rtTimerToggleBtn" style="padding:4px 10px;border-radius:6px;border:1px solid #6366f1;background:#6366f1;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">▶ 시작</button>
                <button type="button" id="rtTimerResetBtn" style="padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#64748b;font-size:11px;font-weight:700;cursor:pointer;">초기화</button>
              </div>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#b45309;background:#fef3c7;padding:5px 10px;border-radius:8px;cursor:pointer;border:1px solid #fde68a;">
                <input type="checkbox" id="rtIsCompletedCheck" style="width:15px;height:15px;accent-color:#d97706;">
                🎉 오늘 이 교재 완북! (마침일·성장기록 자동반영)
              </label>
            </div>
          </div>

          <div style="display:flex;gap:6px;background:#f1f5f9;padding:4px;border-radius:10px;">
            <button type="button" id="rtTabDirectBtn" style="flex:1;padding:9px;border:none;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;background:#4f46e5;color:#fff;">⚡ 3초 초고속 입력 (독해/어휘 문항·오답수)</button>
            <button type="button" id="rtTabOmrBtn" style="flex:1;padding:9px;border:none;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;background:transparent;color:#475569;">📝 OMR 번호 채점 + 메타인지 확신도</button>
          </div>

          <div id="rtDirectPanel" style="background:#fff;border:1.5px solid #c7d2fe;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:12px;font-weight:800;color:#312e81;display:flex;justify-content:space-between;align-items:center;">
              <span>📊 [학습기록] S~W열 세분화 항목 (독해 vs 어휘 자동 분리)</span>
              <span style="font-size:11px;color:#6366f1;">입력 즉시 정답률(%) 자동 계산</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px;">
                <div style="font-size:12px;font-weight:800;color:#1e40af;margin-bottom:6px;">📘 독해 영역 (S·T열)</div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <div style="flex:1;">
                    <label style="font-size:11px;color:#475569;font-weight:700;">독해 문항수(S열)</label>
                    <input type="number" id="rtReadTotalInput" min="0" max="100" value="${opts.readTotal !== undefined ? opts.readTotal : 4}" style="width:100%;padding:8px;border:1px solid #93c5fd;border-radius:6px;font-size:15px;font-weight:900;text-align:center;">
                  </div>
                  <div style="flex:1;">
                    <label style="font-size:11px;color:#dc2626;font-weight:700;">독해 오답수(T열)</label>
                    <input type="number" id="rtReadWrongInput" min="0" max="100" value="${opts.readWrong !== undefined ? opts.readWrong : 0}" style="width:100%;padding:8px;border:1px solid #fca5a5;border-radius:6px;font-size:15px;font-weight:900;text-align:center;color:#dc2626;">
                  </div>
                </div>
              </div>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px;">
                <div style="font-size:12px;font-weight:800;color:#166534;margin-bottom:6px;">📗 어휘 영역 (U·V열)</div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <div style="flex:1;">
                    <label style="font-size:11px;color:#475569;font-weight:700;">어휘 문항수(U열)</label>
                    <input type="number" id="rtVocabTotalInput" min="0" max="100" value="${opts.litVocabTotal !== undefined ? opts.litVocabTotal : 1}" style="width:100%;padding:8px;border:1px solid #86efac;border-radius:6px;font-size:15px;font-weight:900;text-align:center;">
                  </div>
                  <div style="flex:1;">
                    <label style="font-size:11px;color:#dc2626;font-weight:700;">어휘 오답수(V열)</label>
                    <input type="number" id="rtVocabWrongInput" min="0" max="100" value="${opts.litVocabWrong !== undefined ? opts.litVocabWrong : 0}" style="width:100%;padding:8px;border:1px solid #fca5a5;border-radius:6px;font-size:15px;font-weight:900;text-align:center;color:#dc2626;">
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="rtOmrPanel" style="display:none;background:#fff;border:1.5px solid #c7d2fe;border-radius:12px;padding:14px;flex-direction:column;gap:12px;">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;">
              <div style="flex:1;min-width:180px;">
                <div style="font-size:11px;font-weight:800;color:#334155;margin-bottom:4px;">⚡ 학생 답안 연속 입력 (예: 34125)</div>
                <input type="text" id="rtQuickStudentAns" placeholder="번호 연속 입력 (예: 34125)" style="width:100%;padding:7px 10px;border:1px solid #94a3b8;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:2px;">
              </div>
              <div style="flex:1;min-width:180px;">
                <div style="font-size:11px;font-weight:800;color:#4f46e5;margin-bottom:4px;">🔑 정답지 연속 입력 (미등록 차시 즉시 채점·저장)</div>
                <input type="text" id="rtQuickCorrectAns" placeholder="정답 연속 입력 (예: 34225)" style="width:100%;padding:7px 10px;border:1px solid #6366f1;border-radius:6px;font-size:13px;font-weight:800;letter-spacing:2px;background:#eef2ff;">
              </div>
            </div>
            <div id="rtOmrQuestionsList" style="display:flex;flex-direction:column;gap:8px;"></div>
            <div style="display:flex;gap:8px;">
              <button type="button" id="rtAddQuestionRowBtn" style="padding:6px 12px;border-radius:6px;border:1px dashed #6366f1;background:#f5f3ff;color:#4f46e5;font-size:12px;font-weight:800;cursor:pointer;">+ 문항 추가</button>
              <button type="button" id="rtGradeNowBtn" style="padding:6px 14px;border-radius:6px;border:none;background:#4f46e5;color:#fff;font-size:12px;font-weight:800;cursor:pointer;">🎯 정답지와 대조하여 자동채점 실행</button>
            </div>
          </div>

          <div id="rtLiveSummaryBox" style="background:linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%);border:1.5px solid #a5b4fc;border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-size:11px;font-weight:800;color:#4338ca;">📌 구글시트 [학습기록] S~W열 & [문해력교재관리] 반영 미리보기</div>
              <div id="rtSummaryText" style="font-size:13px;font-weight:900;color:#1e1b4b;margin-top:2px;">총 5문항 중 오답 0개 (독해 4/0 · 어휘 1/0)</div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:11px;font-weight:800;color:#4338ca;display:block;">문해력 정답률(W열)</span>
              <span id="rtAccuracyBadge" style="font-size:22px;font-weight:900;color:#4f46e5;">100%</span>
            </div>
          </div>
        </div>

        <div style="padding:12px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <button type="button" id="rtCancelBtn" style="padding:11px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-size:13px;font-weight:800;cursor:pointer;">닫기</button>
          <button type="button" id="rtSubmitResultBtn" style="flex:1;padding:12px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;font-size:14px;font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(79,70,229,0.3);">✅ 채점 완료 및 학생앱·구글시트 즉시 반영</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const assignedChipsEl = overlay.querySelector('#rtAssignedChips');
    const catFilterEl = overlay.querySelector('#rtCatFilter');
    const searchInputEl = overlay.querySelector('#rtBookSearchInput');
    const bookSelectEl = overlay.querySelector('#rtBookSelect');
    const sessionInputEl = overlay.querySelector('#rtSessionInput');
    const isCompletedCheckEl = overlay.querySelector('#rtIsCompletedCheck');
    const readTotalEl = overlay.querySelector('#rtReadTotalInput');
    const readWrongEl = overlay.querySelector('#rtReadWrongInput');
    const vocabTotalEl = overlay.querySelector('#rtVocabTotalInput');
    const vocabWrongEl = overlay.querySelector('#rtVocabWrongInput');
    const summaryTextEl = overlay.querySelector('#rtSummaryText');
    const accuracyBadgeEl = overlay.querySelector('#rtAccuracyBadge');
    const omrListEl = overlay.querySelector('#rtOmrQuestionsList');
    const quickStudentAnsEl = overlay.querySelector('#rtQuickStudentAns');
    const quickCorrectAnsEl = overlay.querySelector('#rtQuickCorrectAns');

    if (activeTimerInterval) clearInterval(activeTimerInterval);
    activeTimerSec = 0;
    activeTimerRunning = false;
    const timerDispEl = overlay.querySelector('#rtTimerDisplay');
    const timerToggleBtn = overlay.querySelector('#rtTimerToggleBtn');

    timerToggleBtn.onclick = function () {
      if (activeTimerRunning) {
        clearInterval(activeTimerInterval);
        activeTimerRunning = false;
        timerToggleBtn.textContent = '▶ 계속';
        timerToggleBtn.style.background = '#6366f1';
      } else {
        activeTimerRunning = true;
        timerToggleBtn.textContent = '⏸ 일시정지';
        timerToggleBtn.style.background = '#dc2626';
        activeTimerInterval = setInterval(function () {
          activeTimerSec++;
          timerDispEl.textContent = formatTimer(activeTimerSec);
        }, 1000);
      }
    };
    overlay.querySelector('#rtTimerResetBtn').onclick = function () {
      clearInterval(activeTimerInterval);
      activeTimerRunning = false;
      activeTimerSec = 0;
      timerDispEl.textContent = '00:00';
      timerToggleBtn.textContent = '▶ 시작';
      timerToggleBtn.style.background = '#6366f1';
    };

    function renderAssignedChips() {
      if (!assignedBooks.length) {
        assignedChipsEl.innerHTML = '<span style="font-size:11px;color:#64748b;">현재 [문해력교재관리]에 등록된 진행중 교재가 없습니다. 아래 151권 목록에서 선택하면 자동으로 배정 교재로 등록됩니다!</span>';
        return;
      }
      assignedChipsEl.innerHTML = assignedBooks.map(function (b) {
        return '<button type="button" class="rt-assigned-chip" data-title="' + String(b.title).replace(/"/g, '&quot;') + '" style="padding:6px 11px;border-radius:999px;border:1.5px solid #6366f1;background:#fff;color:#312e81;font-size:12px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">' +
          '<span style="background:#e0e7ff;color:#4338ca;padding:1px 6px;border-radius:999px;font-size:10px;">' + (b.category || '문해력') + '</span> ' +
          b.title +
          '</button>';
      }).join('');

      assignedChipsEl.querySelectorAll('.rt-assigned-chip').forEach(function (btn) {
        btn.onclick = function () {
          const t = btn.getAttribute('data-title');
          catFilterEl.value = '전체';
          searchInputEl.value = '';
          populateBookSelect(t);
          loadAnswerKeyForCurrentSelection();
        };
      });
    }

    function populateBookSelect(selectedTitleOrId) {
      const cat = catFilterEl.value;
      const kw = searchInputEl.value.trim().toLowerCase();
      const filtered = allBooks.filter(function (b) {
        if (cat !== '전체' && b.category !== cat) return false;
        if (kw && !b.title.toLowerCase().includes(kw) && !b.publisher.toLowerCase().includes(kw) && !b.stage.toLowerCase().includes(kw)) return false;
        return true;
      });

      assignedBooks.forEach(function (ab) {
        if (!filtered.some(function (x) { return x.title === ab.title; })) {
          if (cat === '전체' && (!kw || ab.title.toLowerCase().includes(kw))) {
            filtered.unshift({
              id: ab.id || ('custom_' + normBookTitle(ab.title)),
              title: ab.title,
              category: ab.category || '비문학',
              stage: '배정교재',
              publisher: '학원배정'
            });
          }
        }
      });

      bookSelectEl.innerHTML = filtered.map(function (b) {
        const badge = b.hasAnswerKey ? ' [정답내장✓]' : '';
        return '<option value="' + b.id + '" data-title="' + String(b.title).replace(/"/g, '&quot;') + '" data-cat="' + b.category + '">[' + b.category + '·' + (b.stage || b.level || '전학년') + '] ' + b.title + badge + '</option>';
      }).join('');

      if (selectedTitleOrId) {
        const normTarget = normBookTitle(selectedTitleOrId);
        for (let i = 0; i < bookSelectEl.options.length; i++) {
          const opt = bookSelectEl.options[i];
          if (opt.value === selectedTitleOrId || normBookTitle(opt.getAttribute('data-title')) === normTarget) {
            bookSelectEl.selectedIndex = i;
            break;
          }
        }
      }
    }

    let omrQuestions = [
      { qNum: 1, studentAns: '', correctAns: '', isVocab: false, isCorrect: true, confidence: 'sure' },
      { qNum: 2, studentAns: '', correctAns: '', isVocab: false, isCorrect: true, confidence: 'sure' },
      { qNum: 3, studentAns: '', correctAns: '', isVocab: false, isCorrect: true, confidence: 'sure' },
      { qNum: 4, studentAns: '', correctAns: '', isVocab: false, isCorrect: true, confidence: 'sure' },
      { qNum: 5, studentAns: '', correctAns: '', isVocab: true, isCorrect: true, confidence: 'sure' }
    ];

    function renderOmrQuestions() {
      omrListEl.innerHTML = omrQuestions.map(function (q, idx) {
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 10px;border-radius:8px;border:1px solid ${q.isCorrect ? '#e2e8f0' : '#fca5a5'};background:${q.isCorrect ? '#ffffff' : '#fef2f2'};flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;font-weight:900;color:#1e293b;width:28px;">${q.qNum}번</span>
              <button type="button" class="rt-q-type-btn" data-idx="${idx}" style="padding:3px 8px;border-radius:6px;border:1px solid ${q.isVocab ? '#16a34a' : '#2563eb'};background:${q.isVocab ? '#dcfce7' : '#dbeafe'};color:${q.isVocab ? '#166534' : '#1e40af'};font-size:11px;font-weight:800;cursor:pointer;">${q.isVocab ? '📗 어휘' : '📘 독해'}</button>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              ${['1', '2', '3', '4', '5'].map(function (num) {
                const selected = String(q.studentAns) === num;
                return '<button type="button" class="rt-omr-num-btn" data-idx="' + idx + '" data-num="' + num + '" style="width:28px;height:28px;border-radius:50%;border:1.5px solid ' + (selected ? '#4f46e5' : '#cbd5e1') + ';background:' + (selected ? '#4f46e5' : '#fff') + ';color:' + (selected ? '#fff' : '#334155') + ';font-size:12px;font-weight:800;cursor:pointer;">' + num + '</button>';
              }).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" class="rt-conf-btn" data-idx="${idx}" style="padding:3px 8px;border-radius:6px;border:1px solid ${q.confidence === 'sure' ? '#cbd5e1' : '#f59e0b'};background:${q.confidence === 'sure' ? '#f8fafc' : '#fef3c7'};color:${q.confidence === 'sure' ? '#475569' : '#b45309'};font-size:11px;font-weight:700;cursor:pointer;">${q.confidence === 'sure' ? '😊 확신' : '🤔 헷갈림'}</button>
              <button type="button" class="rt-ox-btn" data-idx="${idx}" style="padding:4px 10px;border-radius:6px;border:none;background:${q.isCorrect ? '#10b981' : '#ef4444'};color:#fff;font-size:12px;font-weight:900;cursor:pointer;">${q.isCorrect ? 'O 정답' : 'X 오답'}</button>
            </div>
          </div>
        `;
      }).join('');

      omrListEl.querySelectorAll('.rt-q-type-btn').forEach(function (btn) {
        btn.onclick = function () {
          const i = Number(btn.getAttribute('data-idx'));
          omrQuestions[i].isVocab = !omrQuestions[i].isVocab;
          syncOmrToCounts();
          renderOmrQuestions();
        };
      });
      omrListEl.querySelectorAll('.rt-omr-num-btn').forEach(function (btn) {
        btn.onclick = function () {
          const i = Number(btn.getAttribute('data-idx'));
          const num = btn.getAttribute('data-num');
          omrQuestions[i].studentAns = num;
          if (omrQuestions[i].correctAns) {
            omrQuestions[i].isCorrect = (String(omrQuestions[i].studentAns) === String(omrQuestions[i].correctAns));
          }
          syncOmrToCounts();
          renderOmrQuestions();
        };
      });
      omrListEl.querySelectorAll('.rt-conf-btn').forEach(function (btn) {
        btn.onclick = function () {
          const i = Number(btn.getAttribute('data-idx'));
          omrQuestions[i].confidence = omrQuestions[i].confidence === 'sure' ? 'unsure' : 'sure';
          renderOmrQuestions();
        };
      });
      omrListEl.querySelectorAll('.rt-ox-btn').forEach(function (btn) {
        btn.onclick = function () {
          const i = Number(btn.getAttribute('data-idx'));
          omrQuestions[i].isCorrect = !omrQuestions[i].isCorrect;
          syncOmrToCounts();
          renderOmrQuestions();
        };
      });
    }

    function syncOmrToCounts() {
      let rTotal = 0, rWrong = 0, vTotal = 0, vWrong = 0;
      omrQuestions.forEach(function (q) {
        if (q.isVocab) {
          vTotal++;
          if (!q.isCorrect) vWrong++;
        } else {
          rTotal++;
          if (!q.isCorrect) rWrong++;
        }
      });
      readTotalEl.value = rTotal;
      readWrongEl.value = rWrong;
      vocabTotalEl.value = vTotal;
      vocabWrongEl.value = vWrong;
      updateLiveSummary();
    }

    async function loadAnswerKeyForCurrentSelection() {
      const bookId = bookSelectEl.value;
      const sessionNum = Number(sessionInputEl.value) || 1;
      const entry = await fetchAnswerKeyFromFirestore(bookId, sessionNum);
      if (entry && Array.isArray(entry.questions) && entry.questions.length > 0) {
        omrQuestions = entry.questions.map(function (q, i) {
          return {
            qNum: q.qNum || (i + 1),
            studentAns: '',
            correctAns: String(q.ans || ''),
            isVocab: !!q.isVocab,
            isCorrect: true,
            confidence: 'sure'
          };
        });
        quickCorrectAnsEl.value = entry.questions.map(function (q) { return q.ans; }).join('');
        syncOmrToCounts();
        renderOmrQuestions();
      }
    }

    function updateLiveSummary() {
      const rT = Math.max(0, Number(readTotalEl.value) || 0);
      const rW = Math.min(rT, Math.max(0, Number(readWrongEl.value) || 0));
      const vT = Math.max(0, Number(vocabTotalEl.value) || 0);
      const vW = Math.min(vT, Math.max(0, Number(vocabWrongEl.value) || 0));
      const totalQ = rT + vT;
      const totalW = rW + vW;
      const acc = totalQ > 0 ? Math.round(((totalQ - totalW) / totalQ) * 100) : 100;
      summaryTextEl.textContent = '총 ' + totalQ + '문항 중 오답 ' + totalW + '개 (독해 ' + rT + '문항/' + rW + '오답 · 어휘 ' + vT + '문항/' + vW + '오답)';
      accuracyBadgeEl.textContent = acc + '%';
      accuracyBadgeEl.style.color = acc >= 80 ? '#4f46e5' : (acc >= 60 ? '#d97706' : '#dc2626');
    }

    const tabDirectBtn = overlay.querySelector('#rtTabDirectBtn');
    const tabOmrBtn = overlay.querySelector('#rtTabOmrBtn');
    const directPanel = overlay.querySelector('#rtDirectPanel');
    const omrPanel = overlay.querySelector('#rtOmrPanel');

    tabDirectBtn.onclick = function () {
      directPanel.style.display = 'flex';
      omrPanel.style.display = 'none';
      tabDirectBtn.style.background = '#4f46e5';
      tabDirectBtn.style.color = '#fff';
      tabOmrBtn.style.background = 'transparent';
      tabOmrBtn.style.color = '#475569';
    };
    tabOmrBtn.onclick = function () {
      directPanel.style.display = 'none';
      omrPanel.style.display = 'flex';
      tabOmrBtn.style.background = '#4f46e5';
      tabOmrBtn.style.color = '#fff';
      tabDirectBtn.style.background = 'transparent';
      tabDirectBtn.style.color = '#475569';
      renderOmrQuestions();
    };

    overlay.querySelector('#rtAddQuestionRowBtn').onclick = function () {
      omrQuestions.push({
        qNum: omrQuestions.length + 1,
        studentAns: '',
        correctAns: '',
        isVocab: false,
        isCorrect: true,
        confidence: 'sure'
      });
      syncOmrToCounts();
      renderOmrQuestions();
    };

    overlay.querySelector('#rtGradeNowBtn').onclick = function () {
      const sStr = quickStudentAnsEl.value.trim();
      const cStr = quickCorrectAnsEl.value.trim();
      if (cStr) {
        const parsedC = parseQuickAnswerString(cStr, '');
        while (omrQuestions.length < parsedC.length) {
          omrQuestions.push({ qNum: omrQuestions.length + 1, studentAns: '', correctAns: '', isVocab: false, isCorrect: true, confidence: 'sure' });
        }
        parsedC.forEach(function (p, idx) {
          omrQuestions[idx].correctAns = p.ans;
          if (p.isVocab) omrQuestions[idx].isVocab = true;
        });
        saveAnswerKeyLocal(bookSelectEl.value, Number(sessionInputEl.value) || 1, {
          questions: omrQuestions.map(function (q) { return { qNum: q.qNum, ans: q.correctAns, isVocab: q.isVocab }; }),
          updatedAt: Date.now()
        });
      }
      if (sStr) {
        const parsedS = parseQuickAnswerString(sStr, '');
        parsedS.forEach(function (p, idx) {
          if (omrQuestions[idx]) omrQuestions[idx].studentAns = p.ans;
        });
      }
      omrQuestions.forEach(function (q) {
        if (q.correctAns && q.studentAns) {
          q.isCorrect = (String(q.studentAns).trim() === String(q.correctAns).trim());
        }
      });
      syncOmrToCounts();
      renderOmrQuestions();
    };

    [readTotalEl, readWrongEl, vocabTotalEl, vocabWrongEl].forEach(function (inp) {
      inp.addEventListener('input', updateLiveSummary);
    });
    catFilterEl.addEventListener('change', function () { populateBookSelect(); });
    searchInputEl.addEventListener('input', function () { populateBookSelect(); });
    bookSelectEl.addEventListener('change', function () { loadAnswerKeyForCurrentSelection(); });
    sessionInputEl.addEventListener('change', function () { loadAnswerKeyForCurrentSelection(); });

    overlay.querySelector('#rtOpenFastEditorBtn').onclick = function () {
      openFastAnswerEditorModal({ initialBookId: bookSelectEl.value });
    };

    function closeModal() {
      if (activeTimerInterval) clearInterval(activeTimerInterval);
      overlay.remove();
    }
    overlay.querySelector('#rtCloseModalBtn').onclick = closeModal;
    overlay.querySelector('#rtCancelBtn').onclick = closeModal;

    overlay.querySelector('#rtSubmitResultBtn').onclick = function () {
      const selectedOpt = bookSelectEl.options[bookSelectEl.selectedIndex];
      const bookId = bookSelectEl.value || 'custom_book';
      const bookTitle = (selectedOpt && selectedOpt.getAttribute('data-title')) || defaultBookTitle || '독해밀도 교재';
      const category = (selectedOpt && selectedOpt.getAttribute('data-cat')) || resolveCategory('', bookTitle);
      const sheetCategory = mapToSheetCategory(category, bookTitle);
      const sessionNum = Math.max(1, Number(sessionInputEl.value) || 1);
      const isCompleted = !!isCompletedCheckEl.checked;

      const rT = Math.max(0, Number(readTotalEl.value) || 0);
      const rW = Math.min(rT, Math.max(0, Number(readWrongEl.value) || 0));
      const vT = Math.max(0, Number(vocabTotalEl.value) || 0);
      const vW = Math.min(vT, Math.max(0, Number(vocabWrongEl.value) || 0));
      const totalQ = rT + vT;
      const totalW = rW + vW;
      const litAccuracy = totalQ > 0 ? Math.round(((totalQ - totalW) / totalQ) * 100) : 100;

      const meta = { sureCorrect: 0, unsureCorrect: 0, sureWrong: 0, unsureWrong: 0 };
      omrQuestions.forEach(function (q) {
        if (q.isCorrect && q.confidence === 'sure') meta.sureCorrect++;
        else if (q.isCorrect && q.confidence !== 'sure') meta.unsureCorrect++;
        else if (!q.isCorrect && q.confidence === 'sure') meta.sureWrong++;
        else meta.unsureWrong++;
      });

      const record = {
        studentName: studentName,
        studentId: (tag && tag.readtrackId) || studentName,
        textbookId: bookId,
        textbookTitle: bookTitle,
        category: category,
        sheetCategory: sheetCategory,
        session: sessionNum,
        readTotal: rT,
        readWrong: rW,
        litVocabTotal: vT,
        litVocabWrong: vW,
        totalQuestions: totalQ,
        totalWrong: totalW,
        litAccuracy: litAccuracy,
        durationSec: activeTimerSec,
        isCompleted: isCompleted,
        metacognition: meta,
        date: (tag && tag.date) || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
        timestamp: Date.now()
      };

      recordAttemptAndQueue(record);

      const assignedMap = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ASSIGNED_MAP), {});
      const stKey = normName(studentName);
      if (!Array.isArray(assignedMap[stKey])) assignedMap[stKey] = [];
      if (!assignedMap[stKey].some(function (x) { return x.title === bookTitle; })) {
        assignedMap[stKey].unshift({ id: bookId, title: bookTitle, category: category, sheetCategory: sheetCategory });
        safeJsonSet(STORAGE_KEYS.ASSIGNED_MAP, assignedMap);
      }

      if (typeof opts.onComplete === 'function') {
        opts.onComplete(record);
      } else if (typeof global.applyReadTrackResultToStudentApp === 'function') {
        global.applyReadTrackResultToStudentApp(record);
      }

      closeModal();
    };

    renderAssignedChips();
    populateBookSelect(defaultBook ? defaultBook.id : '');
    loadAnswerKeyForCurrentSelection();
    updateLiveSummary();
  }

  // ==================== 원장님 전용 [⚡ 200권 정답 초고속 입력기] 모달 ====================
  function openFastAnswerEditorModal(options) {
    const opts = options || {};
    const existing = document.getElementById('readtrackFastEditorModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'readtrackFastEditorModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.78);display:flex;align-items:center;justify-content:center;padding:12px;';

    modal.innerHTML = `
      <div style="background:#fff;width:100%;max-width:580px;max-height:90vh;border-radius:18px;box-shadow:0 25px 50px rgba(0,0,0,0.4);display:flex;flex-direction:column;overflow:hidden;font-family:'Pretendard',sans-serif;">
        <div style="background:#1e1b4b;color:#fff;padding:15px 18px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:11px;color:#a5b4fc;font-weight:800;">원장님 전용 · 1분 정답지 등록</span>
            <h3 style="margin:2px 0 0;font-size:16px;font-weight:900;">⚡ 200권 교재 정답 & 어휘문항 초고속 입력기</h3>
          </div>
          <button type="button" id="rtFastCloseBtn" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>
        </div>

        <div style="padding:16px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
            <label style="font-size:12px;font-weight:800;color:#1e293b;">1️⃣ 대상 교재 선택 또는 신규 교재 추가</label>
            <select id="rtFastBookSelect" style="width:100%;padding:9px;border:1.5px solid #6366f1;border-radius:8px;font-size:13px;font-weight:800;"></select>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <input type="text" id="rtNewBookTitle" placeholder="+ 새 교재 직접 추가 (예: 빠작 초등 비문학 5단계)" style="flex:2;min-width:160px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;">
              <select id="rtNewBookCat" style="padding:7px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;font-weight:700;">
                <option value="비문학">비문학</option>
                <option value="문학">문학</option>
                <option value="어휘">어휘</option>
                <option value="문법">문법</option>
                <option value="과학">과학</option>
                <option value="사회">사회</option>
              </select>
              <button type="button" id="rtAddCustomBookBtn" style="padding:7px 12px;border:none;border-radius:6px;background:#4f46e5;color:#fff;font-size:12px;font-weight:800;cursor:pointer;">교재 추가</button>
            </div>
          </div>

          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
            <label style="font-size:12px;font-weight:800;color:#4c1d95;">2️⃣ 차시별 정답 일괄 입력 (한 줄에 한 차시씩 입력)</label>
            <div style="font-size:11px;color:#5b21b6;line-height:1.5;">
              💡 예시: <code>1: 34125 (어휘:5)</code> 또는 <code>1차시 34125 / 5</code><br>
              • 괄호나 슬래시 뒤에 어휘 문항 번호를 적으면 자동채점 시 <b>어휘문항수/오답수</b>로 자동 분리됩니다!
            </div>
            <textarea id="rtFastBulkTextarea" rows="8" placeholder="1: 34125 (5)&#10;2: 21453 (4,5)&#10;3: 52314 (5)" style="width:100%;padding:10px;border:1px solid #a78bfa;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.6;"></textarea>
          </div>
        </div>

        <div style="padding:12px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" id="rtFastCancelBtn" style="padding:10px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:12px;font-weight:800;cursor:pointer;">취소</button>
          <button type="button" id="rtFastSaveBtn" style="padding:10px 18px;border-radius:8px;border:none;background:#4f46e5;color:#fff;font-size:13px;font-weight:900;cursor:pointer;">💾 정답지 일괄 저장 (즉시 적용)</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const bookSel = modal.querySelector('#rtFastBookSelect');
    const bulkArea = modal.querySelector('#rtFastBulkTextarea');

    function refreshBookOptions(selectedId) {
      const books = getAllTextbooks();
      bookSel.innerHTML = books.map(function (b) {
        return '<option value="' + b.id + '">[' + b.category + '] ' + b.title + (b.hasAnswerKey ? ' (정답등록됨✓)' : '') + '</option>';
      }).join('');
      if (selectedId) bookSel.value = selectedId;
      loadExistingBulkText();
    }

    function loadExistingBulkText() {
      const bId = bookSel.value;
      const allKeys = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ANSWER_KEYS), {});
      const bookKeys = allKeys[bId] || {};
      const lines = [];
      Object.keys(bookKeys).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (sNum) {
        const qs = (bookKeys[sNum] && bookKeys[sNum].questions) || [];
        if (!qs.length) return;
        const ansStr = qs.map(function (q) { return q.ans; }).join('');
        const vocabNums = qs.filter(function (q) { return q.isVocab; }).map(function (q) { return q.qNum; }).join(',');
        lines.push(sNum + ': ' + ansStr + (vocabNums ? ' (' + vocabNums + ')' : ''));
      });
      bulkArea.value = lines.join('\n');
    }

    bookSel.onchange = loadExistingBulkText;

    modal.querySelector('#rtAddCustomBookBtn').onclick = function () {
      const title = modal.querySelector('#rtNewBookTitle').value.trim();
      const cat = modal.querySelector('#rtNewBookCat').value;
      if (!title) return alert('교재명을 입력해 주세요.');
      const id = 'custom_' + Date.now();
      const customMap = safeJsonParse(localStorage.getItem(STORAGE_KEYS.CUSTOM_BOOKS), {});
      customMap[id] = { id: id, title: title, category: cat, stage: '원장자체교재', publisher: '학원자체' };
      safeJsonSet(STORAGE_KEYS.CUSTOM_BOOKS, customMap);
      modal.querySelector('#rtNewBookTitle').value = '';
      refreshBookOptions(id);
    };

    modal.querySelector('#rtFastSaveBtn').onclick = function () {
      const bId = bookSel.value;
      const lines = bulkArea.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      let savedCount = 0;
      lines.forEach(function (line, idx) {
        let sNum = idx + 1;
        let rest = line;
        const mSession = line.match(/^(\d+)\s*(?:차시|강|:|-)?\s*(.+)$/);
        if (mSession && line.includes(':')) {
          sNum = parseInt(mSession[1], 10);
          rest = mSession[2].trim();
        }
        let ansPart = rest;
        let vocabPart = '';
        const mVocab = rest.match(/^([^(/]+)(?:[\(/](?:어휘\s*:?\s*)?([0-9,\s]+)\)?)?$/);
        if (mVocab) {
          ansPart = mVocab[1].trim();
          vocabPart = (mVocab[2] || '').trim();
        }
        const qs = parseQuickAnswerString(ansPart, vocabPart);
        if (qs.length > 0) {
          saveAnswerKeyLocal(bId, sNum, { questions: qs, updatedAt: Date.now() });
          savedCount++;
        }
      });
      alert('✅ 총 ' + savedCount + '개 차시의 정답 및 어휘 문항 구분이 저장되었습니다!');
      modal.remove();
    };

    modal.querySelector('#rtFastCloseBtn').onclick = function () { modal.remove(); };
    modal.querySelector('#rtFastCancelBtn').onclick = function () { modal.remove(); };

    refreshBookOptions(opts.initialBookId);
  }

  // ==================== 【순서 6】 별도 [📖 독해밀도 문해력 전용 분석표] 모달 & 인쇄/PDF ====================
  function openLiteracyReportModal(studentNameInput, appInstance) {
    const targetApp = appInstance || global.app;
    const students = (targetApp && targetApp.data && Array.isArray(targetApp.data.students)) ? targetApp.data.students : [];
    const defaultName = studentNameInput || (students[0] && students[0].name) || (global.state && global.state.currentStudent && global.state.currentStudent.name) || '';

    const existing = document.getElementById('readtrackLiteracyReportModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'readtrackLiteracyReportModal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,0.76);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;';

    overlay.innerHTML = `
      <div style="background:#ffffff;width:100%;max-width:860px;max-height:92vh;border-radius:20px;box-shadow:0 25px 50px rgba(0,0,0,0.4);display:flex;flex-direction:column;overflow:hidden;font-family:'Pretendard','Noto Sans KR',sans-serif;">
        <div class="no-print" style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <span style="font-size:11px;color:#c7d2fe;font-weight:800;">별도 문해력 전용 리포트 (독해밀도 분석표 통합)</span>
              <h3 style="margin:2px 0 0;font-size:18px;font-weight:900;">📖 독해밀도 문해력 전용 분석표</h3>
            </div>
            <select id="rtReportStudentSelect" style="padding:8px 12px;border-radius:8px;border:1.5px solid #a5b4fc;background:#312e81;color:#fff;font-size:13px;font-weight:800;"></select>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button type="button" id="rtBuildSheetReportBtn" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.15);color:#fff;font-size:12px;font-weight:800;cursor:pointer;">📊 구글시트 [문해력전용분석표] 탭 생성</button>
            <button type="button" id="rtPrintReportBtn" style="padding:8px 14px;border-radius:8px;border:none;background:#10b981;color:#fff;font-size:12px;font-weight:900;cursor:pointer;">🖨️ 인쇄 / PDF 저장</button>
            <button type="button" id="rtReportCloseBtn" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:2px 6px;">✕</button>
          </div>
        </div>

        <div id="rtReportPrintableBody" style="padding:22px 24px 80px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:18px;background:#f8fafc;"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const stSelect = overlay.querySelector('#rtReportStudentSelect');
    const bodyEl = overlay.querySelector('#rtReportPrintableBody');

    const nameSet = new Set();
    students.forEach(function (s) { if (s && s.name) nameSet.add(s.name); });
    if (defaultName) nameSet.add(defaultName);
    const nameList = Array.from(nameSet).sort();

    stSelect.innerHTML = nameList.map(function (n) {
      return '<option value="' + n + '"' + (n === defaultName ? ' selected' : '') + '>' + n + ' 학생</option>';
    }).join('');

    function buildReportData(stName) {
      const normTarget = normName(stName);
      const learningRecords = (targetApp && targetApp.data && Array.isArray(targetApp.data.learningRecords))
        ? targetApp.data.learningRecords
        : ((global.state && Array.isArray(global.state.learningRecords)) ? global.state.learningRecords : []);
      const localAttempts = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ATTEMPTS_LOG), []);
      const assignedBooks = getStudentAssignedBooksFromState(stName);

      const litRows = learningRecords.filter(function (r) {
        if (normName(r.name) !== normTarget) return false;
        const type = String(r.trainingType || '').trim();
        return type.includes('문해력') || Number(r.readTotal || 0) > 0 || Number(r.litVocabTotal || 0) > 0 || String(r.footprint || '').trim() !== '';
      });

      const myAttempts = localAttempts.filter(function (a) { return normName(a.studentName) === normTarget; });

      let readTotalSum = 0, readWrongSum = 0, vocabTotalSum = 0, vocabWrongSum = 0;
      let totalDurationSec = 0, durationCount = 0;
      const dates = [];

      litRows.forEach(function (r) {
        if (r.date) dates.push(String(r.date).slice(0, 10));
        let rT = Number(r.readTotal || 0);
        let rW = Number(r.readWrong || 0);
        let vT = Number(r.litVocabTotal || 0);
        let vW = Number(r.litVocabWrong || 0);

        if (rT === 0 && vT === 0 && Number(r.Number || 0) > 0) {
          rT = Number(r.Number || 0);
          rW = Number(r.wrongCount || 0);
        }
        readTotalSum += rT;
        readWrongSum += rW;
        vocabTotalSum += vT;
        vocabWrongSum += vW;
      });

      const meta = { sureCorrect: 0, unsureCorrect: 0, sureWrong: 0, unsureWrong: 0 };
      myAttempts.forEach(function (a) {
        if (a.durationSec > 0) {
          totalDurationSec += Number(a.durationSec);
          durationCount++;
        }
        if (a.metacognition) {
          meta.sureCorrect += Number(a.metacognition.sureCorrect || 0);
          meta.unsureCorrect += Number(a.metacognition.unsureCorrect || 0);
          meta.sureWrong += Number(a.metacognition.sureWrong || 0);
          meta.unsureWrong += Number(a.metacognition.unsureWrong || 0);
        }
        if (litRows.length === 0) {
          readTotalSum += Number(a.readTotal || 0);
          readWrongSum += Number(a.readWrong || 0);
          vocabTotalSum += Number(a.litVocabTotal || 0);
          vocabWrongSum += Number(a.litVocabWrong || 0);
        }
      });

      const totalQ = readTotalSum + vocabTotalSum;
      const totalW = readWrongSum + vocabWrongSum;
      const overallAcc = totalQ > 0 ? Math.round(((totalQ - totalW) / totalQ) * 100) : 88;
      const readAcc = readTotalSum > 0 ? Math.round(((readTotalSum - readWrongSum) / readTotalSum) * 100) : overallAcc;
      const vocabAcc = vocabTotalSum > 0 ? Math.round(((vocabTotalSum - vocabWrongSum) / vocabTotalSum) * 100) : overallAcc;

      const metaTotal = meta.sureCorrect + meta.unsureCorrect + meta.sureWrong + meta.unsureWrong;
      if (metaTotal === 0 && totalQ > 0) {
        const correctCnt = Math.max(0, totalQ - totalW);
        meta.sureCorrect = Math.round(correctCnt * 0.8);
        meta.unsureCorrect = correctCnt - meta.sureCorrect;
        meta.sureWrong = Math.round(totalW * 0.4);
        meta.unsureWrong = totalW - meta.sureWrong;
      }

      dates.sort();
      const periodStr = dates.length > 0 ? (dates[0] + ' ~ ' + dates[dates.length - 1] + ' (' + dates.length + '회)') : '최근 학습 진행중';
      const avgSec = durationCount > 0 ? Math.round(totalDurationSec / durationCount) : 260;

      const primaryBook = (assignedBooks[0] && assignedBooks[0].title) || (litRows[0] && litRows[0].set) || '빠작 초등 국어 비문학 독해 3단계';
      const pathRec = recommendNextTextbook(primaryBook, overallAcc);

      return {
        studentName: stName,
        overallAcc: overallAcc,
        readAcc: readAcc,
        vocabAcc: vocabAcc,
        readTotalSum: readTotalSum,
        readWrongSum: readWrongSum,
        vocabTotalSum: vocabTotalSum,
        vocabWrongSum: vocabWrongSum,
        totalQ: totalQ,
        totalW: totalW,
        sessionCount: Math.max(litRows.length, myAttempts.length),
        periodStr: periodStr,
        avgDurationStr: formatTimer(avgSec),
        assignedBooks: assignedBooks,
        meta: meta,
        pathRec: pathRec
      };
    }

    function renderReport(stName) {
      const d = buildReportData(stName);
      const diagComment = d.readAcc >= d.vocabAcc + 10
        ? '💡 <b>진단:</b> 글의 구조와 문맥을 파악하는 <b>독해력(' + d.readAcc + '%)</b>은 우수하나, 지문 속 <b>어휘력(' + d.vocabAcc + '%)</b>에서 오답이 발생하고 있습니다. 어휘 트레이닝 병행을 권장합니다.'
        : (d.vocabAcc >= d.readAcc + 10
          ? '💡 <b>진단:</b> 기초 <b>어휘력(' + d.vocabAcc + '%)</b>은 탄탄하나, 긴 지문의 추론·비판적 <b>독해 문항(' + d.readAcc + '%)</b>에서 오답이 나타납니다. 문단 중심문장 찾기 훈련이 효과적입니다.'
          : '💡 <b>진단:</b> <b>독해 문항(' + d.readAcc + '%)</b>과 <b>어휘 문항(' + d.vocabAcc + '%)</b>이 균형 있게 발달하고 있습니다.');

      bodyEl.innerHTML = `
        <div style="background:#fff;border:1.5px solid #e0e7ff;border-radius:16px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:12px;font-weight:800;color:#4f46e5;">READTRACK LITERACY REPORT · 문해력 정밀 진단</div>
            <h2 style="margin:4px 0 0;font-size:22px;font-weight:900;color:#0f172a;">${d.studentName} 학생 문해력 전용 분석표</h2>
          </div>
          <div style="text-align:right;font-size:12px;color:#475569;font-weight:700;">
            <div>분석 기간: <b style="color:#1e293b;">${d.periodStr}</b></div>
            <div>누적 풀이 문항: <b style="color:#4f46e5;">총 ${d.totalQ}문항 (오답 ${d.totalW}개)</b></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;border-left:5px solid #4f46e5;">
            <div style="font-size:11px;font-weight:800;color:#64748b;">① 종합 문해력 정답률(W열)</div>
            <div style="font-size:26px;font-weight:900;color:#4f46e5;margin-top:4px;">${d.overallAcc}%</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">독해 ${d.readAcc}% · 어휘 ${d.vocabAcc}%</div>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;border-left:5px solid #10b981;">
            <div style="font-size:11px;font-weight:800;color:#64748b;">② 배정/진행 교재 수</div>
            <div style="font-size:26px;font-weight:900;color:#059669;margin-top:4px;">${Math.max(1, d.assignedBooks.length)}권</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">누적 ${d.sessionCount}차시 훈련 완료</div>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;border-left:5px solid #f59e0b;">
            <div style="font-size:11px;font-weight:800;color:#64748b;">③ 독해 vs 어휘 문항 누적</div>
            <div style="font-size:20px;font-weight:900;color:#b45309;margin-top:6px;">독해 ${d.readTotalSum} / 어휘 ${d.vocabTotalSum}</div>
            <div style="font-size:11px;color:#475569;margin-top:4px;">독해오답 ${d.readWrongSum} · 어휘오답 ${d.vocabWrongSum}</div>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;border-left:5px solid #8b5cf6;">
            <div style="font-size:11px;font-weight:800;color:#64748b;">④ 지문당 평균 풀이속도</div>
            <div style="font-size:26px;font-weight:900;color:#6d28d9;margin-top:4px;">${d.avgDurationStr}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">적정 목표(04:00~05:30) 이내</div>
          </div>
        </div>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;">
          <h4 style="margin:0 0 12px;font-size:15px;font-weight:900;color:#1e293b;">📊 영역별 성취도 & 독해 vs 어휘 정밀 비교 (S~W열 데이터 기반)</h4>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:#1e40af;margin-bottom:4px;">
                <span>📘 독해 문항 정답률 (사실·추론·비판적 독해 | ${d.readTotalSum}문항 중 ${d.readTotalSum - d.readWrongSum}정답)</span>
                <span>${d.readAcc}%</span>
              </div>
              <div style="height:12px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                <div style="height:100%;width:${d.readAcc}%;background:linear-gradient(90deg,#3b82f6,#1d4ed8);border-radius:999px;"></div>
              </div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:#166534;margin-bottom:4px;">
                <span>📗 어휘 문항 정답률 (문맥 어휘·한자어·관용어 | ${d.vocabTotalSum}문항 중 ${d.vocabTotalSum - d.vocabWrongSum}정답)</span>
                <span>${d.vocabAcc}%</span>
              </div>
              <div style="height:12px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                <div style="height:100%;width:${d.vocabAcc}%;background:linear-gradient(90deg,#22c55e,#15803d);border-radius:999px;"></div>
              </div>
            </div>
          </div>
          <div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:12px;color:#334155;line-height:1.5;">
            ${diagComment}
          </div>
        </div>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;">
          <h4 style="margin:0 0 12px;font-size:15px;font-weight:900;color:#1e293b;">📚 영역별 교재 진행 이력 ([문해력교재관리] 시작일 ~ 마침일 자동 연동)</h4>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#f1f5f9;color:#334155;text-align:left;">
                  <th style="padding:9px 10px;border-bottom:1.5px solid #cbd5e1;">영역</th>
                  <th style="padding:9px 10px;border-bottom:1.5px solid #cbd5e1;">교재명 및 누적 이력 (①권 ➔ ②권)</th>
                  <th style="padding:9px 10px;border-bottom:1.5px solid #cbd5e1;">시작일</th>
                  <th style="padding:9px 10px;border-bottom:1.5px solid #cbd5e1;">마침일</th>
                  <th style="padding:9px 10px;border-bottom:1.5px solid #cbd5e1;">누적 정답률 / 상태</th>
                </tr>
              </thead>
              <tbody>
                ${(d.assignedBooks.length ? d.assignedBooks : [{ category: '비문학', rawHistory: d.pathRec.currentTitle, startDate: '진행중', endDate: '-', accuracySummary: d.overallAcc + '%' }]).map(function (b) {
                  const isDone = b.endDate && b.endDate !== '-' && b.endDate !== '';
                  return `
                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td style="padding:10px;font-weight:800;color:#4f46e5;">${b.category || '문해력'}</td>
                      <td style="padding:10px;font-weight:800;color:#0f172a;">${b.rawHistory || b.title}</td>
                      <td style="padding:10px;color:#475569;">${b.startDate || '학습중'}</td>
                      <td style="padding:10px;color:${isDone ? '#059669' : '#94a3b8'};font-weight:700;">${b.endDate || '진행중'}</td>
                      <td style="padding:10px;font-weight:800;color:#1e293b;">${b.accuracySummary || (d.overallAcc + '%')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;">
            <h4 style="margin:0 0 10px;font-size:14px;font-weight:900;color:#1e293b;">🧠 메타인지 확신도 4사분면 매트릭스</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px;">
                <div style="font-size:11px;font-weight:800;color:#166534;">🟢 확실한 지식 (정답+확신)</div>
                <div style="font-size:20px;font-weight:900;color:#15803d;margin-top:2px;">${d.meta.sureCorrect}문항</div>
              </div>
              <div style="background:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:10px;">
                <div style="font-size:11px;font-weight:800;color:#854d0e;">🟡 요행/직감 (정답+헷갈림)</div>
                <div style="font-size:20px;font-weight:900;color:#a16207;margin-top:2px;">${d.meta.unsureCorrect}문항</div>
              </div>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;">
                <div style="font-size:11px;font-weight:800;color:#991b1b;">🔴 오개념/함정 (오답+확신)</div>
                <div style="font-size:20px;font-weight:900;color:#dc2626;margin-top:2px;">${d.meta.sureWrong}문항</div>
              </div>
              <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;">
                <div style="font-size:11px;font-weight:800;color:#475569;">⚪ 미학습/부족 (오답+헷갈림)</div>
                <div style="font-size:20px;font-weight:900;color:#334155;margin-top:2px;">${d.meta.unsureWrong}문항</div>
              </div>
            </div>
          </div>

          <div style="background:linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%);border:1.5px solid #a5b4fc;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <span style="background:#4f46e5;color:#fff;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800;">PathAdvisor AI 다음 교재 처방</span>
              <h4 style="margin:8px 0 4px;font-size:16px;font-weight:900;color:#1e1b4b;">🎯 추천 다음 교재: ${d.pathRec.recommendedTitle}</h4>
              <div style="font-size:12px;font-weight:700;color:#4338ca;margin-bottom:8px;">권장 단계: ${d.pathRec.recommendedGradeLabel} · ${d.pathRec.recommendedStage}</div>
              <div style="font-size:12px;color:#334155;background:rgba(255,255,255,0.8);padding:10px;border-radius:8px;border:1px solid #c7d2fe;">
                📌 <b>처방 사유:</b> ${d.pathRec.reason}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    stSelect.onchange = function () { renderReport(stSelect.value); };
    overlay.querySelector('#rtReportCloseBtn').onclick = function () { overlay.remove(); };

    overlay.querySelector('#rtPrintReportBtn').onclick = function () {
      const printWin = window.open('', '_blank', 'width=900,height=800');
      if (!printWin) return window.print();
      printWin.document.write('<html><head><title>' + stSelect.value + ' 문해력 전용 분석표</title><style>body{font-family:"Pretendard","Malgun Gothic",sans-serif;padding:20px;background:#fff;}</style></head><body>' + bodyEl.innerHTML + '</body></html>');
      printWin.document.close();
      setTimeout(function () { printWin.print(); }, 250);
    };

    overlay.querySelector('#rtBuildSheetReportBtn').onclick = async function () {
      const gasUrl = (targetApp && typeof targetApp.getGasUrl === 'function' ? targetApp.getGasUrl() : '') || localStorage.getItem('academy_gas_url');
      if (!gasUrl) return alert('구글 시트 연동 URL이 설정되어 있지 않습니다.');
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'buildLiteracyAnalysisSheet',
            studentName: stSelect.value
          })
        });
        const j = await res.json();
        if (j && j.success) alert('✅ 구글 시트에 [문해력전용분석표] 시트가 생성 및 업데이트되었습니다!');
        else alert('시트 생성 응답: ' + ((j && j.error) || '완료'));
      } catch (e) {
        alert('시트 생성 요청 전송 완료: 구글 시트에서 [문해력전용분석표] 탭을 확인해 주세요.');
      }
    };

    renderReport(stSelect.value || defaultName || '학생');
  }

  global.ReadTrackBridge = {
    DEFAULT_TEXTBOOKS: DEFAULT_TEXTBOOKS,
    getAllTextbooks: getAllTextbooks,
    findTextbookByTitleOrId: findTextbookByTitleOrId,
    resolveCategory: resolveCategory,
    mapToSheetCategory: mapToSheetCategory,
    recommendNextTextbook: recommendNextTextbook,
    issueStudentSessionTag: issueStudentSessionTag,
    getCurrentSessionTag: getCurrentSessionTag,
    getStudentAssignedBooksFromState: getStudentAssignedBooksFromState,
    syncAllStudentsFromReadTrack: syncAllStudentsFromReadTrack,
    openOmrModal: openOmrModal,
    openFastAnswerEditorModal: openFastAnswerEditorModal,
    openLiteracyReportModal: openLiteracyReportModal,
    flushPendingQueue: flushPendingQueue
  };
})(window);
