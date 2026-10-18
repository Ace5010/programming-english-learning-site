// Theme regression uses disposable Chrome contexts and native media playback.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'Use the existing Vite address in CODEWORDS_TEST_URL.');
const out = process.env.CODEWORDS_QA_DIR;
assert.ok(out, 'Set CODEWORDS_QA_DIR for reviewable theme screenshots.');
await mkdir(out, { recursive: true });
const source = await readFile(new URL('../src/vocabulary.ts', import.meta.url), 'utf8');
const vocabulary = JSON.parse(source.slice(source.indexOf('= [') + 2).trim().replace(/;$/, ''));
const longest = vocabulary.reduce((a, b) => a.word.length > b.word.length ? a : b);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const themes = ['minimal', 'sketch', 'print', 'graffiti'];
const results = [], errors = [];
async function open(reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__themeAudio = [];
    window.Audio = function(...args) { const audio = new NativeAudio(...args); window.__themeAudio.push(audio); return audio; };
  });
  await page.goto(baseURL);
  await page.locator('.word-card').first().waitFor();
  return { page, context };
}
async function choose(page, value) {
  const picker = page.locator('.lesson-overlay').getByLabel('界面风格', { exact: true });
  if (await picker.count()) await picker.selectOption(value);
  else await page.locator('.site-header').getByLabel('界面风格', { exact: true }).selectOption(value);
  assert.equal(await page.locator('html').getAttribute('data-theme'), value);
}
const records = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key !== 'codewords-theme').sort().map(key => [key, localStorage.getItem(key)])));
async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Document overflow');
  const overflow = await page.locator('.word-card,.word-button,.example,.library-tools,.lesson-content,.lesson-header-inner,.theme-picker').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 1).map(node => node.className));
  assert.deepEqual(overflow, [], `Component overflow: ${overflow}`);
}
async function settled(page) {
  await page.waitForFunction(() => document.querySelector('.main-nav').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running'));
}
try {
  {
    const { page, context } = await open();
    await page.evaluate(() => {
      localStorage.setItem('codewords-mastered', '[2,3]');
      localStorage.setItem('codewords-favorites', '[1,49]');
      localStorage.setItem('codewords-voice', 'guy');
      localStorage.setItem('codewords-playback-speed', 'slow');
      localStorage.setItem('codewords-quiz-sessions', '7');
      localStorage.setItem('codewords-quiz-last-tested', '{"2":123456789}');
      localStorage.setItem('codewords-review-v1', '{"version":1,"words":{}}');
      localStorage.setItem('unrelated-user-preference', 'keep');
    });
    await page.reload();
    await page.getByRole('button', { name: '词库', exact: true }).click();
    await page.getByLabel('词汇分类', { exact: true }).selectOption('操作系统与文件');
    await page.getByLabel('词汇级别', { exact: true }).selectOption('核心');
    await page.getByLabel('搜索当前列表', { exact: true }).fill('file');
    const before = await records(page);
    for (const theme of themes) {
      await choose(page, theme);
      assert.deepEqual(await records(page), before, 'Theme changed learning records');
      assert.equal(await page.getByLabel('搜索当前列表', { exact: true }).inputValue(), 'file');
      assert.equal(await page.getByLabel('词汇分类', { exact: true }).inputValue(), '操作系统与文件');
      assert.equal(await page.getByLabel('词汇级别', { exact: true }).inputValue(), '核心');
      await page.getByRole('button', { name: '朗读单词 file', exact: true }).click();
      await page.waitForFunction(() => { const audio=window.__themeAudio.at(-1); return audio && !audio.paused && audio.currentTime>0; });
      const audio = await page.evaluate(() => { const audio=window.__themeAudio.at(-1); return {src:audio.src,rate:audio.playbackRate}; });
      assert.ok(audio.src.includes('/audio/guy/word-49.mp3'));
      assert.equal(audio.rate, .72);
      await page.getByRole('button', { name: '朗读单词 file', exact: true }).click();
    }
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'graffiti');
    assert.deepEqual(await records(page), before, 'Reload changed learning records');
    await page.getByRole('button', { name: '词库', exact: true }).click();
    assert.equal(await page.locator('.word-card').count(), 24);
    await page.getByRole('button', { name: '再显示 24 个', exact: true }).click();
    await choose(page, 'minimal');
    assert.equal(await page.locator('.word-card').count(), 48, 'Theme reset pagination');
    results.push('Four themes retain all learning keys, voice/speed, filters, search and pagination; native media works; theme survives reload.');
    await context.close();
  }
  {
    const { page, context } = await open();
    for (const theme of themes) {
      await choose(page, theme);
      await settled(page);
      await page.getByRole('button', { name: '词库', exact: true }).click();
      const moving = await page.locator('.main-nav').evaluate(nav => nav.getAnimations({ subtree: true }).some(a => a.playState === 'running'));
      assert.equal(moving, true, `${theme}: navigation motion missing`);
      assert.equal(await page.locator('.page-heading h1').innerText(), '词库');
      await page.evaluate(() => {
        const buttons=[...document.querySelectorAll('.main-nav .nav-item')];
        for(let i=0;i<20;i++) buttons[i%4].click();
      });
      await settled(page);
      assert.equal(await page.locator('.nav-item[aria-current="page"]').getAttribute('aria-label'), '已掌握');
      assert.equal(await page.locator('.empty-state').isVisible(), true);
      await page.getByRole('button', { name:'今日学习', exact:true }).click();
      for (const width of [1440, 1920, 1024, 820, 600, 390, 320]) {
        await page.setViewportSize({ width, height:1000 });
        await settled(page);
        await page.evaluate(async () => { await document.fonts.ready; });
        await fits(page);
        const marker = await page.locator('.main-nav').evaluate(nav => {
          const button=nav.querySelector('[aria-current="page"]').getBoundingClientRect();
          const mark=nav.querySelector('.nav-marker').getBoundingClientRect();
          return { x:Math.abs(button.x-mark.x), width:Math.abs(button.width-mark.width) };
        });
        assert.ok(marker.x<2 && marker.width<2, `${theme}/${width}: marker ${JSON.stringify(marker)}`);
        if ([1440,1920,390].includes(width)) await page.screenshot({ path:path.join(out,`${theme}-today-${width}.png`) });
      }
      await page.getByRole('button', { name:'词库', exact:true }).click();
      await page.getByLabel('搜索当前列表',{exact:true}).fill(longest.word);
      await fits(page);
      await page.setViewportSize({ width:1440, height:1000 });
      await page.getByRole('button',{ name:'今日学习', exact:true }).click();
      await page.getByRole('button',{ name:'语音设置', exact:true }).click();
      await page.screenshot({ path:path.join(out,`${theme}-settings-1440.png`) });
      await page.getByRole('button',{ name:'关闭语音设置', exact:true }).click();
    }
    await page.emulateMedia({ reducedMotion:'reduce' });
    for(const theme of themes){
      await choose(page,theme);
      await page.getByRole('button',{name:'词库',exact:true}).click();
      assert.equal(await page.locator('.main-nav').evaluate(nav=>nav.getAnimations({subtree:true}).length),0);
      await page.getByRole('button',{name:'今日学习',exact:true}).click();
    }
    results.push('Four distinct navigation effects respond immediately and cancel rapid clicks; 7 widths and longest word fit; live reduced motion suppresses all nav effects.');
    await context.close();
  }
  {
    const { page, context } = await open('reduce');
    await page.evaluate(() => {
      const skill=extra=>({level:0,streak:0,intervalDays:0,dueAt:0,lastPracticedAt:0,lastSuccessDay:'',lastFailureDay:'',needsPractice:false,...extra});
      localStorage.setItem('codewords-mastered','[2]');
      localStorage.setItem('codewords-review-v1',JSON.stringify({version:1,words:{2:{meaning:skill({dueAt:Date.now()+86400000}),spelling:skill({level:2})}}}));
    });
    await page.reload();
    await page.getByRole('button',{name:'复习练习',exact:true}).click();
    await page.locator('.lesson-exercise-dictation').waitFor();
    await page.keyboard.type('ra');
    const task = await page.locator('.lesson-count').innerText();
    const before = await records(page);
    for (const theme of themes) {
      await choose(page,theme);
      assert.equal(await page.locator('.lesson-count').innerText(),task);
      assert.deepEqual(await page.locator('.lesson-letter-input').evaluateAll(inputs=>inputs.map(input=>input.value)),['r','a','','','']);
      assert.deepEqual(await records(page),before);
      await page.locator('.lesson-theme-picker select').dispatchEvent('keydown',{key:'Enter',bubbles:true});
      assert.equal(await page.locator('.lesson-feedback').count(),0,'Theme select submitted an answer');
      for(const width of [1440,1920,390,320]){
        await page.setViewportSize({width,height:1000});
        await fits(page);
        await page.screenshot({path:path.join(out,`${theme}-practice-${width}.png`)});
      }
    }
    await page.locator('.lesson-letter-input').nth(2).focus();
    await page.keyboard.type('nch');
    await page.keyboard.press('Enter');
    await page.locator('.lesson-feedback').waitFor();
    assert.equal(await page.locator('.lesson-feedback strong').innerText(),'正确');
    for(const theme of themes){
      await choose(page,theme);
      assert.equal(await page.locator('.lesson-feedback strong').innerText(),'正确');
      await page.setViewportSize({width:1440,height:1000});
      await page.screenshot({path:path.join(out,`${theme}-feedback-1440.png`)});
    }
    await page.getByRole('button',{name:'继续',exact:true}).click();
    assert.notEqual(await page.locator('.lesson-count').innerText(),task);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.lesson-overlay').count(),0);
    results.push('Theme changes preserve the actual dictation task, all answers, feedback and learning records; select Enter does not submit; keyboard check/continue and Escape still work.');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'theme-results.json'),JSON.stringify({browser:await browser.version(),baseURL,results,errors},null,2));
  console.log(`THEME BROWSER PASS: ${results.length} scenario groups; screenshots and evidence: ${out}`);
} finally { await browser.close(); }
