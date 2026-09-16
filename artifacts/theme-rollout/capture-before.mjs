import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel:'chrome', headless:true });
const page = await browser.newPage({ viewport:{width:1440,height:1000}, reducedMotion:'reduce' });
const errors=[];
page.on('pageerror', error=>errors.push(error.message));
try {
  await page.addInitScript(()=>{
    const OriginalAudio=window.Audio;
    window.__themeAudio=[];
    window.Audio=function(...args){ const audio=new OriginalAudio(...args); window.__themeAudio.push(audio); return audio; };
  });
  await page.goto('http://localhost:5186/');
  await page.locator('.word-card').last().waitFor();
  assert.equal(await page.locator('.word-card').count(),10);
  for(const width of [1440,1920]){
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:fileURLToPath(new URL(`before-today-${width}.png`,import.meta.url))});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'词库',exact:true}).click();
  assert.equal(await page.locator('.word-card').count(),24);
  await page.screenshot({path:fileURLToPath(new URL('before-library-1440.png',import.meta.url))});
  await page.getByLabel('搜索当前列表',{exact:true}).fill('file');
  await page.getByRole('button',{name:'朗读单词 file',exact:true}).click();
  await page.waitForFunction(()=>window.__themeAudio.some(audio=>!audio.paused&&audio.currentTime>0));
  await page.getByRole('button',{name:'语音设置',exact:true}).click();
  await page.screenshot({path:fileURLToPath(new URL('before-settings-1440.png',import.meta.url))});
  await page.getByRole('button',{name:'关闭语音设置',exact:true}).click();
  await page.evaluate(()=>localStorage.setItem('codewords-mastered','[1,2,3,21,29]'));
  await page.reload();
  await page.getByRole('button',{name:'复习练习',exact:true}).click();
  await page.locator('.lesson-exercise').waitFor();
  await page.screenshot({path:fileURLToPath(new URL('before-practice-1440.png',import.meta.url))});
  assert.deepEqual(errors,[]);
  await writeFile(new URL('baseline-browser.json',import.meta.url),JSON.stringify({browser:await browser.version(),url:page.url(),today:10,libraryInitial:24,audio:'real word playback passed',errors},null,2));
  console.log('Baseline captured: today 1440/1920, library, settings, real audio, practice.');
} finally { await browser.close(); }
