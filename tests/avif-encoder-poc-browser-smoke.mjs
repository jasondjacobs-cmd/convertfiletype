import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const siteUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const thirdPartyRequests = [];
const consoleErrors = [];
const pageErrors = [];

page.on('request', (request) => {
  const url = new URL(request.url());
  if (!['http:', 'https:'].includes(url.protocol)) return;
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) thirdPartyRequests.push(request.url());
});
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${siteUrl}/experiments/avif-encoder/`, { waitUntil: 'networkidle' });
  await page.getByText('Converter build: avif-encoder-poc-v1').waitFor();

  const jpegBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 160, 100);
    gradient.addColorStop(0, '#ff7a18');
    gradient.addColorStop(1, '#2f80ed');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 160, 100);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('AVIF', 48, 58);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  });

  await page.locator('[data-jpeg-file]').setInputFiles({
    name: 'avif-proof.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpegBase64, 'base64')
  });

  await page.locator('[data-run-proof]').click();
  await page.getByText('AVIF encoder proof passed.').waitFor({ timeout: 30000 });

  const result = await page.locator('[data-result]').evaluate(async (element) => {
    const link = element.querySelector('[data-download]');
    const response = await fetch(link.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = new TextDecoder('ascii').decode(bytes.subarray(4, Math.min(40, bytes.length)));
    const image = new Image();
    const decoded = new Promise((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Generated AVIF could not be decoded.'));
    });
    image.src = link.href;
    const dimensions = await decoded;
    return {
      mime: blob.type,
      size: blob.size,
      header,
      dimensions,
      elapsedMs: Number(element.dataset.proofElapsedMs),
      downloadName: link.download
    };
  });

  assert.equal(result.mime, 'image/avif');
  assert.ok(result.size > 0, 'AVIF output should not be empty');
  assert.ok(result.header.startsWith('ftyp'), 'AVIF should contain an ftyp box');
  assert.match(result.header, /avif|avis/, 'AVIF brand should be present');
  assert.deepEqual(result.dimensions, { width: 160, height: 100 });
  assert.equal(result.downloadName, 'avif-proof.avif');
  assert.ok(result.elapsedMs > 0 && result.elapsedMs < 10000, `AVIF proof should finish under 10s; got ${result.elapsedMs}ms`);
  assert.deepEqual(thirdPartyRequests, [], `Runtime made third-party requests:\n${thirdPartyRequests.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
  assert.deepEqual(pageErrors, [], `Page errors:\n${pageErrors.join('\n')}`);

  console.log(`AVIF encoder proof passed in ${result.elapsedMs}ms with ${result.size} output bytes and zero third-party runtime requests.`);
} finally {
  await browser.close();
}
