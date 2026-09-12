import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const siteUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
const externalHttpRequests = [];
const sameOriginRequests = [];

page.on('request', (request) => {
  const raw = request.url();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const url = new URL(raw);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalHttpRequests.push(raw);
    else sameOriginRequests.push(url.pathname);
  }
});
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${siteUrl}/png-to-avif/`, { waitUntil: 'networkidle' });
  await page.getByText('Converter build: png-avif-v1-wasm').waitFor();

  const inlineScripts = await page.locator('script:not([src])').count();
  assert.equal(inlineScripts, 0, 'PNG to AVIF page should not use inline scripts');

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 160, 100);
    const gradient = ctx.createLinearGradient(30, 20, 130, 80);
    gradient.addColorStop(0, '#ff7a18');
    gradient.addColorStop(1, '#2f80ed');
    ctx.fillStyle = gradient;
    ctx.fillRect(30, 20, 100, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(50, 35, 60, 30);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  await page.locator('[data-png-file]').setInputFiles({
    name: 'png-to-avif-smoke.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64')
  });

  await page.locator('[data-convert]').click();
  await page.getByText('Conversion complete.').waitFor({ timeout: 15000 });

  const result = await page.locator('[data-result]').evaluate(async (element) => {
    const link = element.querySelector('[data-download]');
    const response = await fetch(link.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const box = new TextDecoder('ascii').decode(bytes.subarray(4, 8));
    const header = new TextDecoder('ascii').decode(bytes.subarray(8, Math.min(64, bytes.length)));
    const image = new Image();
    const decoded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Generated AVIF could not be decoded.'));
    });
    image.src = link.href;
    const decodedImage = await decoded;
    const canvas = document.createElement('canvas');
    canvas.width = decodedImage.naturalWidth;
    canvas.height = decodedImage.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decodedImage, 0, 0);
    const cornerAlpha = ctx.getImageData(0, 0, 1, 1).data[3];
    const centerAlpha = ctx.getImageData(80, 50, 1, 1).data[3];
    return {
      mime: blob.type,
      size: blob.size,
      box,
      header,
      dimensions: { width: decodedImage.naturalWidth, height: decodedImage.naturalHeight },
      cornerAlpha,
      centerAlpha,
      elapsed: Number(element.dataset.conversionElapsedMs),
      downloadName: link.download
    };
  });

  assert.equal(result.mime, 'image/avif');
  assert.ok(result.size > 0, 'AVIF output should not be empty');
  assert.equal(result.box, 'ftyp', 'AVIF should begin with an ftyp box');
  assert.match(result.header, /avif|avis/, 'AVIF brand should be present');
  assert.deepEqual(result.dimensions, { width: 160, height: 100 });
  assert.equal(result.downloadName, 'png-to-avif-smoke.avif');
  assert.ok(result.cornerAlpha <= 5, `transparent corner alpha should be preserved; got ${result.cornerAlpha}`);
  assert.ok(result.centerAlpha >= 250, `opaque center alpha should remain opaque; got ${result.centerAlpha}`);
  assert.ok(result.elapsed > 0 && result.elapsed < 10000, `elapsed < 10000; got ${result.elapsed}ms`);
  assert.ok(sameOriginRequests.includes('/assets/vendor/jsquash-avif/avif_enc.js'), 'self-hosted AVIF encoder JS should load');
  assert.ok(sameOriginRequests.includes('/assets/vendor/jsquash-avif/avif_enc.wasm'), 'self-hosted AVIF encoder WASM should load');
  assert.deepEqual(externalHttpRequests, [], `Runtime made third-party HTTP(S) requests:\n${externalHttpRequests.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
  assert.deepEqual(pageErrors, [], `Page errors:\n${pageErrors.join('\n')}`);

  await page.locator('[data-convert-another]').click();
  assert.equal(await page.locator('[data-result]').isHidden(), true, 'reset should hide the result');

  console.log(`PNG to AVIF browser smoke passed in ${result.elapsed}ms with ${result.size} output bytes, transparent alpha ${result.cornerAlpha}, and zero third-party HTTP(S) requests.`);
} finally {
  await browser.close();
}
