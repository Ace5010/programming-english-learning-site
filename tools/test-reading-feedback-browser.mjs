// Disposable Chrome contexts: exercise actual MP3 playback without touching user records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession, parseDailyProgress, DAILY_KEY } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { findReadingAudio } from '../src/readingAudio.ts';
import { readingWords } from '../src/readingText.ts';
import { expectedSlowQueue } from './helpers/slow-audio-expectation.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/reading-feedback');
await mkdir(output, { recursive: true });
const configs = { programming: { lessons: adaptiveProgrammingLessons, key: PROGRAMMING_COURSE_KEY }, daily: { lessons: adaptiveDailyLessons, key: DAILY_KEY } };
const results = [], evidence = [], failures = [], bundles = new Set();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });

function fixture(section, kind, predicate = () => true) {
  const config = configs[section];
  const lesson = config.lessons.find(lesson => lesson.exercises.some(task => task.kind === kind && predicate(task)));
  const task = lesson.exercises.find(task => task.kind === kind && predicate(task));
  const progress = createDailyProgress(), now = Date.now(), ids = task.knowledgeIds;
  progress.learning = { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 1 } };
  assert.equal(parseDailyProgress(JSON.stringify(progress), config.lessons).writable, true);
  return { task, state: { [config.key]: JSON.stringify(progress) } };
}
async function open(section, state = {}, theme = 'minimal', width = 390) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  page.on('response', response => { if (response.status() >= 400 && /\.mp3/.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(({ section, state, theme }) => {
    if (!sessionStorage.getItem('reading-test')) {
      localStorage.setItem('codewords-section', section); localStorage.setItem('codewords-theme', theme);
      Object.entries(state).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('reading-test', '1');
    }
    const NativeAudio = window.Audio;
    window.__readingAudio = { items: [], events: [] };
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.__readingAudio.items.push(audio);
      for (const type of ['playing', 'ended', 'error']) audio.addEventListener(type, () => window.__readingAudio.events.push({ type, src: audio.src, rate: audio.playbackRate, duration: audio.duration, preservesPitch: audio.preservesPitch, active: window.__readingAudio.items.filter(item => !item.paused && !item.ended).length }));
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
  }, { section, state, theme });
  await page.goto(baseURL);
  for (const source of await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src))) if (source.includes('/assets/')) bundles.add(source);
  const main = page.locator(`#${section}-content`);
  await main.waitFor({ state: 'visible' });
  return { page, context, main, errors, config: configs[section] };
}
const saved = async env => JSON.parse(await env.page.evaluate(key => localStorage.getItem(key), env.config.key));
const eventCount = env => env.page.evaluate(() => window.__readingAudio.events.length);
async function played(env, action, needle, rate = 1) {
  if (rate === .72) {
    const voice = await env.page.evaluate(() => localStorage.getItem('codewords-voice') === 'guy' ? 'guy' : 'aria');
    needle = expectedSlowQueue(needle, voice, baseURL)?.[0].url ?? needle;
  }
  const before = await eventCount(env); await action();
  await env.page.waitForFunction(({ before, needle, rate }) => window.__readingAudio.events.slice(before).some(event => event.type === 'playing' && event.src.includes(needle) && event.rate === rate && event.duration > 0), { before, needle, rate });
  const events = await env.page.evaluate(before => window.__readingAudio.events.slice(before).filter(event => event.type === 'playing'), before);
  for (const event of events) { assert.ok(event.active <= 1, `Overlapping sounds: ${JSON.stringify(event)}`); assert.equal(event.preservesPitch, true); evidence.push(event); }
}
async function layout(env, name) {
  assert.equal(await env.page.locator('.reading-controls svg, .reading-popup svg').count(), 0, 'direct text reading does not add separate speaker icons');
  const bounds = await env.page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, nested: document.querySelectorAll('button button').length }));
  assert.equal(bounds.nested, 0, 'no nested reading/answer buttons');
  assert.ok(bounds.document <= bounds.width + 1, JSON.stringify(bounds));
  await env.page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
}
async function scenario(name, run) {
  const environments = [];
  const create = async (...args) => { const env = await open(...args); environments.push(env); return env; };
  try { await run(create); for (const env of environments) assert.deepEqual(env.errors, []); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); results.push({ name, passed: false }); console.log(`FAIL ${name}: ${error.message}`); for (const env of environments) await env.page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true }).catch(() => {}); }
  finally { for (const env of environments) await env.context.close(); }
}

