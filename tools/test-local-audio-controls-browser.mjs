// Actual local MP3 playback in disposable Chrome contexts. No microphone or user profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vocabulary } from '../src/vocabulary.ts';
import { dailyPhrases } from '../src/dailyCourse.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { DAILY_KEY, createDailyProgress, createDailySession, parseDailyProgress } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { REVIEW_KEY, parseReviewProgress, serializeReviewProgress, reviewAbilities } from '../src/review.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve('artifacts/local-audio-controls');
const earned = JSON.parse(await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8'));
const settings = {
  programming: { root: '#programming-content', key: PROGRAMMING_COURSE_KEY, lessons: adaptiveProgrammingLessons, label: '编程英语', library: '词汇库' },
  daily: { root: '#daily-content', key: DAILY_KEY, lessons: adaptiveDailyLessons, label: '日常英语', library: '表达库' },
};
const now = Math.max(...Object.values(JSON.parse(earned.programming.course).learning.targets).map(target => target.readyAt)) + 3600000;
const seed = { [PROGRAMMING_COURSE_KEY]: earned.programming.course, [DAILY_KEY]: earned.daily.course, [REVIEW_KEY]: earned.programming.review };
const results = [], failures = [], browserErrors = [], scenarios = [], loadedScripts = new Set();
const playbackEvidence = [];
const raw = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const read = async (page, key) => JSON.parse(await raw(page, key));
const main = env => env.page.locator(env.config.root);
let browser;
const themes = ['minimal', 'sketch', 'print', 'graffiti'];
async function navigate(page, label) { await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: label, exact: true }).click(); }
async function open({ section = 'programming', state = {}, width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date(now));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('favicon.ico')) errors.push(event.text()); });
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(({ section, state }) => {
    if (!sessionStorage.getItem('local-audio-qa')) {
      localStorage.setItem('codewords-section', section);
      for (const [key, value] of Object.entries(state)) localStorage.setItem(key, value);
      sessionStorage.setItem('local-audio-qa', '1');
    }
    const NativeAudio = window.Audio;
    window.__speedAudio = { items: [], events: [] };
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args), id = window.__speedAudio.items.length;
      window.__speedAudio.items.push(audio);
      for (const type of ['playing', 'ratechange', 'pause', 'ended', 'error']) audio.addEventListener(type, () => window.__speedAudio.events.push({ id, type, src: audio.src, rate: audio.playbackRate, duration: audio.duration, currentTime: audio.currentTime, paused: audio.paused, ended: audio.ended, preservesPitch: audio.preservesPitch }));
      return audio;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  }, { section, state });
  await page.goto(baseURL);
  const scripts = await page.evaluate(() => [...document.scripts].map(script => script.src).filter(url => /\/assets\/[^/]+\.js/.test(url)));
  for (const script of scripts) loadedScripts.add(script);
  if (process.env.CODEWORDS_EXPECTED_BUNDLE) assert.ok(scripts.some(url => url.endsWith(process.env.CODEWORDS_EXPECTED_BUNDLE)));
  await page.locator(settings[section].root).waitFor({ state: 'visible' });
  return { page, context, errors, section, config: settings[section] };
}
function scenario(name, options, run) { scenarios.push({ name, options, run }); }
async function waitPlayback(env, start, rate, includes, label) {
  await env.page.waitForFunction(({ start, rate, includes }) => window.__speedAudio.events.slice(start).some(event => event.type === 'playing' && Math.abs(event.rate - rate) < 0.0001 && event.duration > 0 && event.src.includes(includes)), { start, rate, includes });
  const evidence = await env.page.evaluate(({ start, rate, includes }) => window.__speedAudio.events.slice(start).find(event => event.type === 'playing' && Math.abs(event.rate - rate) < 0.0001 && event.src.includes(includes)), { start, rate, includes });
  playbackEvidence.push({ label, ...evidence });
  assert.equal(evidence.preservesPitch, true);
  return evidence;
}
function isolatedExercise(section, kind) {
  const config = settings[section], lesson = config.lessons.find(lesson => lesson.exercises.some(task => task.kind === kind));
  const exercise = lesson.exercises.find(task => task.kind === kind);
  const progress = createDailyProgress();
  const ids = exercise.knowledgeIds;
  assert.ok(ids?.length && ids.every(id => config.lessons.some(source => source.learningTargets.includes(id))));
  progress.learning = { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [exercise] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } };
  const value = JSON.stringify(progress);
  assert.equal(parseDailyProgress(value, config.lessons).writable, true, `Legal isolated ${section}/${kind} fixture`);
  return { state: { [config.key]: value }, lesson, exercise };
}
function taskFor(env, session) {
  const id = session.queue[session.index].exerciseId;
  const task = env.config.lessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice]).find(task => task.id === id);
  assert.ok(task, id);
  return task;
}
async function answerWord(env, word) {
  const form = env.page.locator('.lesson-exercise');
  const kind = (await form.getAttribute('class')).match(/lesson-exercise-(\w+)/)[1];
  assert.ok(['meaning', 'context', 'listen', 'cloze'].includes(kind));
  const value = kind === 'meaning' ? word.meaning : kind === 'context' ? word.exampleZh : word.word;
  await form.getByRole('button', { name: value, exact: true }).click();
  await env.page.locator('.lesson-footer').getByRole('button', { name: '检查', exact: true }).click();
  await env.page.locator('.lesson-footer-correct').waitFor();
  await env.page.locator('.lesson-footer .lesson-primary').click();
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1, JSON.stringify(size));
}


