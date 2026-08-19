const puppeteer = require('puppeteer');
const path = require('path');

async function run() {
  const userDataPath = path.join(__dirname, 'chrome-profile');
  
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
    
    console.log("Navigating to login page...");
    await page.goto("https://www.readin.co.kr/member/login", { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    
    console.log("Typing ID and PW...");
    await page.focus('input[type="text"]');
    await page.click('input[type="text"]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input[type="text"]', "chaegbingsu");
    
    await page.focus('input[type="password"]');
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input[type="password"]', "kmh86226886");
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log("Clicking login button natively...");
    await page.click('.login-btn');
    
    // Wait for the popup and click "확인" or "닫기"
    console.log("Waiting for popup and clicking confirm...");
    await new Promise(r => setTimeout(r, 1500));
    
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const confirmBtn = buttons.find(b => b.innerText && (b.innerText.includes('확인') || b.innerText.includes('닫기')));
      if (confirmBtn) {
        confirmBtn.click();
        console.log("Clicked popup confirm button!");
      }
    });

    console.log("Waiting for navigation...");
    await new Promise(r => setTimeout(r, 6000));
    
    console.log("URL after login:", page.url());
    await page.screenshot({ path: path.join(__dirname, 'debug_login_result.png') });
    console.log("Saved debug_login_result.png");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

run();
