// Isolated Chrome contexts: no real user progress, accounts, microphone, or device.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession, parseDailyProgress, DAILY_KEY } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { vocabulary } from '../src/vocabulary.ts';
import { pairOrder } from '../src/pairPractice.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { resolveAdaptiveLesson } from '../src/adaptiveLearning.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5187/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/course-upgrade'); await mkdir(output, { recursive: true });
const configs = { daily: { lessons: adaptiveDailyLessons, key: DAILY_KEY }, programming: { lessons: adaptiveProgrammingLessons, key: PROGRAMMING_COURSE_KEY } };
const results = [], failures = [], events = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
function fixture(section, predicate) {
  const config = configs[section];
  const lesson = config.lessons.find(lesson => lesson.practice.some(predicate)); assert.ok(lesson);
  const task = lesson.practice.find(predicate), now = Date.now(), ids = [...new Set([...task.knowledgeIds, ...(task.prerequisiteIds ?? [])])];
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 4, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: .5, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 1 } };
  const parsed = parseDailyProgress(JSON.stringify(progress), config.lessons); assert.equal(parsed.writable, true, parsed.warning);
  return { task, state: { [config.key]: JSON.stringify(progress) } };
}
async function open(section, state, width = 390, session = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  page.on('response', response => { if (response.status() >= 400 && /\.mp3/.test(response.url())) errors.push(`${response.status()}: ${response.url()}`); });
  await page.addInitScript(({ state, section, session }) => {
    if (!sessionStorage.getItem('upgrade-test')) {
      localStorage.setItem('codewords-section', section); localStorage.setItem('codewords-theme', 'lagoon');
      Object.entries(state).forEach(([key, value]) => localStorage.setItem(key, value));
      Object.entries(session).forEach(([key, value]) => sessionStorage.setItem(key, value));
      sessionStorage.setItem('upgrade-test', '1');
    }
    const NativeAudio = window.Audio; window.__audio = { items: [], events: [] };
    window.Audio = function(...args) {
      const audio = new NativeAudio(...args); window.__audio.items.push(audio);
      for (const type of ['playing', 'ended', 'error']) audio.addEventListener(type, () => window.__audio.events.push({ type, src: audio.src, rate: audio.playbackRate, duration: audio.duration, pitch: audio.preservesPitch, active: window.__audio.items.filter(item => !item.paused && !item.ended).length }));
      return audio;
    }; window.Audio.prototype = NativeAudio.prototype;
  }, { state, section, session });
  await page.goto(baseURL);
  const main = page.locator(`#${section}-content`); await main.waitFor({ state: 'visible' });
  return { page, main, context, errors, config: configs[section] };
}
const saved = env => env.page.evaluate(key => JSON.parse(localStorage.getItem(key)), env.config.key);
async function layout(env, name, capture = false) {
  const value = await env.page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, nested: document.querySelectorAll('button button').length }));
  assert.equal(value.nested, 0); assert.ok(value.width <= value.viewport + 1, JSON.stringify(value));
  if (capture) {
    await env.page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
    await env.page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  }
}
async function scenario(name, run) {
  if (process.env.CODEWORDS_SCENARIO && !name.includes(process.env.CODEWORDS_SCENARIO)) return;
  const opened = [];
  try {
    await run(async (...args) => { const env = await open(...args); opened.push(env); return env; });
    for (const env of opened) {
      assert.deepEqual(env.errors, []);
      const audio = await env.page.evaluate(() => window.__audio.events);
      for (const event of audio) if (event.type === 'playing') { assert.ok(event.active <= 1, `Overlapping audio: ${JSON.stringify(event)}`); assert.equal(event.pitch, true); }
      events.push(...audio);
    }
    results.push({ name, passed: true }); console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false }); failures.push({ name, error: error.stack }); console.log(`FAIL ${name}: ${error.message}`);
    for (const env of opened) await env.page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true }).catch(() => {});
  } finally { for (const env of opened) await env.context.close(); }
}