async function localPlay(env, button, rate, includes, label) {
  const start = await env.page.evaluate(() => window.__speedAudio.events.length);
  await button.click();
  return waitPlayback(env, start, rate, includes, label);
}
async function noGlobalSpeed(page) {
  assert.equal(await page.getByRole('group', { name: '播放语速', exact: true }).count(), 0, 'Playback choices belong to the current item, not the page header');
}
const cardFor = (scope, id) => scope.locator(`article[data-word-id="${id}"]`);
async function wordPair(env, card, word, prefix) {
  const normal = card.getByRole('button', { name: `朗读单词 ${word.word}`, exact: true });
  const slow = card.getByRole('button', { name: `慢速朗读单词 ${word.word}`, exact: true });
  assert.equal(await normal.isVisible(), true); assert.equal(await slow.isVisible(), true);
  await localPlay(env, normal, 1, `/word-${word.id}.mp3`, `${prefix} word normal`);
  await localPlay(env, slow, .72, `/word-${word.id}.mp3`, `${prefix} word slow`);
  await localPlay(env, normal, 1, `/word-${word.id}.mp3`, `${prefix} same word returns to normal`);
}

scenario('distant library cards offer immediate local word and example playback', { width: 390, state: { 'codewords-playback-speed': 'slow' } }, async env => {
  await navigate(env.page, '词汇库'); await noGlobalSpeed(env.page);
  const library = env.page.locator('#vocabulary-content');
  await library.getByRole('button', { name: '再显示 24 个', exact: true }).click();
  const target = library.locator('article[data-word-id]').nth(30);
  const id = Number(await target.getAttribute('data-word-id'));
  const word = vocabulary.find(word => word.id === id);
  const following = library.locator('article[data-word-id]').nth(31);
  await target.scrollIntoViewIfNeeded();
  assert.ok(await env.page.evaluate(() => scrollY) > 1000);
  await noOverflow(env.page);
  await env.page.screenshot({ path: path.join(output, 'local-word-card-390.png') });
  await wordPair(env, target, word, 'distant library');
  await localPlay(env, target.getByRole('button', { name: `朗读例句 ${word.example}`, exact: true }), 1, `/example-${id}.mp3`, 'distant example normal');
  await localPlay(env, target.getByRole('button', { name: `慢速朗读例句 ${word.example}`, exact: true }), .72, `/example-${id}.mp3`, 'distant example slow');
  const nextId = Number(await following.getAttribute('data-word-id'));
  const next = vocabulary.find(word => word.id === nextId);
  await localPlay(env, following.getByRole('button', { name: `朗读单词 ${next.word}`, exact: true }), 1, `/word-${nextId}.mp3`, 'other word stays normal after slow playback');
  await localPlay(env, target.locator('.meaning'), 1, `/word-${id}.mp3`, 'card blank area stays normal');
  return { position: 31, target: id, nextTarget: nextId, scrollY: await env.page.evaluate(() => scrollY) };
});

