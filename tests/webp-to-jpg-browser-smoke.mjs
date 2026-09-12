import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const fixturePage = await browser.newPage({ viewport: { width: 96, height: 64 } });
const fixture = '/tmp/webp-to-jpg-fixture.webp';

const consoleMessages = [];
page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`));

try {
  await fixturePage.setContent('<canvas id="c" width="96" height="64"></canvas>');
  const base64 = await fixturePage.evaluate(() => {
    const canvas = document.querySelector('#c');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 96, 64);
    ctx.fillStyle = 'rgba(30,120,220,.65)';
    ctx.fillRect(18, 12, 60, 40);
    const dataUrl = canvas.toDataURL('image/webp', 0.9);
    if (!dataUrl.startsWith('data:image/webp;base64,')) throw new Error('Browser did not create WebP fixture');
    return dataUrl.split(',')[1];
  });
  await writeFile(fixture, Buffer.from(base64, 'base64'));
  await fixturePage.close();

  await page.goto(`${baseUrl}/webp-to-jpg/`, { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(await page.locator('script:not([src])').count(), 0, 'converter page must not require inline scripts');

  await page.setInputFiles('[data-webp-file]', fixture);
  await page.locator('[data-quality]').evaluate((el) => {
    el.value = '90';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-background]').selectOption('white');

  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 10000 });
  const elapsed = Date.now() - started;

  const build = await page.locator('[data-build-version]').textContent();
  const resultHidden = await page.locator('[data-result]').evaluate((el) => el.hidden);
  const previewSrc = await page.locator('[data-preview]').getAttribute('src');
  const downloadHref = await page.locator('[data-download]').getAttribute('href');
  const downloadName = await page.locator('[data-download]').getAttribute('download');
  const progress = await page.locator('[data-progress-percent]').textContent();
  const resultSize = await page.locator('[data-result-size]').textContent();

  assert.equal(build?.trim(), 'Converter build: webp-jpg-v1-native');
  assert.equal(resultHidden, false, 'result must be visible after success');
  assert.ok(previewSrc?.startsWith('blob:'), 'preview must use generated blob URL');
  assert.ok(downloadHref?.startsWith('blob:'), 'download must use generated blob URL');
  assert.match(downloadName || '', /\.jpg$/i);
  assert.equal(progress?.trim(), '100%');
  assert.match(resultSize || '', /JPG/);
  assert.match(resultSize || '', /96\s×\s64/);
  assert.ok(elapsed < 10000, `conversion took ${elapsed}ms; target is under 10000ms`);

  const output = await page.evaluate(async () => {
    const link = document.querySelector('[data-download]');
    const response = await fetch(link.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = document.querySelector('[data-preview]');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const corner = Array.from(ctx.getImageData(0, 0, 1, 1).data);
    return { type: blob.type, size: blob.size, first: bytes[0], second: bytes[1], corner, width: image.naturalWidth, height: image.naturalHeight };
  });

  assert.equal(output.type, 'image/jpeg');
  assert.ok(output.size > 0, 'JPG must be non-empty');
  assert.equal(output.first, 0xff, 'JPG SOI byte 1 missing');
  assert.equal(output.second, 0xd8, 'JPG SOI byte 2 missing');
  assert.equal(output.width, 96);
  assert.equal(output.height, 64);

  const [r, g, b] = output.corner;
  const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
  assert.ok(r >= 225 && g >= 225 && b >= 225 && channelSpread <= 25, `transparent corner should remain near-white after lossy JPEG encoding, got ${output.corner}`);

  const siteErrors = consoleMessages.filter((message) => /\[error\]|\[pageerror\]/i.test(message));
  assert.deepEqual(siteErrors, [], `site-origin browser errors: ${JSON.stringify(siteErrors)}`);

  console.log(`WebP smoke conversion passed in ${elapsed}ms: ${resultSize}`);

  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), true, 'result must hide after reset');
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null, 'download href must clear after reset');
} finally {
  await browser.close();
}
