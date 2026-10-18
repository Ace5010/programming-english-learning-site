import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveProgrammingLessons as lessons } from '../src/programmingPractice.ts';
import { createDailyProgress } from '../src/dailyProgress.ts';
import { vocabulary } from '../src/vocabulary.ts';
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
async function open(width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ theme, other }) => {
    if (!sessionStorage.getItem('word-check-qa')) {
      localStorage.setItem('codewords-section', 'programming');
      localStorage.setItem('codewords-theme', theme);
      localStorage.setItem('codewords-daily-v1', other);
      localStorage.setItem('codewords-foundation-v1', other);
      localStorage.setItem('codewords-favorites', '[1]');
      sessionStorage.setItem('word-check-qa', '1');
    }
    let seed = 314159;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    window.__wordCheckAudio = [];
    const OriginalAudio = window.Audio;
    function Audio(...args) {
      const audio = new OriginalAudio(...args);
      audio.addEventListener('playing', () => window.__wordCheckAudio.push({ src: audio.src, rate: audio.playbackRate, pitch: audio.preservesPitch }));
      return audio;
    }
    Audio.prototype = OriginalAudio.prototype;
    Object.setPrototypeOf(Audio, OriginalAudio);
    window.Audio = Audio;
  }, { theme, other });
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
async function scenario(name, width, theme, action) {
  const env = await open(width, theme);
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

for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) for (const width of [1440, 390]) {
  await scenario(`layout-${theme}-${width}`, width, theme, async ({ page, root }) => {
    assert.equal(await root.locator('[data-target-id]').count(), 6);
    assert.equal(await root.getByRole('button', { name: /^慢速朗读 / }).count(), 6);
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    await checkLayout(page);
    await root.getByRole('button', { name: '开始学习', exact: true }).click();
    await root.getByRole('button', { name: '开始测试', exact: true }).waitFor();
    assert.equal(await root.locator('.daily-phrase-word').count(), 6);
    assert.equal(await root.locator('.daily-question').count(), 0);
    assert.equal(await root.locator('.speech-mic').count(), 0);
    const saved = await read(page);
    assert.equal(saved.session.stage, 'study');
    assert.equal(saved.session.answers.length, 0);
    assert.equal(Object.keys(saved.learning?.targets ?? {}).length, 0);
    const cards = root.locator('.word-check-study .daily-study-expression');
    assert.equal(await cards.count(), 6);
    assert.equal(await cards.nth(1).locator('.daily-meaning').first().innerText(), '项目');
    await cards.first().locator('summary').click();
    const escaped = await cards.evaluateAll(nodes => nodes.flatMap(card => {
      const box = card.getBoundingClientRect();
      return [...card.children].filter(child => {
        const inner = child.getBoundingClientRect();
        return inner.bottom > box.bottom + 1 || inner.right > box.right + 1;
      }).map(child => child.className);
    }));
    assert.deepEqual(escaped, [], 'word and optional example must stay inside their card');
    await screenshot(page, `study-${theme}-${width}.png`);
    return await checkLayout(page);
  });
}

for (const width of [1440, 390]) await scenario(`flow-${width}`, width, 'lagoon', async ({ page, root }) => {
  await root.getByRole('button', { name: '开始学习', exact: true }).click();
  const first = (await read(page)).session.adaptive.focusIds;
  const firstWord = vocabulary.find(word => word.id === Number(first[0].slice(5)));
  await root.getByRole('button', { name: `朗读 ${firstWord.word}`, exact: true }).click();
  await page.waitForFunction(() => window.__wordCheckAudio.some(item => /word-1\.mp3/.test(item.src) && item.rate === 1));
  await root.getByRole('button', { name: `慢速朗读 ${firstWord.word}`, exact: true }).click();
  await page.waitForFunction(() => window.__wordCheckAudio.some(item => /word-1\.mp3/.test(item.src) && item.rate === .72 && item.pitch));
  assert.equal((await read(page)).session.stage, 'study');
  const studyAudio = await page.evaluate(() => window.__wordCheckAudio);
  await root.getByRole('button', { name: '开始测试', exact: true }).click();
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

await browser.close();
await writeFile(path.join(output, 'report.json'), JSON.stringify({ baseURL, results, failures }, null, 2));
assert.deepEqual(failures, [], `${failures.length} scenarios failed`);