for (const section of ['daily', 'programming']) {
  await scenario(`${section}-order-correction-reload-theme`, async open => {
    const { task, state } = fixture(section, task => task.id.endsWith('-order-words') && task.answers[0].split(' ').length === 4);
    const env = await open(section, state, 320), { page, main } = env;
    const solution = correctDraft(task).order, wrong = [...solution]; [wrong[1], wrong[2]] = [wrong[2], wrong[1]];
    for (const index of wrong) await main.locator('[aria-label="可选词块"] > .reading-token > .daily-token').nth(index).click();
    await main.getByRole('button', { name: '检查', exact: true }).click(); await main.locator('.answer-correction').waitFor();
    const notice = await main.locator('.answer-correction').boundingBox(), controls = await main.locator('.daily-controls').boundingBox();
    assert.ok(notice.y >= 0 && notice.y + notice.height <= controls.y + 1, 'The correction must be visible above the fixed answer controls');
    assert.ok(await main.locator('.daily-answer-tokens .needs-correction').count() > 0);
    assert.equal((await saved(env)).session.answers.length, 0); assert.ok(await main.getByRole('button', { name: '再检查', exact: true }).isDisabled());
    assert.equal(await main.locator('.daily-feedback').count(), 0);
    const draft = (await saved(env)).session.draft;
    for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
      await page.getByLabel('界面配色', { exact: true }).selectOption(theme);
      assert.deepEqual((await saved(env)).session.draft, draft); await layout(env, `${section}-correction-${theme}`, true);
    }
    await main.getByRole('button', { name: /返回课程/ }).click(); await main.getByRole('button', { name: '继续学习', exact: true }).click();
    await page.reload(); await main.locator('.answer-correction').waitFor(); assert.deepEqual((await saved(env)).session.draft, draft);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await main.locator('.answer-correction').evaluate(element => element === document.activeElement), true, 'Restored correction retains focus instead of the first input or tile');
    const restoredNotice = await main.locator('.answer-correction').boundingBox(), restoredControls = await main.locator('.daily-controls').boundingBox();
    assert.ok(restoredNotice.y >= 0 && restoredNotice.y + restoredNotice.height <= restoredControls.y + 1, 'Restored correction remains visible above the fixed answer controls');
    while (await main.locator('.daily-answer-tokens .daily-token').count()) await main.locator('.daily-answer-tokens .daily-token').first().click();
    for (const index of solution) await main.locator('[aria-label="可选词块"] > .reading-token > .daily-token').nth(index).click();
    await main.getByRole('button', { name: '再检查', exact: true }).click(); await main.locator('.daily-feedback').waitFor();
    assert.equal((await saved(env)).session.answers[0].outcome, 'assisted'); assert.equal((await saved(env)).session.answers[0].corrected, true);
    assert.match(await main.locator('.daily-feedback h3').innerText(), /修改正确/);
  });

  await scenario(`${section}-listening-gap-second-error`, async open => {
    const { task, state } = fixture(section, task => task.audioPrompt && task.blanks[0][0].length >= 5);
    const env = await open(section, state), { page, main } = env;
    const answer = task.blanks[0][0], input = main.getByRole('textbox', { name: '第 1 个空' });
    await main.getByRole('button', { name: '听一听', exact: true }).click();
    await page.waitForFunction(() => window.__audio.events.some(e => e.type === 'playing'));
    await main.getByRole('button', { name: '慢速播放录音', exact: true }).click();
    await page.waitForFunction(() => window.__audio.events.some(e => e.type === 'playing' && e.rate === .72));
    await input.fill(answer.slice(0, -1) + 'z'); await main.getByRole('button', { name: '检查', exact: true }).click();
    await main.locator('.answer-correction').waitFor(); assert.equal(await input.getAttribute('aria-invalid'), 'true');
    await page.reload(); await main.locator('.answer-correction').waitFor();
    await input.fill(answer.slice(0, -1) + 'x'); await input.press('Enter'); await main.locator('.daily-feedback').waitFor();
    assert.equal((await saved(env)).session.answers.length, 1); assert.equal((await saved(env)).session.answers[0].outcome, 'revealed');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await main.locator('.daily-feedback').evaluate(element => element === document.activeElement), true, 'Wrong-answer explanation receives focus instead of the fixed Continue button');
    await layout(env, `${section}-listen-gap`, true);
  });

  for (const mode of ['text', 'audio']) await scenario(`${section}-${mode}-pairs`, async open => {
    const { task, state } = fixture(section, task => task.kind === 'match' && task.pairMode === mode && task.pairs.length >= 3);
    const env = await open(section, state, 320), { page, main } = env;
    const left = pairOrder(task.pairs, `${task.id}:left`);
    const chooseLeft = item => main.locator('.course-pair-row > .course-pair-card').nth(left.findIndex(value => value.id === item.id)).click();
    const right = item => main.getByRole('group', { name: '中文含义', exact: true }).getByRole('button', { name: item.zh, exact: true });
    const first = task.pairs[0];
    if (mode === 'audio') for (const item of task.pairs) assert.ok(!(await main.locator('.course-pairs').innerText()).includes(item.en));
    const before = await main.locator('.course-pair-row > .course-pair-card').allTextContents();
    await chooseLeft(first); await right(task.pairs[1]).click();
    assert.equal((await saved(env)).session.draft.pairs.mistakes[first.id], 1);
    assert.equal(await right(task.pairs[1]).isDisabled(), true);
    await page.reload(); await main.locator('.pair-note').waitFor();
    assert.deepEqual(await main.locator('.course-pair-row > .course-pair-card').allTextContents(), before);
    for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
      await page.getByLabel('界面配色', { exact: true }).selectOption(theme); await layout(env, `${section}-${mode}-pairs-${theme}`, true);
    }
    await right(first).click();
    for (const item of task.pairs.slice(1)) {
      if ((await saved(env)).session.draft.pairs.matches[item.id]) continue;
      if (item === task.pairs.at(-1)) {
        assert.equal(await main.locator('.daily-feedback').count(), 0, 'The final pair must remain interactive');
        assert.equal((await saved(env)).session.answers.length, 0);
        assert.equal((await saved(env)).session.draft.pairs.matches[item.id], undefined);
        await page.reload(); await main.locator('.course-pairs').waitFor();
      }
      await chooseLeft(item); await right(item).click();
    }
    await main.locator('.daily-feedback').waitFor();
    const answer = (await saved(env)).session.answers[0]; assert.equal(answer.targets[first.id], 'assisted'); assert.equal(Object.values(answer.targets).filter(value => value === 'unmeasured').length, 1);
    await main.locator('.course-pair-row .daily-inline-slow').first().click();
    await page.waitForFunction(() => window.__audio.events.some(e => e.type === 'playing' && e.rate === .72));
    await layout(env, `${section}-${mode}-pairs-complete`, true);
  });
}

