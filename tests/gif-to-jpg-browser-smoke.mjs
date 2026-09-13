import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const fixture = '/tmp/gif-to-jpg-fixture.gif';
const consoleMessages = [];
const externalHttpRequests = [];
page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`));
page.on('request', (request) => {
  const url = new URL(request.url());
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== new URL(baseUrl).origin) externalHttpRequests.push(request.url());
});

try {
  // Real 2×2 GIF89a: white/red pixels, decoded by Chromium rather than a mocked image path.
  const gifBase64 = 'R0lGODlhAgACAIAAAP///wAAACH5BAEAAAAALAAAAAACAAIAAAIDhI9WADs=';
  await writeFile(fixture, Buffer.from(gifBase64, 'base64'));
  await page.goto(`${baseUrl}/gif-to-jpg/`, { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(await page.locator('script:not([src])').count(), 0, 'converter page must not require inline scripts');
  await page.setInputFiles('[data-gif-file]', fixture);
  await page.locator('[data-quality]').evaluate((el) => { el.value = '90'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-background]').selectOption('white');
  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 10000 });
  const elapsed = Date.now() - started;
  const build = await page.locator('[data-build-version]').textContent();
  const resultSize = await page.locator('[data-result-size]').textContent();
  const downloadName = await page.locator('[data-download]').getAttribute('download');
  assert.equal(build?.trim(), 'Converter build: gif-jpg-v1-native');
  assert.match(downloadName || '', /\.jpg$/i);
  assert.match(resultSize || '', /JPG/);
  assert.match(resultSize || '', /2\s×\s2/);
  assert.ok(elapsed < 10000, `conversion took ${elapsed}ms; target is under 10000ms`);
  const output = await page.evaluate(async () => {
    const link = document.querySelector('[data-download]');
    const response = await fetch(link.href); const blob = await response.blob(); const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = document.querySelector('[data-preview]');
    return { type: blob.type, size: blob.size, first: bytes[0], second: bytes[1], third: bytes[2], width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.equal(output.type, 'image/jpeg'); assert.ok(output.size > 0); assert.deepEqual([output.first, output.second, output.third], [0xff, 0xd8, 0xff]); assert.equal(output.width, 2); assert.equal(output.height, 2);
  assert.deepEqual(externalHttpRequests, [], `third-party runtime requests: ${JSON.stringify(externalHttpRequests)}`);
  const siteErrors = consoleMessages.filter((message) => /\[error\]|\[pageerror\]/i.test(message));
  assert.deepEqual(siteErrors, [], `site-origin browser errors: ${JSON.stringify(siteErrors)}`);
  console.log(`GIF to JPG smoke conversion passed in ${elapsed}ms: ${resultSize}`);
  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), true);
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null);
} finally { await browser.close(); }
