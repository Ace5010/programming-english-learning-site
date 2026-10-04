import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveProgrammingLessons as lessons } from '../src/programmingPractice.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer, parseDailyProgress } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { vocabulary } from '../src/vocabulary.ts';
import { mergeProgrammingCourse } from '../src/programmingProgress.ts';
import { programmingReview } from '../src/programmingReview.ts';
import { correctDraft } from './helpers/course-answer.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://127.0.0.1:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/programming-word-check-20261004/browser');
await mkdir(output, { recursive: true });
const tasks = new Map(lessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice]).map(task => [task.id, task]));
const key = 'codewords-programming-course-v1';
const other = JSON.stringify(createDailyProgress());
const results = [], failures = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function open(width, theme, progress) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ theme, other, progress }) => {
    if (!sessionStorage.getItem('word-check-qa')) {
      localStorage.setItem('codewords-section', 'programming');
      localStorage.setItem('codewords-theme', theme);
      localStorage.setItem('codewords-daily-v1', other);
      localStorage.setItem('codewords-foundation-v1', other);
      localStorage.setItem('codewords-favorites', '[1]');
      if (progress) localStorage.setItem('codewords-programming-course-v1', JSON.stringify(progress));
      sessionStorage.setItem('word-check-qa', '1');
    }
    let seed = 314159;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    window.__wordCheckAudio = [];
    window.__wordCheckRequests = [];
    const OriginalAudio = window.Audio;
    function Audio(...args) {
      const audio = new OriginalAudio(...args);
      const originalPlay = audio.play.bind(audio);
      audio.play = () => { window.__wordCheckRequests.push({ src: audio.src, rate: audio.playbackRate, pitch: audio.preservesPitch }); return originalPlay(); };
      audio.addEventListener('playing', () => window.__wordCheckAudio.push({ src: audio.src, rate: audio.playbackRate, pitch: audio.preservesPitch }));
      return audio;
    }
    Audio.prototype = OriginalAudio.prototype;
    Object.setPrototypeOf(Audio, OriginalAudio);
    window.Audio = Audio;
  }, { theme, other, progress });
  await page.goto(baseURL);
  await page.locator('#programming-content').waitFor({ state: 'visible' });
  return { page, context, errors, root: page.locator('#programming-content') };
}
async function checkLayout(page) {
  const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('#programming-content button, #programming-content input')]
      .filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().right > innerWidth + 2).map(node => node.textContent) }));
  assert.ok(layout.content <= layout.width + 2, JSON.stringify(layout));
  assert.deepEqual(layout.overflow, []);
  return layout;
}
async function screenshot(page, name) {
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}
async function scenario(name, width, theme, action, progress) {
  if (process.env.CODEWORDS_SCENARIO && name !== process.env.CODEWORDS_SCENARIO) return;
  const env = await open(width, theme, progress);
  try {
    const evidence = await action(env);
    assert.deepEqual(env.errors, []);
    results.push({ name, width, theme, evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.stack });
    await env.page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await env.context.close(); }
}

