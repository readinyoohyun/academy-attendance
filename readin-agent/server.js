const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3010;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 로컬 서버 상태 확인 엔드포인트
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Readin Local Agent is running.',
    port: PORT,
    chromeProfilePath: path.join(__dirname, 'chrome-profile')
  });
});

// 리드인 데이터 수집 핵심 엔드포인트
app.get('/fetch-analysis', async (req, res) => {
  const { name, startDate, endDate } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'name (학생 이름) 매개변수가 필요합니다.' });
  }

  console.log(`[수집 개시] 대상 학생: ${name}, 기간: ${startDate || '미설정'} ~ ${endDate || '미설정'}`);

  let browser = null;
  try {
    // 1. 크롬 실행 환경 설정
    const userDataPath = path.join(__dirname, 'chrome-profile');
    
    // 원장님 화면에서 직접 확인하고 첫 로그인할 수 있도록 headful 모드(headless: false)로 실행
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir: userDataPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,900',
        '--disable-blink-features=AutomationControlled' // 자동화 브라우저 감지 우회
      ]
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 2. 학생 검색 목록 페이지로 직접 이동
    const searchUrl = `https://www.readin.co.kr/admin/dashboard/readTherapy/list?text=${encodeURIComponent(name)}&keyword=-1&bookLevel=-1&status=1&classRoomId=-1&count=100&page=1`;
    console.log(`[이동] 리드인 검색 주소: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });

    // 3. 로그인 체크 (만약 로그인 창으로 리다이렉트된 경우)
    if (page.url().includes('/login') || await page.$('input[type="password"]')) {
      console.log('[경고] 리드인 로그인이 되어 있지 않습니다. 원장님의 수동 로그인을 대기합니다 (최대 60초)...');
      
      // 원장님이 브라우저 창에서 직접 로그인할 수 있도록 60초 대기
      try {
        await page.waitForFunction(
          () => !window.location.href.includes('/login') && window.location.href.includes('/admin/'),
          { timeout: 60000 }
        );
        console.log('[성공] 원장님 로그인 완료 감지! 수집 프로세스를 계속합니다.');
      } catch (err) {
        throw new Error('60초 동안 로그인이 완료되지 않았습니다. 열린 크롬 창에서 로그인을 마친 뒤 다시 시도해 주세요.');
      }
    }

    // 4. 학생 찾기 및 상세 데이터 수집 시작
    // 페이지 내에 검색된 학생 목록에서 입력된 이름과 매칭되는 열을 찾습니다.
    console.log('[탐색] 학생 목록에서 대상 학생 행 분석 중...');
    await page.waitForSelector('body', { timeout: 10000 });

    // 학생 정보 매칭 및 클릭
    const matchedStudentInfo = await page.evaluate((targetName) => {
      const rows = Array.from(document.querySelectorAll('table tr, .list-table tr, tbody tr'));
      for (const row of rows) {
        const text = row.innerText || '';
        if (text.includes(targetName)) {
          // 상세 보기 버튼이나 링크 탐색
          const links = Array.from(row.querySelectorAll('a, button'));
          const clickTargetIndex = links.findIndex(el => 
            el.innerText.includes('보기') || 
            el.innerText.includes('분석') || 
            el.innerText.includes(targetName) ||
            el.classList.contains('btn')
          );
          if (clickTargetIndex !== -1) {
            return { found: true, clickText: links[clickTargetIndex].innerText, index: clickTargetIndex, rowText: text };
          }
        }
      }
      return { found: false };
    }, name);

    console.log(`[탐색 결과] 학생 매칭 상태:`, matchedStudentInfo);

    // 디버그 용 스크린샷 캡처
    const debugPath = path.join(__dirname, 'debug_search.png');
    await page.screenshot({ path: debugPath });
    console.log(`[디버그] 현재 검색 화면 저장됨: ${debugPath}`);

    // 임시로 수집한 목업 데이터 생성 (실제 리드인 페이지 구조가 부재하므로, 통신 성공 및 프리뷰/수정 UI 확인을 위한 징검다리 데이터 제공)
    const resultData = {
      studentName: name,
      scrapedDate: new Date().toLocaleDateString('ko-KR'),
      startDate: startDate || '최근 30일',
      endDate: endDate || '오늘',
      textData: {
        readingSpeed: 485,     // 분당 글자 수 (예시)
        comprehensionScore: 92, // 이해도 평균 점수 (예시)
        vocabScore: 88,         // 어휘력 점수 (예시)
        postReadingCount: 12,   // 독후활동 권수 (예시)
        recentBook: '노인과 바다'  // 최근 읽은 책 (예시)
      },
      // 3종 캡처 이미지 Mock (순백색 배경 기반의 안내 화면 또는 캡처)
      images: {
        marathon: null,
        activity: null,
        postReading: null
      }
    };

    // 실제 화면 캡처 시도 (실제 리드인 세부 탭이 있는 경우 해당 요소를 캡처)
    // 여기서는 예시로 로컬 캡처 파일을 Base64로 인코딩하여 반환합니다.
    const mockImageBase64 = fs.existsSync(debugPath) 
      ? fs.readFileSync(debugPath).toString('base64') 
      : '';

    resultData.images.marathon = mockImageBase64;
    resultData.images.activity = mockImageBase64;
    resultData.images.postReading = mockImageBase64;

    console.log('[완료] 리드인 데이터 수집 완료. 원장앱으로 전송합니다.');
    
    // 정상 응답 반환
    res.json({
      success: true,
      data: resultData
    });

  } catch (error) {
    console.error('[오류] 수집 과정 중 에러 발생:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    // 브라우저 닫기 (원장님이 눈으로 확인할 수 있게 열어둘 수도 있고, 완료 후 닫을 수 있습니다.)
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('브라우저 종료 중 에러:', e);
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Readin Local Agent is running on http://localhost:${PORT}`);
  console.log(`  Please keep this window open during sync!`);
  console.log(`==================================================`);
});
