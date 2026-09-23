// Disposable Chrome contexts. No user profile, microphone, or external AI service.
// CODEWORDS_TEST_URL selects an already running server; this test never starts one.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dailyLessons, dailyUnits, dailyPhrases } from '../src/dailyCourse.ts';
import { programmingLessons, programmingUnits, programmingPhrases } from '../src/programmingCourse.ts';
import { vocabulary } from '../src/vocabulary.ts';
import { DAILY_KEY, parseDailyProgress } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { REVIEW_KEY, parseReviewProgress, serializeReviewProgress, reviewAbilities, updateReviewProgress } from '../src/review.ts';

const require = createRequire(import.meta.url);
const playwright = process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwright);
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.ok(/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(baseURL), 'Use an identified local development server.');
const output = path.resolve('artifacts/course-system');
await mkdir(output, { recursive: true });
const response = await fetch(baseURL, { signal: AbortSignal.timeout(10000) }).catch(error => {
  throw new Error(`The existing development server is unavailable at ${baseURL}: ${error.message}`);
});
assert.ok(response.ok, `Development server returned ${response.status}`);
const documentHTML = await response.text();
const production = new URL(baseURL).pathname.startsWith('/dist/');
if (production) {
  assert.ok(/\/assets\/[^"']+\.js/.test(documentHTML), 'Production document must load bundled JavaScript');
  assert.doesNotMatch(documentHTML, /@vite\/client|src\/main\.tsx/, 'Production smoke must not silently test development source');
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], browserErrors = [], failures = [];
const earned = {};
let mainExercises = 0, selfChecks = 0;
const curricula = {
  programming: { label: '编程英语', key: PROGRAMMING_COURSE_KEY, lessons: programmingLessons, units: programmingUnits, phrases: programmingPhrases, root: '#programming-content' },
  daily: { label: '日常英语', key: DAILY_KEY, lessons: dailyLessons, units: dailyUnits, phrases: dailyPhrases, root: '#daily-content' },
};
const preserve = { 'codewords-mastered': '[1,2,21]', 'codewords-favorites': '[17]', 'codewords-quiz-last-tested': '{"17":12345}' };
const themes = ['minimal', 'sketch', 'print', 'graffiti'];
const only = process.env.CODEWORDS_SCENARIO;
if (only) Object.assign(earned, JSON.parse(await readFile(path.join(output, 'earned-fixtures.json'), 'utf8').catch(() => '{}')));

async function read(page, key) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key); }
async function raw(page, key) { return page.evaluate(key => localStorage.getItem(key), key); }
async function open({ section = 'programming', seed = {}, width = 1440, now } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  if (now) await page.clock.setFixedTime(new Date(now));
  page.setDefaultTimeout(12000);
  const localErrors = [];
  page.on('pageerror', error => localErrors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('favicon.ico')) localErrors.push(event.text()); });
  page.on('dialog', async dialog => { localErrors.push(`Unexpected dialog: ${dialog.message()}`); await dialog.dismiss(); });
  await page.addInitScript(({ section, seed }) => {
    if (!sessionStorage.getItem('course-system-qa-seeded')) {
      localStorage.setItem('codewords-section', section);
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
      sessionStorage.setItem('course-system-qa-seeded', '1');
    }
    const NativeAudio = window.Audio;
    window.__courseAudio = { items: [], events: [] };
    function TrackedAudio(...args) {
      const item = new NativeAudio(...args);
      window.__courseAudio.items.push(item);
      for (const type of ['playing', 'pause', 'ended', 'error']) item.addEventListener(type, () => window.__courseAudio.events.push({ type, src: item.src, rate: item.playbackRate, duration: item.duration }));
      return item;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  }, { section, seed });
  await page.goto(baseURL);
  await page.locator(curricula[section].root).waitFor({ state: 'visible' });
  return { context, page, localErrors, section, config: curricula[section] };
}