for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) for (const width of [1440, 390, 320]) {
  await scenario(`layout-${theme}-${width}`, width, theme, async ({ page, root }) => {
    assert.equal(await root.locator('[data-target-id]').count(), 6);
    assert.equal(await root.getByRole('button', { name: /^慢速朗读 / }).count(), 12);
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    await checkLayout(page);
    await root.getByRole('heading', { name: '本节课会学到的词语', exact: true }).waitFor();
    await root.getByRole('button', { name: '开始测试', exact: true }).waitFor();
    assert.equal(await root.getByRole('button', { name: '开始学习', exact: true }).count(), 0);
    assert.equal(await root.locator('.daily-question').count(), 0);
    assert.equal(await root.locator('.speech-mic').count(), 0);
    const saved = await read(page);
    assert.equal(saved?.session ?? null, null);
    assert.equal(Object.keys(saved?.learning?.targets ?? {}).length, 0);
    const cards = root.locator('.course-word-card');
    assert.equal(await cards.count(), 6);
    assert.equal(await cards.nth(1).locator('.course-word-meaning').innerText(), '项目');
    assert.equal(await root.locator('.course-word-usage, .course-word-contrast').count(), 0);
    assert.equal(await root.locator('.course-word-example').count(), 6);
    assert.equal(await root.locator('.course-word-card details').count(), 0);
    const first = await cards.first().boundingBox(), second = await cards.nth(1).boundingBox();
    if (width === 1440) {
      assert.ok(Math.abs(first.y - second.y) < 2 && second.x > first.x + first.width);
      const learning = await root.locator('.course-home-main').boundingBox(), rail = await root.locator('.daily-rail').boundingBox();
      assert.ok(learning.width <= 940 && rail.x > learning.x + learning.width + 24, 'desktop leaves breathing room beside the learning area');
      assert.ok(Math.abs(rail.y - learning.y) < 2, 'progress belongs beside the learning area');
      assert.ok(Math.abs(learning.x - (width - rail.x - rail.width)) < 2, 'the content group has balanced outer whitespace');
    }
    else assert.ok(second.y >= first.y + first.height);
    const entry = await root.locator('.course-word-test-entry').boundingBox(), last = await cards.last().boundingBox();
    assert.ok(entry.y >= last.y + last.height, 'the test must follow all learning cards');
    const styles = await root.locator('.course-word-learning-heading h2').evaluate(node => ({
      color: getComputedStyle(node).color, size: parseFloat(getComputedStyle(node).fontSize),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-deep').trim(),
    }));
    assert.ok(styles.size >= 26);
    assert.notEqual(styles.color, 'rgb(0, 0, 0)');
    const escaped = await cards.evaluateAll(nodes => nodes.flatMap(card => {
      const box = card.getBoundingClientRect();
      return [...card.children].filter(child => {
        const inner = child.getBoundingClientRect();
        return inner.bottom > box.bottom + 1 || inner.right > box.right + 1;
      }).map(child => child.className);
    }));
    assert.deepEqual(escaped, [], 'word and open example must stay inside their card');
    await screenshot(page, `learning-${theme}-${width}.png`);
    return { ...await checkLayout(page), styles, card: first, testEntry: entry };
  });
}

