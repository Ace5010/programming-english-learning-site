import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openSettings, closeSettings, chooseTheme } from './helpers/settings-browser.mjs';
import { vocabulary } from '../src/vocabulary.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { DAILY_KEY, createDailyProgress, createDailySession, parseDailyProgress } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { REVIEW_KEY } from '../src/review.ts';
import { SYNC_KEYS } from '../src/syncProtocol.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/unified-settings-20261101/browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [], errors = [], geometry = [], playback = [];
async function open(seed = {}, width = 1440, height = 960) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seed => {
    if (!sessionStorage.getItem('settings-test')) {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
      sessionStorage.setItem('settings-test', '1');
    }
    window.settingsMedia = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { window.settingsMedia.push(this); return play.apply(this, args); };
  }, seed);
  await page.goto(baseURL);
  await page.locator('.site-header .settings-trigger').waitFor();
  return { page, context };
}
const nav = (page, name) => page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click();
const section = (page, name) => page.getByRole('group', { name: '学习分区', exact: true }).getByRole('button', { name, exact: true }).click();
const snapshot = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), SYNC_KEYS);
async function scenario(name, run) {
  if (process.env.CODEWORDS_SCENARIO && !new RegExp(process.env.CODEWORDS_SCENARIO).test(name)) return;
  try { await run(); results.push(name); console.log(`PASS ${name}`); }
  catch (error) {
    failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.stack}`);
    const page = browser.contexts().at(-1)?.pages().at(-1);
    if (page) await page.screenshot({ path: path.join(output, `failure-${failures.length}.png`) });
  } finally { for (const context of browser.contexts()) await context.close(); }
}
async function layout(page, label, mobile) {
  const report = await page.evaluate(() => {
    const dialog = document.querySelector('.settings-dialog'), rect = dialog.getBoundingClientRect();
    const outside = [...dialog.querySelectorAll('button,input,select,textarea')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < rect.left - 1 || box.right > rect.right + 1);
    }).map(element => element.textContent || element.getAttribute('aria-label'));
    return { viewport: { width: innerWidth, height: innerHeight }, box: rect.toJSON(), outside, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  geometry.push({ label, ...report });
  assert.deepEqual(report.outside, [], label); assert.equal(report.overflow, false, label);
  if (mobile) { assert.equal(report.box.x, 0); assert.equal(report.box.y, 0); assert.equal(report.box.width, report.viewport.width); }
  else { assert.ok(Math.abs(report.box.x + report.box.width / 2 - report.viewport.width / 2) <= 1); assert.ok(Math.abs(report.box.y + report.box.height / 2 - report.viewport.height / 2) <= 1); }
}
async function exportRecord(page, name) {
  const dialog = await openSettings(page, 'data');
  await dialog.getByRole('button', { name: '导出学习记录', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name, exact: true }).click()]);
  return await readFile(await download.path(), 'utf8');
}
function dailyDraftSeed() {
  const lesson = adaptiveDailyLessons.find(lesson => lesson.exercises.some(task => task.kind === 'fill'));
  const task = lesson.exercises.find(task => task.kind === 'fill'), now = Date.now();
  const ids = task.knowledgeIds, known = [...new Set([...ids, ...(task.prerequisiteIds ?? [])])];
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(known.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } };
  const raw = JSON.stringify(progress); assert.equal(parseDailyProgress(raw, adaptiveDailyLessons).writable, true);
  return { 'codewords-section': 'daily', [DAILY_KEY]: raw };
}
try {
  await scenario('centered desktop and full-screen mobile categories in all palettes', async () => {
    const { page } = await open();
    for (const size of [{ width: 1440, height: 960 }, { width: 760, height: 640 }, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
        await chooseTheme(page, theme);
        const dialog = await openSettings(page);
        assert.equal(await dialog.getAttribute('data-page'), size.width <= 680 ? 'overview' : 'audio');
        await layout(page, `${size.width}/${theme}/initial`, size.width <= 680);
        if (theme === 'lagoon') await page.screenshot({ path: path.join(output, `initial-${size.width}.png`) });
        for (const category of ['audio', 'appearance', 'data']) {
          await openSettings(page, category); await layout(page, `${size.width}/${theme}/${category}`, size.width <= 680);
          if (category === 'appearance' && [1440, 320].includes(size.width)) await page.screenshot({ path: path.join(output, `${category}-${theme}-${size.width}.png`) });
        }
        await dialog.getByRole('button', { name: /^设备同步/ }).click();
        await dialog.getByRole('button', { name: '输入已有同步码', exact: true }).click();
        await layout(page, `${size.width}/${theme}/sync`, size.width <= 680);
        await dialog.getByRole('button', { name: '返回学习数据', exact: true }).click();
        await dialog.getByRole('button', { name: '导出学习记录', exact: true }).click();
        await layout(page, `${size.width}/${theme}/export`, size.width <= 680);
        await closeSettings(page);
      }
    }
  });
  await scenario('preferences persist, real previews do not change autoplay speed, library filter survives', async () => {
    const { page } = await open({ 'codewords-favorites': '[1,2]', 'codewords-foundation-v1': '{"legacy":"preserved"}' });
    await nav(page, '词汇库'); await page.getByLabel('搜索当前列表').fill('function');
    const before = await snapshot(page);
    const dialog = await openSettings(page, 'audio');
    await dialog.getByLabel('点读声音', { exact: true }).selectOption('guy');
    await dialog.getByLabel('自动播放语速').selectOption('slow');
    await dialog.getByRole('switch', { name: '练习提示音' }).uncheck();
    for (const name of ['正常试听', '慢速试听']) {
      await page.evaluate(() => { window.settingsMedia = []; });
      await dialog.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(() => window.settingsMedia.some(audio => !audio.paused && audio.currentTime > .05 && !audio.error));
      assert.equal(await dialog.getByLabel('自动播放语速').inputValue(), 'slow');
      await dialog.getByRole('button', { name, exact: true, pressed: true }).waitFor();
      playback.push(await page.evaluate(name => ({ name, files: window.settingsMedia.map(audio => ({ source: new URL(audio.currentSrc || audio.src).pathname, time: audio.currentTime, rate: audio.playbackRate })) }), name));
    }
    await chooseTheme(page, 'mint');
    assert.equal(await page.getByLabel('搜索当前列表').inputValue(), 'function');
    assert.equal(await page.evaluate(() => window.settingsMedia.every(audio => audio.paused)), true);
    assert.deepEqual(await snapshot(page), before);
    await page.reload();
    await openSettings(page, 'audio');
    assert.equal(await dialog.getByLabel('点读声音', { exact: true }).inputValue(), 'guy');
    assert.equal(await dialog.getByLabel('自动播放语速').inputValue(), 'slow');
    assert.equal(await dialog.getByRole('switch', { name: '练习提示音' }).isChecked(), false);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'mint');
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
    assert.equal(await page.locator('.site-header .settings-trigger').evaluate(element => element === document.activeElement), true);
    await openSettings(page); await page.mouse.click(5, 5); assert.equal(await dialog.count(), 0);
  });
  await scenario('review question and typed draft survive settings, keyboard trapping, Escape and reload', async () => {
    const now = Date.now(), word = vocabulary[0];
    const skill = extra => ({ level: 3, streak: 1, intervalDays: 1, dueAt: now + 86400000, lastPracticedAt: now - 86400000, lastSuccessDay: '', lastFailureDay: '', needsPractice: false, ...extra });
    const { page } = await open({ 'codewords-mastered': JSON.stringify([word.id]), [REVIEW_KEY]: JSON.stringify({ version: 1, words: { [word.id]: { meaning: skill(), listening: skill(), context: skill(), spelling: skill({ dueAt: 0, needsPractice: true }) } } }) });
    await nav(page, '复习'); await page.getByRole('button', { name: '开始到期复习', exact: true }).click();
    const input = page.locator('.lesson-exercise-dictation input').first(); await input.fill('my draft');
    const before = await page.evaluate(() => sessionStorage.getItem('codewords-review-session-v1'));
    await chooseTheme(page, 'sky');
    const dialog = await openSettings(page, 'audio'); await dialog.getByLabel('点读声音', { exact: true }).selectOption('guy');
    await dialog.getByLabel('自动播放语速').selectOption('slow');
    for (let i = 0; i < 12; i++) { await page.keyboard.press(i % 3 === 0 ? 'Shift+Tab' : 'Tab'); assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true); }
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0); assert.equal(await page.locator('.lesson-overlay').isVisible(), true);
    assert.equal(await input.inputValue(), 'my draft'); assert.equal(await page.evaluate(() => sessionStorage.getItem('codewords-review-session-v1')), before);
    assert.equal(await page.locator('.lesson-overlay .settings-trigger').evaluate(element => element === document.activeElement), true);
    await page.screenshot({ path: path.join(output, 'review-after-settings.png') });
    await page.reload(); assert.equal(await input.inputValue(), 'my draft');
    await page.setViewportSize({ width: 320, height: 640 }); await openSettings(page, 'appearance'); await page.keyboard.press('Escape');
    assert.equal(await input.inputValue(), 'my draft');
  });
  await scenario('daily question and draft stay unchanged across appearance and sound settings', async () => {
    const { page } = await open(dailyDraftSeed(), 390, 844);
    const input = page.locator('#daily-content .daily-question input').first(); await input.fill('draft');
    const before = await page.evaluate(key => localStorage.getItem(key), DAILY_KEY);
    await chooseTheme(page, 'pearl'); const dialog = await openSettings(page, 'audio');
    await dialog.getByLabel('点读声音', { exact: true }).selectOption('guy'); await closeSettings(page);
    assert.equal(await input.inputValue(), 'draft'); assert.equal(await page.evaluate(key => localStorage.getItem(key), DAILY_KEY), before);
    await page.reload(); assert.equal(await input.inputValue(), 'draft');
  });
  await scenario('global export preserves unvisited and damaged records, then retains recovery after visiting', async () => {
    const dailyRaw = '{broken daily original', programmingRaw = '{broken programming original';
    const { page } = await open({ 'codewords-section': 'foundation', [DAILY_KEY]: dailyRaw, [PROGRAMMING_COURSE_KEY]: programmingRaw, 'codewords-favorites': '[2,9]' });
    assert.equal(await exportRecord(page, '导出日常英语记录'), dailyRaw);
    const programming = JSON.parse(await exportRecord(page, '导出编程英语记录'));
    assert.equal(programming[PROGRAMMING_COURSE_KEY], programmingRaw); assert.equal(programming['codewords-favorites'], '[2,9]');
    await closeSettings(page); await section(page, '日常英语');
    const daily = JSON.parse(await exportRecord(page, '导出日常英语记录')); assert.equal(daily.savedRaw, dailyRaw); assert.ok(daily.warning);
    await closeSettings(page); await section(page, '编程英语');
    const recovered = JSON.parse(await exportRecord(page, '导出编程英语记录')); assert.equal(recovered[PROGRAMMING_COURSE_KEY], programmingRaw); assert.equal(recovered.courseRecovery.savedRaw, programmingRaw);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), DAILY_KEY), dailyRaw);
  });
  await scenario('export from another section includes a newer unsaved daily draft after storage failure', async () => {
    const { page } = await open(dailyDraftSeed());
    const before = await page.evaluate(key => localStorage.getItem(key), DAILY_KEY);
    await page.evaluate(key => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) throw new DOMException('isolated test quota', 'QuotaExceededError'); return set.call(this, name, value); };
    }, DAILY_KEY);
    await page.locator('#daily-content .daily-question input').first().fill('unsaved draft');
    await page.locator('#daily-content [role="alert"]').waitFor(); await section(page, '英语基础');
    const exported = JSON.parse(await exportRecord(page, '导出日常英语记录'));
    assert.equal(exported.savedRaw, before); assert.equal(exported.currentProgress.session.draft.blanks[0], 'unsaved draft'); assert.ok(exported.warning);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), DAILY_KEY), before);
  });
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ baseURL, results, failures, errors, geometry, playback, note: 'Isolated Chrome profiles; no personal records or native Android installation used.' }, null, 2));
}
assert.deepEqual(failures, []); assert.deepEqual(errors, []);
console.log(`PASS ${results.length} unified settings scenarios.`);