for (const section of ['programming', 'daily']) {
  await scenario(`${section}-desktop-answer-cue-after-reading`, async open => {
    const { task, state } = fixture(section, 'choice');
    const env = await open(section, state, 'minimal', 1440), { main, page } = env;
    await main.locator('.daily-option').filter({ hasText: task.answers[0] }).click();
    await played(env, () => main.getByRole('button', { name: '检查', exact: true }).click(), '/feedback/correct.mp3');
    assert.equal(await page.evaluate(() => window.__readingAudio.items.some(item => !item.src.includes('/feedback/') && !item.paused && !item.ended)), false, 'Checking an answer stops desktop pronunciation before the cue');
  });

  await scenario(`${section}-answer-and-complete`, async open => {
    const { task, state } = fixture(section, 'choice');
    const env = await open(section, state), { page, main } = env;
    await main.locator('.daily-option').filter({ hasText: task.answers[0] }).click();
    await played(env, () => main.getByRole('button', { name: '检查', exact: true }).click(), '/feedback/correct.mp3');
    assert.equal((await saved(env)).session.feedback.correct, true);
    await page.reload(); await main.locator('.daily-feedback.compact').waitFor();
    assert.equal(await eventCount(env), 0, 'restoring correct feedback is silent');
    await played(env, () => main.getByRole('button', { name: '继续', exact: true }).click(), '/feedback/complete.mp3');
    assert.equal((await saved(env)).session.stage, 'summary');
    await page.reload(); await main.locator('.daily-summary').waitFor();
    assert.equal(await eventCount(env), 0, 'restoring a completed course is silent');
  });

  await scenario(`${section}-listening-options-and-help`, async open => {
    const { task, state } = fixture(section, 'listen', task => task.options.some(option => findReadingAudio(option)));
    const env = await open(section, state), { page, main } = env;
    const option = task.options.find(option => findReadingAudio(option));
    const recording = findReadingAudio(option);
    await played(env, () => main.locator('.daily-option').filter({ hasText: option }).click(), recording.path.replace('{voice}', 'aria').split('?')[0]);
    assert.equal((await saved(env)).session.draft.helped, false, 'first answer is selected before its automatic pronunciation');
    assert.equal((await saved(env)).session.feedback, null, 'point reading does not submit');
    const raw = (await saved(env)).session.draft.choice;
    await played(env, () => main.locator('.daily-options').getByRole('button', { name: `慢速朗读 ${option}`, exact: true }).click(), recording.path.replace('{voice}', 'aria').split('?')[0], .72);
    const assisted = await saved(env);
    assert.equal(assisted.session.draft.choice, raw, 'replaying keeps the selected answer');
    assert.equal(assisted.session.draft.helpSource, 'audio');
    assert.equal(assisted.session.draft.revealed, false);
    assert.equal(await main.locator('.daily-help').textContent(), '已点读英文，本题会记录为借助提示完成。');
    await page.reload(); await main.locator('.daily-question').waitFor();
    assert.equal((await saved(env)).session.draft.helpSource, 'audio');
    await main.locator('.daily-option').filter({ hasText: task.answers[0] }).click();
    await main.getByRole('button', { name: '检查', exact: true }).click();
    assert.equal((await saved(env)).session.feedback.outcome, 'assisted');
  });

  await scenario(`${section}-order-tiles-and-replay`, async open => {
    const { task, state } = fixture(section, 'order');
    const env = await open(section, state), { main } = env;
    const token = task.options[0], recording = findReadingAudio(token);
    // Locate by the existing tile region: reading buttons must not add/remove tiles.
    const firstWord = readingWords(token)[0].text;
    await played(env, () => main.locator('[aria-label="可选词块"] .daily-token').first().locator('[data-reading-word]').first().click(), findReadingAudio(firstWord).path.replace('{voice}', 'aria').split('?')[0]);
    const before = (await saved(env)).session.draft.order;
    await played(env, () => main.locator('[aria-label="已排列的句子"]').getByRole('button', { name: `慢速朗读 ${token}`, exact: true }).click(), recording.path.replace('{voice}', 'aria').split('?')[0], .72);
    assert.deepEqual((await saved(env)).session.draft.order, before);
    assert.equal((await saved(env)).session.feedback, null);
    await layout(env, `${section}-order-390`);
  });
}