for (const width of [1440, 390]) await scenario(`flow-${width}`, width, 'lagoon', async ({ page, root }) => {
  const first = await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId));
  const beforeStudy = await read(page);
  const firstWord = vocabulary.find(word => word.id === Number(first[0].slice(5)));
  await root.getByRole('button', { name: `朗读 ${firstWord.word}`, exact: true }).click();
  await page.waitForFunction(() => window.__wordCheckAudio.some(item => /word-1\.mp3/.test(item.src) && item.rate === 1));
  await root.getByRole('button', { name: `慢速朗读 ${firstWord.word}`, exact: true }).click();
  await page.waitForFunction(() => window.__wordCheckAudio.some(item => /word-1\.mp3/.test(item.src) && item.rate === .72 && item.pitch));
  assert.deepEqual(await read(page), beforeStudy, 'learning and audio must not enroll or grade words');
  const studyAudio = await page.evaluate(() => window.__wordCheckAudio);
  await root.getByRole('button', { name: '开始测试', exact: true }).click();
  assert.equal((await read(page)).session.stage, 'exercise');
  assert.equal((await read(page)).session.answers.length, 0);
  assert.equal(Object.keys((await read(page)).learning.targets).length, 6);
  assert.equal(await root.locator('.course-word-grid').count(), 0, 'start goes straight to the first check');
  const observed = [];
  for (let index = 0; index < 10; index++) {
    const form = root.locator('.daily-question');
    await form.waitFor();
    const task = tasks.get(await form.getAttribute('data-exercise-id'));
    assert.ok(task);
    assert.ok(task.knowledgeIds.every(id => first.includes(id)));
    assert.ok(['choice', 'fill'].includes(task.kind));
    const wrong = width === 390 || index === 1;
    if (task.kind === 'choice') await form.getByRole('button', { name: wrong ? task.options.find(option => !task.answers.includes(option)) : task.answers[0], exact: true }).click();
    else await form.locator('input[data-blank]').fill(wrong ? 'zzzz' : correctDraft(task).blanks[0]);
    await root.getByRole('button', { name: '检查', exact: true }).click();
    await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key)).session.answers.length === count, { key, count: index + 1 });
    if (index === 3) {
      const before = await read(page);
      await page.reload();
      await root.getByRole('button', { name: '继续', exact: true }).waitFor();
      assert.deepEqual(await read(page), before);
    }
    observed.push({ id: task.id, kind: task.kind, targets: task.knowledgeIds, wrong });
    await root.getByRole('button', { name: '继续', exact: true }).click();
  }
  await root.getByRole('heading', { name: '本节测试已完成', exact: true }).waitFor();
  const finished = await read(page);
  assert.equal(finished.session.answers.length, 10);
  assert.equal(finished.session.stage, 'summary');
  assert.ok(observed.filter(task => task.kind === 'fill').length <= 1);
  assert.deepEqual([...new Set(observed.flatMap(task => task.targets))].sort(), [...first].sort());
  const text = await root.innerText();
  assert.ok(text.includes(width === 390 ? '这次认得 0 个词，6 个词还需熟悉' : '这次认得 5 个词，1 个词还需熟悉'), text);
  assert.ok(!text.includes('会继续穿插到后面的学习中'));
  const unfamiliar = root.locator('[aria-label="本次需要再熟悉的词"]');
  assert.equal(await unfamiliar.locator('.daily-phrase-word').count(), width === 390 ? 6 : 1);
  const resultAudioCount = await page.evaluate(() => window.__wordCheckAudio.length);
  await unfamiliar.getByRole('button', { name: /^慢速朗读 / }).first().click();
  await page.waitForFunction(previous => window.__wordCheckAudio.length > previous && window.__wordCheckAudio.at(-1).rate === .72, resultAudioCount);
  await checkLayout(page);
  await screenshot(page, `result-${width}.png`);
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '复习', exact: true }).click();
  const review = root.locator('[aria-label="已学词汇"]');
  await review.locator('[data-word-id]').first().waitFor();
  assert.equal(await review.locator('[data-word-id]').count(), 6);
  const previousReads = await page.evaluate(() => window.__wordCheckAudio.filter(item => /word-1\.mp3/.test(item.src) && item.rate === 1).length);
  await review.getByRole('button', { name: `朗读单词 ${firstWord.word}`, exact: true }).click();
  await page.waitForFunction(previous => window.__wordCheckAudio.filter(item => /word-1\.mp3/.test(item.src) && item.rate === 1).length > previous, previousReads);
  await screenshot(page, `review-${width}.png`);
  await checkLayout(page);
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '课程', exact: true }).click();
  const next = await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId));
  assert.equal(next.length, 6);
  assert.ok(next.every(id => !first.includes(id)));
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('codewords-daily-v1'), localStorage.getItem('codewords-foundation-v1'), localStorage.getItem('codewords-favorites')]), [other, other, '[1]']);
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '复习', exact: true }).click();
  await root.locator('.review-scenarios > summary').click();
  const scenes = root.locator('.daily-early-review');
  await scenes.locator('summary').click();
  await scenes.getByRole('button', { name: '开始练习', exact: true }).first().click();
  await root.locator('.daily-question').waitFor();
  const scene = await read(page);
  assert.equal(scene.session.mode, 'review');
  const sceneQuestion = scene.session.queue[scene.session.index].exerciseId;
  const reviewAudio = await page.evaluate(() => window.__wordCheckAudio);
  await page.reload();
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '复习', exact: true }).click();
  await root.getByRole('button', { name: '继续', exact: true }).click();
  await root.locator(`.daily-question[data-exercise-id="${sceneQuestion}"]`).waitFor();
  assert.deepEqual(await read(page), scene);
  return { first, next, observed, studyAudio, sceneQuestion, audio: reviewAudio };
});

