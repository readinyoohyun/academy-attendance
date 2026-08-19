const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function run() {
  const userDataPath = path.join(__dirname, 'chrome-profile');
  const name = "나연우";
  
  console.log("Launching browser in headful mode...");
  const browser = await puppeteer.launch({
    headless: false, // Must be false to use headful session
    userDataDir: userDataPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const searchUrl = `https://www.readin.co.kr/admin/dashboard/readTherapy/list?text=&keyword=-1&bookLevel=-1&status=1&classRoomId=-1&count=100&page=1`;
    console.log("Navigating to list page...");
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Current URL:", page.url());
    if (page.url().includes('/login')) {
      console.log("[WARNING] Not logged in! Please log in manually in the opened browser window within 30 seconds...");
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    // Type natively
    console.log("Focusing and typing student name natively...");
    const inputSelector = 'input[placeholder*="이름"], input[placeholder*="검색"], input[type="text"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.focus(inputSelector);
    await page.click(inputSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(inputSelector, name);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Click search button
    console.log("Clicking search button natively...");
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
    
    await new Promise(resolve => setTimeout(resolve, 4000)); // wait for search results

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
      await new Promise(resolve => setTimeout(resolve, 6000));
      console.log("URL after navigation:", page.url());
      
      const detailBody = await page.evaluate(() => document.body.innerText);
      fs.writeFileSync(path.join(__dirname, 'detail_body.txt'), detailBody);
      console.log("Saved detail_body.txt text dump.");
      
      // Save screenshot
      await page.screenshot({ path: path.join(__dirname, 'debug_detail_scraped.png') });
      console.log("Saved debug_detail_scraped.png");
    } else {
      console.log("Student card not found in list!");
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

run();
