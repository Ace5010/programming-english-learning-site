// Real Chrome E2E in disposable browser contexts; never uses the user's profile.
// Set CODEWORDS_TEST_URL to the running fixed-port server and CODEWORDS_PLAYWRIGHT
// to an existing Playwright package if it is not available by package name.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dailyLessons, dailyUnits, dailyPhrases } from '../src/dailyCourse.ts';
import { createDailyProgress, createDailySession, beginDailyExercises, updateDailyDraft, createDailyDraft, submitDailyAnswer, advanceDailySession, normalizeDailyAnswer, parseDailyProgress } from '../src/dailyProgress.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'CODEWORDS_TEST_URL must identify the existing local server.');
const output = path.resolve('artifacts/daily-english');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const problems = [];
const results = [];
const legacy = { 'codewords-mastered': '[1,2,3,21,29]', 'codewords-favorites': '[17]', 'codewords-quiz-sessions': '3', 'codewords-best-score': '8', 'codewords-quiz-last-tested': '{"17":12345}' };

function validDraft(task) {
  const draft = createDailyDraft(task);
  if (task.kind === 'choice' || task.kind === 'listen') draft.choice = task.answers[0];
  if (task.kind === 'fill') draft.blanks = task.blanks.map(answers => answers[0]);
  if (task.kind === 'write') draft.text = task.answers[0];
  if (task.kind === 'speak') { draft.text = task.sample; draft.checks = task.checks.map(() => true); }
  if (task.kind === 'order') {
    const remaining = new Set(task.options.map((_, index) => index));
    draft.order = task.answers[0].split(' ').map(token => { const index = [...remaining].find(index => task.options[index] === token); assert.notEqual(index, undefined); remaining.delete(index); return index; });
  }
  return draft;
}

async function open({ progress, raw, section = 'daily', viewport = { width: 1440, height: 1000 }, theme = 'minimal', reducedMotion = 'reduce' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error' && !entry.location().url.endsWith('favicon.ico')) problems.push(entry.text()); });
  page.on('dialog', async dialog => { problems.push(`Unexpected dialog: ${dialog.message()}`); await dialog.dismiss(); });
  await page.addInitScript(({ legacy, progress, raw, section, theme }) => {
    if (!sessionStorage.getItem('daily-qa-seeded')) {
      for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
      localStorage.setItem('codewords-section', section);
      localStorage.setItem('codewords-theme', theme);
      if (progress) localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
      if (raw !== undefined) localStorage.setItem('codewords-daily-v1', raw);
      sessionStorage.setItem('daily-qa-seeded', '1');
    }
    const NativeAudio = window.Audio;
    window.__dailyAudio = { items: [], events: [] };
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args);
      window.__dailyAudio.items.push(audio);
      for (const type of ['playing', 'pause', 'ended', 'error']) audio.addEventListener(type, () => window.__dailyAudio.events.push({ type, src: audio.src, rate: audio.playbackRate }));
      return audio;
    }
    TrackedAudio.prototype = NativeAudio.prototype; Object.setPrototypeOf(TrackedAudio, NativeAudio); window.Audio = TrackedAudio;
  }, { legacy, progress, raw, section, theme });
  await page.goto(baseURL);
  await page.locator(section === 'daily' ? '#daily-content' : '#vocabulary-content').waitFor({ state: 'visible' });
  return { context, page };
}

async function saved(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1') || 'null')); }
async function assertLegacy(page) { assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(legacy)), legacy); }
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow'); }
async function scenario(name, options, fn) {
  const env = await open(options);
  try { await fn(env); await assertLegacy(env.page); results.push(name); console.log(`PASS ${name}`); }
  finally { await env.context.close(); }
}

