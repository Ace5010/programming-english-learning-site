// Deterministic failure/lifecycle tests. Recognition events here are simulated;
// real service validation lives in test-daily-speech-native.mjs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { createDailyProgress, createDailySession } from '../src/dailyProgress.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const url = process.env.CODEWORDS_TEST_URL;
assert.ok(url, 'Set CODEWORDS_TEST_URL to the running fixed-port website.');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const lesson = adaptiveDailyLessons[0];
const task = lesson.exercises.find(item => item.kind === 'speak');
const now = Date.now(), ids = task.knowledgeIds;
const seed = {
  ...createDailyProgress(),
  learning: { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) },
  session: { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } },
};
const results = [], errors = [];
async function open({ unsupported = false, lateLocal = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ seed, unsupported, lateLocal }) => {
    if (!sessionStorage.getItem('speech-seeded')) {
      localStorage.setItem('codewords-section', 'daily');
      localStorage.setItem('codewords-daily-v1', JSON.stringify(seed));
      localStorage.setItem('codewords-mastered', '[1,2,3]');
      localStorage.setItem('codewords-favorites', '[4]');
      sessionStorage.setItem('speech-seeded', '1');
    }
    window.__speechCalls = [];
    class MockRecognition {
      processLocally = false;
      static available() { return lateLocal ? new Promise(resolve => { window.__resolveLocal = resolve; }) : Promise.resolve('downloadable'); }
      start() { window.__speechCalls.push(this); this.started = true; this.onstart?.(); if (!window.__suppressAudioStart) this.onaudiostart?.(); }
      stop() { if (this.stopped) throw new Error('Duplicate stop'); this.stopped = true; if (!window.__deferEnd) queueMicrotask(() => this.onend?.()); }
      abort() { this.aborted = true; }
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = unsupported ? undefined : MockRecognition;
    window.__emitSpeech = (text, final = true) => {
      const current = window.__speechCalls.at(-1);
      current.onresult?.({ results: [{ isFinal: final, 0: { transcript: text } }] });
      if (final && !current.stopped) current.onend?.();
    };
  }, { seed, unsupported, lateLocal });
  await page.goto(url); await page.locator('.daily-speaking').waitFor();
  return { context, page };
}
const record = page => page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
const mic = (page, id = 'hello') => page.locator(`[data-speech-target="${id}"]`);
async function scenario(name, run, options) {
  const env = await open(options);
  try {
    await run(env.page);
    assert.equal(await env.page.evaluate(() => localStorage.getItem('codewords-mastered')), '[1,2,3]');
    assert.equal(await env.page.evaluate(() => localStorage.getItem('codewords-favorites')), '[4]');
    results.push({ name, passed: true }); console.log('PASS', name);
  } finally { await env.context.close(); }
}
try {
  await scenario('no automatic microphone; only final results save; mismatch and reread', async page => {
    assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);
    assert.equal(await page.locator('.daily-speaking textarea').count(), 0);
    await mic(page).click();
    await page.evaluate(() => window.__emitSpeech('hello', false));
    assert.equal((await record(page)).session.draft.speech, undefined);
    assert.equal(await page.locator('.speech-target.matched').count(), 0);
    assert.equal(await page.locator('.daily-controls .primary').isDisabled(), true);
    await page.evaluate(() => window.__emitSpeech('yellow'));
    await page.getByText('被识别为', { exact: false }).waitFor();
    assert.equal((await record(page)).session.answers.length, 0);
    await mic(page).click(); await page.evaluate(() => window.__emitSpeech('Hello!'));
    await page.locator('[data-phrase-id="hello"].matched').waitFor();
    await page.reload(); await page.locator('[data-phrase-id="hello"].matched').waitFor();
    await page.locator('.daily-controls .primary').click();
    assert.equal((await record(page)).session.answers.length, 0);
    await mic(page, 'goodbye').click(); await page.evaluate(() => window.__emitSpeech('Goodbye'));
    await page.locator('[data-phrase-id="goodbye"].matched').waitFor();
    await page.locator('.daily-controls .primary').click();
    await page.getByRole('heading', { name: '这组表达已完成跟读' }).waitFor();
    const saved = await record(page);
    assert.equal(saved.session.feedback.outcome, 'self');
    assert.equal(saved.lessons[lesson.id].skills.speaking.independentAnswers, 0);
  });
  await scenario('permission, network and silence errors are actionable and do not add wrong answers', async page => {
    for (const [code, text] of [['not-allowed', '麦克风权限未开启'], ['network', '语音识别服务连接失败'], ['no-speech', '没有识别到声音'], ['audio-capture', '没有找到可用的麦克风']]) {
      await mic(page).click();
      await page.evaluate(code => window.__speechCalls.at(-1).onerror?.({ error: code }), code);
      await page.getByRole('alert').filter({ hasText: text }).waitFor();
      assert.equal(await mic(page).isDisabled(), false);
      assert.equal((await record(page)).session.answers.length, 0);
      assert.equal((await record(page)).session.draft.speech, undefined);
    }
  });
  await scenario('manual stop retains a late final result without calling stop twice', async page => {
    await page.evaluate(() => { window.__deferEnd = true; });
    await mic(page).click(); await mic(page).click();
    await page.evaluate(() => { window.__emitSpeech('hello'); window.__speechCalls.at(-1).onend?.(); });
    await page.locator('[data-phrase-id="hello"].matched').waitFor();
    assert.equal(await page.evaluate(() => !!window.__speechCalls.at(-1).aborted), false);
    assert.equal((await record(page)).session.draft.speech.transcripts.hello, 'hello');
  });
  await scenario('theme preserves listening; mode, section and page exit abort and ignore late events', async page => {
    await mic(page).click();
    await page.evaluate(() => { window.__late = window.__speechCalls.at(-1).onresult; });
    await page.locator('.theme-picker select').selectOption('graffiti');
    assert.equal(await page.evaluate(() => !!window.__speechCalls.at(-1).aborted), false);
    await page.getByRole('button', { name: '自己表达', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
    await page.evaluate(() => window.__late({ results: [{ isFinal: true, 0: { transcript: 'hello' } }] }));
    assert.deepEqual((await record(page)).session.draft.speech.transcripts, {});
    await mic(page, 'self').click();
    await page.getByRole('button', { name: '编程英语', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
    await page.getByRole('button', { name: '日常英语', exact: true }).click();
    await mic(page, 'self').click();
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
  });
  await scenario('free expression is editable and a different name is not marked wrong', async page => {
    await page.getByRole('button', { name: '自己表达', exact: true }).click();
    await mic(page, 'self').click(); await page.evaluate(() => window.__emitSpeech('Hi. My name is Alex. Bye.'));
    await page.getByLabel('我说的内容（识别有误可修改）').waitFor();
    assert.equal(await page.locator('textarea').inputValue(), 'Hi. My name is Alex. Bye.');
    assert.equal(await page.locator('.speech-word.different').count(), 0);
    await page.locator('textarea').fill('Hi, I am Alex. Goodbye.');
    for (const box of await page.locator('.daily-checks input').all()) await box.check();
    await page.locator('textarea').press('Control+Enter');
    await page.getByRole('heading', { name: '已记录你的自查' }).waitFor();
  });
  await scenario('unsupported browser keeps an explicit self-expression path', async page => {
    assert.equal(await mic(page).isDisabled(), true);
    await page.getByText('当前浏览器不支持语音识别', { exact: false }).waitFor();
    await page.getByRole('button', { name: '自己表达', exact: true }).click();
    assert.equal(await page.locator('textarea').isEditable(), true);
  }, { unsupported: true });
  await scenario('late local availability does not relabel an active remote recognition', async page => {
    await mic(page).click();
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).processLocally), false);
    await page.evaluate(() => window.__resolveLocal('available'));
    await page.locator('.speech-service-note').filter({ hasText: '声音可能发送至该服务' }).waitFor();
    await page.evaluate(() => window.__emitSpeech('hello'));
    await page.locator('.speech-service-note').filter({ hasText: '使用设备上的英语识别' }).waitFor();
  }, { lateLocal: true });
  await scenario('cancelling a pending start and another-tab changes stop capture', async page => {
    await page.evaluate(() => { window.__suppressAudioStart = true; });
    await mic(page).click(); await mic(page).click();
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
    await page.evaluate(() => { window.__suppressAudioStart = false; });
    await mic(page).click();
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'codewords-daily-v1', newValue: 'changed-in-another-tab' })));
    await page.locator('.daily-notice').waitFor();
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
    assert.equal(await mic(page).isDisabled(), true);
  });
  await scenario('waiting for permissions times out without fabricated audio or progress', async page => {
    await page.clock.install();
    await page.evaluate(() => { window.__suppressAudioStart = true; });
    await mic(page).click();
    await page.clock.fastForward(15001);
    await page.getByRole('alert').filter({ hasText: '麦克风或识别服务没有启动' }).waitFor();
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
    assert.equal((await record(page)).session.answers.length, 0);
  });
  assert.deepEqual(errors, []);
  await mkdir('artifacts/daily-speech', { recursive: true });
  await writeFile('artifacts/daily-speech/simulated-browser-results.json', JSON.stringify({ input: 'simulated recognition events', results, errors }, null, 2));
} finally { await browser.close(); }
