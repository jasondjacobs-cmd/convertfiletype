import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:4173';
const FIXTURE = 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAJbAAABmAACAAAAAQAAAa4AAACtAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAAoAAAAGQAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAJNbWRhdBIACgYYHafxsKgyoAFENACCFME8YjfxwnJCj3Sc+ufK2DSFaT8AHkzUvO4P4b7s5+hioF6iUIDlFZx6ESNwXv+1PB2FMtp7Pr7xL4eujrLdYtxFnS2xhiwS/7ZzySBhYUa5H84mO0VsclsWlcfjMosXzTedRpao0KABldN0KS/uMDz/UcKte8KFDWE4VApQ1rAKzA2q/kFTWq6wCyiuTSUU6iig///wAwAFGFvIEgAKCRgdp/G0QENBoTKIA0Q8eHhmUBhhh+EAAACAwhEUs2sHXyPP++rPFmSGTYv5xyQkQq+4jvJ/t8E5UnT5zSEFN3Lb7+Ka85wBfcfqqRA1m0Skq7Ors0f/2vyDYI05BUZqbx0wCRkSBu4ugRXTF7v4KPweaVcEvyIN890QqQUTf9HdOPhIrT1vpruO80oPvCogxIKvBRL7Wkf6fMUpr+tALXomoiHvnDQ2C9gk+PnnJBW4K5/yW3JtXVp/EKMbruaHC1w5smunYpTgxTu+zwsp7QhzKt4MYJBEyB8NrbwcA8qo81wlSOTRk+GD+JfSq8OiqyE6jB1+UO/1xugtQ5AmrxZ7Hy+qwhuAFy8E9803weBaHDBDSGhSuGpypte3ZaK/2VmuI8ojZbcYWDG6VgzyqqsUHmte1qZvxHMufuHDVuOAF1c2pCAupP6uKDxcW+4hsAaJA0Wg+U9cyRCY5q/bd/Bakq0m7XukBvgKalY948BMHeHeqcxWef/EYMP/WB4///+vrfFqCa/8woOZf7N5nVKB12PK';
const fixturePath = '/tmp/avif-to-webp-fixture.avif';
fs.writeFileSync(fixturePath, Buffer.from(FIXTURE, 'base64'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
const externalHttpRequests = [];
page.on('request', (request) => {
  const raw = request.url();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const url = new URL(raw);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalHttpRequests.push(raw);
  }
});
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${SITE_URL}/avif-to-webp/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('script:not([src])').count(), 0, 'inline scripts are not allowed');
  await page.waitForFunction(() => !document.querySelector('[data-status]').textContent.includes('Checking AVIF support'), null, { timeout: 5000 });
  const supportStatus = await page.locator('[data-status]').textContent();
  assert.ok(!supportStatus.includes('cannot decode AVIF'), `Chromium must support AVIF for this smoke: ${supportStatus}`);

  await page.locator('[data-avif-file]').setInputFiles(fixturePath);
  await page.locator('[data-convert]').click();
  await page.getByText('Conversion complete.', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-build-version]').textContent(), 'Converter build: avif-webp-v1-native');

  const output = await page.locator('[data-result]').evaluate(async (element) => {
    const anchor = element.querySelector('[data-download]');
    const response = await fetch(anchor.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const signature = new TextDecoder('latin1').decode(bytes);
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = anchor.href; });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    const cornerAlpha = ctx.getImageData(0, 0, 1, 1).data[3];
    const centerAlpha = ctx.getImageData(80, 50, 1, 1).data[3];
    return {
      type: blob.type,
      size: blob.size,
      signature,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cornerAlpha,
      centerAlpha,
      elapsed: Number(element.dataset.conversionElapsedMs),
      downloadName: anchor.download
    };
  });

  assert.equal(output.type, 'image/webp');
  assert.ok(output.size > 0);
  assert.ok(output.signature.startsWith('RIFF'));
  assert.equal(output.signature.slice(8, 12), 'WEBP');
  assert.equal(output.width, 160);
  assert.equal(output.height, 100);
  assert.equal(output.downloadName, 'avif-to-webp-fixture.webp');
  assert.ok(output.cornerAlpha <= 5, `transparent corner alpha should be preserved; got ${output.cornerAlpha}`);
  assert.ok(output.centerAlpha >= 245, `opaque center alpha should remain opaque; got ${output.centerAlpha}`);
  assert.ok(output.elapsed > 0 && output.elapsed < 10000, `elapsed < 10000; got ${output.elapsed}ms`);
  assert.deepEqual(externalHttpRequests, [], `Runtime made third-party HTTP(S) requests:\n${externalHttpRequests.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
  assert.deepEqual(pageErrors, [], `Page errors:\n${pageErrors.join('\n')}`);

  await page.locator('[data-convert-another]').click();
  assert.equal(await page.locator('[data-result]').isHidden(), true, 'reset should hide the result');
  console.log(`AVIF to WebP browser smoke passed in ${output.elapsed}ms with ${output.size} output bytes, transparent alpha ${output.cornerAlpha}, and zero third-party HTTP(S) requests.`);
} finally {
  await browser.close();
}
