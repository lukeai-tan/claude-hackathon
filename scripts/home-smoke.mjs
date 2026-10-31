import {chromium} from '../source-code/OpenSlides/.qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4173');
 await assert.equal(await page.title(),'OpenSuite');
 assert.equal(await page.locator('[data-app]').count(),2);
 assert.match(await page.locator('[data-app="openpdf"]').getAttribute('href'),/OpenPDF.exe$/);
 assert.equal(await page.locator('[data-app="openslides"]').getAttribute('href'),'./OpenSlides/');
 await page.screenshot({path:'opensuite-home-web.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'opensuite-home-mobile.png',fullPage:true});
 await page.addInitScript(()=>{window.calls=[];window.openSuite={launch:async id=>{window.calls.push(id);return {message:'Opened '+id}},openExternal:async url=>window.calls.push(url)};});
 await page.reload();
 await page.locator('[data-app="openpdf"]').click();
 await page.locator('[data-app="openslides"]').click();
 assert.deepEqual(await page.evaluate(()=>window.calls),['openpdf','openslides']);
 assert.deepEqual(errors,[]);
 console.log('Homepage: browser downloads, app routing, desktop bridge and mobile layout passed.');
}finally{await browser.close();}
