import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const fixture = process.env.HEIC_FIXTURE || '/tmp/image1.heic';
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const baseOrigin = new URL(baseUrl).origin;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const externalHttpRequests = [];
const requestUrls = [];

page.on('request', (request) => {
  const raw = request.url();
  requestUrls.push(raw);
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
  await page.goto(`${baseUrl}/heic-to-webp/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByText('Converter build: heic-webp-v1-libheif').waitFor();

  assert.equal(await page.locator('script:not([src])').count(), 0, 'HEIC to WebP page should not use inline scripts');
  assert.ok(requestUrls.some((url) => url.startsWith(`${baseOrigin}/assets/js/heic-libheif-bootstrap.mjs`)), 'same-origin HEIC bootstrap should load');
  assert.ok(requestUrls.some((url) => url.startsWith(`${baseOrigin}/assets/vendor/libheif/libheif-bundle.mjs`)), 'self-hosted libheif bundle should load');

  await page.waitForFunction(() => window.libheifReady && typeof window.libheifReady.then === 'function', null, { timeout: 5000 });
  await page.evaluate(async () => {
    const libheif = await window.libheifReady;
    if (!libheif || typeof libheif.HeifDecoder !== 'function') throw new Error('HeifDecoder unavailable');
  });

  await page.setInputFiles('[data-heic-file]', fixture);
  assert.equal(await page.locator('[data-quality-output]').textContent(), '85%');
  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 12000 });
  const elapsed = Date.now() - started;

  const output = await page.locator('[data-result]').evaluate(async (element) => {
    const link = element.querySelector('[data-download]');
    const response = await fetch(link.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = new Image();
    const dimensions = await new Promise((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Generated WebP could not be decoded.'));
      image.src = link.href;
    });
    const signature = new TextDecoder('latin1').decode(bytes.slice(0, 12));
    return {
      mime: blob.type,
      size: blob.size,
      signature,
      dimensions,
      downloadName: link.download,
      elapsed: Number(element.dataset.conversionElapsedMs)
    };
  });

  assert.equal(output.mime, 'image/webp');
  assert.ok(output.size > 0, 'WebP output should not be empty');
  assert.ok(output.signature.startsWith('RIFF') && output.signature.slice(8, 12) === 'WEBP', 'WebP RIFF/WEBP signature should be valid');
  assert.ok(output.dimensions.width > 0 && output.dimensions.height > 0, 'WebP dimensions should be valid');
  assert.equal(output.downloadName, 'image1.webp');
  assert.ok(output.elapsed > 0 && output.elapsed < 10000, `elapsed < 10000; got ${output.elapsed}ms`);
  assert.ok(elapsed < 10000, `browser conversion took ${elapsed}ms; target is under 10000ms`);
  assert.deepEqual(externalHttpRequests, [], `Runtime made third-party HTTP(S) requests:\n${externalHttpRequests.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
  assert.deepEqual(pageErrors, [], `Page errors:\n${pageErrors.join('\n')}`);

  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').isHidden(), true, 'reset should hide the result');
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null, 'reset should clear download href');

  console.log(`HEIC to WebP browser smoke passed in ${output.elapsed}ms with ${output.size} output bytes and zero third-party HTTP(S) requests.`);
} finally {
  await browser.close();
}
