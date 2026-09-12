import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const fixturePage = await browser.newPage({ viewport: { width: 120, height: 80 } });
const fixture = '/tmp/jpg-to-png-fixture.jpg';
const consoleMessages = [];
page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`));

try {
  await fixturePage.setContent('<style>html,body{margin:0;width:120px;height:80px;background:#e8eef7}div{width:72px;height:44px;margin:18px;background:#c51f2f;border:6px solid #17324f}</style><div></div>');
  await fixturePage.screenshot({ path: fixture, type: 'jpeg', quality: 90 });
  await fixturePage.close();

  await page.goto(`${baseUrl}/jpg-to-png/`, { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(await page.locator('script:not([src])').count(), 0, 'converter page must not require inline scripts');

  await page.setInputFiles('[data-jpg-file]', fixture);
  const started = Date.now();
  await page.click('[data-convert]');
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Conversion complete.', null, { timeout: 10000 });
  const elapsed = Date.now() - started;

  assert.equal((await page.locator('[data-build-version]').textContent())?.trim(), 'Converter build: jpg-png-v1-native');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), false);
  assert.ok((await page.locator('[data-preview]').getAttribute('src'))?.startsWith('blob:'));
  assert.ok((await page.locator('[data-download]').getAttribute('href'))?.startsWith('blob:'));
  assert.match(await page.locator('[data-download]').getAttribute('download') || '', /\.png$/i);
  assert.equal((await page.locator('[data-progress-percent]').textContent())?.trim(), '100%');
  assert.ok(elapsed < 10000, `conversion took ${elapsed}ms; target is under 10000ms`);

  const output = await page.evaluate(async () => {
    const href = document.querySelector('[data-download]').href;
    const blob = await (await fetch(href)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = document.querySelector('[data-preview]');
    return { type: blob.type, size: blob.size, bytes: Array.from(bytes.slice(0, 8)), width: image.naturalWidth, height: image.naturalHeight };
  });

  assert.equal(output.type, 'image/png');
  assert.ok(output.size > 0);
  assert.deepEqual(output.bytes, [137,80,78,71,13,10,26,10]);
  assert.equal(output.width, 120);
  assert.equal(output.height, 80);

  const siteErrors = consoleMessages.filter((message) => /\[error\]|\[pageerror\]/i.test(message));
  assert.deepEqual(siteErrors, [], `site-origin browser errors: ${JSON.stringify(siteErrors)}`);

  console.log(`JPG to PNG smoke conversion passed in ${elapsed}ms`);

  await page.click('[data-convert-another]');
  assert.equal(await page.locator('[data-result]').evaluate((el) => el.hidden), true);
  assert.equal(await page.locator('[data-download]').getAttribute('href'), null);
} finally {
  await browser.close();
}