await scenario('programming-supporting-words', async open => {
  const { task, state } = fixture('programming', task => task.id.endsWith('-20-sentence'));
  const env = await open('programming', state, 320), { page, main } = env;
  const glosses = main.getByLabel('句中词语的含义', { exact: true });
  await glosses.waitFor();
  const text = await glosses.innerText();
  for (const word of task.supportWords) { assert.ok(text.includes(word.en)); assert.ok(text.includes(word.zh)); }
  assert.ok(!text.toLowerCase().includes('readme'), 'Glosses must not reveal the assessed target');
  assert.equal((await saved(env)).session.draft.helped, false, 'Supporting vocabulary is teaching, not target-answer help');
  await page.reload(); await glosses.waitFor();
  assert.equal((await saved(env)).session.queue[0].exerciseId, task.id);
  for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
    await page.getByLabel('界面配色', { exact: true }).selectOption(theme);
    await layout(env, `programming-supporting-words-${theme}`, true);
  }
  const choice = main.getByRole('group', { name: '答案选项', exact: true }).getByRole('button', { name: task.answers[0], exact: true });
  await choice.click(); await main.getByRole('button', { name: '检查', exact: true }).click();
  await main.locator('.daily-feedback').waitFor();
  assert.equal((await saved(env)).session.answers[0].outcome, 'independent');
});

await scenario('daily-writing-ime-and-one-retry', async open => {
  const { task, state } = fixture('daily', task => task.kind === 'write' && task.answers[0].split(' ').length === 4);
  const env = await open('daily', state), { page, main } = env; const input = main.locator('textarea');
  const words = task.answers[0].split(' '); [words[1], words[2]] = [words[2], words[1]];
  await input.fill(words.join(' ')); await input.dispatchEvent('compositionstart'); await input.press('Enter');
  assert.equal((await saved(env)).session.draft.correction, undefined); assert.equal((await saved(env)).session.answers.length, 0);
  await input.dispatchEvent('compositionend'); await input.fill(words.join(' ')); await input.press('Enter'); await main.locator('.answer-correction').waitFor();
  await input.fill(task.answers[0]); await input.press('Enter'); await main.locator('.daily-feedback').waitFor();
  assert.equal((await saved(env)).session.answers[0].corrected, true);
  await page.reload(); await main.locator('.daily-feedback').waitFor(); assert.equal((await saved(env)).session.answers.length, 1);
});

