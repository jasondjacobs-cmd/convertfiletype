import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const fixturePage = await browser.newPage({ viewport: { width: 120, height: 80 } });
const fixture = '/tmp/png-to-webp-fixture.png';
const consoleMessages = [];
page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`));

try {
  await fixturePage.setContent('<canvas id="c" width="120" height="80"></canvas>');
  const pngBase64 = await fixturePage.evaluate(() => {
    const canvas = document.querySelector('#c');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 120, 80);
    ctx.fillStyle = 'rgba(200,40,60,.65)';
    ctx.fillRect(25, 15, 70, 50);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
  });
  await writeFile(fixture, Buffer.from(pngBase64, 'base64'));
  await fixturePage.close();

  await page.goto(`${baseUrl}/png-to-webp/`, { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(await page.locator('script:not([src])').count(), 0, 'converter page must not require inline scripts');
  await page.setInputFiles('[data-png-file]', fixture);
  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 10000 });
  const elapsed = Date.now() - started;

  assert.equal((await page.locator('[data-build-version]').textContent())?.trim(), 'Converter build: png-webp-v1-native');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), false);
  assert.match(await page.locator('[data-download]').getAttribute('download') || '', /\.webp$/i);
  assert.equal((await page.locator('[data-progress-percent]').textContent())?.trim(), '100%');
  assert.ok(elapsed < 10000, `conversion took ${elapsed}ms; target is under 10000ms`);

  const output = await page.evaluate(async () => {
    const href = document.querySelector('[data-download]').href;
    const blob = await (await fetch(href)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const signature = new TextDecoder('latin1').decode(bytes.slice(0, 12));
    const image = document.querySelector('[data-preview]');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const corner = Array.from(ctx.getImageData(0, 0, 1, 1).data);
    return { type: blob.type, size: blob.size, signature, width: image.naturalWidth, height: image.naturalHeight, corner };
  });

  assert.equal(output.type, 'image/webp');
  assert.ok(output.size > 0);
  assert.equal(output.signature.slice(0, 4), 'RIFF');
  assert.equal(output.signature.slice(8, 12), 'WEBP');
  assert.equal(output.width, 120);
  assert.equal(output.height, 80);
  assert.ok(output.corner[3] <= 5, `transparent corner alpha should be preserved, got ${output.corner}`);

  const siteErrors = consoleMessages.filter((message) => /\[error\]|\[pageerror\]/i.test(message));
  assert.deepEqual(siteErrors, [], `site-origin browser errors: ${JSON.stringify(siteErrors)}`);
  console.log(`PNG to WebP smoke passed in ${elapsed}ms with transparency preserved`);

  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), true);
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null);
} finally {
  await browser.close();
}