await scenario('card-click-playback', 1440, 'lagoon', async ({ page, root }) => {
  const card = root.locator('.course-word-card').first();
  const id = await card.getAttribute('data-target-id');
  const word = vocabulary.find(item => `word-${item.id}` === id);
  const baseline = await read(page), clicks = [], slowReads = [];
  async function normal(action, target, voice = 'aria') {
    const before = await page.evaluate(() => ({ events: window.__wordCheckAudio.length, requests: window.__wordCheckRequests.length }));
    await action();
    await page.waitForFunction(({ before, target, voice }) => window.__wordCheckAudio.slice(before.events).some(event =>
      event.src.includes(`/audio/${voice}/${target}.mp3`) && event.rate === 1 && event.pitch), { before, target, voice });
    const requests = await page.evaluate(before => window.__wordCheckRequests.slice(before), before.requests);
    const normalRequests = requests.filter(request => request.rate === 1);
    assert.equal(normalRequests.length, 1, 'one click must issue one normal recording, with no bubbling replay');
    assert.ok(normalRequests[0].src.includes(`${target}.mp3`));
    clicks.push({ target, voice, request: normalRequests[0] });
  }
  await normal(() => card.locator('.course-word-meaning').click(), id);
  assert.ok((await card.getAttribute('class')).includes('word-playing'));
  await normal(() => card.locator('.course-word-english').click(), id); // Immediate repeat, even during playback.
  await normal(() => card.locator('.course-word-phonetic').click(), id);
  const box = await card.boundingBox();
  await normal(() => card.click({ position: { x: box.width - 8, y: 8 } }), id);
  await card.getByRole('button', { name: `朗读 ${word.word}`, exact: true }).focus();
  await card.locator('.course-word-example-meaning').evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await normal(() => page.keyboard.press('Enter'), id);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await normal(() => page.keyboard.press('Space'), id);
  let before = await page.evaluate(() => window.__wordCheckAudio.length);
  await card.getByRole('button', { name: `慢速朗读 ${word.word}`, exact: true }).click();
  await page.waitForFunction(({ before, id }) => window.__wordCheckAudio.slice(before).some(event => event.src.includes(`${id}.mp3`) && event.rate === .72 && event.pitch), { before, id });
  await normal(() => card.locator('.course-word-meaning').click(), id); // Slow must not leak into normal.
  const example = card.locator('.course-word-example'), exampleId = id.replace('word-', 'example-');
  await normal(() => example.locator('.course-word-example-meaning').click(), exampleId);
  await normal(() => example.locator('.course-word-example-english').click(), exampleId);
  await normal(() => example.click({ position: { x: 5, y: 5 } }), exampleId);
  before = await page.evaluate(() => window.__wordCheckAudio.length);
  await example.getByRole('button', { name: `慢速朗读 ${word.example}`, exact: true }).click();
  await page.waitForFunction(before => window.__wordCheckAudio.slice(before).some(event => event.rate === .72 && event.pitch), before);
  await example.locator('.course-word-status').getByText('正在朗读例句', { exact: true }).waitFor();
  assert.ok(!(await card.getAttribute('class')).includes('word-playing'));
  assert.ok((await card.getAttribute('class')).includes('example-playing'));
  assert.deepEqual(await read(page), baseline);
  async function allCards(voice) {
    for (const currentCard of await root.locator('.course-word-card').all()) {
      const target = await currentCard.getAttribute('data-target-id');
      await normal(() => currentCard.locator('.course-word-main').click(), target, voice);
      let count = await page.evaluate(() => window.__wordCheckAudio.length);
      const wordSlow = currentCard.locator('.course-word-pronunciation .daily-inline-slow');
      await wordSlow.click();
      await page.waitForFunction(({ count, target, voice }) => window.__wordCheckAudio.slice(count).some(event =>
        event.src.includes(`/audio/${voice}/${target}.mp3`) && event.rate === .72 && event.pitch), { count, target, voice });
      assert.equal(await wordSlow.getAttribute('aria-pressed'), 'true');
      slowReads.push({ target, voice, kind: 'word', ...(await page.evaluate(() => window.__wordCheckAudio.at(-1))) });
      await normal(() => currentCard.locator('.course-word-example-content').click(), target.replace('word-', 'example-'), voice);
      count = await page.evaluate(() => window.__wordCheckAudio.length);
      const sentenceSlow = currentCard.locator('.course-word-example .daily-inline-slow');
      await sentenceSlow.click();
      await page.waitForFunction(count => window.__wordCheckAudio.slice(count).some(event => event.rate === .72 && event.pitch), count);
      assert.equal(await sentenceSlow.getAttribute('aria-pressed'), 'true');
      assert.ok(!(await currentCard.getAttribute('class')).includes('word-playing'));
      slowReads.push({ target, voice, kind: 'example', ...(await page.evaluate(() => window.__wordCheckAudio.at(-1))) });
    }
  }
  await allCards('aria');
  await page.getByRole('button', { name: '语音设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').first().selectOption('guy');
  await page.keyboard.press('Escape');
  await normal(() => card.locator('.course-word-meaning').click(), id, 'guy');
  await normal(() => example.locator('.course-word-example-english').click(), exampleId, 'guy');
  await allCards('guy');
  await page.locator('.theme-picker select').selectOption('mint');
  assert.deepEqual(await read(page), baseline);
  const audio = await page.evaluate(() => window.__wordCheckAudio);
  await page.reload();
  await root.getByRole('heading', { name: '本节课会学到的词语', exact: true }).waitFor();
  assert.deepEqual(await read(page), baseline);
  return { clicks, slowReads, audio, isolatedProgress: true };
});

const empty = createDailyProgress();
const study = { ...empty, session: planAdaptiveSession(empty, lessons, Date.now(), () => .37) };
await scenario('saved-study-direct-test', 390, 'sky', async ({ page, root }) => {
  await root.getByRole('heading', { name: '本节课会学到的词语', exact: true }).waitFor();
  const before = await read(page);
  assert.equal(before.session.stage, 'study');
  await page.locator('.theme-picker select').selectOption('pearl');
  await page.reload();
  await root.getByRole('button', { name: '开始测试', exact: true }).waitFor();
  assert.deepEqual(await read(page), before);
  await root.getByRole('button', { name: '开始测试', exact: true }).click();
  await root.locator('.daily-question').waitFor();
  const after = await read(page);
  assert.equal(after.session.id, before.session.id);
  assert.equal(after.session.adaptive.seed, before.session.adaptive.seed);
  assert.deepEqual(after.session.queue, before.session.queue);
  assert.equal(after.session.stage, 'exercise');
  assert.equal(after.session.answers.length, 0);
  assert.equal(Object.keys(after.learning.targets).length, 6);
  assert.ok(Object.values(after.learning.targets).every(target => target.confidence === 0 && !target.readyAt));
  return { session: after.session.id, targets: after.session.adaptive.focusIds };
}, study);

const begun = beginAdaptiveLearning(study, lessons);
const firstTask = tasks.get(begun.session.queue[0].exerciseId);
const draftProgress = { ...begun, session: updateDailyDraft(begun.session, { choice: firstTask.options[0] }) };
await scenario('saved-answer-home-and-resume', 390, 'lagoon', async ({ page, root }) => {
  await root.locator('.daily-question').waitFor();
  const before = await read(page);
  await root.getByRole('button', { name: /返回课程/ }).click();
  await root.getByRole('button', { name: '继续测试', exact: true }).waitFor();
  assert.deepEqual(await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId)), before.session.adaptive.focusIds);
  await root.locator('.course-word-main').first().click();
  await page.locator('.theme-picker select').selectOption('pearl');
  assert.deepEqual(await read(page), before, 'home audio and palette must preserve an in-progress draft');
  await root.getByRole('button', { name: '继续测试', exact: true }).click();
  await root.locator(`.daily-question[data-exercise-id="${firstTask.id}"]`).waitFor();
  assert.equal(await root.locator('.daily-option[aria-pressed="true"]').innerText(), before.session.draft.choice);
  await page.reload();
  await root.locator('.daily-question').waitFor();
  assert.deepEqual(await read(page), before);
  return { task: firstTask.id, draft: before.session.draft };
}, draftProgress);

