// Real Chrome regression for vocabulary browsing and media state after the redesign.
// Every test uses a fresh disposable context. No real browser profile is opened.
// Run together with test-review-browser.mjs for the full mixed-practice regression.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'Set CODEWORDS_TEST_URL to the existing Vite URL; do not change its port.');
const out = process.env.CODEWORDS_QA_DIR || path.join(tmpdir(), 'codewords-redesign-qa');
await mkdir(out, { recursive: true });
const source = await readFile(new URL('../src/vocabulary.ts', import.meta.url), 'utf8');
const vocabulary = JSON.parse(source.slice(source.indexOf('= [') + 2).trim().replace(/;$/, ''));
const item = vocabulary.find(word => word.id === 1);
const byId = new Map(vocabulary.map(word => [word.id, word]));
const byWord = new Map(vocabulary.map(word => [word.word, word]));
const browser = await chromium.launch({
  ...(process.env.CODEWORDS_CHROME ? { executablePath: process.env.CODEWORDS_CHROME } : { channel: 'chrome' }),
  headless: true,
});
const errors = [];
const results = [];
const mediaEvidence = [];

async function open(viewport = { width: 1440, height: 1000 }, reducedMotion = 'reduce') {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  // Observe native Audio objects and events. Do not replace network or playback.
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__redesignQA = { audio: [], events: [] };
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args);
      const index = window.__redesignQA.audio.push(audio) - 1;
      for (const type of ['playing', 'timeupdate', 'pause', 'ended', 'waiting', 'error']) {
        audio.addEventListener(type, () => window.__redesignQA.events.push({
          index, type, src: audio.src, currentTime: audio.currentTime,
          rate: audio.playbackRate, paused: audio.paused, ended: audio.ended,
        }));
      }
      return audio;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  });
  await page.goto(baseURL);
  await page.locator('.word-card').first().waitFor();
  return { context, page };
}
async function scenario(name, run, options) {
  const env = await open(options?.viewport, options?.reducedMotion);
  try {
    await run(env.page);
    results.push({ name, passed: true });
    console.log(`PASS: ${name}`);
  } finally { await env.context.close(); }
}
async function goLibrary(page) {
  const toggle = page.getByRole('button', { name: '打开菜单', exact: true });
  if (await toggle.count() && await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: '词库', exact: true }).click();
}
const cardFor = page => page.locator('.word-card').filter({ has: page.getByRole('button', { name: `朗读单词 ${item.word}`, exact: true }) });
const audioCount = page => page.evaluate(() => window.__redesignQA.audio.length);
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])));
async function waitPlaying(page, index, file, voice, rate) {
  await page.waitForFunction(index => {
    const qa = window.__redesignQA;
    return qa.events.some(event => event.index === index && event.type === 'playing') && qa.audio[index]?.currentTime > 0;
  }, index);
  const evidence = await page.evaluate(index => {
    const audio = window.__redesignQA.audio[index];
    return { index, src: audio.src, rate: audio.playbackRate, currentTime: audio.currentTime,
      duration: audio.duration, readyState: audio.readyState, preservesPitch: audio.preservesPitch,
      events: window.__redesignQA.events.filter(event => event.index === index) };
  }, index);
  assert.ok(new URL(evidence.src).pathname.endsWith(`/audio/${voice}/${file}`), evidence.src);
  assert.equal(evidence.rate, rate);
  assert.equal(evidence.preservesPitch, true);
  assert.ok(evidence.duration > 0 && evidence.currentTime > 0);
  mediaEvidence.push(evidence);
  return evidence;
}
async function expectFits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Document must not scroll horizontally.');
  const overflow = await page.locator('.word-card, .word-button, .example, .library-tools').evaluateAll(elements =>
    elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })));
  assert.deepEqual(overflow, [], JSON.stringify(overflow));
}

