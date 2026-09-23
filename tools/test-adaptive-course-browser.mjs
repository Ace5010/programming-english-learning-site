// Real Chrome UI in disposable contexts. No user profile, microphone, or external service.
// Use CODEWORDS_SCENARIO to rerun named scenarios against the already running local server.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveDailyLessons, adaptiveDailyUnits } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons, adaptiveProgrammingUnits } from '../src/programmingPractice.ts';
import { dailyLessons } from '../src/dailyCourse.ts';
import { programmingLessons } from '../src/programmingCourse.ts';
import { vocabulary } from '../src/vocabulary.ts';
import { DAILY_KEY, parseDailyProgress, createDailyProgress, createDailySession, beginDailyExercises, learnDailyLesson, dailyExerciseKnowledgeIds } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { REVIEW_KEY, parseReviewProgress, isReviewEligible } from '../src/review.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve('artifacts/adaptive-course');
await mkdir(output, { recursive: true });
const response = await fetch(baseURL, { signal: AbortSignal.timeout(10000) });
assert.equal(response.ok, true);
const html = await response.text();
const production = new URL(baseURL).pathname.startsWith('/dist/');
if (production) {
  assert.match(html, /\/assets\/[^"']+\.js/);
  assert.doesNotMatch(html, /src\/main\.tsx/, 'The application must load the built bundle');
}
const only = process.env.CODEWORDS_SCENARIO;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [], browserErrors = [];
const earned = only ? JSON.parse(await readFile(path.join(output, 'earned-fixtures.json'), 'utf8').catch(() => '{}')) : {};
let objectiveAnswers = 0, selfChecks = 0;
const configs = {
  programming: { label: '编程英语', key: PROGRAMMING_COURSE_KEY, root: '#programming-content', lessons: adaptiveProgrammingLessons, units: adaptiveProgrammingUnits, oldLessons: programmingLessons },
  daily: { label: '日常英语', key: DAILY_KEY, root: '#daily-content', lessons: adaptiveDailyLessons, units: adaptiveDailyUnits, oldLessons: dailyLessons },
};
for (const config of Object.values(configs)) config.exercises = new Map(config.lessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice].map(task => [task.id, { task, lesson }])));
const themes = ['minimal', 'sketch', 'print', 'graffiti'];
const raw = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const read = async (page, key) => JSON.parse(await raw(page, key));
const root = env => env.page.locator(env.config.root);
const progress = env => read(env.page, env.config.key);
const readyIds = state => Object.entries(state.learning?.targets ?? {}).filter(([, target]) => target.readyAt > 0).map(([id]) => id);
async function navigate(page, name) { await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click(); }
async function open({ section = 'programming', seed = {}, width = 1440, rng = 314159, now } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  if (now) await page.clock.setFixedTime(new Date(now));
  page.setDefaultTimeout(10000);
  const localErrors = [];
  page.on('pageerror', error => localErrors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('favicon.ico')) localErrors.push(event.text()); });
  await page.addInitScript(({ section, seed, rng }) => {
    if (!sessionStorage.getItem('adaptive-course-qa')) {
      localStorage.setItem('codewords-section', section);
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
      sessionStorage.setItem('adaptive-course-qa', '1');
    }
    let randomState = rng;
    Math.random = () => { randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0; return randomState / 4294967296; };
    const NativeAudio = window.Audio;
    window.__adaptiveAudio = { items: [], events: [] };
    function TrackedAudio(...args) {
      const item = new NativeAudio(...args);
      window.__adaptiveAudio.items.push(item);
      for (const type of ['playing', 'pause', 'ended', 'error']) item.addEventListener(type, () => window.__adaptiveAudio.events.push({ type, src: item.src, rate: item.playbackRate, duration: item.duration }));
      return item;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  }, { section, seed, rng });
  await page.goto(baseURL);
  await page.locator(configs[section].root).waitFor({ state: 'visible' });
  return { context, page, section, config: configs[section], localErrors };
}
async function scenario(name, options, test) {
  if (only && !only.split('|').some(part => name.includes(part))) return;
  const started = Date.now();
  let env;
  try {
    env = await open(options);
    const evidence = await test(env);
    assert.deepEqual(env.localErrors, [], 'No browser runtime errors');
    results.push({ name, durationMs: Date.now() - started, evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.stack ?? String(error) });
    console.error(`FAIL ${name}\n${error.stack ?? error}`);
    if (env) {
      const slug = name.replace(/[^a-z0-9]+/gi, '-');
      await env.page.screenshot({ path: path.join(output, `failure-${slug}.png`), fullPage: true }).catch(() => {});
      await writeFile(path.join(output, `failure-${slug}.txt`), await env.page.locator('body').innerText()).catch(() => {});
      await writeFile(path.join(output, `failure-${slug}-state.json`), JSON.stringify(await progress(env), null, 2)).catch(() => {});
    }
  } finally {
    if (env) { browserErrors.push(...env.localErrors.map(error => ({ name, error }))); await env.context.close(); }
    await saveReport();
  }
}
async function saveReport() {
  const suffix = only ? `-${only.replace(/[^a-z0-9]+/gi, '-').slice(0, 100)}` : '';
  const report = { baseURL, production, scenarios: results, failures, browserErrors, objectiveAnswers, selfChecks, microphoneTested: false, testedAt: new Date().toISOString() };
  await writeFile(path.join(output, `browser-results${production ? '-production' : ''}${suffix}.json`), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, 'earned-fixtures.json'), JSON.stringify(earned));
}
async function currentOnly(env) {
  await root(env).locator('.daily-lesson-row').waitFor();
  assert.equal(await root(env).locator('.daily-lesson-row').count(), 1);
  const text = await root(env).innerText();
  assert.doesNotMatch(text, /(?:共|\/|总计|总共)\s*24\s*(?:课|节)|24\s*(?:课|节)/);
  const headings = await root(env).locator('h2,h3').allTextContents();
  for (const source of [...env.config.lessons, ...env.config.units]) assert.ok(!headings.includes(source.title), `Source curriculum title exposed: ${source.title}`);
}
async function startRound(env) {
  await currentOnly(env);
  await root(env).locator('.daily-lesson-row').getByRole('button').click();
  await root(env).locator('.daily-study-card').waitFor();
  const state = await progress(env);
  assert.ok(state.session.adaptive);
  assert.match(await root(env).locator('.daily-session-heading h1').innerText(), /^第\s*\d+\s*节$/);
  await root(env).getByRole('button', { name: '开始练习', exact: true }).click();
  await root(env).locator('.daily-question').waitFor();
  return state.session.adaptive;
}
function currentTask(env, state) {
  const id = state.session.queue[state.session.index].exerciseId;
  const entry = env.config.exercises.get(id);
  assert.ok(entry, `Unknown dynamic exercise ${id}`);
  return entry;
}
function orderIndexes(task) {
  // Blocks can be whole sentences or commands and may repeat: do not split the answer into words.
  function match(rest, remaining, result) {
    if (!rest) return remaining.length ? null : result;
    for (const index of remaining) if (rest === task.options[index] || rest.startsWith(`${task.options[index]} `)) {
      const found = match(rest.slice(task.options[index].length).trimStart(), remaining.filter(other => other !== index), [...result, index]);
      if (found) return found;
    }
    return null;
  }
  const answer = match(task.answers[0], task.options.map((_, index) => index), []);
  assert.ok(answer, `Cannot assemble ${task.id}`);
  return answer;
}
async function fillAnswer(env, task, wrong = false) {
  const form = root(env).locator(`.daily-question[data-exercise-id="${task.id}"]`);
  await form.waitFor();
  if (task.kind === 'choice' || task.kind === 'listen') {
    const value = wrong ? task.options.find(option => !task.answers.includes(option)) : task.answers[0];
    assert.notEqual(value, undefined, task.id);
    await form.getByRole('button', { name: value, exact: true }).click();
  } else if (task.kind === 'fill') {
    for (let index = 0; index < task.blanks.length; index++) await form.getByLabel(`第 ${index + 1} 个空`, { exact: true }).fill(wrong ? 'zz' : task.blanks[index][0]);
  } else if (task.kind === 'order') {
    const indexes = orderIndexes(task);
    for (const index of wrong ? indexes.slice().reverse() : indexes) await form.locator('[aria-label="可选词块"] button').nth(index).click();
  } else {
    if (task.kind === 'speak') await form.getByRole('button', { name: '自己表达', exact: true }).click();
    await form.locator('textarea').fill(wrong ? 'zz' : task.kind === 'speak' ? task.sample : task.answers[0]);
    if (task.kind === 'speak') for (const checkbox of await form.locator('input[type=checkbox]').all()) await checkbox.check();
  }
}
async function answer(env, { weak = false, sequence = [] } = {}) {
  const before = await progress(env), { task, lesson } = currentTask(env, before);
  const ids = dailyExerciseKnowledgeIds(lesson, task);
  const helped = weak && task.kind !== 'speak' && before.session.index % 2 === 0;
  const wrong = weak && task.kind !== 'speak' && !helped;
  if (helped) await root(env).getByRole('button', { name: '提示', exact: true }).click();
  await fillAnswer(env, task, wrong);
  await root(env).locator('.daily-controls .primary').click();
  await root(env).locator('.daily-feedback').waitFor();
  const checked = await progress(env);
  assert.equal(checked.session.feedback.correct, !wrong, task.id);
  assert.equal(checked.session.feedback.outcome, task.kind === 'speak' ? 'self' : helped ? 'assisted' : wrong ? 'revealed' : 'independent', task.id);
  if (task.kind === 'speak') {
    selfChecks++;
    for (const id of ids) assert.equal(checked.learning.targets[id].confidence, before.learning.targets[id].confidence, 'Self check adds no automatic confidence');
  } else objectiveAnswers++;
  sequence.push({ id: task.id, kind: task.kind, knowledgeIds: ids, signature: task.learningSignature, outcome: checked.session.feedback.outcome, turn: checked.learning?.turns });
  assert.equal(parseDailyProgress(JSON.stringify(checked), env.config.lessons).writable, true, 'Each dynamic answer must survive its own parser');
  await root(env).locator('.daily-controls .primary').click();
  return checked;
}
async function finishRound(env, options) {
  let count = 0;
  while ((await progress(env)).session.stage === 'exercise') {
    assert.ok(++count <= 24, 'Adaptive round remains bounded');
    await answer(env, options);
  }
  await root(env).locator('.daily-summary').waitFor();
  const state = await progress(env);
  assert.equal(state.session.answers.length, count);
  assert.equal(state.session.queue.length, count);
  return state;
}
async function assertNoReview(env) {
  const state = await progress(env);
  assert.deepEqual(readyIds(state), []);
  if (env.section === 'programming') {
    const review = parseReviewProgress(await raw(env.page, REVIEW_KEY));
    assert.equal(Object.keys(review).filter(id => isReviewEligible(review, Number(id))).length, 0);
  }
  await navigate(env.page, '复习');
  await root(env).getByRole('heading', { name: '先学习当前课程', exact: true }).waitFor();
  assert.equal(await root(env).locator('.daily-early-review').count(), 0);
  if (env.section === 'programming') assert.equal(await env.page.getByRole('button', { name: '提前巩固已学词', exact: true }).isDisabled(), true);
  await navigate(env.page, '课程');
}
async function resume(env) {
  if (!await root(env).locator('.daily-question').isVisible()) await root(env).locator('.daily-resume').getByRole('button', { name: '继续', exact: true }).click();
  await root(env).locator('.daily-question').waitFor();
}
async function preserveDraft(env) {
  const { task } = currentTask(env, await progress(env));
  await fillAnswer(env, task);
  const session = (await progress(env)).session;
  const options = await root(env).locator('.daily-option,[aria-label="可选词块"] button').allTextContents();
  await env.page.reload(); await root(env).locator('.daily-question').waitFor();
  assert.deepEqual((await progress(env)).session, session, 'Reload preserves queue, options selection and full draft');
  assert.deepEqual(await root(env).locator('.daily-option,[aria-label="可选词块"] button').allTextContents(), options);
  await env.page.getByLabel('界面风格', { exact: true }).selectOption('sketch');
  await env.page.getByRole('button', { name: env.section === 'daily' ? '编程英语' : '日常英语', exact: true }).click();
  await env.page.getByRole('button', { name: env.config.label, exact: true }).click();
  await resume(env);
  assert.deepEqual((await progress(env)).session, session, 'Theme and section switches preserve current draft');
  // Complete the already-filled draft, avoiding duplicate order-block selections.
  await root(env).locator('.daily-controls .primary').click();
  await root(env).locator('.daily-feedback').waitFor();
  assert.equal((await progress(env)).session.feedback.correct, true);
  if (task.kind === 'speak') selfChecks++; else objectiveAnswers++;
  await root(env).locator('.daily-controls .primary').click();
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions));
}

