import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const baseUrl=process.env.SITE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const fixturePage=await browser.newPage({viewport:{width:120,height:80}});
const fixture='/tmp/webp-to-png-fixture.webp';
const consoleMessages=[];page.on('console',(msg)=>consoleMessages.push(`[${msg.type()}] ${msg.text()}`));page.on('pageerror',(error)=>consoleMessages.push(`[pageerror] ${error.message}`));
try{
 await fixturePage.setContent('<style>html,body{margin:0;width:120px;height:80px;background:transparent}div{width:72px;height:44px;margin:18px;background:rgba(197,31,47,.65);border:6px solid rgba(23,50,79,.9)}</style><div></div>');
 const buffer=await fixturePage.screenshot({type:'webp',omitBackground:true});
 await import('node:fs/promises').then(fs=>fs.writeFile(fixture,buffer));await fixturePage.close();
 await page.goto(`${baseUrl}/webp-to-png/`,{waitUntil:'networkidle',timeout:30000});assert.equal(await page.locator('script:not([src])').count(),0);
 await page.setInputFiles('[data-webp-file]',fixture);const started=Date.now();await page.click('[data-convert]');await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent==='Conversion complete.',null,{timeout:10000});const elapsed=Date.now()-started;
 assert.equal((await page.locator('[data-build-version]').textContent())?.trim(),'Converter build: webp-png-v1-native');assert.equal(await page.locator('[data-result]').evaluate(el=>el.hidden),false);assert.match(await page.locator('[data-download]').getAttribute('download')||'',/\.png$/i);assert.equal((await page.locator('[data-progress-percent]').textContent())?.trim(),'100%');assert.ok(elapsed<10000,`conversion took ${elapsed}ms`);
 const output=await page.evaluate(async()=>{const href=document.querySelector('[data-download]').href;const blob=await(await fetch(href)).blob();const bytes=new Uint8Array(await blob.arrayBuffer());const image=document.querySelector('[data-preview]');const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const corner=Array.from(ctx.getImageData(0,0,1,1).data);return{type:blob.type,size:blob.size,bytes:Array.from(bytes.slice(0,8)),width:image.naturalWidth,height:image.naturalHeight,corner};});
 assert.equal(output.type,'image/png');assert.ok(output.size>0);assert.deepEqual(output.bytes,[137,80,78,71,13,10,26,10]);assert.equal(output.width,120);assert.equal(output.height,80);assert.ok(output.corner[3]<=5,`transparent corner alpha should be preserved, got ${output.corner}`);
 const siteErrors=consoleMessages.filter(m=>/\[error\]|\[pageerror\]/i.test(m));assert.deepEqual(siteErrors,[]);console.log(`WebP to PNG smoke conversion passed in ${elapsed}ms with transparency preserved`);
 await page.click('[data-convert-another]');assert.equal(await page.locator('[data-result]').evaluate(el=>el.hidden),true);assert.equal(await page.locator('[data-download]').getAttribute('href'),null);
}finally{await browser.close();}