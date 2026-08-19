const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function run() {
  const userDataPath = path.join(__dirname, 'chrome-profile');
  const name = "나연우";
  
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: userDataPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Go to student search page directly, let it redirect to login
    console.log("Navigating directly to student search page...");
    const searchUrl = `https://www.readin.co.kr/admin/dashboard/readTherapy/list?text=&keyword=-1&bookLevel=-1&status=1&classRoomId=-1&count=100&page=1`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("URL after direct navigation:", page.url());
    
    // Check if redirected to login page
    if (page.url().includes('/login') || await page.$('input[type="password"]')) {
      console.log("Confirmed: on login page. Waiting for password input...");
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      
      console.log("Filling credentials natively...");
      const idSelector = 'input[placeholder*="아이디"], input[type="text"]';
      const pwSelector = 'input[placeholder*="비밀번호"], input[type="password"]';
      
      await page.focus(idSelector);
      await page.click(idSelector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type(idSelector, "chaegbingsu");
      
      await page.focus(pwSelector);
      await page.click(pwSelector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type(pwSelector, "kmh86226886");
      
      console.log("Clicking login button...");
      const loginBtnHandle = await page.evaluateHandle(() => {
        return document.querySelector('.login-btn, button[type="submit"]') || 
               Array.from(document.querySelectorAll('a')).find(el => el.innerText && el.innerText.includes('로그인'));
      });
      
      if (loginBtnHandle) {
        await loginBtnHandle.asElement().click();
        console.log("Clicked login button. Waiting for redirect...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log("Current URL after login attempt:", page.url());
    
    // Go to student search page again to make sure
    console.log("Navigating to student search page again...");
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await page.screenshot({ path: path.join(__dirname, 'debug_native_search.png') });
    console.log("Saved debug_native_search.png. Current URL is:", page.url());

    // Natively type name and search
    console.log("Performing native search for student name...");
    const inputSelector = 'input[placeholder*="이름"], input[placeholder*="검색"], input[type="text"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    await page.focus(inputSelector);
    await page.click(inputSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(inputSelector, name);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find and click search button
    const searchBtnHandle = await page.evaluateHandle(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements.find(el => {
        const txt = (el.innerText || '').trim();
        return (txt === '검색' || txt.includes('검색')) && txt.length < 15 && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA';
      });
    });
    if (searchBtnHandle) {
      await searchBtnHandle.asElement().click();
      console.log("Clicked search button.");
    }
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Save screenshot after search
    await page.screenshot({ path: path.join(__dirname, 'debug_after_search.png') });
    console.log("Saved debug_after_search.png");

    // Click student card
    console.log("Clicking student card...");
    const clicked = await page.evaluate((targetName) => {
      const containers = Array.from(document.querySelectorAll('.student-card, .card, table tr, .list-table tr, tbody tr, li'));
      const matches = containers.filter(el => (el.innerText || '').includes(targetName));
      if (matches.length > 0) {
        const target = matches[0];
        const link = target.querySelector('a, button') || target;
        link.click();
        return true;
      }
      return false;
    }, name);

    if (clicked) {
      console.log("Clicked card, waiting for navigation...");
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log("URL after navigation:", page.url());
      
      const detailBody = await page.evaluate(() => document.body.innerText);
      fs.writeFileSync(path.join(__dirname, 'detail_body.txt'), detailBody);
      console.log("Saved detail_body.txt text dump.");
      
      // Save screenshot
      await page.screenshot({ path: path.join(__dirname, 'debug_detail_scraped.png') });
      console.log("Saved debug_detail_scraped.png");

    } else {
      console.log("Student card not found!");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

run();
