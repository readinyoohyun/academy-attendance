const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function run() {
  const userDataPath = path.join(__dirname, 'chrome-profile');
  const name = "나연우";
  
  console.log("Launching browser in headful mode to perform native search...");
  const browser = await puppeteer.launch({
    headless: false, // Run headful so we can see
    userDataDir: userDataPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    const searchUrl = `https://www.readin.co.kr/admin/dashboard/readTherapy/list?text=${encodeURIComponent(name)}&keyword=-1&bookLevel=-1&status=1&classRoomId=-1&count=100&page=1`;
    
    console.log("Navigating to list page...");
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Type name natively
    console.log("Focusing and typing name natively...");
    const inputSelector = 'input[placeholder*="이름"], input[placeholder*="검색"], input[type="text"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    
    // Clear and type
    await page.click(inputSelector, { clickCount: 3 }); // select all
    await page.keyboard.press('Backspace');
    await page.type(inputSelector, name);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Click search button natively
    console.log("Finding and clicking search button natively...");
    const searchBtnHandle = await page.evaluateHandle(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements.find(el => {
        const txt = (el.innerText || '').trim();
        return (txt === '검색' || txt.includes('검색')) && txt.length < 15 && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA';
      });
    });
    
    if (searchBtnHandle) {
      const btn = searchBtnHandle.asElement();
      if (btn) {
        await btn.click();
        console.log("Clicked search button.");
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 4000)); // wait for search

    // Save screenshot of search results
    await page.screenshot({ path: path.join(__dirname, 'debug_native_search.png') });
    console.log("Saved debug_native_search.png");

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
      console.log("Current URL after click:", page.url());
      await page.screenshot({ path: path.join(__dirname, 'debug_after_click.png') });
      console.log("Saved debug_after_click.png");
      
      const bodyText = await page.evaluate(() => document.body.innerText);
      fs.writeFileSync(path.join(__dirname, 'detail_body.txt'), bodyText);
      console.log("Saved detail_body.txt text dump.");
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