for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
  await scenario(`word-reading-${theme}`, async open => {
    const env = await open('programming', {}, theme, theme === 'minimal' ? 1440 : 390), { page, main } = env;
    await main.getByRole('button', { name: '开始学习', exact: true }).click();
    assert.equal(await main.locator('.daily-phrases svg').count(), 0, 'course cards use their English text as the normal playback control');
    const card = main.locator('.daily-phrase-word').first();
    const word = card.locator('.daily-phrase-content');
    const text = await word.textContent(), recording = findReadingAudio(text);
    await played(env, () => word.click(), recording.path.replace('{voice}', 'aria').split('?')[0]);
    await played(env, () => card.getByRole('button', { name: `慢速朗读 ${text}`, exact: true }).click(), recording.path.replace('{voice}', 'aria').split('?')[0], .72);
    assert.equal(await page.locator('.reading-popup').count(), 0, 'course text does not open a duplicate playback menu');
    await layout(env, `word-reading-${theme}`);
    await played(env, () => word.press('Enter'), recording.path.replace('{voice}', 'aria').split('?')[0]);
    await main.locator('.foundation-guide-link').first().click();
    const inline = page.locator('#foundation-content .foundation-card > p .reading-word').first(), inlineText = await inline.textContent();
    const inlineRecording = findReadingAudio(inlineText);
    await played(env, () => inline.click(), inlineRecording.path.replace('{voice}', 'aria').split('?')[0]);
    assert.equal(await page.locator('.reading-popup button').count(), 1, 'inline words only show a local slow action');
    await played(env, () => page.locator('.reading-popup').getByRole('button', { name: `慢速朗读单词 ${inlineText}`, exact: true }).click(), inlineRecording.path.replace('{voice}', 'aria').split('?')[0], .72);
  });
}

await scenario('additional-voice-and-mute', async open => {
  const env = await open('daily'), { main, page } = env;
  await main.getByRole('button', { name: '开始学习', exact: true }).click();
  const extra = main.locator('.daily-phrase p .reading-word').filter({ hasText: /^h$/ }).first();
  const recording = findReadingAudio('h');
  await played(env, () => extra.click(), recording.path.replace('{voice}', 'aria'));
  await main.getByRole('button', { name: '语音设置', exact: true }).click();
  await page.getByLabel('声音').selectOption('guy');
  await page.getByRole('checkbox', { name: '练习提示音' }).uncheck();
  await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
  await played(env, () => extra.click(), recording.path.replace('{voice}', 'guy'));
  assert.equal(await page.evaluate(() => localStorage.getItem('codewords-feedback-sound')), 'off');
  await layout(env, 'daily-word-reading');
  const fixtureData = fixture('programming', 'choice');
  const muted = await open('programming', { ...fixtureData.state, 'codewords-feedback-sound': 'off' });
  await muted.main.locator('.daily-option').filter({ hasText: fixtureData.task.answers[0] }).click();
  await muted.main.getByRole('button', { name: '检查', exact: true }).click();
  await muted.main.locator('.daily-feedback.compact').waitFor();
  await muted.main.getByRole('button', { name: '继续', exact: true }).click();
  await muted.main.locator('.daily-summary').waitFor();
  assert.equal((await muted.page.evaluate(() => window.__readingAudio.events)).filter(event => event.src.includes('/feedback/')).length, 0);
});