for (const section of ['programming', 'daily']) {
  scenario(`${section} teaching has local normal and slow without changing the lesson`, { section, width: 390 }, async env => {
    await main(env).locator('.daily-lesson-row').getByRole('button').click();
    await main(env).locator('.daily-study-card').waitFor();
    const session = (await read(env.page, env.config.key)).session;
    const card = main(env).locator('.daily-phrase').first();
    const clip = section === 'daily' ? '/audio/daily/aria/' : '/audio/aria/';
    await noGlobalSpeed(env.page);
    await localPlay(env, card.locator('.daily-phrase-content'), 1, clip, `${section} teaching normal`);
    await localPlay(env, card.locator('.daily-inline-slow'), .72, clip, `${section} teaching slow`);
    await localPlay(env, card.locator('.daily-phrase-content'), 1, clip, `${section} teaching returns to normal`);
    for (const theme of themes) {
      await env.page.getByLabel('界面风格', { exact: true }).selectOption(theme);
      await card.scrollIntoViewIfNeeded();
      await noOverflow(env.page);
      const box = await card.locator('.daily-inline-slow').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 391);
      assert.equal(await card.locator('button button').count(), 0);
      assert.deepEqual((await read(env.page, env.config.key)).session, session);
      await env.page.screenshot({ path: path.join(output, `local-teaching-${section}-${theme}-390.png`) });
    }
  });

  const fixture = isolatedExercise(section, 'listen');
  scenario(`${section} listening and feedback keep both local speeds and answer draft`, { section, state: fixture.state, width: 390 }, async env => {
    await main(env).locator('.daily-question').waitFor();
    await noGlobalSpeed(env.page);
    const task = fixture.exercise;
    const choice = section === 'daily' ? task.options.find(option => !task.answers.includes(option)) : task.answers[0];
    await main(env).locator('.daily-question').getByRole('button', { name: choice, exact: true }).click();
    const before = (await read(env.page, env.config.key)).session;
    const row = main(env).locator('.daily-audio-row');
    await localPlay(env, row.getByRole('button', { name: '听一听', exact: true }), 1, `/${task.audioId}.mp3`, `${section} listening normal`);
    await localPlay(env, row.getByRole('button', { name: /^慢速朗读 / }), .72, `/${task.audioId}.mp3`, `${section} listening slow`);
    assert.deepEqual((await read(env.page, env.config.key)).session, before);
    await main(env).locator('.daily-controls .primary').click();
    const feedback = main(env).locator('.daily-feedback');
    await feedback.waitFor();
    const answered = (await read(env.page, env.config.key)).session;
    await localPlay(env, feedback.getByRole('button', { name: '听参考发音', exact: true }), 1, `/${task.audioId}.mp3`, `${section} feedback normal`);
    await localPlay(env, feedback.getByRole('button', { name: /^慢速参考发音 / }), .72, `/${task.audioId}.mp3`, `${section} feedback slow`);
    assert.deepEqual((await read(env.page, env.config.key)).session, answered);
    await noOverflow(env.page);
    await env.page.screenshot({ path: path.join(output, `local-feedback-${section}-390.png`) });
    await env.page.reload();
    assert.deepEqual((await read(env.page, env.config.key)).session, answered);
    await localPlay(env, main(env).locator('.daily-feedback').getByRole('button', { name: '听参考发音', exact: true }), 1, `/${task.audioId}.mp3`, `${section} feedback normal after refresh`);
  });

  scenario(`${section} scene review uses local listening buttons`, { section, state: seed }, async env => {
    await navigate(env.page, '复习');
    if (section === 'programming') await main(env).locator('.review-scenarios > summary').click();
    await main(env).getByLabel('复习内容', { exact: true }).selectOption('listening');
    await main(env).locator('.daily-early-review > summary').click();
    await main(env).locator('.daily-early-review .daily-lesson-row').first().getByRole('button', { name: '开始练习', exact: true }).click();
    await main(env).locator('.daily-question').waitFor();
    const session = (await read(env.page, env.config.key)).session;
    const task = taskFor(env, session);
    assert.equal(task.kind, 'listen');
    const row = main(env).locator('.daily-audio-row');
    await noGlobalSpeed(env.page);
    await localPlay(env, row.getByRole('button', { name: /^慢速朗读 / }), .72, `/${task.audioId}.mp3`, `${section} scene review slow`);
    await localPlay(env, row.getByRole('button', { name: '听一听', exact: true }), 1, `/${task.audioId}.mp3`, `${section} scene review normal`);
    assert.deepEqual((await read(env.page, env.config.key)).session, session);
  });
}