async function answer(page, task, { wrong = false, playAudio = true } = {}) {
  const form = page.locator(`.daily-question[data-exercise-id="${task.id}"]`);
  await form.waitFor();
  if (task.kind === 'listen' && playAudio) {
    const phrase = dailyPhrases.find(item => item.id === task.audioId);
    const start = await page.evaluate(() => window.__dailyAudio.events.length);
    await form.getByRole('button', { name: '听一听', exact: true }).click();
    await page.waitForFunction(({ id, start }) => window.__dailyAudio.events.slice(start).some(event => event.type === 'playing' && event.src.includes(`/${id}.mp3`)), { id: phrase.id, start });
  }
  if (task.kind === 'choice' || task.kind === 'listen') {
    const option = wrong ? task.options.find(option => !task.answers.includes(option)) : task.answers[0];
    await form.getByRole('button', { name: option, exact: true }).click();
  } else if (task.kind === 'fill') {
    for (let i = 0; i < task.blanks.length; i++) await form.getByLabel(`第 ${i + 1} 个空`, { exact: true }).fill(wrong ? 'zz' : task.blanks[i][0]);
  } else if (task.kind === 'order') {
    const draft = validDraft(task);
    for (const index of wrong ? [0] : draft.order) await form.locator('[aria-label="可选词块"] button').nth(index).click();
  } else {
    if (task.kind === 'speak') await form.getByRole('button', { name: '自己表达', exact: true }).click();
    await form.locator('textarea').fill(wrong ? 'zz' : task.kind === 'speak' ? task.sample : task.answers[0]);
    if (task.kind === 'speak') for (const input of await form.locator('input[type=checkbox]').all()) await input.check();
  }
  await page.locator('.daily-controls .primary').click();
  await page.locator('.daily-feedback').waitFor();
  const state = await saved(page);
  assert.equal(state.session.feedback.correct, !wrong, task.id);
  await page.locator('.daily-controls .primary').press('Enter');
}

