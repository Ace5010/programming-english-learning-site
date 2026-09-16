// Keyboard regression in real Chrome with disposable learning records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'Use CODEWORDS_TEST_URL for the existing Vite address.');
const out = process.env.CODEWORDS_QA_DIR || path.join(tmpdir(), 'codewords-keyboard-qa');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];

async function open(level = 2, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(level => {
    const skill = extra => ({ level: 0, streak: 0, intervalDays: 0, dueAt: 0, lastPracticedAt: 0, lastSuccessDay: '', lastFailureDay: '', needsPractice: false, ...extra });
    localStorage.setItem('codewords-mastered', '[2]');
    localStorage.setItem('codewords-favorites', '[17]');
    localStorage.setItem('codewords-quiz-sessions', '3');
    localStorage.setItem('codewords-review-v1', JSON.stringify({ version: 1, words: { 2: {
      meaning: skill({ dueAt: Date.now() + 86_400_000 }), spelling: skill({ level }),
    } } }));
  }, level);
  await page.goto(baseURL);
  await page.getByRole('button', { name: '复习练习', exact: true }).click();
  await page.locator('.lesson-exercise-dictation').waitFor().catch(async error => {
    console.log('Failed fixture:', await page.locator('body').innerText(), errors);
    throw error;
  });
  return { context, page };
}
async function snapshot(page) {
  return page.evaluate(() => ({
    focused: document.activeElement?.getAttribute('aria-label'),
    values: [...document.querySelectorAll('.lesson-letter-input')].map(input => input.value),
  }));
}

async function scenario(name, run, level = 2, viewport) {
  const environment = await open(level, viewport);
  try {
    await run(environment);
    results.push({ name, passed: true });
    console.log(`PASS: ${name}`);
  } finally { await environment.context.close(); }
}
async function expectFocused(page, label) {
  assert.equal((await snapshot(page)).focused, label);
}
async function submitAndContinue(page) {
  assert.equal(await page.locator('.lesson-feedback').count(), 0, 'Typing never submits automatically.');
  await page.keyboard.press('Enter');
  await page.locator('.lesson-feedback').waitFor();
  assert.equal(await page.locator('.lesson-feedback strong').innerText(), '正确');
  assert.equal(await page.locator('.lesson-footer .lesson-primary').evaluate(element => element === document.activeElement), true);
  const previous = await page.locator('.lesson-count').innerText();
  await page.keyboard.press('Enter');
  await page.waitForFunction(previous => document.querySelector('.lesson-count')?.textContent !== previous, previous);
  assert.equal(await page.locator('.lesson-feedback').count(), 0);
  const stored = await page.evaluate(() => ({
    mastered: localStorage.getItem('codewords-mastered'),
    favorites: localStorage.getItem('codewords-favorites'),
    sessions: localStorage.getItem('codewords-quiz-sessions'),
  }));
  assert.deepEqual(stored, { mastered: '[2]', favorites: '[17]', sessions: '3' });
}

try {
  for (const level of [0, 1, 2]) {
    await scenario(`level ${level}: type every missing letter, check and continue without mouse focus changes`, async ({ page }) => {
      const labels = await page.locator('.lesson-letter-input').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label')));
      await expectFocused(page, labels[0]);
      const answer = labels.map(label => 'branch'[Number(/第 (\d+)/.exec(label)[1]) - 1]).join('').toUpperCase();
      await page.keyboard.type(answer);
      assert.deepEqual((await snapshot(page)).values, [...answer]);
      await submitAndContinue(page);
    }, level);
  }

  await scenario('arrow keys, replacement, deletion, Tab and incomplete Enter preserve the answer and focus', async ({ page }) => {
    await page.keyboard.type('ra');
    await expectFocused(page, '第 4 个字母');
    await page.keyboard.press('ArrowLeft');
    await expectFocused(page, '第 3 个字母');
    await page.keyboard.type('z');
    assert.deepEqual((await snapshot(page)).values, ['r', 'z', '', '', '']);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('a');
    await page.keyboard.press('ArrowRight');
    await expectFocused(page, '第 5 个字母');
    await page.keyboard.press('Backspace');
    await expectFocused(page, '第 4 个字母');
    await page.keyboard.press('Backspace');
    await expectFocused(page, '第 3 个字母');
    assert.deepEqual((await snapshot(page)).values, ['r', '', '', '', '']);
    await page.keyboard.type('a');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expectFocused(page, '第 4 个字母');
    assert.equal(await page.locator('.lesson-feedback').count(), 0);
    await page.keyboard.type('n');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    assert.deepEqual((await snapshot(page)).values, ['r', 'a', '', '', '']);
    await page.keyboard.type('nch');
    await page.keyboard.press('Shift+Tab');
    await expectFocused(page, '第 5 个字母');
    await page.keyboard.press('Tab');
    await expectFocused(page, '第 6 个字母');
    await page.keyboard.type('x');
    assert.deepEqual((await snapshot(page)).values, ['r', 'a', 'n', 'c', 'x']);
    await page.keyboard.type('h');
    await page.screenshot({ path: path.join(out, 'keyboard-dictation-1440.png') });
    await submitAndContinue(page);
  });

  await scenario('native IME commit advances after single or multiple letters without premature checking', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'r', selectionStart: 1, selectionEnd: 1 });
    await expectFocused(page, '第 2 个字母');
    await page.locator('.lesson-letter-input').first().dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
    assert.equal(await page.locator('.lesson-feedback').count(), 0);
    await cdp.send('Input.insertText', { text: 'r' });
    await expectFocused(page, '第 3 个字母');
    assert.deepEqual((await snapshot(page)).values, ['r', '', '', '', '']);
    await cdp.send('Input.imeSetComposition', { text: 'an', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: 'an' });
    await expectFocused(page, '第 5 个字母');
    assert.deepEqual((await snapshot(page)).values, ['r', 'a', 'n', '', '']);
    await page.keyboard.type('ch');
    await submitAndContinue(page);
  });

  await scenario('non-English IME text does not move focus or leave composition stuck', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '中' });
    await expectFocused(page, '第 2 个字母');
    assert.deepEqual((await snapshot(page)).values, ['', '', '', '', '']);
    await page.keyboard.type('ranch');
    await submitAndContinue(page);
  });

  await scenario('batched text input fills consecutive editable gaps and fits on a phone', async ({ page }) => {
    await page.keyboard.insertText('ranch');
    assert.deepEqual((await snapshot(page)).values, ['r', 'a', 'n', 'c', 'h']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(out, 'keyboard-dictation-390.png') });
    await submitAndContinue(page);
  }, 2, { width: 390, height: 844 });

  await scenario('full spelling keeps standard text editing and Enter check/continue', async ({ page }) => {
    await expectFocused(page, '英文拼写');
    await page.keyboard.type('branch');
    assert.equal(await page.getByLabel('英文拼写', { exact: true }).inputValue(), 'branch');
    await submitAndContinue(page);
  }, 3);

  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'keyboard-results.json'), JSON.stringify({ baseURL, browser: await browser.version(), results, errors }, null, 2));
  console.log(`KEYBOARD PASS: ${results.length} scenarios; screenshots and results: ${out}`);
} finally { await browser.close(); }
