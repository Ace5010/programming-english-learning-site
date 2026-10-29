import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = JSON.parse(await readFile('artifacts/mobile-audit/programming-review-fixture.json', 'utf8'));
const output = 'artifacts/review-card-examples-20261029';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(fixture => {
 window.qaAudio = [];
 const originalPlay = HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play = function() { this.addEventListener('playing', () => window.qaAudio.push({ rate: this.playbackRate, src: this.currentSrc })); return originalPlay.call(this); };
 if (!sessionStorage.getItem('review-compact-qa')) {
  localStorage.setItem('codewords-programming-course-v1', fixture.course);
  localStorage.setItem('codewords-review-v1', fixture.review);
  localStorage.setItem('codewords-section', 'programming');
  sessionStorage.setItem('review-compact-qa', '1');
 }
}, fixture);
try {
 await page.goto('http://localhost:5186/');
 await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '复习', exact: true }).click();
 const panel = page.locator('.review-vocabulary');
 await panel.locator('.word-card').first().waitFor();
 assert.equal(await panel.locator('.word-card').count(), 12);
 const originalProgress = await page.evaluate(() => localStorage.getItem('codewords-review-v1'));
 const firstId = await panel.locator('.word-card').first().getAttribute('data-word-id');
 await page.getByRole('button', { name: '下一页', exact: true }).first().click();
 assert.notEqual(await panel.locator('.word-card').first().getAttribute('data-word-id'), firstId);
 const pageSelect = page.getByLabel('已学词汇页码').first();
 const lastPage = await pageSelect.locator('option').last().getAttribute('value');
 await pageSelect.selectOption(lastPage);
 assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).first().isDisabled(), true);
 await page.getByLabel('搜索已学词汇', { exact: true }).fill('file');
 assert.ok(await panel.locator('.word-card').count() > 0);
 await page.getByLabel('清除已学词搜索').click();
 assert.equal(await panel.locator('.word-card').first().getAttribute('data-word-id'), firstId);
 await page.getByLabel('复习词汇范围').selectOption('scheduled');
 await page.getByLabel('复习词汇范围').selectOption('all');
 const row = panel.locator('.word-card').first();
 assert.equal(await row.locator('details').count(), 0);
 assert.equal(await row.locator('.example').isVisible(), true);
 await row.getByRole('button', { name: /^慢速朗读例句/ }).click();
 await page.waitForFunction(() => window.qaAudio.some(a => a.rate === .72));
 assert.equal(await page.evaluate(() => window.qaAudio.some(a => a.rate === .72)), true);
 await row.getByRole('button', { name: /^朗读单词/ }).click();
 await page.waitForFunction(() => window.qaAudio.at(-1)?.rate === 1);
 assert.equal(await page.evaluate(() => window.qaAudio.at(-1)?.rate === 1), true);
 const star = row.locator('.favorite'), wasFavorite = await star.getAttribute('aria-pressed');
 await star.click();
 assert.notEqual(await star.getAttribute('aria-pressed'), wasFavorite);
 await star.click();
 assert.equal(await page.evaluate(() => localStorage.getItem('codewords-review-v1')), originalProgress);
 for (const width of [1440, 1024, 760, 390, 320]) {
  await page.setViewportSize({ width, height: width < 800 ? 844 : 1000 });
  for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
   await page.getByLabel('界面配色', { exact: true }).selectOption(theme);
   const metrics = await panel.evaluate(panel => {
    const visible = el => el.checkVisibility() && el.getBoundingClientRect().width && el.getBoundingClientRect().height;
    const bad = [...panel.querySelectorAll('button, select, input, summary')].filter(visible).filter(el => { const b = el.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1; }).map(el => el.textContent);
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, columns: getComputedStyle(panel.querySelector(".word-grid")).gridTemplateColumns.split(" ").length, rowHeight: panel.querySelector('.word-card').getBoundingClientRect().height, bad };
   });
   assert.equal(metrics.columns, width >= 1280 ? 3 : width >= 640 ? 2 : 1);
   assert.ok(metrics.documentWidth <= width + 1, JSON.stringify(metrics));
   assert.deepEqual(metrics.bad, [], JSON.stringify(metrics));
   assert.equal(await panel.locator('.example:visible').count(), await panel.locator('.word-card').count());
   results.push({ theme, ...metrics });
   await page.evaluate(() => scrollTo(0, 0));
   if (theme === 'lagoon' || width === 390) await page.screenshot({ path: `${output}/${theme}-${width}.png` });
  }
 }
 await page.setViewportSize({ width: 390, height: 844 });
 await row.scrollIntoViewIfNeeded();
 await page.screenshot({ path: `${output}/example-expanded-390.png` });
 await row.getByRole('button', { name: /^练习 / }).click();
 await page.locator('.lesson-overlay').waitFor();
 assert.deepEqual(errors, []);
 await writeFile(`${output}/results.json`, JSON.stringify({ checks: ['pagination, last page, search reset, filter reset', 'visible examples and real audio normal/slow playback', 'favorite toggle with review data preserved', 'single word practice opens', '20 viewport/palette overflow checks'], results, errors }, null, 2));
 console.log(JSON.stringify({ checks: 'passed', results }));
} finally { await browser.close(); }
