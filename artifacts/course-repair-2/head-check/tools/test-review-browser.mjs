// Opt-in ReviewLesson / LessonExercise browser regression. This script launches Chrome.
// Run only where browser automation is permitted, with an existing Playwright package.
// CODEWORDS_PLAYWRIGHT may name that package directory; CODEWORDS_TEST_URL must
// equal the Local URL printed by the running Vite server. No user profile is opened.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'Set CODEWORDS_TEST_URL to the actual Local URL printed by Vite.');
assert.ok(['http:', 'https:'].includes(new URL(baseURL).protocol));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const screenshots = process.env.CODEWORDS_QA_DIR || path.join(tmpdir(), 'codewords-review-qa');
await mkdir(screenshots, { recursive: true });
const source = await readFile(new URL('../src/vocabulary.ts', import.meta.url), 'utf8');
const words = JSON.parse(source.slice(source.indexOf('= [') + 2).trim().replace(/;$/, ''));
const byWord = new Map(words.map(item => [item.word, item]));
const byId = new Map(words.map(item => [item.id, item]));
// The final three meanings are distinct, so this fixture exercises three pairs.
const mixedIds = [1, 2, 3, 21, 29];
const now = Date.now();
const day = 86_400_000;
const skill = (extra = {}) => ({ level: 0, streak: 0, intervalDays: 0, dueAt: 0, lastPracticedAt: 0, lastSuccessDay: '', lastFailureDay: '', needsPractice: false, ...extra });
const typingProgress = (id, level = 3) => ({ [id]: { meaning: skill({ dueAt: now + day }), spelling: skill({ level }) } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const problems = [];
let faviconErrors = 0;
let passed = 0;

async function open({ ids = mixedIds, progress, corrupt, viewport = { width: 1280, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.location().url.endsWith('/favicon.ico')) { faviconErrors++; return; }
    problems.push(`${message.text()} ${message.location().url}`);
  });
  page.on('dialog', async dialog => {
    problems.push(`Unexpected ${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });
  // Observe actual Audio objects without replacing playback or network behavior.
  // The real source identifies audio-only tasks without accessing React state.
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__lessonQA = { lastAudio: null };
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args);
      window.__lessonQA.lastAudio = audio;
      return audio;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  });
  try {
    await page.addInitScript(({ ids, progress, corrupt }) => {
      // Only this newly created disposable context owns these records.
      // Seed before React reads storage; a later reload must retain the test's changes.
      if (sessionStorage.getItem('codewords-review-qa-seeded')) return;
      sessionStorage.setItem('codewords-review-qa-seeded', '1');
      localStorage.clear();
      localStorage.setItem('codewords-mastered', JSON.stringify(ids));
      localStorage.setItem('codewords-favorites', '[17]');
      localStorage.setItem('codewords-best-score', '8');
      localStorage.setItem('codewords-quiz-sessions', '3');
      localStorage.setItem('codewords-voice', 'guy');
      localStorage.setItem('codewords-quiz-last-tested', JSON.stringify({ 17: 12345 }));
      if (progress) localStorage.setItem('codewords-review-v1', JSON.stringify({ version: 1, words: progress }));
      if (corrupt !== undefined) localStorage.setItem('codewords-review-v1', corrupt);
    }, { ids, progress, corrupt });
    await page.goto(baseURL);
    await page.locator('.quiz-button').click();
    await page.getByRole('dialog').waitFor();
    await page.locator('.lesson-exercise, .lesson-empty-copy').first().waitFor();
    return { context, page, ids, items: ids.map(id => byId.get(id)) };
  } catch (error) { await context.close(); throw error; }
}

async function scenario(name, options, run) {
  const environment = await open(options);
  try { await run(environment); passed++; console.log(`PASS: ${name}`); }
  finally { await environment.context.close(); }
}
async function readProgress(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('codewords-review-v1') || '{"words":{}}').words);
}
async function readStorage(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])));
}
async function currentKind(page) {
  const className = await page.locator('.lesson-exercise').getAttribute('class');
  const kind = /lesson-exercise-(meaning|listen|dictation|cloze|pairs)/.exec(className ?? '')?.[1];
  assert.ok(kind, `Unknown exercise: ${className}`);
  return kind;
}
async function targetFor({ page, items }) {
  const kind = await currentKind(page);
  if (kind === 'meaning') {
    const word = (await page.locator('.lesson-target strong').innerText()).trim();
    assert.ok(byWord.has(word), `Unknown meaning target: ${word}`);
    return byWord.get(word);
  }
  if (kind === 'cloze') {
    const translation = (await page.locator('.lesson-translation').innerText()).trim();
    const matches = items.filter(item => item.exampleZh.trim() === translation);
    assert.equal(matches.length, 1, `Cloze fixture needs a unique translation: ${translation}`);
    return matches[0];
  }
  assert.ok(kind === 'listen' || kind === 'dictation');
  await page.getByRole('button', { name: '播放单词', exact: true }).click();
  const src = await page.evaluate(() => window.__lessonQA.lastAudio?.src ?? '');
  const id = Number(/\/word-(\d+)\.mp3(?:[?#]|$)/.exec(src)?.[1]);
  assert.ok(byId.has(id), `No word target in actual audio URL: ${src}`);
  return byId.get(id);
}
async function pairItems(page) {
  const labels = await page.getByRole('group', { name: '英文单词', exact: true }).locator('button:not([disabled])').allTextContents();
  return labels.map(label => {
    assert.ok(byWord.has(label.trim()), `Unknown pair word: ${label}`);
    return byWord.get(label.trim());
  });
}
async function pairCorrect(page, item) {
  await page.getByRole('group', { name: '英文单词', exact: true }).getByRole('button', { name: item.word, exact: true }).click();
  await page.getByRole('group', { name: '中文含义', exact: true }).getByRole('button', { name: item.meaning, exact: true }).click();
}
async function fillDictation(page, item, answer = item.word) {
  const fullInput = page.getByRole('textbox', { name: '英文拼写', exact: true });
  if (await fullInput.count()) { await fullInput.fill(answer); return; }
  const letters = [...answer].filter(character => /^[a-z]$/i.test(character));
  const inputs = page.locator('.lesson-letter-input');
  assert.ok(await inputs.count(), 'Scaffolded dictation needs missing-letter inputs.');
  for (let index = 0; index < await inputs.count(); index++) {
    const input = inputs.nth(index);
    const label = await input.getAttribute('aria-label');
    const position = Number(/第 (\d+) 个字母/.exec(label ?? '')?.[1]) - 1;
    assert.ok(letters[position], `No letter for ${label} in ${item.word}`);
    await input.fill(letters[position]);
  }
}
async function answerCurrent(environment, { reveal = false } = {}) {
  const { page } = environment;
  const kind = await currentKind(page);
  if (reveal) await page.getByRole('button', { name: '暂时不会', exact: true }).click();
  else if (kind === 'pairs') {
    for (const item of await pairItems(page)) await pairCorrect(page, item);
  } else {
    const item = await targetFor(environment);
    if (kind === 'dictation') await fillDictation(page, item, item.word.toUpperCase());
    else await page.getByRole('group', { name: '答案选项', exact: true }).getByRole('button', { name: kind === 'meaning' ? item.meaning : item.word, exact: true }).click();
    await page.getByRole('button', { name: '检查', exact: true }).click();
  }
  await page.locator('.lesson-feedback').waitFor();
  return kind;
}
async function next(page) {
  const previousCount = await page.locator('.lesson-count').innerText();
  await page.locator('.lesson-footer .lesson-primary').click();
  await page.waitForFunction(previous => document.querySelector('.lesson-count')?.textContent !== previous, previousCount);
}
async function finishRound(environment, { reveal = false, onTask, onFeedback } = {}) {
  const kinds = new Set();
  let tasks = 0;
  while (!(await environment.page.locator('.lesson-summary-list').count())) {
    assert.ok(tasks++ < 15, 'A lesson must finish within fifteen tasks.');
    const kind = await currentKind(environment.page);
    kinds.add(kind);
    if (onTask) await onTask(kind, tasks);
    await answerCurrent(environment, { reveal });
    if (onFeedback) await onFeedback(kind, tasks);
    await next(environment.page);
  }
  return { kinds, tasks };
}
async function advanceTo(environment, kind) {
  for (let count = 0; count < 10; count++) {
    if (await currentKind(environment.page) === kind) return;
    await answerCurrent(environment);
    await next(environment.page);
  }
  assert.fail(`Fixture did not reach ${kind}.`);
}
async function checkFits(page) {
  const overflow = await page.locator('.lesson-overlay, .lesson-stage, .lesson-content, .lesson-footer-inner, .lesson-options, .lesson-pairs').evaluateAll(elements =>
    elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ className: element.className, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })));
  assert.deepEqual(overflow, [], `Horizontal lesson overflow: ${JSON.stringify(overflow)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
}

try {
  await scenario('all five exercise types complete through the new footer flow', {}, async environment => {
    const { page } = environment;
    const { kinds, tasks } = await finishRound(environment);
    assert.deepEqual([...kinds].sort(), ['cloze', 'dictation', 'listen', 'meaning', 'pairs']);
    assert.equal(tasks, 10);
    assert.equal(await page.locator('.lesson-summary-list > li').count(), 5);
    assert.match(await page.locator('#lesson-heading').innerText(), /复习了 5 个词/);
    const stored = await readStorage(page);
    assert.equal(stored['codewords-quiz-sessions'], '4');
    assert.equal(stored['codewords-best-score'], '8');
    assert.equal(stored['codewords-favorites'], '[17]');
    assert.deepEqual(JSON.parse(stored['codewords-mastered']), mixedIds);
    assert.equal(JSON.parse(stored['codewords-quiz-last-tested'])['17'], 12345);
    const progress = JSON.parse(stored['codewords-review-v1']).words;
    for (const id of mixedIds) {
      assert.equal(progress[id].meaning.needsPractice, false);
      assert.equal(progress[id].spelling.streak, 0, 'Seen-answer dictation is practice, not delayed-recall evidence.');
    }
    await page.screenshot({ path: path.join(screenshots, 'mixed-lesson-summary.png'), fullPage: true });
  });

  await scenario('one mismatched pair changes only that word and preserves individual outcomes', {}, async environment => {
    const { page } = environment;
    await advanceTo(environment, 'pairs');
    const items = await pairItems(page);
    assert.ok(items.length >= 2);
    const [wrongWord, otherWord] = items;
    await page.getByRole('group', { name: '英文单词', exact: true }).getByRole('button', { name: wrongWord.word, exact: true }).click();
    await page.getByRole('group', { name: '中文含义', exact: true }).getByRole('button', { name: otherWord.meaning, exact: true }).click();
    await page.locator('.lesson-note').waitFor();
    let progress = await readProgress(page);
    assert.equal(progress[wrongWord.id].meaning.needsPractice, true);
    assert.ok(items.filter(item => item.id !== wrongWord.id).every(item => !progress[item.id]?.meaning.needsPractice));
    assert.equal(await page.locator('.lesson-feedback').count(), 0);
    for (const item of items) await pairCorrect(page, item);
    await page.locator('.lesson-feedback').waitFor();
    progress = await readProgress(page);
    assert.equal(progress[wrongWord.id].meaning.needsPractice, true);
    for (const item of items.filter(item => item.id !== wrongWord.id)) {
      assert.equal(progress[item.id].meaning.needsPractice, false);
      assert.equal(progress[item.id].meaning.streak, 1);
    }
  });

  await scenario('dictation hints save difficulty immediately before any completed answer', { ids: [2], progress: typingProgress(2) }, async environment => {
    const { page } = environment;
    assert.equal(await currentKind(page), 'dictation');
    await page.getByRole('button', { name: '提示', exact: true }).click();
    await page.locator('.lesson-note').waitFor();
    assert.match(await page.locator('.lesson-note').innerText(), /第 \d+ 个字母/);
    const progress = await readProgress(page);
    assert.equal(progress['2'].spelling.needsPractice, true);
    assert.equal(progress['2'].spelling.level, 2);
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-quiz-last-tested')));
    assert.equal(history['2'], undefined, 'A hint alone must not mark the question finished.');
    await page.getByRole('button', { name: '退出复习', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await readStorage(page))['codewords-quiz-sessions'], '3');
    assert.equal((await readProgress(page))['2'].spelling.needsPractice, true);
  });

  await scenario('full dictation gives a brief letter-order correction and records the unfinished round', { ids: [2], progress: typingProgress(2) }, async environment => {
    const { page } = environment;
    await page.getByRole('textbox', { name: '英文拼写', exact: true }).fill('brnach');
    await page.getByRole('button', { name: '检查', exact: true }).click();
    await page.locator('.lesson-feedback').waitFor();
    const feedback = await page.locator('.lesson-feedback').innerText();
    assert.match(feedback, /正确答案/);
    assert.match(feedback, /第 3、4 个字母顺序反了/);
    assert.match(feedback, /branch/);
    assert.equal((await readProgress(page))['2'].spelling.needsPractice, true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await readStorage(page))['codewords-quiz-sessions'], '3');
    assert.equal(await page.locator('.quiz-button').evaluate(element => element === document.activeElement), true);
  });

  await scenario('scaffolded dictation remains assisted after using a hint and answering correctly', { ids: [2], progress: typingProgress(2, 1) }, async environment => {
    const { page } = environment;
    await page.getByRole('button', { name: '提示', exact: true }).click();
    assert.ok(await page.locator('.lesson-letter-input.lesson-letter-hint').count());
    await answerCurrent(environment);
    const progress = await readProgress(page);
    assert.equal(progress['2'].spelling.needsPractice, true);
    assert.equal(progress['2'].spelling.streak, 0);
    assert.equal(progress['2'].spelling.level, 0);
  });

  await scenario('cloze shows Chinese context by default without charging a hint', {}, async environment => {
    const { page } = environment;
    await advanceTo(environment, 'cloze');
    const item = await targetFor(environment);
    assert.equal(await page.locator('.lesson-translation').isVisible(), true);
    assert.equal((await page.locator('.lesson-translation').innerText()).trim(), item.exampleZh.trim());
    assert.ok(await page.locator('.lesson-sentence-gap').count());
    assert.equal(await page.locator('.lesson-note').count(), 0);
    const before = (await readProgress(page))[item.id].meaning;
    await answerCurrent(environment);
    const after = (await readProgress(page))[item.id].meaning;
    assert.equal(after.needsPractice, false);
    assert.equal(after.streak, before.streak);
    assert.equal(after.dueAt, before.dueAt);
  });

  await scenario('leaving before answering changes neither completion count nor review progress', { ids: [2] }, async ({ page }) => {
    await page.getByRole('button', { name: '退出复习', exact: true }).click();
    const stored = await readStorage(page);
    assert.equal(stored['codewords-quiz-sessions'], '3');
    assert.equal(stored['codewords-review-v1'], undefined);
    assert.deepEqual(JSON.parse(stored['codewords-quiz-last-tested']), { 17: 12345 });
  });

  await scenario('damaged review storage survives an entire in-memory lesson', { ids: [2], corrupt: '{broken' }, async environment => {
    const { page } = environment;
    await page.getByRole('alert').waitFor();
    await finishRound(environment, { reveal: true });
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-review-v1')), '{broken');
    assert.match(await page.locator('.lesson-save-note').innerText(), /未完整保存/);
    assert.equal((await readStorage(page))['codewords-best-score'], '8');
  });

  await scenario('storage write failure warns while the completed task remains usable', { ids: [2] }, async environment => {
    const { page } = environment;
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'codewords-review-v1') throw new DOMException('test quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await answerCurrent(environment);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.lesson-footer .lesson-primary').isEnabled(), true);
    await next(page);
    assert.equal(await currentKind(page), 'listen');
  });

  await scenario('all exercise types and feedback fit on a narrow phone', { viewport: { width: 360, height: 780 } }, async environment => {
    const { page } = environment;
    const captured = new Set();
    const { kinds } = await finishRound(environment, { onTask: async kind => {
      await checkFits(page);
      if (!captured.has(kind)) {
        captured.add(kind);
        await page.screenshot({ path: path.join(screenshots, `mobile-${kind}.png`) });
      }
    }, onFeedback: () => checkFits(page) });
    assert.equal(kinds.size, 5);
    await checkFits(page);
    await page.screenshot({ path: path.join(screenshots, 'mobile-summary.png') });
  });

  const longest = words.reduce((result, item) => item.word.length > result.word.length ? item : result);
  await scenario('long multiword dictation and its answer fit the phone', { ids: [longest.id], progress: typingProgress(longest.id), viewport: { width: 360, height: 780 } }, async environment => {
    const { page } = environment;
    assert.equal(await currentKind(page), 'dictation');
    await checkFits(page);
    await answerCurrent(environment);
    await checkFits(page);
    await page.screenshot({ path: path.join(screenshots, 'mobile-long-dictation.png') });
  });

  await scenario('actual audio retains the selected voice and slow playback rate', { ids: [2], progress: typingProgress(2) }, async environment => {
    const { page } = environment;
    assert.equal((await targetFor(environment)).id, 2);
    await page.waitForFunction(() => window.__lessonQA.lastAudio?.readyState >= 2);
    const normal = await page.evaluate(() => ({ src: window.__lessonQA.lastAudio.src, rate: window.__lessonQA.lastAudio.playbackRate }));
    assert.match(normal.src, /\/audio\/guy\/word-2\.mp3/);
    assert.equal(normal.rate, 1);
    await page.getByRole('button', { name: '慢速', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__lessonQA.lastAudio.playbackRate), 0.72);
  });

  assert.deepEqual(problems, [], `Browser errors: ${problems.join('\n')}`);
  console.log(`BROWSER PASS: ${passed} scenarios; favicon errors: ${faviconErrors}; screenshots: ${screenshots}`);
} finally { await browser.close(); }