const modalWord = vocabulary.find(word => word.id === 1);
const modalReview = parseReviewProgress(earned.programming.review);
for (const ability of reviewAbilities) modalReview[modalWord.id][ability].dueAt = now + 7 * 86400000;
modalReview[modalWord.id].listening.dueAt = now - 1000;
const modalSeed = { ...seed, [REVIEW_KEY]: serializeReviewProgress(modalReview), 'codewords-playback-speed': 'slow' };
scenario('word review rows, listening and summary offer local controls', { state: modalSeed, width: 390 }, async env => {
  await navigate(env.page, '复习');
  const card = cardFor(main(env), modalWord.id);
  await wordPair(env, card, modalWord, 'review row');
  await localPlay(env, card.getByRole('button', { name: `慢速朗读例句 ${modalWord.example}`, exact: true }), .72, `/example-${modalWord.id}.mp3`, 'review example slow');
  await localPlay(env, card.getByRole('button', { name: `朗读例句 ${modalWord.example}`, exact: true }), 1, `/example-${modalWord.id}.mp3`, 'review example normal');
  await main(env).getByRole('button', { name: `练习 ${modalWord.word}`, exact: true }).click();
  const dialog = env.page.locator('.lesson-overlay');
  await dialog.waitFor();
  await noGlobalSpeed(env.page);
  const answer = dialog.locator('.lesson-options').getByRole('button', { name: modalWord.word, exact: true });
  await answer.click();
  const position = await dialog.locator('.lesson-count').innerText();
  await localPlay(env, dialog.getByRole('button', { name: '慢速播放', exact: true }), .72, `/word-${modalWord.id}.mp3`, 'word review listening slow');
  await localPlay(env, dialog.getByRole('button', { name: '正常播放', exact: true }), 1, `/word-${modalWord.id}.mp3`, 'word review listening normal');
  assert.equal(await answer.getAttribute('aria-pressed'), 'true');
  assert.equal(await dialog.locator('.lesson-count').innerText(), position);
  await answerWord(env, modalWord); await answerWord(env, modalWord);
  await dialog.getByRole('heading', { name: '复习了 1 个词', exact: true }).waitFor();
  await localPlay(env, dialog.getByRole('button', { name: `慢速播放 ${modalWord.word}`, exact: true }), .72, `/word-${modalWord.id}.mp3`, 'word summary slow');
  await localPlay(env, dialog.getByRole('button', { name: `正常播放 ${modalWord.word}`, exact: true }), 1, `/word-${modalWord.id}.mp3`, 'word summary normal');
  await noOverflow(env.page);
  await env.page.screenshot({ path: path.join(output, 'local-review-summary-390.png') });
});

const speakingFixture = isolatedExercise('daily', 'speak');
scenario('speaking demonstrations and own-expression references have both local speeds', { section: 'daily', state: speakingFixture.state, width: 390 }, async env => {
  await main(env).locator('.daily-speaking').waitFor();
  const phrase = speakingFixture.exercise.readAloud[0];
  await noGlobalSpeed(env.page);
  const before = (await read(env.page, DAILY_KEY)).session;
  await localPlay(env, main(env).getByRole('button', { name: `听示范 ${phrase.en}`, exact: true }), 1, `/${phrase.id}.mp3`, 'speaking demonstration normal');
  await localPlay(env, main(env).getByRole('button', { name: `慢速朗读 ${phrase.en}`, exact: true }), .72, `/${phrase.id}.mp3`, 'speaking demonstration slow');
  assert.deepEqual((await read(env.page, DAILY_KEY)).session, before);
  await main(env).getByRole('button', { name: '自己表达', exact: true }).click();
  await main(env).locator('textarea').fill('Hello! Goodbye!');
  const draft = (await read(env.page, DAILY_KEY)).session;
  await main(env).locator('.daily-sample > summary').click();
  const sample = main(env).locator('.daily-sample');
  await localPlay(env, sample.getByRole('button', { name: `慢速参考表达 ${phrase.en}`, exact: true }), .72, `/${phrase.id}.mp3`, 'own-expression reference slow');
  await localPlay(env, sample.getByRole('button', { name: `听参考表达 ${phrase.en}`, exact: true }), 1, `/${phrase.id}.mp3`, 'own-expression reference normal');
  assert.deepEqual((await read(env.page, DAILY_KEY)).session, draft);
  await noOverflow(env.page);
});

scenario('expression library local playback keeps voice selection and long sentences usable', { section: 'daily', width: 390 }, async env => {
  await navigate(env.page, '表达库');
  const phrase = [...dailyPhrases].sort((left, right) => right.en.length - left.en.length)[0];
  await main(env).getByLabel('查找表达').fill(phrase.en);
  const row = main(env).locator('.daily-expression').first();
  await noGlobalSpeed(env.page);
  await localPlay(env, row.getByRole('button', { name: `慢速朗读 ${phrase.en}`, exact: true }), .72, `/${phrase.id}.mp3`, 'expression slow');
  await localPlay(env, row.getByRole('button', { name: `朗读 ${phrase.en}`, exact: true }), 1, `/${phrase.id}.mp3`, 'expression normal');
  await noOverflow(env.page);
  await env.page.screenshot({ path: path.join(output, 'local-long-expression-390.png') });
  await main(env).getByRole('button', { name: '语音设置', exact: true }).click();
  await env.page.getByLabel('点读声音', { exact: true }).selectOption('guy');
  await env.page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
  await localPlay(env, row.getByRole('button', { name: `慢速朗读 ${phrase.en}`, exact: true }), .72, `/audio/daily/guy/${phrase.id}.mp3`, 'Guy expression slow');
  await localPlay(env, row.getByRole('button', { name: `朗读 ${phrase.en}`, exact: true }), 1, `/audio/daily/guy/${phrase.id}.mp3`, 'Guy expression normal');
});

