import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const fixture = process.env.HEIC_FIXTURE || '/tmp/image1.heic';
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const baseOrigin = new URL(baseUrl).origin;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

const consoleMessages = [];
const requestUrls = [];
page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`));
page.on('request', (request) => requestUrls.push(request.url()));
page.on('requestfailed', (request) => consoleMessages.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText || ''}`));

try {
  await page.goto(`${baseUrl}/heic-to-jpg/`, { waitUntil: 'networkidle', timeout: 30000 });

  const thirdPartyDecoderRequests = requestUrls.filter((url) => /jsdelivr|unpkg|libheif-js/i.test(url) && !url.startsWith(baseOrigin));
  assert.deepEqual(thirdPartyDecoderRequests, [], `decoder must be same-origin, saw ${JSON.stringify(thirdPartyDecoderRequests)}`);

  const localDecoderRequest = requestUrls.find((url) => url.startsWith(`${baseOrigin}/assets/vendor/libheif/libheif-bundle.mjs`));
  assert.ok(localDecoderRequest, `self-hosted decoder request missing. requests=${JSON.stringify(requestUrls)}`);

  try {
    await page.waitForFunction(() => window.libheif && typeof window.libheif.HeifDecoder === 'function', null, { timeout: 30000 });
  } catch (error) {
    const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((el) => el.src));
    const moduleState = await page.evaluate(() => ({
      libheifType: typeof window.libheif,
      libheifKeys: window.libheif ? Object.keys(window.libheif).slice(0, 20) : []
    }));
    throw new Error(`libheif did not load. scripts=${JSON.stringify(scripts)} moduleState=${JSON.stringify(moduleState)} requests=${JSON.stringify(requestUrls)} console=${JSON.stringify(consoleMessages)}`);
  }

  await page.setInputFiles('[data-heic-file]', fixture);
  await page.locator('[data-quality]').evaluate((el) => {
    el.value = '90';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 12000 });
  const elapsed = Date.now() - started;

  const build = await page.locator('[data-build-version]').textContent();
  const resultHidden = await page.locator('[data-result]').evaluate((el) => el.hidden);
  const previewSrc = await page.locator('[data-preview]').getAttribute('src');
  const downloadHref = await page.locator('[data-download]').getAttribute('href');
  const progress = await page.locator('[data-progress-percent]').textContent();
  const resultSize = await page.locator('[data-result-size]').textContent();

  assert.equal(build?.trim(), 'Converter build: heic-v11-selfhosted');
  assert.equal(resultHidden, false, 'result must be visible after success');
  assert.ok(previewSrc?.startsWith('blob:'), 'preview must use a generated blob URL');
  assert.ok(downloadHref?.startsWith('blob:'), 'download must use a generated blob URL');
  assert.equal(progress?.trim(), '100%');
  assert.match(resultSize || '', /JPG/);
  assert.match(resultSize || '', /\d+\s×\s\d+/);
  assert.ok(elapsed < 10000, `conversion took ${elapsed}ms; target is under 10000ms`);

  console.log(`HEIC smoke conversion passed in ${elapsed}ms: ${resultSize}`);

  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), true, 'result must hide after reset');
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null, 'download href must clear after reset');
} finally {
  await browser.close();
}
