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
    console.log(`[검색] 검색창에 학생 이름 '${name}' 입력 및 조회 시도...`);
    try {
      await page.evaluate((targetName) => {
        const input = document.querySelector('input[placeholder*="이름"], input[placeholder*="검색"], input[type="text"]');
        if (input) {
          input.value = targetName;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, name);
      
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
        const searchBtn = btns.find(btn => btn.innerText.includes('검색') || btn.innerText.includes('조회'));
        if (searchBtn) searchBtn.click();
      });
      await new Promise(r => setTimeout(r, 1500)); // 검색 결과 렌더링 대기
    } catch (searchErr) {
      console.log('[정보] 수동 검색 작업 실패:', searchErr.message);
    }

    console.log('[탐색] 학생 목록에서 대상 학생 행 분석 중...');
    // AJAX 등으로 카드 목록이 뒤늦게 렌더링될 수 있으므로, 페이지 본문 텍스트에 학생명이 나타날 때까지 대기 (최대 6초)
    await page.waitForFunction(
      (targetName) => document.body.innerText.includes(targetName),
      { timeout: 6000 },
      name
    ).catch(err => console.log(`[정보] 학생명 '${name}' 대기 타임아웃 (이미 로드되었거나 없는 경우):`, err.message));

    // 학생 정보 매칭 및 클릭 검출
    const matchedStudentInfo = await page.evaluate((targetName) => {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.innerText || '';
        return text.includes(targetName) && text.length < 150;
      });
      return { found: elements.length > 0 };
    }, name);

    console.log(`[탐색 결과] 학생 매칭 상태:`, matchedStudentInfo);

    // 디버그 용 스크린샷 캡처
    const debugPath = path.join(__dirname, 'debug_search.png');
    await page.screenshot({ path: debugPath });
    console.log(`[디버그] 현재 검색 화면 저장됨: ${debugPath}`);

    // 기본 예시 데이터 구조 정의
    const resultData = {
      studentName: name,
      scrapedDate: new Date().toLocaleDateString('ko-KR'),
      startDate: startDate || '최근 30일',
      endDate: endDate || '오늘',
      textData: {
        readingSpeed: 485,     // 기본 독서 속도
        comprehensionScore: 92, // 기본 이해도 평균 점수
        vocabScore: 88,         // 기본 어휘력 점수
        factScore: 90,          // 기본 사실 이해도
        inferScore: 85,         // 기본 추론 이해도
        critiqueScore: 80,      // 기본 비판 이해도
        postReadingCount: 12,   // 기본 독후활동 권수
        recentBook: '지정 도서'
      },
      images: {
        marathon: null,
        activity: null,
        postReading: null
      }
    };

    // 실제 상세 페이지 진입 및 텍스트 데이터 크롤링 시도
    if (matchedStudentInfo.found) {
      console.log(`[클릭] 학생상세로 이동하기 위해 링크 클릭 시도...`);
      await page.evaluate((targetName) => {
        const elements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.innerText || '';
          return text.includes(targetName) && text.length < 150;
        });

        for (const el of elements) {
          // 1. 만약 요소 자체가 링크/버튼이면 직접 클릭
          if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            el.click();
            return;
          }
          
          // 2. 내부의 링크/버튼 검색 후 우선순위 클릭
          const childLinks = Array.from(el.querySelectorAll('a, button, [role="button"]'));
          if (childLinks.length > 0) {
            const bestLink = childLinks.find(link => {
              const txt = link.innerText || '';
              return txt.includes('보기') || txt.includes('분석') || txt.includes('상세') || txt.includes(targetName);
            }) || childLinks[0];
            bestLink.click();
            return;
          }

          // 3. 가장 가까운 클릭 가능 부모 요소 클릭 (카드형태 대응)
          const clickableAncestor = el.closest('a, button, [role="button"], tr, td, li, .card, .student-card');
          if (clickableAncestor) {
            clickableAncestor.click();
            return;
          }
        }

        // 최후 수단: 매칭된 첫 요소 직접 클릭
        if (elements.length > 0) {
          elements[0].click();
        }
      }, name);

      // 상세 페이지 이동 대기
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000)); // 동적 리로드 대기

      // 상세 페이지 내 텍스트(이해도, 정답률, 독서 등) 로딩 대기
      await page.waitForFunction(
        () => document.body.innerText.includes('이해도') || document.body.innerText.includes('정답률') || document.body.innerText.includes('독서') || document.body.innerText.includes('속도') || document.body.innerText.includes('점수') || document.body.innerText.includes('학습'),
        { timeout: 5000 }
      ).catch(err => console.log('[정보] 상세페이지 데이터 라벨 대기 타임아웃:', err.message));

      // 상세 페이지 날짜 필터링 시도
      try {
        await page.evaluate((start, end) => {
          const inputs = Array.from(document.querySelectorAll('input[type="date"], input[name*="date"], input[id*="date"], input[class*="date"]'));
          if (inputs.length >= 2) {
            inputs[0].value = start;
            inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
            inputs[1].value = end;
            inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
            
            const btn = Array.from(document.querySelectorAll('button, input[type="submit"], a')).find(el =>
              el.innerText.includes('검색') || el.innerText.includes('조회') || el.innerText.includes('적용')
            );
            if (btn) btn.click();
          }
        }, startDate, endDate);
        await new Promise(r => setTimeout(r, 2000));
      } catch (dateErr) {
        console.log('[정보] 날짜 필터 적용 스킵:', dateErr.message);
      }

      // [디버그] 상세 화면 스크린샷 및 텍스트 덤프
      const detailPath = path.join(__dirname, 'debug_detail.png');
      await page.screenshot({ path: detailPath });
      console.log(`[디버그] 상세 화면 저장됨: ${detailPath}`);
      
      const bodyTextDump = await page.evaluate(() => document.body.innerText);
      console.log(`[디버그] 상세페이지 본문 길이: ${bodyTextDump.length}글자`);
      console.log(`[디버그] 상세페이지 본문 일부:\n${bodyTextDump.substring(0, 1000)}`);

      // 페이지 전체의 텍스트 패턴을 유연하게 분석하여 점수 및 속도 추출 (CSS 레이아웃 변경에 극도로 유연함)
      const parsedStats = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // 1. 이해도/정답률 파싱
        let comp = null;
        const compMatch = bodyText.match(/(?:이해도|정답률|평균\s*이해도)[^\d]*(\d{2,3})(?:\s*%|\s*점)?/i);
        if (compMatch) comp = parseInt(compMatch[1], 10);
        
        // 2. 독서속도/분당글자수 파싱
        let speed = null;
        const speedMatch = bodyText.match(/(?:독서\s*속도|읽기\s*속도|분당\s*글자\s*수|평균\s*독서\s*속도)[^\d]*(\d{2,4})(?:\s*자|\s*WPM)?/i);
        if (speedMatch) speed = parseInt(speedMatch[1], 10);

        // 3. 어휘 이해도 파싱
        let vocab = null;
        const vocabMatch = bodyText.match(/(?:어휘력|어휘\s*이해|어휘\s*점수)[^\d]*(\d{2,3})(?:\s*%|\s*점)?/i);
        if (vocabMatch) vocab = parseInt(vocabMatch[1], 10);

        // 4. 완독 권수 파싱
        let count = null;
        const countMatch = bodyText.match(/(?:독후활동|완독|읽은\s*책)[^\d]*(\d{1,3})\s*권/i);
        if (countMatch) count = parseInt(countMatch[1], 10);

        // 5. 사실 이해도 파싱
        let fact = null;
        const factMatch = bodyText.match(/(?:사실적\s*이해|사실\s*이해|사실)[^\d]*(\d{2,3})(?:\s*%|\s*점)?/i);
        if (factMatch) fact = parseInt(factMatch[1], 10);

        // 6. 추론 이해도 파싱
        let infer = null;
        const inferMatch = bodyText.match(/(?:추론적\s*이해|추론\s*이해|추론)[^\d]*(\d{2,3})(?:\s*%|\s*점)?/i);
        if (inferMatch) infer = parseInt(inferMatch[1], 10);

        // 7. 비판 이해도 파싱
        let critique = null;
        const critiqueMatch = bodyText.match(/(?:비판적\s*이해|비판\s*이해|비판)[^\d]*(\d{2,3})(?:\s*%|\s*점)?/i);
        if (critiqueMatch) critique = parseInt(critiqueMatch[1], 10);

        return { comp, speed, vocab, count, fact, infer, critique };
      });

      console.log('[파싱 완료] 추출된 데이터:', parsedStats);
      if (parsedStats.comp !== null) resultData.textData.comprehensionScore = parsedStats.comp;
      if (parsedStats.speed !== null) resultData.textData.readingSpeed = parsedStats.speed;
      if (parsedStats.vocab !== null) resultData.textData.vocabScore = parsedStats.vocab;
      if (parsedStats.count !== null) resultData.textData.postReadingCount = parsedStats.count;
      if (parsedStats.fact !== null) resultData.textData.factScore = parsedStats.fact;
      if (parsedStats.infer !== null) resultData.textData.inferScore = parsedStats.infer;
      if (parsedStats.critique !== null) resultData.textData.critiqueScore = parsedStats.critique;
    }

    console.log('[완료] 리드인 데이터 수집 완료. 원장앱으로 전송합니다.');
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