try {
  for (const section of ['programming', 'daily']) for (const behavior of ['strong', 'weak']) await scenario(`${section}: ${behavior} adaptive rounds and review admission`, { section }, async env => {
    const rounds = [], sequence = [];
    let firstAdmissionRound = 0;
    for (let round = 1; round <= (behavior === 'weak' ? 6 : 16); round++) {
      const plan = await startRound(env);
      if (round === 1) {
        assert.ok(plan.newIds.length > 0);
        await assertNoReview(env); await resume(env);
      }
      const roundSequence = [];
      const state = await finishRound(env, { weak: behavior === 'weak', sequence: roundSequence });
      sequence.push(...roundSequence);
      const ready = readyIds(state);
      if (ready.length && !firstAdmissionRound) firstAdmissionRound = round;
      if (behavior === 'weak') assert.deepEqual(ready, [], 'Assistance and errors never qualify for long-term review');
      rounds.push({ round, plan, answers: state.session.answers.length, readyIds: ready, targets: state.learning.targets, sequence: roundSequence });
      if (round === 2 && behavior === 'weak') {
        assert.ok(plan.newIds.length < rounds[0].plan.newIds.length, 'Weak performance reduces new content');
        assert.ok(plan.focusIds.some(id => rounds[0].plan.focusIds.includes(id)), 'Weak content returns next round');
      }
      console.log(`ROUND ${section}/${behavior} ${round}: ${state.session.answers.length} answers, ${plan.newIds.length} new, ${ready.length} review-ready`);
      await env.page.reload(); await root(env).locator('.daily-summary').waitFor();
      assert.deepEqual((await progress(env)).session.queue, state.session.queue);
      await root(env).getByRole('button', { name: '返回课程', exact: true }).click();
      if (round >= 6 && (behavior === 'weak' || ready.length)) break;
    }
    const state = await progress(env);
    assert.ok(rounds.length >= 6);
    const byTarget = new Map();
    for (const [index, event] of sequence.entries()) for (const id of event.knowledgeIds) {
      const list = byTarget.get(id) ?? [];
      list.push({ ...event, index }); byTarget.set(id, list);
    }
    assert.ok([...byTarget.values()].some(events => new Set(events.map(event => event.kind)).size >= 2), 'Same target appears in distinct exercise forms');
    assert.ok([...byTarget.values()].some(events => events.some((event, index) => index && event.index - events[index - 1].index >= 2)), 'Repeated targets are interleaved with other content');
    if (behavior === 'strong') {
      assert.ok(readyIds(state).length > 0, 'Sustained independent performance eventually qualifies for review');
      earned[section] = { course: await raw(env.page, env.config.key), review: await raw(env.page, REVIEW_KEY) };
      await navigate(env.page, '复习');
      await root(env).locator('.daily-early-review').waitFor();
      if (section === 'programming') assert.equal(await env.page.getByRole('button', { name: '提前巩固已学词', exact: true }).isEnabled(), true);
    } else await assertNoReview(env);
    await writeFile(path.join(output, `${section}-${behavior}-rounds.json`), JSON.stringify(rounds, null, 2));
    return { rounds: rounds.length, firstAdmissionRound, objectiveAnswers: sequence.filter(event => event.outcome !== 'self').length, readyCount: readyIds(state).length, plans: rounds.map(item => ({ new: item.plan.newIds.length, focus: item.plan.focusIds, answers: item.answers })) };
  });

  if (production) for (const section of ['programming', 'daily']) await scenario(`${section}: production smoke starts, saves and plans next dynamic round`, { section }, async env => {
    const scripts = await env.page.evaluate(() => [...document.scripts].map(script => script.src));
    assert.ok(scripts.some(url => /\/assets\/index-[^/]+\.js/.test(url)), 'Browser loads the built application bundle');
    assert.ok(!scripts.some(url => /src\/main\.tsx/.test(url)));
    const plan = await startRound(env);
    const sequence = [];
    const state = await finishRound(env, { sequence });
    await env.page.reload(); await root(env).locator('.daily-summary').waitFor();
    assert.deepEqual((await progress(env)).session.queue, state.session.queue);
    await root(env).getByRole('button', { name: '开始下一课', exact: true }).click();
    await root(env).locator('.daily-study-card').waitFor();
    const nextPlan = (await progress(env)).session.adaptive;
    assert.equal(nextPlan.round, plan.round + 1);
    assert.ok(nextPlan.focusIds.some(id => plan.focusIds.includes(id)), 'Next production round carries unfinished learning forward');
    await root(env).getByRole('button', { name: '开始练习', exact: true }).click();
    await preserveDraft(env);
    await answer(env);
    return { scripts, firstRoundAnswers: sequence.length, firstPlan: plan, nextPlan };
  });

  for (const section of ['programming', 'daily']) await scenario(`${section}: stable draft, queue, option order and different random seeds`, { section, rng: 71 }, async env => {
    const planA = await startRound(env), firstA = (await progress(env)).session.queue[0].exerciseId;
    await preserveDraft(env);
    const sequenceA = [firstA, (await progress(env)).session.queue[1].exerciseId];
    for (let index = 0; index < 3; index++) { await answer(env); sequenceA.push((await progress(env)).session.queue.at(-1).exerciseId); }
    const other = await open({ section, rng: 901 });
    try {
      const planB = await startRound(other), sequenceB = [(await progress(other)).session.queue[0].exerciseId];
      for (let index = 0; index < 4; index++) { await answer(other); sequenceB.push((await progress(other)).session.queue.at(-1).exerciseId); }
      assert.notEqual(planA.seed, planB.seed);
      assert.notDeepEqual(sequenceA, sequenceB, 'Distinct seeds must change actual exercise arrangement');
      assert.deepEqual(other.localErrors, []);
      return { seedA: planA.seed, seedB: planB.seed, sequenceA, sequenceB };
    } finally { await other.context.close(); }
  });

  for (const section of ['programming', 'daily']) {
    const config = configs[section];
    const oldLesson = config.oldLessons[0];
    let old = learnDailyLesson(createDailyProgress(), oldLesson, Date.now() - 86400000);
    old.session = beginDailyExercises(createDailySession(oldLesson, 'lesson', Date.now() - 3600000));
    old.session.draft.choice = oldLesson.exercises[0].answers[0];
    const oldRaw = JSON.stringify(old);
    await scenario(`${section}: historical active session and legacy favorites remain readable`, { section, seed: { [config.key]: oldRaw, 'codewords-mastered': '[1,2,21]', 'codewords-favorites': '[17]' } }, async env => {
      await root(env).locator('.daily-question').waitFor();
      assert.equal(await root(env).locator('.daily-question').getAttribute('data-exercise-id'), oldLesson.exercises[0].id);
      assert.equal((await progress(env)).session.draft.choice, old.session.draft.choice);
      assert.equal(await root(env).locator('[role=alert]').count(), 0);
      await root(env).locator('.daily-controls .primary').click();
      await root(env).locator('.daily-feedback').waitFor();
      await root(env).locator('.daily-controls .primary').click();
      await env.page.reload(); await root(env).locator('.daily-question').waitFor();
      assert.equal((await progress(env)).session.index, 1);
      assert.equal((await progress(env)).session.adaptive, undefined);
      assert.equal(await raw(env.page, 'codewords-mastered'), '[1,2,21]');
      assert.equal(await raw(env.page, 'codewords-favorites'), '[17]');
      const review = parseReviewProgress(await raw(env.page, REVIEW_KEY));
      for (const id of [1, 2, 21]) assert.equal(isReviewEligible(review, id), true, 'Explicit historical mastered records remain reviewable');
    });
    await scenario(`${section}: competing page edits protect saved course and damaged records`, { section }, async env => {
      await startRound(env);
      const saved = await progress(env);
      const replacement = JSON.stringify({ ...saved, revision: saved.revision + 1, favorites: ['hello'] });
      const other = await env.context.newPage();
      await other.goto(baseURL);
      await other.evaluate(({ key, replacement }) => localStorage.setItem(key, replacement), { key: config.key, replacement });
      await root(env).locator('[role=alert]').waitFor();
      assert.equal(await raw(env.page, config.key), replacement);
      assert.equal(await root(env).locator('.daily-controls .primary').isDisabled(), true);
      await root(env).getByRole('button', { name: '重新加载记录', exact: true }).click();
      await root(env).locator('.daily-question').waitFor();
      assert.equal(await root(env).locator('.daily-controls .primary').isEnabled(), true);
      await other.evaluate(key => localStorage.setItem(key, '{broken'), config.key);
      await root(env).locator('[role=alert]').waitFor();
      await env.page.reload(); await root(env).locator('[role=alert]').waitFor();
      assert.equal(await raw(env.page, config.key), '{broken');
      await other.close();
    });
    if (earned[section]) await scenario(`${section}: earned review offers early practice and due practice`, { section, now: Date.now() + 8 * 86400000, seed: { [config.key]: earned[section].course, ...(earned[section].review ? { [REVIEW_KEY]: earned[section].review } : {}) } }, async env => {
      await navigate(env.page, '复习');
      const ready = new Set(readyIds(await progress(env)));
      const scheduled = root(env).locator('.daily-panel > .daily-lessons .daily-lesson-row');
      assert.ok(await scheduled.count() > 0, 'Admitted targets become due after time passes');
      await scheduled.first().getByRole('button', { name: '开始复习', exact: true }).click();
      await root(env).locator('.daily-question').waitFor();
      const session = (await progress(env)).session;
      assert.equal(session.mode, 'review');
      for (const entry of session.queue) {
        const { task, lesson } = env.config.exercises.get(entry.exerciseId);
        for (const id of dailyExerciseKnowledgeIds(lesson, task)) assert.ok(ready.has(id), `Non-admitted target leaked into review: ${id}`);
      }
      return { ready: [...ready], dueQueue: session.queue.map(entry => entry.exerciseId) };
    });
    if (earned[section]) await scenario(`${section}: confirm switching unfinished review to adaptive course`, { section, seed: { [config.key]: earned[section].course, ...(earned[section].review ? { [REVIEW_KEY]: earned[section].review } : {}) } }, async env => {
      const scripts = await env.page.evaluate(() => [...document.scripts].map(script => script.src));
      if (production) {
        assert.ok(scripts.some(url => /\/assets\/index-[^/]+\.js/.test(url)));
        assert.ok(!scripts.some(url => /src\/main\.tsx/.test(url)));
      }
      await navigate(env.page, '复习');
      await root(env).locator('.daily-early-review summary').click();
      await root(env).locator('.daily-early-review .daily-lesson-row').first().getByRole('button', { name: '开始练习', exact: true }).click();
      await root(env).locator('.daily-question').waitFor();
      await answer(env);
      const reviewed = await progress(env);
      assert.equal(reviewed.session.mode, 'review');
      assert.equal(reviewed.session.stage, 'exercise', 'A real review must remain unfinished for the replacement boundary');
      await navigate(env.page, '课程');
      await root(env).locator('.daily-lesson-row').getByRole('button').click();
      await root(env).locator('.daily-notice[role="status"]').waitFor();
      assert.equal((await progress(env)).session.id, reviewed.session.id, 'The pending confirmation preserves the review session');
      await root(env).locator('.daily-notice[role="status"]').getByRole('button', { name: /^开始“/ }).click();
      await root(env).locator('.daily-study-card').waitFor();
      const switched = await progress(env);
      assert.equal(switched.session.mode, 'lesson');
      assert.ok(switched.session.adaptive);
      assert.notEqual(switched.session.id, reviewed.session.id);
      assert.deepEqual(switched.lessons, reviewed.lessons, 'Confirmed replacement preserves submitted review evidence');
      assert.deepEqual(switched.knowledge, reviewed.knowledge);
      await root(env).getByRole('button', { name: '开始练习', exact: true }).click();
      await answer(env);
      const answered = await progress(env);
      await env.page.reload(); await root(env).locator('.daily-question').waitFor();
      assert.deepEqual((await progress(env)).session, answered.session, 'The new dynamic course saves and resumes normally');
      return { scripts, reviewSessionId: reviewed.session.id, courseSessionId: switched.session.id, plan: switched.session.adaptive };
    });
  }

  if (earned.daily) await scenario('daily: spoken expression self check cannot increase mastery', { section: 'daily', seed: { [DAILY_KEY]: earned.daily.course } }, async env => {
    const before = await progress(env), ready = new Set(readyIds(before));
    const lesson = env.config.lessons.find(lesson => lesson.exercises.some(task => task.kind === 'speak' && dailyExerciseKnowledgeIds(lesson, task).every(id => ready.has(id))));
    assert.ok(lesson, 'Earned independent practice has admitted all targets for a spoken review');
    await navigate(env.page, '复习');
    await root(env).getByLabel('复习内容', { exact: true }).selectOption('speaking');
    await root(env).locator('.daily-early-review summary').click();
    await root(env).locator('.daily-early-review .daily-lesson-row').filter({ hasText: lesson.title }).getByRole('button', { name: '开始练习', exact: true }).click();
    await root(env).locator('.daily-question[data-kind="speak"]').waitFor();
    await answer(env);
    const after = await progress(env);
    for (const [id, target] of Object.entries(before.learning.targets)) {
      // Practicing is still an exposure, so lastSeenTurn can advance after self assessment.
      for (const key of ['confidence', 'abilities', 'readyAt', 'transfer', 'signatures']) assert.deepEqual(after.learning.targets[id][key], target[key], `Self-reported speech must not improve ${id}/${key}`);
    }
    return { sourceLessonId: lesson.id, microphoneTested: false };
  });

  await scenario('real Aria and Guy word, example and daily phrase playback', {}, async env => {
    await navigate(env.page, '词汇库');
    const word = vocabulary.find(item => item.id === 3561);
    await env.page.getByLabel('搜索当前列表').fill(word.example);
    const card = env.page.locator('.word-card').filter({ has: env.page.getByRole('button', { name: `朗读单词 ${word.word}`, exact: true }) });
    for (const voice of ['aria', 'guy']) {
      await env.page.locator('#vocabulary-content').getByRole('button', { name: '语音设置', exact: true }).click();
      await env.page.getByLabel('点读声音', { exact: true }).selectOption(voice);
      await env.page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
      for (const type of ['word', 'example']) {
        const start = await env.page.evaluate(() => window.__adaptiveAudio.events.length);
        await card.getByRole('button', { name: type === 'word' ? `朗读单词 ${word.word}` : `朗读例句 ${word.example}`, exact: true }).click();
        await env.page.waitForFunction(({ start, voice, type, id }) => window.__adaptiveAudio.events.slice(start).some(event => event.type === 'playing' && event.src.includes(`/audio/${voice}/${type}-${id}.mp3`) && event.duration > 0), { start, voice, type, id: word.id });
      }
      await env.page.getByRole('button', { name: '日常英语', exact: true }).click();
      await navigate(env.page, '表达库');
      await root({ ...env, config: configs.daily }).getByLabel('查找表达').fill('Hello!');
      await env.page.getByRole('button', { name: '朗读 Hello!', exact: true }).click();
      await env.page.waitForFunction(voice => window.__adaptiveAudio.events.some(event => event.type === 'playing' && event.src.includes(`/audio/daily/${voice}/hello.mp3`) && event.duration > 0), voice);
      await env.page.getByRole('button', { name: '编程英语', exact: true }).click();
      await navigate(env.page, '词汇库');
    }
    const events = await env.page.evaluate(() => window.__adaptiveAudio.events.filter(event => event.type === 'playing'));
    await writeFile(path.join(output, 'audio-playback.json'), JSON.stringify(events, null, 2));
    return events;
  });

  for (const section of ['programming', 'daily']) for (const width of [1440, 390]) await scenario(`${section}: four themes at ${width}px`, { section, width }, async env => {
    await startRound(env);
    const session = (await progress(env)).session;
    for (const theme of themes) {
      await env.page.getByLabel('界面风格', { exact: true }).selectOption(theme);
      assert.deepEqual((await progress(env)).session, session);
      await noOverflow(env.page);
      await env.page.screenshot({ path: path.join(output, `${section}-exercise-${theme}-${width}.png`) });
      await navigate(env.page, '复习'); await noOverflow(env.page);
      await env.page.screenshot({ path: path.join(output, `${section}-review-${theme}-${width}.png`) });
      await navigate(env.page, section === 'programming' ? '词汇库' : '表达库'); await noOverflow(env.page);
      await navigate(env.page, '课程'); await resume(env);
    }
  });
} finally { await saveReport(); await browser.close(); }
assert.deepEqual(failures, [], `${failures.length} browser scenarios failed`);
assert.deepEqual(browserErrors, []);
console.log(`PASS ${results.length} adaptive browser scenarios, ${objectiveAnswers} objective answers and ${selfChecks} self checks. Microphone not tested.`);