await scenario('fill-does-not-pronounce-hidden-answer', async open => {
  const { state, task } = fixture('programming', 'fill');
  const env = await open('programming', state), { main } = env;
  const before = await saved(env);
  const word = main.locator('.daily-fill .reading-word').first();
  const text = await word.textContent();
  await played(env, () => word.click(), findReadingAudio(text).path.replace('{voice}', 'aria').split('?')[0]);
  assert.deepEqual((await saved(env)).session.draft, before.session.draft);
  assert.equal(await main.locator('.daily-feedback').count(), 0);
  const rendered = await main.locator('.daily-fill').textContent();
  assert.ok(!rendered.includes(task.blanks[0][0]), 'the blank is not filled or revealed by reading nearby text');
});

await scenario('wrong-answer-and-self-check-stay-silent', async open => {
  const current = fixture('programming', 'choice');
  const env = await open('programming', current.state);
  const wrong = current.task.options.find(option => !current.task.answers.includes(option));
  await env.main.locator('.daily-option').filter({ hasText: wrong }).click();
  await env.main.getByRole('button', { name: '检查', exact: true }).click();
  await env.main.locator('.daily-feedback').waitFor();
  assert.equal((await saved(env)).session.feedback.correct, false);
  assert.equal((await env.page.evaluate(() => window.__readingAudio.events)).filter(event => event.src.includes('/feedback/')).length, 0);
  const correction = env.main.locator('.daily-feedback .reading-word').first();
  const word = await correction.textContent();
  await played(env, () => correction.click(), findReadingAudio(word).path.replace('{voice}', 'aria').split('?')[0]);

  const speech = fixture('daily', 'speak');
  const self = await open('daily', speech.state);
  await self.main.getByRole('button', { name: '自己表达', exact: true }).click();
  await self.main.locator('textarea').fill('Hello. My name is Ben.');
  for (const box of await self.main.locator('.daily-checks input').all()) await box.check();
  await self.main.getByRole('button', { name: '完成自查', exact: true }).click();
  await self.main.locator('.daily-feedback.compact').waitFor();
  assert.equal((await saved(self)).session.feedback.outcome, 'self');
  assert.equal((await self.page.evaluate(() => window.__readingAudio.events)).filter(event => event.src.includes('/feedback/')).length, 0);
});

await scenario('pronunciation-takes-over-feedback', async open => {
  const { task, state } = fixture('programming', 'choice');
  const env = await open('programming', state);
  await env.main.locator('.daily-option').filter({ hasText: task.answers[0] }).click();
  await played(env, () => env.main.getByRole('button', { name: '检查', exact: true }).click(), '/feedback/correct.mp3');
  const word = env.main.locator('.daily-question h2 .reading-word').first(), text = await word.textContent();
  await played(env, () => word.click(), findReadingAudio(text).path.replace('{voice}', 'aria').split('?')[0]);
  assert.equal(await env.page.evaluate(() => window.__readingAudio.items.some(item => item.src.includes('/feedback/') && !item.paused && !item.ended)), false);
  assert.equal((await saved(env)).session.feedback.correct, true);
});

await browser.close();
await writeFile(path.join(output, 'results.json'), JSON.stringify({ baseURL, bundles: [...bundles], results, failures, playback: evidence }, null, 2));
console.log(JSON.stringify({ passed: results.filter(result => result.passed).length, failed: failures.length, playingEvents: evidence.length }));
if (failures.length) process.exitCode = 1;