try {
  // Preserve a screenshot of the pre-existing built product before this turn builds.
  if (!existsSync(path.join(output, 'before-build-1440.png'))) {
    const baseline = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await baseline.goto(new URL('dist/index.html', baseURL).href);
    if (await baseline.locator('.word-card').count()) await baseline.screenshot({ path: path.join(output, 'before-build-1440.png') });
    await baseline.close();
  }

  await scenario('24 real lessons complete through every UI exercise and survive reload', {}, async ({ page }) => {
    for (const [index, lesson] of dailyLessons.entries()) {
      if (index === 0) await page.locator('.daily-lesson-row').first().getByRole('button', { name: '学习', exact: true }).click();
      else await page.getByRole('button', { name: '下一课', exact: true }).click();
      await page.locator('.daily-study-card').waitFor();
      await page.getByRole('button', { name: '开始练习', exact: true }).click();
      for (const task of lesson.exercises) await answer(page, task);
      await page.locator('.daily-summary').waitFor();
      assert.ok((await saved(page)).lessons[lesson.id].completedAt > 0);
      await page.reload();
      await page.locator('.daily-summary').waitFor();
      if (index % 6 === 5) console.log(`Completed unit ${Math.floor(index / 6) + 1}/4`);
    }
    assert.equal(Object.values((await saved(page)).lessons).filter(value => value.completedAt).length, 24);
    await page.getByRole('button', { name: '返回课程', exact: true }).click();
    await page.getByRole('button', { name: '练习册', exact: true }).click();
    await page.getByLabel('练习题型').selectOption('write');
    await page.locator('.daily-lesson-row').filter({ hasText: '这些与那些' }).getByRole('button').click();
    await page.locator('.daily-question').waitFor();
    const before = await saved(page);
    assert.equal(before.session.mode, 'workbook');
    assert.ok(before.session.queue.length < 5);
    await page.reload();
    assert.equal((await saved(page)).session.id, before.session.id);
    await page.locator('.daily-question').waitFor();
    assert.equal(await page.locator('.daily-notice[role=alert]').count(), 0);
    for (const entry of before.session.queue) {
      const task = dailyLessons.flatMap(item => item.exercises).find(item => item.id === entry.exerciseId);
      await answer(page, task);
    }
    await page.locator('.daily-summary').waitFor();
  });

  const fillLesson = dailyLessons.find(item => item.exercises.some(task => task.kind === 'fill' && task.blanks.length >= 2 && task.blanks[0][0].length > 1));
  const fillIndex = fillLesson.exercises.findIndex(task => task.kind === 'fill' && task.blanks.length >= 2 && task.blanks[0][0].length > 1);
  let filled = createDailyProgress(); filled.session = beginDailyExercises(createDailySession(fillLesson));
  for (let index = 0; index < fillIndex; index++) {
    filled.session = updateDailyDraft(filled.session, validDraft(fillLesson.exercises[index]));
    filled = advanceDailySession(submitDailyAnswer(filled, fillLesson), fillLesson);
  }
  await scenario('multi-blank keyboard flow, composition events, themes, section switch and draft restoration', { progress: filled }, async ({ page }) => {
    const task = fillLesson.exercises[fillIndex];
    const form = page.locator('.daily-question');
    const first = form.getByLabel('第 1 个空', { exact: true });
    await first.dispatchEvent('compositionstart');
    await first.fill('我');
    await first.press('Enter');
    assert.equal((await saved(page)).session.feedback, null);
    await first.dispatchEvent('compositionend', { data: '我' });
    await first.fill('');
    await first.pressSequentially(task.blanks[0][0]);
    await first.press('Space');
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), '第 2 个空');
    await page.locator(':focus').pressSequentially(task.blanks[1][0]);
    const draft = (await saved(page)).session.draft;
    await page.reload();
    assert.deepEqual((await saved(page)).session.draft, draft);
    for (const theme of ['sketch', 'print', 'graffiti', 'minimal']) {
      await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
      assert.deepEqual((await saved(page)).session.draft, draft);
      await page.screenshot({ path: path.join(output, `practice-${theme}-1440.png`) });
    }
    await page.getByRole('button', { name: '编程英语', exact: true }).click();
    await page.locator('#vocabulary-content').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '日常英语', exact: true }).click();
    await page.locator('.daily-question').waitFor();
    assert.deepEqual((await saved(page)).session.draft, draft);
    await page.getByRole('button', { name: '课程', exact: true }).click();
    await page.locator('.daily-unit-tabs').waitFor();
    await page.getByRole('button', { name: '继续上次学习', exact: true }).click();
    await page.locator('.daily-question').waitFor();
    assert.deepEqual((await saved(page)).session.draft, draft);
    await first.press('Enter');
    await page.locator('.daily-feedback.correct').waitFor();
    await page.locator('.daily-controls .primary').press('Enter');
    assert.ok((await saved(page)).session.index > fillIndex);
  });

  await scenario('errors append a different recheck; help and same-day review preserve original weakness', {}, async ({ page }) => {
    const lesson = dailyLessons[0];
    await page.locator('.daily-lesson-row').first().getByRole('button').click();
    await page.getByRole('button', { name: '开始练习', exact: true }).click();
    await answer(page, lesson.exercises[0]);
    await answer(page, lesson.exercises[1], { wrong: true });
    assert.ok(Object.keys((await saved(page)).lessons[lesson.id].errors).length > 0);
    while ((await saved(page)).session.stage === 'exercise') {
      const state = await saved(page);
      const entry = state.session.queue[state.session.index];
      const task = [...lesson.exercises, ...lesson.rechecks].find(task => task.id === entry.exerciseId);
      await answer(page, task);
    }
    const state = await saved(page);
    assert.ok(state.session.queue.some(entry => entry.retry));
    assert.equal(state.lessons[lesson.id].errors[lesson.exercises[1].id].resolvedAt, 0);
    await page.reload();
    await page.getByRole('button', { name: '返回课程', exact: true }).click();
    await page.getByRole('button', { name: '复习', exact: true }).click();
    await page.locator('.daily-lesson-row').getByRole('button', { name: '复习', exact: true }).click();
    await page.getByRole('button', { name: '提示', exact: true }).click();
    await page.reload();
    assert.equal((await saved(page)).session.draft.helped, true);
    await page.getByRole('button', { name: '暂时不会', exact: true }).click();
    assert.equal((await saved(page)).session.feedback.outcome, 'revealed');
    await page.screenshot({ path: path.join(output, 'correction-1440.png') });
  });

  const listenLesson = dailyLessons.find(lesson => lesson.exercises[0].kind === 'listen' && dailyPhrases.find(phrase => phrase.id === lesson.exercises[0].audioId).en.length > 35);
  const audioProgress = createDailyProgress();
  audioProgress.session = beginDailyExercises(createDailySession(listenLesson));
  await scenario('switching a currently playing prompt to slow starts real slow audio in one click', { progress: audioProgress }, async ({ page }) => {
    const normal = page.getByRole('button', { name: '听一听', exact: true });
    const slow = page.getByRole('button', { name: '慢速', exact: true });
    await normal.click();
    await page.waitForFunction(() => window.__dailyAudio.events.some(event => event.type === 'playing' && event.rate === 1));
    await slow.click();
    await page.waitForFunction(() => window.__dailyAudio.events.some(event => event.type === 'playing' && event.rate === .72));
    assert.equal(await slow.getAttribute('aria-pressed'), 'true');
    assert.equal(await normal.getAttribute('aria-pressed'), 'false');
    await slow.click();
    assert.equal(await slow.getAttribute('aria-pressed'), 'false');
  });

  await scenario('a newer tab record is protected and unsaved drafts can be exported', {}, async ({ page, context }) => {
    await page.locator('.daily-lesson-row').first().getByRole('button').click();
    await page.getByRole('button', { name: '开始练习', exact: true }).click();
    await page.locator('.daily-option').nth(1).click();
    const before = await saved(page);
    const other = await context.newPage();
    await other.goto(baseURL);
    await other.locator('.daily-controls .primary').click();
    await other.locator('.daily-feedback').waitFor();
    const latest = await saved(other);
    assert.ok(latest.revision > before.revision);
    await page.locator('.daily-notice[role=alert]').waitFor();
    assert.equal(await page.locator('.daily-controls .primary').isEnabled(), false);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出记录', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const parts = []; for await (const part of stream) parts.push(part);
    const exported = JSON.parse(Buffer.concat(parts).toString('utf8'));
    assert.equal(exported.currentProgress.session.draft.choice, before.session.draft.choice);
    assert.deepEqual(await saved(page), latest);
    await page.getByRole('button', { name: '重新加载记录', exact: true }).click();
    await page.locator('.daily-feedback').waitFor();
    assert.equal(await page.locator('.daily-notice[role=alert]').count(), 0);
    await other.close();
  });

  await scenario('real audio playing/ended state, voice and speed preference are shared and durable', {}, async ({ page }) => {
    await page.locator('.daily-lesson-row').first().getByRole('button').click();
    const speak = page.getByRole('button', { name: '朗读 Hello!', exact: true });
    await speak.click();
    await page.waitForFunction(() => window.__dailyAudio.events.some(event => event.type === 'playing' && event.src.includes('/daily/aria/hello.mp3')));
    await page.waitForFunction(() => window.__dailyAudio.events.some(event => event.type === 'ended' && event.src.includes('/daily/aria/hello.mp3')));
    assert.equal(await speak.getAttribute('aria-pressed'), 'false');
    await page.locator('#daily-content').getByRole('button', { name: '语音设置', exact: true }).click();
    await page.getByLabel('点读声音').selectOption('guy');
    await page.getByLabel('点读语速').selectOption('slow');
    await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
    await speak.click();
    await page.waitForFunction(() => window.__dailyAudio.events.some(event => event.type === 'playing' && event.src.includes('/daily/guy/hello.mp3') && event.rate === .72));
    await page.reload();
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('codewords-voice'), localStorage.getItem('codewords-playback-speed')]), ['guy', 'slow']);
    await page.getByRole('button', { name: '编程英语', exact: true }).click();
    await page.locator('.word-button').first().click();
    await page.waitForFunction(() => window.__dailyAudio.events.some(event => event.type === 'playing' && /audio\/guy\/word-/.test(event.src) && event.rate === .72));
  });

  await scenario('corrupted daily storage remains byte-identical while programming still works', { raw: '{bad-json' }, async ({ page }) => {
    await page.locator('.daily-notice[role=alert]').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-daily-v1')), '{bad-json');
    assert.equal(await page.locator('.daily-lesson-row').first().getByRole('button').isEnabled(), false);
    await page.getByRole('button', { name: '编程英语', exact: true }).click();
    await page.getByRole('button', { name: '词库', exact: true }).click();
    await page.getByLabel('词汇分类').selectOption('代码基础');
    assert.ok(await page.locator('.word-card').count() > 0);
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-daily-v1')), '{bad-json');
  });

  for (const width of [1440, 1920, 390]) await scenario(`layout ${width}px, four skins and reduced motion`, { viewport: { width, height: width < 600 ? 844 : 1080 } }, async ({ page }) => {
    for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
      await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
      await noOverflow(page);
      await page.screenshot({ path: path.join(output, `course-${theme}-${width}.png`) });
    }
    await page.getByLabel('界面风格', { exact: true }).selectOption('minimal');
    await page.locator('.daily-lesson-row').first().getByRole('button').click();
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, `study-${width}.png`) });
    await page.getByRole('button', { name: '开始练习', exact: true }).click();
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, `exercise-${width}.png`) });
    assert.equal(await page.locator('.daily-enter').evaluate(element => getComputedStyle(element).animationName), 'none');
  });
  assert.deepEqual(problems, []);
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ scenarios: results, browserErrors: problems, lessons: 24, mainExercises: 120, testedAt: new Date().toISOString() }, null, 2));
  console.log(`PASS ${results.length} browser scenarios; 24 lessons and 120 main exercises; no browser errors.`);
} finally { await browser.close(); }