async function scenario(name, options, test) {
  if (only && !only.split('|').some(part => name.includes(part))) return;
  const start = Date.now();
  let env;
  try {
    env = await open(options);
    await test(env);
    assert.deepEqual(env.localErrors, [], 'No browser runtime errors or audio failures');
    results.push({ name, durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = { name, error: error.stack || String(error) };
    failures.push(detail);
    console.error(`FAIL ${name}\n${detail.error}`);
    if (env) {
      const slug = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
      await env.page.screenshot({ path: path.join(output, `failure-${slug}.png`), fullPage: true }).catch(() => {});
      await writeFile(path.join(output, `failure-${slug}.txt`), await env.page.locator('body').innerText()).catch(() => {});
    }
  } finally {
    if (env) { browserErrors.push(...env.localErrors.map(error => ({ name, error }))); await env.context.close(); }
  }
}

function root(env) { return env.page.locator(env.config.root); }
async function navigate(page, name) { await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click(); }
async function noOverflow(page) {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(widths.document <= widths.viewport + 1, JSON.stringify(widths));
}
function orderIndexes(task) {
  const remaining = new Set(task.options.map((_, index) => index));
  let rest = task.answers[0];
  const ordered = [];
  while (rest) {
    const index = [...remaining].find(index => rest === task.options[index] || rest.startsWith(`${task.options[index]} `));
    assert.notEqual(index, undefined, `Cannot match phrase blocks for ${task.id}: ${rest}`);
    ordered.push(index); remaining.delete(index);
    rest = rest.slice(task.options[index].length).trimStart();
  }
  assert.equal(remaining.size, 0, task.id);
  return ordered;
}
async function fillAnswer(env, task, { wrong = false } = {}) {
  const form = root(env).locator(`.daily-question[data-exercise-id="${task.id}"]`);
  await form.waitFor();
  if (task.kind === 'choice' || task.kind === 'listen') {
    const value = wrong ? task.options.find(value => !task.answers.includes(value)) : task.answers[0];
    assert.notEqual(value, undefined, task.id);
    await form.getByRole('button', { name: value, exact: true }).click();
  } else if (task.kind === 'fill') {
    for (let index = 0; index < task.blanks.length; index++) await form.getByLabel(`第 ${index + 1} 个空`, { exact: true }).fill(wrong ? 'zz' : task.blanks[index][0]);
  } else if (task.kind === 'order') {
    for (const index of wrong ? [...orderIndexes(task)].reverse() : orderIndexes(task)) await form.locator('[aria-label="可选词块"] button').nth(index).click();
  } else {
    if (task.kind === 'speak') await form.getByRole('button', { name: '自己表达', exact: true }).click();
    await form.locator('textarea').fill(wrong ? 'zz' : task.kind === 'speak' ? task.sample : task.answers[0]);
    if (task.kind === 'speak') for (const input of await form.locator('input[type=checkbox]').all()) await input.check();
  }
}
async function answer(env, task, options = {}) {
  await fillAnswer(env, task, options);
  await root(env).locator('.daily-controls .primary').click();
  await root(env).locator('.daily-feedback').waitFor();
  const saved = await read(env.page, env.config.key);
  assert.equal(saved.session.feedback.correct, !options.wrong, task.id);
  if (options.helped) assert.equal(saved.session.feedback.outcome, 'assisted', task.id);
  if (task.kind === 'speak') { assert.equal(saved.session.feedback.outcome, 'self'); selfChecks++; }
  if (options.inspect) await options.inspect(saved);
  await root(env).locator('.daily-controls .primary').click();
}
async function beginFirst(env) {
  await root(env).locator('.daily-lesson-row').getByRole('button').click();
  await root(env).locator('.daily-study-card').waitFor();
  await root(env).getByRole('button', { name: '开始练习', exact: true }).click();
  await root(env).locator('.daily-question').waitFor();
}
async function finishActive(env) {
  let guard = 0;
  while ((await read(env.page, env.config.key)).session.stage === 'exercise') {
    assert.ok(++guard <= 20, 'Bounded correction queue');
    const session = (await read(env.page, env.config.key)).session;
    const lesson = env.config.lessons.find(item => item.id === session.lessonId);
    const task = [...lesson.exercises, ...lesson.rechecks].find(item => item.id === session.queue[session.index].exerciseId);
    assert.ok(task, session.queue[session.index].exerciseId);
    await answer(env, task);
  }
  await root(env).locator('.daily-summary').waitFor();
}
async function currentOnly(env, index) {
  const current = env.config.lessons[index];
  assert.equal(await root(env).locator('.daily-lesson-row').count(), 1);
  assert.equal(await root(env).locator('.daily-lesson-row h3').innerText(), current.title);
  const headings = await root(env).locator('h2, h3').allTextContents();
  for (const future of env.config.lessons.slice(index + 1)) assert.ok(!headings.includes(future.title), `Future lesson exposed: ${future.title}`);
  const unitIndex = env.config.units.findIndex(unit => unit.lessons.some(lesson => lesson.id === current.id));
  for (const future of env.config.units.slice(unitIndex + 1)) assert.ok(!headings.includes(future.title), `Future unit exposed: ${future.title}`);
}

try {
  assert.equal(vocabulary.length, 3620);
  for (const section of ['programming', 'daily']) await scenario(`${section}: 24 sequential lessons, 120 real UI answers and reload`, { section }, async env => {
    assert.deepEqual(await env.page.locator('.main-nav .nav-item').allTextContents(), ['课程', '复习', section === 'daily' ? '表达库' : '词汇库']);
    for (const [index, lesson] of env.config.lessons.entries()) {
      await currentOnly(env, index);
      await beginFirst(env);
      for (const task of lesson.exercises) { await answer(env, task); mainExercises++; }
      await root(env).locator('.daily-summary').waitFor();
      let saved = await read(env.page, env.config.key);
      assert.ok(saved.lessons[lesson.id].completedAt > 0, lesson.id);
      assert.equal(saved.session.answers.length, lesson.exercises.length, 'Correct main practice needs no retries');
      assert.equal(parseDailyProgress(JSON.stringify(saved), env.config.lessons).writable, true);
      await env.page.reload();
      await root(env).locator('.daily-summary').waitFor();
      assert.equal((await read(env.page, env.config.key)).session.lessonId, lesson.id);
      if (index === 0) {
        earned[`${section}First`] = { course: await raw(env.page, env.config.key), review: await raw(env.page, REVIEW_KEY) };
        await writeFile(path.join(output, 'earned-fixtures.json'), JSON.stringify(earned));
      }
      await root(env).getByRole('button', { name: '返回课程', exact: true }).click();
      if (index % 6 === 5) console.log(`UI completed ${section} unit ${Math.floor(index / 6) + 1}/4`);
    }
    assert.equal(Object.values((await read(env.page, env.config.key)).lessons).filter(lesson => lesson.completedAt).length, 24);
    await root(env).getByRole('heading', { name: '当前课程已全部完成', exact: true }).waitFor();
    earned[section] = { course: await raw(env.page, env.config.key), review: await raw(env.page, REVIEW_KEY) };
    await writeFile(path.join(output, 'earned-fixtures.json'), JSON.stringify(earned));
    if (section === 'programming') {
      const progress = parseReviewProgress(earned[section].review);
      for (const id of new Set(programmingLessons.flatMap(lesson => lesson.wordIds))) assert.ok(progress[id]?.firstLearnedAt > 0, `Course enrolls word ${id}`);
      for (const word of Object.values(progress)) for (const ability of reviewAbilities) assert.ok((word[ability]?.streak ?? 0) <= 1, 'Same-day course practice is not delayed recall');
    }
  });

  await scenario('legacy enrollment preserves original keys, favorites and all 3620 library words', { seed: preserve }, async env => {
    const progress = parseReviewProgress(await raw(env.page, REVIEW_KEY));
    for (const id of [1, 2, 21]) {
      assert.equal(progress[id].source, 'legacy'); assert.equal(progress[id].firstLearnedAt, 0);
      for (const ability of reviewAbilities) assert.equal(progress[id][ability].attempts ?? 0, 0);
    }
    await navigate(env.page, '词汇库');
    assert.equal(await env.page.locator('.list-guide strong').innerText(), '3,620');
    assert.equal(await env.page.getByRole('button', { name: /掌握|重新学习/ }).count(), 0);
    await env.page.getByLabel('词汇范围', { exact: true }).selectOption('learned');
    assert.equal(await env.page.locator('.list-guide strong').innerText(), '3');
    await env.page.getByLabel('词汇范围', { exact: true }).selectOption('all');
    await env.page.getByLabel('搜索当前列表').fill(vocabulary.find(word => word.id === 1).word);
    assert.ok(await env.page.locator('.word-card').count() > 0);
    assert.ok((await env.page.locator('.word-learning-status').allTextContents()).some(text => /复习/.test(text)), 'All view still contains already learned terms');
    await env.page.reload();
    for (const [key, value] of Object.entries(preserve)) assert.equal(await raw(env.page, key), value);
  });

  for (const section of ['programming', 'daily']) await scenario(`${section}: draft, theme, section switch and refresh preserve current exercise`, { section }, async env => {
    await beginFirst(env);
    const task = env.config.lessons[0].exercises[0];
    await fillAnswer(env, task);
    const before = (await read(env.page, env.config.key)).session;
    await env.page.reload(); await root(env).locator('.daily-question').waitFor();
    for (const theme of themes) {
      await env.page.getByLabel('界面风格', { exact: true }).selectOption(theme);
      const after = (await read(env.page, env.config.key)).session;
      assert.equal(after.id, before.id); assert.deepEqual(after.draft, before.draft); assert.equal(after.index, before.index);
    }
    await env.page.getByRole('button', { name: section === 'programming' ? '日常英语' : '编程英语', exact: true }).click();
    await env.page.getByRole('button', { name: env.config.label, exact: true }).click();
    await root(env).locator('.daily-question').waitFor();
    assert.deepEqual((await read(env.page, env.config.key)).session.draft, before.draft);
    await root(env).locator('.daily-controls .primary').click(); await root(env).locator('.daily-feedback.correct').waitFor();
    await env.page.reload(); await root(env).locator('.daily-feedback.correct').waitFor();
    assert.equal((await read(env.page, env.config.key)).session.answers.length, 1);
    await root(env).locator('.daily-controls .primary').click();
    assert.equal((await read(env.page, env.config.key)).session.index, 1);
  });

  await scenario('programming: wrong answer and help stay in their measured abilities after correction', {}, async env => {
    await beginFirst(env);
    const [meaning, context, listening] = programmingLessons[0].exercises;
    await answer(env, meaning, { wrong: true });
    let progress = parseReviewProgress(await raw(env.page, REVIEW_KEY));
    const word = progress[meaning.wordIds[0]];
    assert.equal(word.meaning.needsPractice, true); assert.equal(word.meaning.incorrectAnswers, 1);
    for (const ability of reviewAbilities.filter(ability => ability !== 'meaning')) assert.equal(word[ability].attempts ?? 0, 0);
    await answer(env, context);
    await root(env).getByRole('button', { name: '提示', exact: true }).click();
    await env.page.reload(); await root(env).locator('.daily-help').waitFor();
    assert.equal((await read(env.page, PROGRAMMING_COURSE_KEY)).session.draft.helped, true);
    await answer(env, listening, { helped: true });
    progress = parseReviewProgress(await raw(env.page, REVIEW_KEY));
    assert.equal(progress[listening.wordIds[0]].listening.needsPractice, true);
    assert.equal(progress[listening.wordIds[0]].spelling.attempts ?? 0, 0);
    assert.equal(progress[listening.wordIds[0]].listening.attempts, 1, 'A hint plus submission remains one answered task');
    await finishActive(env);
    const beforeReload = await raw(env.page, REVIEW_KEY);
    await env.page.reload(); await root(env).locator('.daily-summary').waitFor();
    assert.equal(await raw(env.page, REVIEW_KEY), beforeReload, 'Replaying course receipts is idempotent');
    assert.equal(parseReviewProgress(beforeReload)[meaning.wordIds[0]].meaning.needsPractice, true);
    const correctedCourse = await read(env.page, PROGRAMMING_COURSE_KEY);
    const lesson = programmingLessons[0];
    for (const entry of correctedCourse.session.queue.filter(entry => entry.retry)) {
      const original = lesson.exercises.find(task => task.id === entry.retryOf);
      const retry = lesson.rechecks.find(task => task.id === entry.exerciseId);
      assert.equal(retry.ability, original.ability, 'A different ability must not masquerade as a correction');
      assert.ok(retry.knowledgeIds.some(id => original.knowledgeIds.includes(id)), 'A recheck must target the original knowledge');
    }
    assert.equal(correctedCourse.lessons[lesson.id].errors[meaning.id].resolvedAt, 0, 'Without a suitable same-ability recheck, retain the difficulty for later review');
  });

  await scenario('daily: expression search, learned filter and favorites persist independently', { section: 'daily', seed: earned.dailyFirst ? { [DAILY_KEY]: earned.dailyFirst.course } : {} }, async env => {
    await navigate(env.page, '表达库');
    await root(env).getByLabel('查找表达', { exact: true }).fill('Hello');
    const phrase = dailyPhrases.find(item => item.id === 'hello');
    assert.ok(phrase);
    const card = root(env).locator('.daily-expression').filter({ has: env.page.getByRole('button', { name: `朗读 ${phrase.en}`, exact: true }) });
    await card.getByRole('button', { name: `收藏 ${phrase.en}`, exact: true }).click();
    assert.ok((await read(env.page, DAILY_KEY)).favorites.includes(phrase.id));
    await env.page.reload(); await navigate(env.page, '表达库');
    await root(env).getByLabel(/显示内容/).selectOption('favorites');
    assert.equal(await root(env).locator('.daily-expression').count(), 1);
    if (earned.dailyFirst) {
      await root(env).getByLabel(/显示内容/).selectOption('learned');
      assert.ok(await root(env).locator('.daily-expression').count() > 0);
    }
    assert.equal(await raw(env.page, 'codewords-favorites'), null, 'Daily favorites never overwrite programming favorites');
  });

  if (earned.programmingFirst) {
    const state = parseReviewProgress(earned.programmingFirst.review);
    for (const word of Object.values(state)) for (const ability of reviewAbilities) word[ability].dueAt = Date.now() + 7 * 86400000;
    const seed = { [PROGRAMMING_COURSE_KEY]: earned.programmingFirst.course, [REVIEW_KEY]: serializeReviewProgress(state) };
    await scenario('programming: future due dates separate automatic and voluntary practice', { seed }, async env => {
      await navigate(env.page, '复习');
      assert.equal(await env.page.getByRole('button', { name: '开始到期复习', exact: true }).isDisabled(), true);
      await env.page.getByRole('button', { name: '提前巩固已学词', exact: true }).click();
      await env.page.locator('.lesson-overlay').waitFor();
      await env.page.getByRole('button', { name: '退出复习', exact: true }).click();
      assert.equal(await env.page.locator('.lesson-overlay').count(), 0);
    });
    const due = structuredClone(state);
    const first = Object.values(due)[0]; first.context.dueAt = Date.now() - 1000;
    await scenario('programming: due review excludes future-only vocabulary', { seed: { ...seed, [REVIEW_KEY]: serializeReviewProgress(due) } }, async env => {
      await navigate(env.page, '复习');
      await env.page.getByRole('button', { name: '开始到期复习', exact: true }).click();
      await env.page.locator('.lesson-overlay').waitFor();
      assert.match(await env.page.locator('.lesson-context').innerText(), /本轮 1 个词/);
    });
  }

  if (earned.dailyFirst) await scenario('daily: voluntary early review uses learned material only', { section: 'daily', seed: { [DAILY_KEY]: earned.dailyFirst.course } }, async env => {
    await navigate(env.page, '复习');
    await root(env).getByText('主动练习已学内容', { exact: true }).click();
    const early = root(env).locator('.daily-early-review');
    assert.equal(await early.locator('.daily-lesson-row').count(), 1);
    await early.getByRole('button', { name: '开始练习', exact: true }).click();
    await root(env).locator('.daily-question').waitFor();
    assert.equal((await read(env.page, DAILY_KEY)).session.mode, 'review');
  });

  if (earned.dailyFirst) {
    await scenario('daily: due review opens real saved knowledge and records an answer', { section: 'daily', seed: { [DAILY_KEY]: earned.dailyFirst.course }, now: Date.now() + 2 * 86400000 }, async env => {
      await navigate(env.page, '复习');
      await root(env).getByRole('button', { name: '开始复习', exact: true }).click();
      await root(env).locator('.daily-question').waitFor();
      const session = (await read(env.page, DAILY_KEY)).session;
      const lesson = dailyLessons.find(lesson => lesson.id === session.lessonId);
      const task = [...lesson.exercises, ...lesson.rechecks].find(task => task.id === session.queue[0].exerciseId);
      await answer(env, task);
      assert.equal((await read(env.page, DAILY_KEY)).session.answers.length, 1);
    });
  }

  if (earned.programming) {
    for (const ability of reviewAbilities) await scenario(`programming review adapter: ${ability} selects only its target ability`, {
      seed: { [PROGRAMMING_COURSE_KEY]: earned.programming.course, [REVIEW_KEY]: earned.programming.review },
    }, async env => {
      await navigate(env.page, '复习');
      const filter = root(env).getByLabel('复习内容', { exact: true });
      assert.deepEqual(await filter.locator('option').allTextContents(), ['系统安排', '阅读理解', '词义', '拼写', '听力']);
      await filter.selectOption(ability);
      await root(env).getByText('主动练习已学内容', { exact: true }).click();
      const lesson = programmingLessons.find(lesson => lesson.exercises.some(task => task.ability === ability));
      const row = root(env).locator('.daily-early-review .daily-lesson-row').filter({ has: env.page.getByRole('heading', { name: lesson.title, exact: true }) });
      await row.getByRole('button', { name: '开始练习', exact: true }).click();
      await root(env).locator('.daily-question').waitFor();
      const session = (await read(env.page, PROGRAMMING_COURSE_KEY)).session;
      assert.equal(session.mode, 'review'); assert.equal(session.focused, true);
      assert.ok(session.queue.length > 0);
      for (const entry of session.queue) assert.equal(lesson.exercises.find(task => task.id === entry.exerciseId)?.ability, ability, entry.exerciseId);
      const first = lesson.exercises.find(task => task.id === session.queue[0].exerciseId);
      await answer(env, first);
      await env.page.reload();
      assert.equal((await read(env.page, PROGRAMMING_COURSE_KEY)).session.answers.length, 1);
      assert.equal(await root(env).locator('.daily-notice[role=alert]').count(), 0);
    });

    const now = Date.now() + 2 * 86400000;
    let review = parseReviewProgress(earned.programming.review);
    for (const word of Object.values(review)) for (const ability of reviewAbilities) {
      word[ability].dueAt = now + 7 * 86400000; word[ability].needsPractice = false;
    }
    const lesson = programmingLessons[0];
    const exercise = lesson.exercises.find(task => task.ability === 'meaning');
    const wordId = exercise.wordIds[0];
    review = updateReviewProgress(review, { wordId, ability: 'meaning', level: 0, retry: false, kind: 'meaning' }, 'assisted', now - 2 * 86400000);
    const course = JSON.parse(earned.programming.course);
    course.lessons[lesson.id].errors[exercise.id] = {
      lastAt: now - 2 * 86400000, lastDay: new Date(now - 2 * 86400000).toISOString().slice(0, 10),
      dueAt: now - 86400000, outcome: 'assisted', resolvedAt: 0,
    };
    assert.equal(parseDailyProgress(JSON.stringify(course), programmingLessons).writable, true, 'The historical course-error fixture must remain legal');
    await scenario('programming review adapter: word correction clears scene weakness and storage updates refresh it', {
      now, seed: { [PROGRAMMING_COURSE_KEY]: JSON.stringify(course), [REVIEW_KEY]: serializeReviewProgress(review) },
    }, async env => {
      await navigate(env.page, '复习');
      const scheduled = root(env).locator('.daily-panel > .daily-lessons .daily-lesson-row');
      await scheduled.filter({ hasText: lesson.title }).getByText('有需要再练的内容', { exact: true }).waitFor();
      await env.page.getByRole('button', { name: '开始到期复习', exact: true }).click();
      await env.page.locator('.lesson-exercise-meaning').waitFor();
      const word = vocabulary.find(item => item.id === wordId);
      await env.page.locator('.lesson-options').getByRole('button', { name: word.meaning, exact: true }).click();
      await env.page.locator('.lesson-footer').getByRole('button', { name: '检查', exact: true }).click();
      await env.page.locator('.lesson-footer-correct').waitFor();
      const corrected = parseReviewProgress(await raw(env.page, REVIEW_KEY));
      assert.equal(corrected[wordId].meaning.needsPractice, false);
      assert.ok(corrected[wordId].meaning.dueAt > now);
      await env.page.getByRole('button', { name: '退出复习', exact: true }).click();
      await root(env).getByRole('heading', { name: '暂时没有到期复习', exact: true }).waitFor();
      assert.equal(await scheduled.count(), 0, 'Stale daily-style errors must not override corrected word skills');
      assert.equal((await read(env.page, PROGRAMMING_COURSE_KEY)).lessons[lesson.id].errors[exercise.id].resolvedAt, 0, 'Historical evidence remains intact');

      async function publishExternal(updated) {
        const next = serializeReviewProgress(updated);
        await env.page.evaluate(({ key, next }) => {
          const oldValue = localStorage.getItem(key);
          localStorage.setItem(key, next);
          dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: next, storageArea: localStorage, url: location.href }));
        }, { key: REVIEW_KEY, next });
      }
      const contextWeak = updateReviewProgress(corrected, { wordId, ability: 'context', level: 0, retry: false, kind: 'context' }, 'assisted', now - 2 * 86400000);
      await publishExternal(contextWeak);
      await scheduled.filter({ hasText: lesson.title }).getByText('有需要再练的内容', { exact: true }).waitFor();
      const contextCorrected = updateReviewProgress(contextWeak, { wordId, ability: 'context', level: 0, retry: false, kind: 'context' }, 'independent', now);
      await publishExternal(contextCorrected);
      await root(env).getByRole('heading', { name: '暂时没有到期复习', exact: true }).waitFor();
      assert.equal(await scheduled.count(), 0);
    });
  }

  await scenario('real MP3 playback uses revised word and example assets in both voices', {}, async env => {
    await navigate(env.page, '词汇库');
    const target = vocabulary.find(item => item.id === 3561);
    await env.page.getByLabel('搜索当前列表').fill(target.example);
    const card = env.page.locator('.word-card').filter({ has: env.page.getByRole('button', { name: `朗读单词 ${target.word}`, exact: true }) });
    for (const voice of ['aria', 'guy']) {
      await env.page.locator('#vocabulary-content').getByRole('button', { name: '语音设置', exact: true }).click();
      await env.page.getByLabel('点读声音', { exact: true }).selectOption(voice);
      await env.page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
      for (const type of ['word', 'example']) {
        const start = await env.page.evaluate(() => window.__courseAudio.events.length);
        await card.getByRole('button', { name: type === 'word' ? `朗读单词 ${target.word}` : `朗读例句 ${target.example}`, exact: true }).click();
        await env.page.waitForFunction(({ start, voice, type, id }) => window.__courseAudio.events.slice(start).some(event => event.type === 'playing' && event.src.includes(`/audio/${voice}/${type}-${id}.mp3`) && event.duration > 0), { start, voice, type, id: target.id });
        if (type === 'example') assert.ok((await env.page.evaluate(() => window.__courseAudio.events.at(-1).src)).includes('v='));
      }
    }
    await env.page.getByRole('button', { name: '日常英语', exact: true }).click();
    await env.page.locator('#daily-content .daily-lesson-row').getByRole('button').click();
    await env.page.getByRole('button', { name: '朗读 Hello!', exact: true }).click();
    await env.page.waitForFunction(() => window.__courseAudio.events.some(event => event.type === 'playing' && event.src.includes('/audio/daily/guy/hello.mp3')));
  });

  for (const [section, key] of [['programming', PROGRAMMING_COURSE_KEY], ['programming', REVIEW_KEY], ['daily', DAILY_KEY]]) await scenario(`corrupt JSON preserved: ${key}`, { section, seed: { [key]: '{broken' } }, async env => {
    await env.page.locator('[role=alert]:visible').first().waitFor();
    assert.equal(await raw(env.page, key), '{broken');
    await env.page.reload();
    assert.equal(await raw(env.page, key), '{broken');
    await env.page.getByRole('button', { name: section === 'daily' ? '编程英语' : '日常英语', exact: true }).click();
    await env.page.locator(curricula[section === 'daily' ? 'programming' : 'daily'].root).waitFor({ state: 'visible' });
    assert.equal(await raw(env.page, key), '{broken');
  });

  for (const section of ['programming', 'daily']) for (const width of [1440, 390]) await scenario(`${section}: four themes at ${width}px without horizontal overflow`, { section, width }, async env => {
    for (const theme of themes) {
      await env.page.getByLabel('界面风格', { exact: true }).selectOption(theme);
      for (const view of ['课程', '复习', section === 'programming' ? '词汇库' : '表达库']) {
        await navigate(env.page, view); await noOverflow(env.page);
        await env.page.screenshot({ path: path.join(output, `${section}-${view}-${theme}-${width}.png`) });
      }
    }
    await navigate(env.page, '课程'); await beginFirst(env); await noOverflow(env.page);
    await env.page.screenshot({ path: path.join(output, `${section}-exercise-${width}.png`) });
  });
} finally {
  const reportName = only ? `browser-results-${production ? 'production-' : ''}${only.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}.json` : `browser-results${production ? '-production' : ''}.json`;
  await writeFile(path.join(output, reportName), JSON.stringify({ baseURL, production, scenarios: results, failures, browserErrors, mainExercises, selfChecks, microphoneTested: false, testedAt: new Date().toISOString() }, null, 2));
  await browser.close();
}
assert.deepEqual(failures, [], `${failures.length} browser scenarios failed`);
assert.deepEqual(browserErrors, []);
console.log(`PASS ${results.length} scenarios, ${mainExercises} main exercises; ${selfChecks} spoken-expression self checks (no microphone claim).`);
