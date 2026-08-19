const puppeteer = require('puppeteer');
const path = require('path');

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
    const searchUrl = `https://www.readin.co.kr/admin/dashboard/readTherapy/list?text=${encodeURIComponent(name)}&keyword=-1&bookLevel=-1&status=1&classRoomId=-1&count=100&page=1`;
    
    console.log("Navigating to:", searchUrl);
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });

    // Wait for input field
    await page.waitForSelector('input', { timeout: 5000 });
    
    // Dump current HTML structure of search container
    const formsHTML = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return {
        inputs: inputs.map(i => ({ id: i.id, className: i.className, placeholder: i.placeholder, value: i.value })),
        buttons: buttons.map(b => ({ className: b.className, text: b.innerText, tag: b.tagName }))
      };
    });
    
    console.log("DOM inputs and buttons:", JSON.stringify(formsHTML, null, 2));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

run();