try {
  await scenario('word and example play real local audio; visible playback follows playing, pause and ended', async page => {
    await goLibrary(page);
    const card = cardFor(page);
    let releaseAudio;
    const audioGate = new Promise(resolve => { releaseAudio = resolve; });
    await page.route('**/audio/aria/word-1.mp3', async route => { await audioGate; await route.continue(); }, { times: 1 });
    try {
      await card.locator('.word-button').click();
      await page.waitForFunction(() => window.__redesignQA.audio.length === 1);
      assert.equal(await page.locator('.word-playing').count(), 0, 'A pending real audio request must not display fake playback.');
      assert.equal(await page.evaluate(() => window.__redesignQA.events.some(event => event.type === 'playing')), false);
    } finally { releaseAudio(); }
    await waitPlaying(page, 0, 'word-1.mp3', 'aria', 1);
    await page.waitForFunction(() => document.querySelector('.word-card').classList.contains('word-playing'));
    await card.locator('.word-button').click();
    await page.waitForFunction(() => window.__redesignQA.audio[0].paused && !document.querySelector('.word-card').classList.contains('word-playing'));
    assert.equal(await audioCount(page), 1, 'Clicking an active word stops the same audio instance.');
    await card.locator('.example > button').click();
    const example = await waitPlaying(page, 1, 'example-1.mp3', 'aria', 1);
    assert.equal(new URL(example.src).searchParams.get('v'), item.example);
    await page.waitForFunction(() => document.querySelector('.word-card .example > button').classList.contains('playing'));
    await page.waitForFunction(() => window.__redesignQA.events.some(event => event.index === 1 && event.type === 'ended'));
    await page.waitForFunction(() => !document.querySelector('.word-card .example > button').classList.contains('playing'));
    assert.equal(await page.locator('.word-playing').count(), 0);
  }, { reducedMotion: 'no-preference' });

  await scenario('voice and speed preferences control word/example playback and survive refresh', async page => {
    await goLibrary(page);
    const card = cardFor(page);
    for (const [voice, speed, rate] of [['guy', 'slow', 0.72], ['aria', 'normal', 1]]) {
      await page.getByRole('button', { name: '语音设置', exact: true }).click();
      await page.getByLabel('点读声音', { exact: true }).selectOption(voice);
      await page.getByLabel('点读语速', { exact: true }).selectOption(speed);
      await page.screenshot({ path: path.join(out, `settings-${voice}-${speed}.png`) });
      await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
      let index = await audioCount(page);
      await card.locator('.word-button').click();
      await waitPlaying(page, index, 'word-1.mp3', voice, rate);
      index = await audioCount(page);
      await card.locator('.example > button').click();
      await waitPlaying(page, index, 'example-1.mp3', voice, rate);
      await page.reload();
      await goLibrary(page);
      await card.locator('.word-button').click();
      await waitPlaying(page, 0, 'word-1.mp3', voice, rate);
      const saved = await storage(page);
      assert.equal(saved['codewords-voice'], voice);
      assert.equal(saved['codewords-playback-speed'], speed);
    }
  });

  await scenario('favorites, mastery, progress and old storage survive refresh without resetting unrelated keys', async page => {
    const untouched = {
      'codewords-best-score': '8', 'codewords-quiz-sessions': '3',
      'codewords-quiz-last-tested': '{"17":12345}',
      'codewords-review-v1': '{"version":1,"words":{}}', 'qa-unrelated-record': 'preserve-me',
    };
    await page.evaluate(records => {
      for (const [key, value] of Object.entries(records)) localStorage.setItem(key, value);
      localStorage.setItem('codewords-mastered', '[17]');
      localStorage.setItem('codewords-favorites', '[29]');
    }, untouched);
    await page.reload();
    await goLibrary(page);
    const card = cardFor(page);
    await card.locator('.favorite').click();
    assert.equal(await card.locator('details').count(), 0, 'Spelling breakdown was removed.');
    assert.equal(await audioCount(page), 0, 'Favorite does not trigger audio.');
    await card.locator('.known').click();
    assert.equal(await audioCount(page), 0, 'Mastery does not trigger audio.');
    await page.reload();
    await page.getByRole('button', { name: '收藏夹', exact: true }).click();
    assert.equal(await card.locator('.favorite').getAttribute('aria-pressed'), 'true');
    assert.equal(await card.locator('.known').innerText(), '重新学习');
    let saved = await storage(page);
    assert.deepEqual(JSON.parse(saved['codewords-mastered']).sort((a, b) => a - b), [1, 17]);
    assert.deepEqual(JSON.parse(saved['codewords-favorites']).sort((a, b) => a - b), [1, 29]);
    for (const [key, value] of Object.entries(untouched)) assert.equal(saved[key], value, key);
    await page.getByRole('button', { name: '已掌握', exact: true }).click();
    await card.locator('.known').click();
    await page.reload();
    saved = await storage(page);
    assert.deepEqual(JSON.parse(saved['codewords-mastered']), [17]);
    assert.deepEqual(JSON.parse(saved['codewords-favorites']).sort((a, b) => a - b), [1, 29]);
  });

  await scenario('category, tier, search, paging and navigation counts retain actual vocabulary behavior', async page => {
    await goLibrary(page);
    assert.equal(await page.locator('.word-card').count(), 24);
    const initialCounts = await page.locator('.nav-count').allTextContents();
    await page.getByRole('button', { name: /再显示 24 个/ }).click();
    assert.equal(await page.locator('.word-card').count(), 48);
    await page.getByLabel('词汇分类', { exact: true }).selectOption(item.category);
    await page.getByLabel('词汇级别', { exact: true }).selectOption(item.tier);
    await page.getByLabel('搜索当前列表', { exact: true }).fill(item.word);
    assert.equal(await cardFor(page).count(), 1);
    assert.deepEqual(await page.locator('.nav-count').allTextContents(), initialCounts, 'Filters do not change navigation totals.');
    await page.getByLabel('搜索当前列表', { exact: true }).fill('no-such-word-qa-xyz');
    await page.getByRole('heading', { name: '没有找到匹配词汇', exact: true }).waitFor();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    assert.ok(await page.locator('.word-card').count() > 0);
  });

  await scenario('desktop and mobile vocabulary screens stay readable without horizontal overflow', async page => {
    for (const width of [1440, 1920, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await expectFits(page);
      if ([1440, 1920, 390].includes(width)) await page.screenshot({ path: path.join(out, `vocabulary-${width}.png`), fullPage: true });
      await goLibrary(page);
      await expectFits(page);
      if ([1440, 1920].includes(width)) await page.screenshot({ path: path.join(out, `library-${width}.png`) });
      const longest = vocabulary.reduce((result, word) => word.word.length > result.word.length ? word : result);
      await page.getByLabel('搜索当前列表', { exact: true }).fill(longest.word);
      await page.getByRole('button', { name: `朗读单词 ${longest.word}`, exact: true }).waitFor();
      await expectFits(page);
      await page.getByRole('button', { name: '今日学习', exact: true }).click();
    }
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    // Wider real counts must not push the navigation beyond tablet breakpoints.
    await page.evaluate(() => {
      localStorage.setItem('codewords-mastered', JSON.stringify(Array.from({ length: 1200 }, (_, index) => index + 1)));
      localStorage.setItem('codewords-favorites', JSON.stringify(Array.from({ length: 3200 }, (_, index) => index + 1)));
    });
    await page.reload();
    for (const width of [320, 431, 761, 768, 820, 900, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectFits(page);
    }
  });

  if (process.env.CODEWORDS_SKIP_PRACTICE !== '1') await scenario('a wrong answer receives feedback, a later corrective recheck, and a complete five-type round', async page => {
    const ids = [1, 2, 3, 21, 29];
    await page.evaluate(ids => localStorage.setItem('codewords-mastered', JSON.stringify(ids)), ids);
    await page.reload();
    await page.locator('.quiz-button').click();
    await page.locator('.lesson-exercise').waitFor();
    const initialCount = Number((await page.locator('.lesson-count').innerText()).split('/')[1]);
    assert.equal(initialCount, 10);
    await page.screenshot({ path: path.join(out, 'practice-1440.png') });
    const kinds = new Set();
    let tasks = 0;
    let retried = 0;
    let wrongId;
    while (!(await page.locator('.lesson-summary-list').count())) {
      assert.ok(tasks++ < 15, 'Corrective work must finish within the established 15-task cap.');
      const classes = await page.locator('.lesson-exercise').getAttribute('class');
      const kind = /lesson-exercise-(meaning|listen|dictation|cloze|pairs)/.exec(classes)?.[1];
      assert.ok(kind);
      if (!kinds.has(kind)) await page.screenshot({ path: path.join(out, `practice-${kind}-1440.png`) });
      kinds.add(kind);
      if (await page.getByText('再练一次', { exact: true }).count()) retried++;
      if (kind === 'pairs') {
        const labels = await page.getByRole('group', { name: '英文单词', exact: true }).locator('button:not([disabled])').allTextContents();
        for (const label of labels) {
          const word = byWord.get(label.trim());
          assert.ok(word, label);
          await page.getByRole('group', { name: '英文单词', exact: true }).getByRole('button', { name: word.word, exact: true }).click();
          await page.getByRole('group', { name: '中文含义', exact: true }).getByRole('button', { name: word.meaning, exact: true }).click();
        }
      } else {
        let target;
        if (kind === 'meaning') target = byWord.get((await page.locator('.lesson-target strong').innerText()).trim());
        else if (kind === 'cloze') {
          const translation = (await page.locator('.lesson-translation').innerText()).trim();
          target = ids.map(id => byId.get(id)).find(word => word.exampleZh.trim() === translation);
        } else {
          const index = await audioCount(page);
          await page.getByRole('button', { name: '播放单词', exact: true }).click();
          const src = await page.evaluate(() => window.__redesignQA.audio.at(-1)?.src);
          const id = Number(/\/word-(\d+)\.mp3(?:[?#]|$)/.exec(src)?.[1]);
          target = byId.get(id);
          assert.ok(target, src);
          await waitPlaying(page, index, `word-${id}.mp3`, 'aria', 1);
        }
        assert.ok(target);
        if (tasks === 1) {
          assert.equal(kind, 'meaning');
          wrongId = target.id;
          const options = page.getByRole('group', { name: '答案选项', exact: true }).getByRole('button');
          for (let index = 0; index < await options.count(); index++) {
            if ((await options.nth(index).innerText()).trim() !== target.meaning) { await options.nth(index).click(); break; }
          }
        } else if (kind === 'dictation') {
          const full = page.getByRole('textbox', { name: '英文拼写', exact: true });
          if (await full.count()) await full.fill(target.word);
          else {
            const letters = [...target.word].filter(letter => /^[a-z]$/i.test(letter));
            const inputs = page.locator('.lesson-letter-input');
            for (let index = 0; index < await inputs.count(); index++) {
              const input = inputs.nth(index);
              const label = await input.getAttribute('aria-label');
              const ordinal = Number(/第 (\d+) 个字母/.exec(label)?.[1]) - 1;
              await input.fill(letters[ordinal]);
            }
          }
        } else await page.getByRole('group', { name: '答案选项', exact: true }).getByRole('button', { name: kind === 'meaning' ? target.meaning : target.word, exact: true }).click();
        await page.getByRole('button', { name: '检查', exact: true }).click();
      }
      await page.locator('.lesson-feedback').waitFor();
      if (tasks === 1) {
        assert.match(await page.locator('.lesson-feedback').innerText(), /正确答案/);
        await page.screenshot({ path: path.join(out, 'feedback-error-1440.png') });
      }
      const previous = await page.locator('.lesson-count').innerText();
      await page.locator('.lesson-footer .lesson-primary').click();
      await page.waitForFunction(previous => document.querySelector('.lesson-count')?.textContent !== previous, previous);
    }
    assert.deepEqual([...kinds].sort(), ['cloze', 'dictation', 'listen', 'meaning', 'pairs']);
    assert.equal(tasks, 11);
    assert.equal(retried, 1);
    const saved = await storage(page);
    assert.equal(saved['codewords-quiz-sessions'], '1');
    assert.equal(JSON.parse(saved['codewords-review-v1']).words[wrongId].meaning.needsPractice, true, 'Same-round correction does not erase the difficulty record.');
    await page.screenshot({ path: path.join(out, 'practice-summary-1440.png') });
  });

  if (process.env.CODEWORDS_SKIP_PRACTICE !== '1') await scenario('practice playback states use real normal/slow media and respect reduced motion and summary preferences', async page => {
    await page.evaluate(() => {
      localStorage.setItem('codewords-mastered', '[2]');
      localStorage.setItem('codewords-voice', 'guy');
      localStorage.setItem('codewords-playback-speed', 'slow');
    });
    await page.reload();
    await page.locator('.quiz-button').click();
    await page.locator('.lesson-exercise').waitFor();
    let index = await audioCount(page);
    await page.getByRole('button', { name: '播放单词', exact: true }).click();
    await waitPlaying(page, index, 'word-2.mp3', 'guy', 1);
    await page.locator('.lesson-audio-main.lesson-is-playing').waitFor();
    const animations = await page.locator('.lesson-sound-bars i').evaluateAll(elements => elements.map(element => ({
      animation: getComputedStyle(element).animationName, transition: getComputedStyle(element).transitionDuration,
    })));
    assert.ok(animations.length > 0, 'Real playback exposes the feedback bars.');
    assert.ok(animations.every(style => style.animation === 'none' && style.transition === '0s'), JSON.stringify(animations));
    index = await audioCount(page);
    await page.getByRole('button', { name: '慢速', exact: true }).click();
    await waitPlaying(page, index, 'word-2.mp3', 'guy', 0.72);
    await page.locator('.lesson-audio-slow.lesson-is-playing').waitFor();
    assert.equal(await page.locator('.lesson-audio-main.lesson-is-playing').count(), 0);
    await page.getByRole('button', { name: '慢速', exact: true }).click();
    await page.waitForFunction(index => window.__redesignQA.audio[index].paused && !document.querySelector('.lesson-audio-slow').classList.contains('lesson-is-playing'), index);
    let tasks = 0;
    while (!(await page.locator('.lesson-summary-list').count())) {
      assert.ok(tasks++ < 15);
      await page.getByRole('button', { name: '暂时不会', exact: true }).click();
      await page.locator('.lesson-feedback').waitFor();
      const previous = await page.locator('.lesson-count').innerText();
      await page.locator('.lesson-footer .lesson-primary').click();
      await page.waitForFunction(previous => document.querySelector('.lesson-count')?.textContent !== previous, previous);
    }
    index = await audioCount(page);
    await page.getByRole('button', { name: '听 branch 的发音', exact: true }).click();
    await waitPlaying(page, index, 'word-2.mp3', 'guy', 0.72);
    await page.locator('.lesson-summary-word .lesson-is-playing').waitFor();
  });

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  await writeFile(path.join(out, 'redesign-results.json'), JSON.stringify({ baseURL, browser: await browser.version(), results, errors, mediaEvidence }, null, 2) + '\n');
  console.log(`REDESIGN BROWSER PASS: ${results.length} scenarios; ${mediaEvidence.length} actual-playback checks; screenshots: ${out}`);
} finally { await browser.close(); }
