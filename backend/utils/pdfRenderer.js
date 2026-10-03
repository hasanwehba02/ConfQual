const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class PdfTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PdfTimeoutError';
    }
}

const RENDER_TIMEOUT_MS = 30000;

let browserPromise = null;

function findExecutableOnPath(name, env = process.env) {
    return String(env.PATH || '')
        .split(path.delimiter)
        .map(directory => path.join(directory, name))
        .find(candidate => fs.existsSync(candidate));
}

function getLaunchOptions(env = process.env) {
    if (!env.DYNO) return { headless: 'new' };

    const executablePath = findExecutableOnPath('chrome', env);
    return {
        headless: 'new',
        executablePath,
        args: ['--no-sandbox']
    };
}

function isBrowserConnected(browser) {
    if (typeof browser?.connected === 'boolean') return browser.connected;
    if (typeof browser?.isConnected === 'function') return browser.isConnected();
    return false;
}

async function getBrowser() {
    if (!browserPromise) {
        browserPromise = puppeteer.launch(getLaunchOptions()).catch(error => {
            browserPromise = null;
            throw error;
        });
    }
    const browser = await browserPromise;
    if (!isBrowserConnected(browser)) {
        browserPromise = puppeteer.launch(getLaunchOptions()).catch(error => {
            browserPromise = null;
            throw error;
        });
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

module.exports = { renderPdf, PdfTimeoutError, getLaunchOptions, isBrowserConnected };
