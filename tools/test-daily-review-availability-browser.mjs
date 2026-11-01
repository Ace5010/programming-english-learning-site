import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { createDailyProgress } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning } from '../src/adaptiveLearning.ts';
const { chromium } = createRequire(import.meta.url)(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/daily-review-availability-20261029';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
try {
  for (const [mode, width, theme] of [['skipped', 1440, 'lagoon'], ['taught', 390, 'lagoon'], ['skipped', 320, 'mint'], ['skipped', 390, 'sky'], ['skipped', 390, 'pearl']]) {
    if (process.env.CODEWORDS_REVIEW_WIDTHS && !process.env.CODEWORDS_REVIEW_WIDTHS.split(',').includes(String(width))) continue;
    let progress = createDailyProgress();
    progress.session = planAdaptiveSession(progress, lessons, Date.now(), () => .37);
    const ids = progress.session.adaptive.focusIds;
    if (mode === 'taught') progress = beginAdaptiveLearning(progress, lessons);
    const expected = lessons.flatMap(item => item.phrases).filter(item => ids.includes(item.id));
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ progress, theme }) => {
      if (!sessionStorage.getItem('review-test')) {
        localStorage.setItem('codewords-section', 'daily'); localStorage.setItem('codewords-theme', theme);
        localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
        localStorage.setItem('codewords-mastered', '[1]'); sessionStorage.setItem('review-test', '1');
      }
      window.audioEvents = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(...args) {
        this.addEventListener('playing', () => window.audioEvents.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch }), { once: true });
        return play.apply(this, args);
      };
    }, { progress, theme });
    await page.goto(baseURL);
    const main = page.locator('#daily-content');
    if (mode === 'skipped') {
      await main.getByRole('button', { name: '这些我都会，跳过本课', exact: true }).click();
      await main.getByText('已标记为已会，可在复习中回看。', { exact: true }).waitFor();
    }
    await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '复习', exact: true }).click();
    const rows = main.locator('.expression-review .daily-expression');
    await rows.first().waitFor();
    assert.equal(await rows.count(), new Set(expected.map(item => item.id)).size);
    assert.equal(await rows.getByText(mode === 'skipped' ? '已会' : '待巩固', { exact: true }).count(), await rows.count());
    const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
    assert.ok(Object.values(savedBefore.learning.targets).every(item => item.readyAt === 0));
    if (mode === 'skipped') assert.equal(Object.keys(savedBefore.knowledge ?? {}).length, 0);
    await rows.first().getByRole('button', { name: /^朗读 / }).click();
    await page.waitForFunction(() => window.audioEvents.some(item => item.rate === 1));
    await rows.first().getByRole('button', { name: /慢速/ }).click();
    await page.waitForFunction(() => window.audioEvents.some(item => item.rate === 1 && item.src.includes('/slow/') && item.pitch));
    const playbackEvidence = await page.evaluate(() => window.audioEvents);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1'))), savedBefore);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/${mode}-${width}-${theme}.png`, fullPage: true });
    await page.reload(); await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '复习', exact: true }).click(); await rows.first().waitFor();
    assert.equal(await rows.count(), new Set(expected.map(item => item.id)).size);
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-mastered')), '[1]');
    await rows.first().getByRole('button', { name: '练习相关词汇' }).click();
    if (await main.locator('.daily-notice').count()) {
      // Existing unfinished learning must be explicitly replaced by the learner.
      await main.getByRole('button', { name: /^开始“/ }).click();
    }
    await main.locator('.daily-question').waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
    assert.equal(saved.session.mode, 'review'); assert.ok(saved.session.queue.length);
    results.push({ mode, width, theme, words: ids.length, audio: playbackEvidence });
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ results, errors }, null, 2)); }
console.log(JSON.stringify({ passed: results.length, errors }));
