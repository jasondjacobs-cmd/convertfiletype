import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const baseOrigin = new URL(baseUrl).origin;
const fixture = '/tmp/gif-to-png-fixture.gif';
const transparentGifBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
await writeFile(fixture, Buffer.from(transparentGifBase64, 'base64'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const externalHttpRequests = [];

page.on('request', (request) => {
  const raw = request.url();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const url = new URL(raw);
    if (url.origin !== baseOrigin) externalHttpRequests.push(raw);
  }
});
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${baseUrl}/gif-to-png/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByText('Converter build: gif-png-v1-native').waitFor();
  assert.equal(await page.locator('script:not([src])').count(), 0, 'GIF to PNG page should not use inline scripts');

  await page.setInputFiles('[data-gif-file]', fixture);
  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 10000 });
  const elapsed = Date.now() - started;

  const output = await page.locator('[data-result]').evaluate(async (element) => {
    const link = element.querySelector('[data-download]');
    const response = await fetch(link.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = element.querySelector('[data-preview]');
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    const pixel = Array.from(ctx.getImageData(0, 0, 1, 1).data);
    return {
      mime: blob.type,
      size: blob.size,
      signature: Array.from(bytes.slice(0, 8)),
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel,
      downloadName: link.download,
      elapsed: Number(element.dataset.conversionElapsedMs)
    };
  });

  assert.equal(output.mime, 'image/png');
  assert.ok(output.size > 0, 'PNG output should not be empty');
  assert.deepEqual(output.signature, [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature should be valid');
  assert.equal(output.width, 1);
  assert.equal(output.height, 1);
  assert.equal(output.downloadName, 'gif-to-png-fixture.png');
  assert.ok(output.pixel[3] <= 5, `transparent GIF pixel should remain transparent in PNG, got alpha ${output.pixel[3]}`);
  assert.ok(output.elapsed > 0 && output.elapsed < 10000, `elapsed < 10000; got ${output.elapsed}ms`);
  assert.ok(elapsed < 10000, `browser conversion took ${elapsed}ms; target is under 10000ms`);
  assert.deepEqual(externalHttpRequests, [], `Runtime made third-party HTTP(S) requests:\n${externalHttpRequests.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
  assert.deepEqual(pageErrors, [], `Page errors:\n${pageErrors.join('\n')}`);

  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').isHidden(), true, 'reset should hide the result');
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null, 'reset should clear download href');

  console.log(`GIF to PNG browser smoke passed in ${output.elapsed}ms with transparent alpha ${output.pixel[3]} and zero third-party HTTP(S) requests.`);
} finally {
  await browser.close();
}
