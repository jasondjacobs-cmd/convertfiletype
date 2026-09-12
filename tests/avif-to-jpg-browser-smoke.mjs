import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:4173';
const FIXTURE = 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAJbAAABmAACAAAAAQAAAa4AAACtAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAAoAAAAGQAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAJNbWRhdBIACgYYHafxsKgyoAFENACCFME8YjfxwnJCj3Sc+ufK2DSFaT8AHkzUvO4P4b7s5+hioF6iUIDlFZx6ESNwXv+1PB2FMtp7Pr7xL4eujrLdYtxFnS2xhiwS/7ZzySBhYUa5H84mO0VsclsWlcfjMosXzTedRpao0KABldN0KS/uMDz/UcKte8KFDWE4VApQ1rAKzA2q/kFTWq6wCyiuTSUU6iig///wAwAFGFvIEgAKCRgdp/G0QENBoTKIA0Q8eHhmUBhhh+EAAACAwhEUs2sHXyPP++rPFmSGTYv5xyQkQq+4jvJ/t8E5UnT5zSEFN3Lb7+Ka85wBfcfqqRA1m0Skq7Ors0f/2vyDYI05BUZqbx0wCRkSBu4ugRXTF7v4KPweaVcEvyIN890QqQUTf9HdOPhIrT1vpruO80oPvCogxIKvBRL7Wkf6fMUpr+tALXomoiHvnDQ2C9gk+PnnJBW4K5/yW3JtXVp/EKMbruaHC1w5smunYpTgxTu+zwsp7QhzKt4MYJBEyB8NrbwcA8qo81wlSOTRk+GD+JfSq8OiqyE6jB1+UO/1xugtQ5AmrxZ7Hy+qwhuAFy8E9803weBaHDBDSGhSuGpypte3ZaK/2VmuI8ojZbcYWDG6VgzyqqsUHmte1qZvxHMufuHDVuOAF1c2pCAupP6uKDxcW+4hsAaJA0Wg+U9cyRCY5q/bd/Bakq0m7XukBvgKalY948BMHeHeqcxWef/EYMP/WB4///+vrfFqCa/8woOZf7N5nVKB12PK';
const fixturePath = '/tmp/avif-to-jpg-fixture.avif';
fs.writeFileSync(fixturePath, Buffer.from(FIXTURE, 'base64'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${SITE_URL}/avif-to-jpg/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('script:not([src])').count(), 0, 'inline scripts are not allowed');
  await page.waitForFunction(() => !document.querySelector('[data-status]').textContent.includes('Checking AVIF support'), null, { timeout: 5000 });
  const supportStatus = await page.locator('[data-status]').textContent();
  assert.ok(!supportStatus.includes('cannot decode AVIF'), `Chromium must support AVIF for this smoke: ${supportStatus}`);

  await page.locator('[data-avif-file]').setInputFiles(fixturePath);
  const started = Date.now();
  await page.locator('[data-convert]').click();
  await page.locator('[data-status]').getByText('Conversion complete.', { exact: true }).waitFor({ timeout: 10000 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 10000, `conversion exceeded 10 seconds: ${elapsed}ms`);
  assert.equal(await page.locator('[data-build-version]').textContent(), 'Converter build: avif-jpg-v1-native');
  assert.ok(await page.locator('[data-result]').isVisible());
  assert.match(await page.locator('[data-download]').getAttribute('download'), /\.jpg$/i);
  assert.equal(await page.locator('[data-progress-percent]').textContent(), '100%');

  const output = await page.locator('[data-download]').evaluate(async (anchor) => {
    const response = await fetch(anchor.href);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = new Image();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const corner = [...ctx.getImageData(0, 0, 1, 1).data];
    URL.revokeObjectURL(url);
    return { type: blob.type, size: blob.size, head: [...bytes.slice(0, 3)], width: image.naturalWidth, height: image.naturalHeight, corner };
  });

  assert.equal(output.type, 'image/jpeg');
  assert.ok(output.size > 0);
  assert.deepEqual(output.head, [255, 216, 255]);
  assert.equal(output.width, 160);
  assert.equal(output.height, 100);
  assert.ok(output.corner[0] >= 235 && output.corner[1] >= 235 && output.corner[2] >= 235, `transparent corner should use white fill: ${output.corner}`);

  await page.locator('[data-background]').selectOption('black');
  const blackStarted = Date.now();
  await page.locator('[data-convert]').click();
  await page.locator('[data-status]').getByText('Conversion complete.', { exact: true }).waitFor({ timeout: 10000 });
  assert.ok(Date.now() - blackStarted < 10000, 'black-background conversion exceeded 10 seconds');
  const blackCorner = await page.locator('[data-download]').evaluate(async (anchor) => {
    const blob = await (await fetch(anchor.href)).blob();
    const image = new Image();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixel = [...ctx.getImageData(0, 0, 1, 1).data];
    URL.revokeObjectURL(url);
    return pixel;
  });
  assert.ok(blackCorner[0] <= 20 && blackCorner[1] <= 20 && blackCorner[2] <= 20, `transparent corner should use black fill: ${blackCorner}`);

  await page.locator('[data-convert-another]').click();
  assert.ok(await page.locator('[data-result]').isHidden());
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`);
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
  console.log(`AVIF to JPG browser smoke passed in ${elapsed}ms.`);
} finally {
  await browser.close();
}