for (const width of [1440, 390]) scenario(`local controls fit four themes at ${width}px`, { state: seed, width }, async env => {
  const boxes = [];
  for (const theme of themes) {
    await env.page.getByLabel('界面风格', { exact: true }).selectOption(theme);
    for (const view of ['词汇库', '复习', '表达库']) {
      await env.page.getByRole('button', { name: view === '表达库' ? '日常英语' : '编程英语', exact: true }).click();
      await navigate(env.page, view);
      const scope = env.page.locator(view === '表达库' ? '#daily-content' : view === '词汇库' ? '#vocabulary-content' : '#programming-content');
      const row = scope.locator(view === '表达库' ? '.daily-expression' : 'article[data-word-id]').first();
      await row.scrollIntoViewIfNeeded();
      await noGlobalSpeed(env.page); await noOverflow(env.page);
      assert.equal(await row.locator('button button').count(), 0);
      const slow = row.getByRole('button', { name: view === '表达库' ? /^慢速朗读 / : /^慢速朗读单词 / });
      const box = await slow.boundingBox();
      const bounds = await row.boundingBox();
      assert.ok(box && bounds && box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 1 && box.x + box.width <= width + 1 && box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 1, `${theme}/${view}: ${JSON.stringify({ box, bounds })}`);
      boxes.push({ theme, view, box });
      await env.page.screenshot({ path: path.join(output, `local-${view === '表达库' ? 'expression' : view === '复习' ? 'review' : 'library'}-${theme}-${width}.png`) });
    }
  }
  return boxes;
});

await mkdir(output, { recursive: true });
const documentResponse = await fetch(baseURL, { signal: AbortSignal.timeout(10000) });
assert.ok(documentResponse.ok);
const html = await documentResponse.text();
const production = new URL(baseURL).pathname.startsWith('/dist/');
if (production) { assert.match(html, /\/assets\/[^"']+\.js/); assert.doesNotMatch(html, /src\/main\.tsx/); }
browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const { name, options, run } of scenarios) {
    if (process.env.CODEWORDS_SCENARIO && !process.env.CODEWORDS_SCENARIO.split('|').some(part => name.includes(part))) continue;
    let env; const started = Date.now();
    try {
      env = await open(options);
      const evidence = await run(env);
      assert.deepEqual(env.errors, []);
      results.push({ name, durationMs: Date.now() - started, evidence }); console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error: error.stack ?? String(error) }); console.error(`FAIL ${name}\n${error.stack ?? error}`);
      if (env) {
        const slug = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 100);
        await env.page.screenshot({ path: path.join(output, `failure-${slug}.png`), fullPage: true }).catch(() => {});
        await writeFile(path.join(output, `failure-${slug}.txt`), await env.page.locator('body').innerText()).catch(() => {});
        await writeFile(path.join(output, `failure-${slug}-audio.json`), JSON.stringify(await env.page.evaluate(() => window.__speedAudio.events), null, 2)).catch(() => {});
      }
    } finally { if (env) { browserErrors.push(...env.errors.map(error => ({ name, error }))); await env.context.close(); } }
  }
} finally {
  const suffix = process.env.CODEWORDS_SCENARIO ? `-${process.env.CODEWORDS_SCENARIO.replace(/[^a-z0-9]+/gi, '-').slice(0, 90)}` : '';
  await writeFile(path.join(output, `browser-results${production ? '-production' : ''}${suffix}.json`), JSON.stringify({ baseURL, production, loadedApplicationScripts: [...loadedScripts], testedAt: new Date().toISOString(), scenarios: results, failures, browserErrors, playbackEvidence, microphoneTested: false }, null, 2));
  await browser.close();
}
assert.deepEqual(failures, []); assert.deepEqual(browserErrors, []);
console.log(`PASS ${results.length} local-audio scenarios, ${playbackEvidence.length} actual playing events.`);
