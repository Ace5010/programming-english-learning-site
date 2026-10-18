import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dailyKnowledgeReviewable, parseDailyProgress } from '../src/dailyProgress.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(url, /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = 'artifacts/palette-rollout/interface';
await mkdir(output, { recursive: true });
const earned = JSON.parse(await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8'));
const seed = { 'codewords-daily-v1': earned.daily.course, 'codewords-programming-course-v1': earned.programming.course, 'codewords-review-v1': earned.programming.review, 'codewords-favorites': '[1,2]', 'codewords-theme': 'minimal' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(seed => { if (!sessionStorage.getItem('palette-test')) { Object.entries(seed).forEach(([k,v]) => localStorage.setItem(k,v)); sessionStorage.setItem('palette-test','1'); } }, seed);
const snapshot = () => page.evaluate(keys => Object.fromEntries(keys.map(k => [k,localStorage.getItem(k)])), Object.keys(seed).filter(k => k !== 'codewords-theme'));
const nav = name => page.getByRole('navigation', { name:'学习导航' }).getByRole('button', { name, exact:true });
try {
  await page.goto(url); await page.locator('.course-current').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'lagoon');
  const baseline = await snapshot();
  for (const section of ['日常英语','编程英语']) {
    await page.getByRole('group',{name:'学习分区'}).getByRole('button',{name:section,exact:true}).click();
    for (const view of ['课程','复习',section === '日常英语' ? '词汇库':'词汇库','收藏']) {
      await nav(view).click();
      for (const palette of ['lagoon','pearl','sky','mint']) {
        await page.getByLabel('界面配色',{exact:true}).selectOption(palette);
        await page.waitForTimeout(620);
        assert.deepEqual(await snapshot(),baseline,`${section}/${view}/${palette}: read-only navigation wrote learning state`);
      }
      await page.getByLabel('界面配色',{exact:true}).selectOption('lagoon');
      await page.waitForTimeout(400);
      await page.screenshot({path:`${output}/${section}-${view}.png`,fullPage:true});
      results.push(`${section}/${view}: palettes and data isolation`);
    }
  }
  await page.getByRole('group',{name:'学习分区'}).getByRole('button',{name:'日常英语',exact:true}).click(); await nav('复习').click();
  const progress = parseDailyProgress(earned.daily.course, adaptiveDailyLessons).progress;
  const expected = new Set(adaptiveDailyLessons.flatMap(l => l.learningTargets).filter(id=>dailyKnowledgeReviewable(progress,id)));
  assert.ok(expected.size>0);
  assert.equal(await page.locator('.expression-review .daily-expression').count(),expected.size);
  assert.equal(await page.locator('.expression-review .daily-lesson-row').count(),0);
  await page.locator('.expression-review .primary').click();
  await page.locator('#daily-content .daily-question').waitFor();
  const reviewState = await snapshot();
  const saved = JSON.parse(reviewState['codewords-daily-v1']); assert.equal(saved.session.mode,'review');
  await page.getByLabel('界面配色',{exact:true}).selectOption('mint'); await page.reload(); await nav('复习').click();
  if (await page.locator('.expression-review .primary').isVisible()) await page.locator('.expression-review .primary').click();
  await page.locator('#daily-content .daily-question').waitFor(); assert.deepEqual(await snapshot(),reviewState);
  results.push('daily independent review: admission, resume, refresh without extra answers');
  await page.evaluate(()=>document.querySelector('.section-switch button').click());
  await page.waitForTimeout(80);
  assert.ok(await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running')),'section transition runs');
  await page.waitForTimeout(750);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>document.querySelectorAll('.section-switch button')[2].click());
  await page.waitForTimeout(80); assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  for (const index of [0,1,2,1,0]) { await page.evaluate(i=>document.querySelectorAll('.section-switch button')[i].click(),index); await page.waitForTimeout(20); }
  await page.waitForTimeout(850); assert.equal(await page.locator('.app-shell').getAttribute('data-section'),'programming');
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  results.push('section direction, interrupted transitions, reduced motion');
  assert.deepEqual(errors,[]);
} finally { await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2)); await browser.close(); }
console.log(`PASS ${results.length} palette integration scenarios`);