for (const support of ['partial', 'hidden']) await scenario(`speech-${support}`, async open => {
  const { task, state } = fixture('daily', task => task.kind === 'speak' && task.speechSupport === support && task.readAloud.length > 1);
  const env = await open('daily', state, 320), { page, main } = env;
  assert.ok(!(await main.locator('.speech-reference').first().innerText()).includes(task.readAloud[0].en));
  await main.getByRole('button', { name: '显示文本', exact: true }).first().click();
  assert.ok((await main.locator('.speech-reference').first().innerText()).includes(task.readAloud[0].en));
  await page.reload(); await main.locator('.speech-reference').first().waitFor();
  assert.ok((await main.locator('.speech-reference').first().innerText()).includes(task.readAloud[0].en));
  const before = (await saved(env)).learning.targets;
  await main.getByRole('button', { name: '自己表达', exact: true }).click(); await main.locator('.speech-edit summary').click(); await main.locator('textarea').fill('My own words.');
  for (const box of await main.locator('.daily-checks input').all()) await box.check();
  await main.getByRole('button', { name: '完成自查', exact: true }).click(); await main.locator('.daily-feedback').waitFor();
  const progress = await saved(env); assert.equal(progress.session.answers[0].outcome, 'self');
  for (const id of task.knowledgeIds) { assert.equal(progress.learning.targets[id].confidence, before[id].confidence); assert.deepEqual(progress.learning.targets[id].abilities, before[id].abilities); }
  await layout(env, `speech-${support}`, true);
});

await scenario('legacy-review-correction-refresh', async open => {
  const word = vocabulary.find(item => item.word === 'repository');
  const task = { id: 'review-correction', kind: 'dictation', words: [word], options: [], difficulty: 3, retry: false, evidence: [{ wordId: word.id, ability: 'spelling', level: 3, retry: false, exposed: true, kind: 'dictation' }] };
  const lesson = { id: 'resume-review', items: [word], tasks: [task], index: 0, results: [], finished: false };
  const env = await open('programming', {}, 390, { 'codewords-review-session-v1': JSON.stringify({ version: 1, active: true, lesson, feedback: null }) });
  const { page } = env, root = page.locator('.lesson-overlay');
  const input = root.locator('input').first(); await input.fill('repositry'); await root.getByRole('button', { name: '检查', exact: true }).click();
  await root.locator('.answer-correction').waitFor(); await page.reload(); await root.locator('.answer-correction').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await root.locator('.answer-correction').evaluate(element => element === document.activeElement), true, 'Restored word-review correction retains focus');
  assert.equal(await input.inputValue(), 'repositry'); await input.fill('repository'); await root.getByRole('button', { name: '再检查', exact: true }).click();
  await root.locator('.lesson-feedback').waitFor(); assert.match(await root.locator('.lesson-feedback').innerText(), /修改正确/);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-review-v1')));
  await page.reload(); await root.locator('.lesson-feedback').waitFor(); assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-review-v1'))), before);
  await root.getByRole('button', { name: '完成复习', exact: true }).click(); await root.locator('.lesson-summary').waitFor();
  await page.reload(); assert.equal(await page.locator('.lesson-overlay').count(), 0);
});

for (const section of ['daily', 'programming']) await scenario(`${section}-adaptive-budget-extension`, async open => {
  const { task, state } = fixture(section, task => task.kind === 'choice' && task.options?.some(option => !task.answers.includes(option)));
  const env = await open(section, state, 390), { main } = env;
  const wrong = task.options.find(option => !task.answers.includes(option));
  await main.getByRole('button', { name: wrong, exact: true }).click();
  await main.getByRole('button', { name: '检查', exact: true }).click();
  await main.locator('.daily-feedback').waitFor();
  assert.equal((await saved(env)).session.adaptive.budget, 1);
  await main.getByRole('button', { name: '继续', exact: true }).click();
  const session = (await saved(env)).session;
  assert.equal(session.adaptive.budget, 3, 'A difficult answer extends the round');
  assert.equal(await main.getByRole('progressbar', { name: '本课练习进度' }).count(), 0);
  assert.match(await main.locator('.daily-session-heading').innerText(), /已完成 1 题 · 题数按表现调整，最多 20 题/);
});

