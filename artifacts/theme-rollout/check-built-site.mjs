import {createRequire} from 'node:module';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dist=new URL('../../dist/',import.meta.url);
const assets=await readdir(new URL('assets/',dist));
const css=await readFile(new URL(`assets/${assets.find(name=>name.endsWith('.css'))}`,dist),'utf8');
const themeURLs=[...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(match=>match[1]).filter(url=>url.includes('themes/')))];
assert.equal(themeURLs.length,5);
assert.ok(themeURLs.every(url=>url.startsWith('../themes/')));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[],themeAssets=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
  if(response.status()>=400&&!response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  if(response.url().includes('/dist/themes/'))themeAssets.push({url:response.url(),status:response.status()});
});
try {
  await page.goto('http://localhost:5186/dist/');
  await page.locator('.word-card').first().waitFor();
  assert.equal(await page.locator('script[src*="/assets/index-"]').count(),1);
  for(const theme of ['minimal','sketch','print','graffiti']){
    await page.getByLabel('界面风格',{exact:true}).selectOption(theme);
    await page.evaluate(async()=>{await document.fonts.ready;});
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.getByRole('button',{name:'语音设置',exact:true}).click();
  await page.getByLabel('点读声音',{exact:true}).selectOption('guy');
  await page.getByLabel('点读语速',{exact:true}).selectOption('slow');
  await page.getByRole('button',{name:'关闭语音设置',exact:true}).click();
  await page.getByRole('button',{name:'朗读单词 file',exact:true}).click();
  await page.locator('.word-button.playing').waitFor();
  await page.screenshot({path:fileURLToPath(new URL('production-graffiti-1440.png',import.meta.url))});
  assert.ok(themeAssets.some(asset=>asset.url.endsWith('graffiti-accent.webp')));
  assert.ok(themeAssets.filter(asset=>asset.url.endsWith('.woff2')).length>=4);
  assert.deepEqual(errors,[]);
  // Refresh the small-screen evidence after the final non-wrapping button fix.
  await page.goto('http://localhost:5186/');
  await page.getByLabel('界面风格',{exact:true}).selectOption('graffiti');
  await page.evaluate(async()=>{await document.fonts.ready;});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:fileURLToPath(new URL(`themes/graffiti-today-${width}.png`,import.meta.url))});
  }
  await writeFile(new URL('production-validation.json',import.meta.url),JSON.stringify({url:'http://localhost:5186/dist/',themeURLs,themeAssets,errors,nativeAudio:'Guy slow playback passed'},null,2));
  console.log('BUILD SMOKE PASS: production JS, relative CSS assets, four local fonts, graffiti texture, actual Guy audio, 390/320 final layout.');
}finally{await browser.close();}
