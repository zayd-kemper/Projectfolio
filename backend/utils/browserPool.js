const puppeteer = require('puppeteer');

let browserPromise = null;
const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).then((browser) => {
      browser.on('disconnected', () => { browserPromise = null; });
      return browser;
    }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
};

const allowedBrowserRequest = (url) => {
  if (!url || url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    if (['data:', 'blob:'].includes(parsed.protocol)) return true;
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase().endsWith('res.cloudinary.com');
  } catch {
    return false;
  }
};

const withPage = async (operation) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['media', 'websocket', 'script', 'xhr', 'fetch', 'eventsource'].includes(request.resourceType())) return request.abort();
      if (!allowedBrowserRequest(request.url())) return request.abort();
      return request.continue();
    });
    return await operation(page);
  } finally {
    await page.close().catch(() => {});
  }
};

const closeBrowser = async () => {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => {});
};

module.exports = { getBrowser, withPage, closeBrowser };