for (const section of ['daily', 'programming']) await scenario(`${section}-real-adaptive-round`, async open => {
  const env = await open(section, {}, 1280), { page, main } = env;
  await main.getByRole('button', { name: '开始学习', exact: true }).click();
  await main.getByRole('button', { name: '开始练习', exact: true }).click();
  let count = 0;
  while ((await saved(env)).session.stage !== 'summary') {
    assert.ok(count++ < 20, 'The adaptive round must end');
    const progress = await saved(env), session = progress.session;
    assert.equal(await main.getByRole('progressbar', { name: '本课练习进度' }).count(), 0, 'Adaptive rounds cannot promise a fixed total');
    assert.match(await main.locator('.daily-session-heading').innerText(), new RegExp(`已完成 ${session.answers.length} 题 · 题数按表现调整，最多 20 题`));
    const lesson = resolveAdaptiveLesson(session, env.config.lessons);
    const task = lesson.exercises.find(task => task.id === session.queue[session.index].exerciseId);
    assert.ok(task.knowledgeIds.every(id => progress.learning.targets[id]?.introducedAt));
    const answer = correctDraft(task);
    if (task.kind === 'choice' || task.kind === 'listen') {
      await main.getByRole('button', { name: task.answers[0], exact: true }).click();
    } else if (task.kind === 'fill') {
      for (const [index, value] of answer.blanks.entries()) await main.locator('.daily-fill input').nth(index).fill(value);
    } else if (task.kind === 'write') await main.locator('textarea').fill(answer.text);
    else if (task.kind === 'order') for (const index of answer.order) await main.locator('[aria-label="可选词块"] > .reading-token > .daily-token').nth(index).click();
    else if (task.kind === 'match') {
      const left = pairOrder(task.pairs, `${task.id}:left`);
      for (const item of task.pairs) {
        if ((await saved(env)).session.draft.pairs.matches[item.id]) continue;
        await main.locator('.course-pair-row > .course-pair-card').nth(left.findIndex(value => value.id === item.id)).click();
        await main.getByRole('group', { name: '中文含义', exact: true }).getByRole('button', { name: item.zh, exact: true }).click();
      }
    } else {
      await main.getByRole('button', { name: '自己表达', exact: true }).click(); await main.locator('.speech-edit summary').click(); await main.locator('textarea').fill(answer.text);
      for (const input of await main.locator('.daily-checks input').all()) await input.check();
    }
    if (task.kind !== 'match') await main.locator('.daily-controls .primary').click();
    await main.locator('.daily-feedback').waitFor();
    assert.equal((await saved(env)).session.feedback.correct, true, task.id);
    if (count === 3) { const prior = (await saved(env)).session; await page.reload(); await main.locator('.daily-feedback').waitFor(); assert.deepEqual((await saved(env)).session, prior); }
    await main.getByRole('button', { name: '继续', exact: true }).click();
  }
  await main.locator('.daily-summary').waitFor();
  assert.equal((await saved(env)).learning.rounds, 1);
  assert.equal(await main.getByRole('progressbar', { name: '本课练习进度' }).count(), 0);
  assert.match(await main.locator('.daily-session-heading').innerText(), new RegExp(`本轮完成 ${(await saved(env)).session.answers.length} 题`));
  await layout(env, `${section}-round-summary`, true);
  await main.getByRole('button', { name: '开始下一课', exact: true }).click(); await main.locator('.daily-study-card').waitFor();
  const next = await saved(env); assert.equal(next.session.stage, 'study'); assert.equal(next.session.adaptive.round, 2);
});

await browser.close();
await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ baseURL, results, failures, audioEvents: events, physicalDeviceTested: false, microphoneTested: false }, null, 2));
if (failures.length) process.exitCode = 1;
