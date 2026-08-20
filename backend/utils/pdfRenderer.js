const puppeteer = require('puppeteer');

class PdfTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PdfTimeoutError';
    }
}

const RENDER_TIMEOUT_MS = 30000;

let browserPromise = null;

async function getBrowser() {
    if (!browserPromise) {
        browserPromise = puppeteer.launch({ headless: 'new' });
    }
    const browser = await browserPromise;
    if (!browser.isConnected()) {
        browserPromise = puppeteer.launch({ headless: 'new' });
        return browserPromise;
    }
    return browser;
}

async function renderPdf(html) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    let timeoutId;
    try {
        const renderPromise = (async () => {
            await page.setContent(html, { waitUntil: 'networkidle0' });
            return page.pdf({ format: 'A4', printBackground: true });
        })();

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new PdfTimeoutError('PDF generation timed out')), RENDER_TIMEOUT_MS);
        });

        return await Promise.race([renderPromise, timeoutPromise]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        if (page && !page.isClosed()) {
            await page.close().catch(() => {});
        }
    }
}

module.exports = { renderPdf, PdfTimeoutError };