await scenario('skip-and-undo-before-test', 320, 'mint', async ({ page, root }) => {
  const first = await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId));
  await root.getByRole('button', { name: '这些我都会，跳过本课', exact: true }).click();
  const skipped = await read(page);
  assert.equal(Object.keys(skipped.learning?.targets ?? {}).length, 0);
  assert.deepEqual(Object.keys(skipped.learning.selfKnown).sort(), [...first].sort());
  assert.equal(skipped.learning.rounds, 0);
  const next = await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId));
  assert.ok(next.every(id => !first.includes(id)));
  await root.getByRole('button', { name: '撤销跳过', exact: true }).click();
  assert.deepEqual(await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId)), first);
  await root.getByRole('heading', { name: '本节课会学到的词语', exact: true }).waitFor();
  assert.equal((await read(page)).session.stage, 'study');
  assert.equal(Object.keys((await read(page)).learning?.targets ?? {}).length, 0);
  await checkLayout(page);
  return { first, next, restoredStudy: true };
});

let completed = beginAdaptiveLearning(study, lessons);
while (completed.session.stage === 'exercise') {
  const task = tasks.get(completed.session.queue[completed.session.index].exerciseId);
  completed = { ...completed, session: updateDailyDraft(completed.session, correctDraft(task)) };
  completed = advanceAdaptiveSession(recordAdaptiveAnswer(submitDailyAnswer(completed, resolveAdaptiveLesson(completed.session, lessons)), lessons), lessons);
}
const reviewing = { ...completed, session: programmingReview(mergeProgrammingCourse({}, completed, lessons)).session(lessons[0], 'meaning') };
assert.equal(parseDailyProgress(JSON.stringify(reviewing), lessons).writable, true, 'scene fixture must be a valid taught-word review');
await scenario('review-switch-keeps-draft-until-confirmed', 1440, 'lagoon', async ({ page, root }) => {
  await root.getByRole('heading', { name: '本节课会学到的词语', exact: true }).waitFor();
  const before = await read(page);
  assert.equal(before.session.mode, 'review');
  const newIds = await root.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId));
  assert.ok(newIds.every(id => !before.learning.targets[id]));
  await root.getByRole('button', { name: '开始测试', exact: true }).click();
  const notice = root.locator('.daily-notice').filter({ hasText: '还有一轮学习尚未结束' });
  await notice.waitFor();
  const noticeBox = await notice.boundingBox();
  assert.ok(noticeBox.y >= 0 && noticeBox.y + noticeBox.height <= 1000, `switch notice must be in view: ${JSON.stringify(noticeBox)}`);
  assert.deepEqual(await read(page), before, 'viewing and requesting a switch must preserve review');
  await root.getByRole('button', { name: '保留原来的练习', exact: true }).click();
  assert.deepEqual(await read(page), before);
  await root.getByRole('button', { name: '开始测试', exact: true }).click();
  await root.locator('.daily-notice').getByRole('button', { name: /^开始“/ }).click();
  await root.locator('.daily-question').waitFor();
  const after = await read(page);
  assert.equal(after.session.mode, 'lesson');
  assert.equal(after.session.stage, 'exercise');
  assert.deepEqual(after.session.adaptive.focusIds, newIds);
  return { review: before.session.id, newSession: after.session.id, newIds };
}, reviewing);

await browser.close();
await writeFile(path.join(output, 'report.json'), JSON.stringify({ baseURL, results, failures }, null, 2));
assert.deepEqual(failures, [], `${failures.length} scenarios failed`);
