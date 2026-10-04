// Isolated Chrome profiles. ASR events are simulated; no user data or microphone is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { beginAdaptiveLearning } from '../src/adaptiveLearning.ts';
import { createDailyProgress, createDailySession, parseDailyProgress } from '../src/dailyProgress.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/speech-protection/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const report = { url, input: 'simulated final/interim/error recognition events', scenarios: [], errors: [] };
const configs = {
  programming: { lessons: adaptiveProgrammingLessons, key: 'codewords-programming-course-v1' },
  daily: { lessons: adaptiveDailyLessons, key: 'codewords-daily-v1' },
};

function fixture(section, phraseText) {
  const { lessons, key } = configs[section];
  const predicate = task => task.speechActivity === 'repeat' && task.readAloud?.length === 1
    && (phraseText ? task.readAloud[0].en === phraseText : section === 'programming' ? task.readAloud[0].en === 'Please check my pull request.' : task.readAloud[0].en.split(' ').length >= 4);
  const lesson = lessons.find(item => item.practice.some(predicate)), task = lesson.practice.find(predicate);
  let progress = createDailyProgress();
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson'),
    adaptive: { version: 1, round: 1, sourceLessonId: lesson.id, focusIds: task.knowledgeIds, newIds: task.knowledgeIds, seed: 1, budget: 2 } };
  progress = beginAdaptiveLearning(progress, lessons);
  return { lessons, key, task, progress, phrase: task.readAloud[0] };
}

async function scenario(section, name, run, width = 1440, phraseText) {
  const data = fixture(section, phraseText);
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 }, reducedMotion: 'reduce' });
  await context.route('http://127.0.0.1:18768/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(({ section, key, progress }) => {
    if (!sessionStorage.getItem('speech-protection-seeded')) {
      localStorage.setItem('codewords-section', section);
      localStorage.setItem('codewords-theme', 'lagoon');
      localStorage.setItem(key, JSON.stringify(progress));
      localStorage.setItem('codewords-mastered', '[1,2]');
      localStorage.setItem('codewords-favorites', '[3]');
      localStorage.setItem(section === 'daily' ? 'codewords-programming-course-v1' : 'codewords-daily-v1', '{"version":1,"revision":0,"lessons":{},"session":null}');
      sessionStorage.setItem('speech-protection-seeded', '1');
    }
    window.__speechCalls = [];
    class Recognition {
      start() { window.__speechCalls.push(this); this.onaudiostart?.(); }
      stop() { queueMicrotask(() => this.onend?.()); }
      abort() { this.aborted = true; }
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = Recognition;
    window.__result = (text, final = true) => {
      const mic = window.__speechCalls.at(-1);
      mic.onresult?.({ results: [{ isFinal: final, 0: { transcript: text } }] });
      if (final) mic.onend?.();
    };
  }, data && { section, key: data.key, progress: data.progress });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const main = page.locator(`#${section}-content`);
    await main.locator('.daily-speaking').waitFor();
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), data.key);
    const say = async text => { await main.locator('.speech-mic').click(); await page.evaluate(text => window.__result(text), text); };
    const baseline = await saved();
    const result = await run({ ...data, page, main, saved, say, baseline });
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-mastered')), '[1,2]');
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-favorites')), '[3]');
    const otherKey = section === 'daily' ? 'codewords-programming-course-v1' : 'codewords-daily-v1';
    assert.equal(await page.evaluate(key => localStorage.getItem(key), otherKey), '{"version":1,"revision":0,"lessons":{},"session":null}');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(parseDailyProgress(JSON.stringify(await saved()), data.lessons).writable, true);
    await page.screenshot({ path: `${output}/${section}-${name}.png`, fullPage: true });
    report.scenarios.push({ section, name, width, passed: true, result });
    console.log('PASS', section, name, width);
  } finally { await context.close(); }
}

const mismatched = (phrase, count) => phrase.en.split(' ').map((word, index) => index < count ? ['yellow', 'purple'][index] : word).join(' ');
const unchangedMastery = (before, after) => {
  for (const [id, value] of Object.entries(before.learning.targets)) {
    assert.equal(after.learning.targets[id].confidence, value.confidence);
    assert.deepEqual(after.learning.targets[id].abilities, value.abilities);
    assert.equal(after.learning.targets[id].readyAt, value.readyAt);
  }
};

try {
  for (const section of ['programming', 'daily']) {
    await scenario(section, 'single-word-passes', async ({ page, main, phrase, say, saved, baseline }) => {
      const text = section === 'programming' ? 'please check my poll request' : mismatched(phrase, 1);
      await say(text);
      await main.locator('.speech-target.matched').waitFor();
      assert.equal(await main.locator('.speech-word.different, .speech-word.missing').count(), 0, 'accepted words do not retain failure styling');
      assert.equal((await saved()).session.answers.length, 0, 'passing does not automatically complete a successful interaction');
      await page.reload(); await main.locator('.speech-target.matched').waitFor();
      await main.locator('.daily-controls .primary').click();
      await main.locator('.daily-feedback').waitFor();
      const after = await saved(); unchangedMastery(baseline, after);
      assert.equal(after.session.answers[0].correct, true);
      assert.equal(after.session.answers[0].speech.source, 'recognition');
      assert.equal(after.session.answers[0].speech.assessment, section === 'programming' ? 'context' : 'tolerated');
      assert.equal(after.session.draft.speech.transcripts[phrase.id], text);
      return after.session.answers[0].speech;
    }, section === 'daily' ? 390 : 1440);

    await scenario(section, 'multiple-context-differences', async ({ page, main, phrase, say, saved, baseline }) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await say(mismatched(phrase, 2));
        await main.getByText(`已尝试 ${attempt}/3 次`, { exact: false }).waitFor();
      }
      const text = section === 'programming' ? 'please cheque my pool requests' : 'eye am form China';
      await say(text);
      await main.locator('.speech-target.matched').waitFor();
      await main.getByText('这句通过了。已结合上下文容忍近音词的识别差异。', { exact: true }).waitFor();
      assert.equal((await saved()).session.answers.length, 0, 'a context pass still needs the learner to complete it');
      assert.equal((await saved()).session.draft.speech.attempts[phrase.id], 3);
      assert.equal(await main.locator('.speech-skip-feedback').count(), 0);
      await page.reload();
      await main.locator('.speech-target.matched').waitFor();
      assert.equal((await saved()).session.draft.speech.transcripts[phrase.id], text);
      await main.locator('.daily-controls .primary').click();
      await main.locator('.daily-feedback').waitFor();
      const after = await saved(); unchangedMastery(baseline, after);
      assert.equal(after.session.answers[0].correct, true);
      assert.equal(after.session.answers[0].outcome, 'self');
      assert.equal(after.session.answers[0].speech.assessment, 'context');
      assert.equal(after.session.answers[0].speech.source, 'recognition');
      assert.equal(after.session.answers[0].speech.attempts[phrase.id], 3);
      return { expected: phrase.en, transcript: text, speech: after.session.answers[0].speech };
    }, section === 'programming' ? 390 : 1440, section === 'daily' ? 'I am from China.' : undefined);

    if (section === 'programming') await scenario(section, 'context-word-boundaries', async ({ page, main, phrase, say, saved, baseline }) => {
      const text = 'please check my pool re quest';
      await say(text);
      await main.locator('.speech-target.matched').waitFor();
      assert.equal(await main.locator('.speech-word.different, .speech-word.missing').count(), 0);
      assert.equal((await saved()).session.draft.speech.transcripts[phrase.id], text);
      await page.reload(); await main.locator('.speech-target.matched').waitFor();
      await main.locator('.daily-controls .primary').click(); await main.locator('.daily-feedback').waitFor();
      const after = await saved(); unchangedMastery(baseline, after);
      assert.equal(after.session.answers[0].speech.assessment, 'context');
      assert.equal(after.session.answers[0].correct, true);
      return { expected: phrase.en, transcript: text };
    });

    await scenario(section, 'third-failure-confirmation', async ({ page, main, phrase, say, saved, baseline }) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await say(mismatched(phrase, 2));
        await main.getByText(`已尝试 ${attempt}/3 次`, { exact: false }).waitFor();
        assert.equal((await saved()).session.answers.length, 0);
        assert.equal((await saved()).session.draft.speech.attempts[phrase.id], attempt);
        await page.reload(); await main.locator('.daily-speaking').waitFor();
        assert.equal((await saved()).session.draft.speech.attempts[phrase.id], attempt);
      }
      await main.getByRole('button', { name: '自己表达', exact: true }).click();
      await main.locator('.daily-sample summary').click();
      await main.getByRole('button', { name: '跟读示例', exact: true }).click();
      await main.locator('.speech-result details summary').click();
      await main.getByLabel('修正识别文字', { exact: true }).fill(mismatched(phrase, 2) + ' today');
      assert.equal((await saved()).session.draft.speech.attempts[phrase.id], 2, 'mode, reference and edit retain attempts');
      await main.locator('.speech-mic').click();
      await page.evaluate(() => { window.__lateResult = window.__speechCalls.at(-1).onresult; window.__lateEnd = window.__speechCalls.at(-1).onend; });
      await page.evaluate(text => window.__result(text), mismatched(phrase, 2));
      await main.getByRole('heading', { name: '这题先跳过', exact: true }).waitFor();
      const confirmation = main.locator('.speech-skip-feedback');
      assert.equal(await confirmation.isVisible(), true);
      assert.ok((await confirmation.boundingBox()).y >= 0, 'confirmation stays in the visible viewport');
      assert.equal(await main.locator('.speech-mic').isDisabled(), true);
      const after = await saved(); unchangedMastery(baseline, after);
      assert.equal(after.session.index, 0, 'no advancement until Continue');
      assert.equal(after.session.answers.length, 1);
      assert.equal(after.session.answers[0].correct, false);
      assert.equal(after.session.answers[0].speech.source, 'skipped');
      assert.equal(after.session.answers[0].speech.assessment, 'failed');
      assert.equal(after.session.answers[0].speech.attempts[phrase.id], 3);
      assert.equal(after.session.feedback.correct, false);
      assert.equal(after.session.queue[after.session.index].exerciseId, baseline.session.queue[0].exerciseId);
      for (const id of Object.keys(baseline.learning.targets)) assert.deepEqual(after.learning.targets[id].speechMaterials, baseline.learning.targets[id].speechMaterials);
      await page.evaluate(text => { window.__lateResult({ results: [{ isFinal: true, 0: { transcript: text } }] }); window.__lateEnd(); }, phrase.en);
      assert.deepEqual(await saved(), after, 'late callbacks cannot overwrite the confirmation');
      await page.reload(); await main.getByRole('heading', { name: '这题先跳过', exact: true }).waitFor();
      assert.deepEqual((await saved()).session.answers, after.session.answers);
      assert.equal((await saved()).session.index, 0);
      assert.equal(await main.getByText('再试一次：', { exact: false }).count(), 0, 'a skipped task must not still demand another attempt');
      await page.screenshot({ path: `${output}/${section}-skip-confirmation.png`, animations: 'disabled' });
      await main.locator('.daily-controls').screenshot({ path: `${output}/${section}-skip-notice.png`, animations: 'disabled' });
      await main.locator('.daily-controls .primary').click();
      await main.locator('.speech-skip-feedback').waitFor({ state: 'hidden' });
      const advanced = await saved();
      assert.equal(advanced.session.index, 1);
      assert.equal(advanced.session.feedback, null);
      assert.notEqual(advanced.session.queue[advanced.session.index]?.exerciseId, baseline.session.queue[0].exerciseId);
      assert.equal(advanced.session.answers.length, 1, 'confirmation is never counted twice');
      await page.evaluate(text => { window.__speechCalls.at(-1)?.onresult?.({ results: [{ isFinal: true, 0: { transcript: text } }] }); }, phrase.en);
      assert.deepEqual(await saved(), advanced, 'previous recognition cannot overwrite the next question');
      return after.session.answers[0];
    }, section === 'programming' ? 390 : 1440);

    await scenario(section, 'third-attempt-success', async ({ main, phrase, say, saved }) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await say(mismatched(phrase, 2));
        await main.getByText(`已尝试 ${attempt}/3 次`, { exact: false }).waitFor();
      }
      await say(phrase.en);
      await main.locator('.speech-target.matched').waitFor();
      assert.equal((await saved()).session.answers.length, 0);
      await main.locator('.daily-controls .primary').click(); await main.locator('.daily-feedback').waitFor();
      assert.equal((await saved()).session.answers[0].correct, true);
      assert.equal((await saved()).session.answers[0].speech.assessment, 'exact');
    });

    await scenario(section, 'manual-skip-confirmation', async ({ page, main, saved }) => {
      await main.getByRole('button', { name: '暂时跳过这次口语', exact: true }).click();
      await main.getByRole('heading', { name: '已跳过这次口语', exact: true }).waitFor();
      assert.equal(await main.locator('.speech-skip-feedback').isVisible(), true);
      assert.equal((await saved()).session.index, 0);
      assert.equal((await saved()).session.answers[0].speech.assessment, undefined);
      await page.reload(); await main.getByRole('heading', { name: '已跳过这次口语', exact: true }).waitFor();
      await main.locator('.daily-controls .primary').click();
      await main.locator('.speech-skip-feedback').waitFor({ state: 'hidden' });
      assert.equal((await saved()).session.index, 1);
    }, 390);

    await scenario(section, 'service-errors-do-not-count', async ({ page, main, phrase, saved }) => {
      for (const error of ['not-allowed', 'network', 'no-speech', 'audio-capture']) {
        await main.locator('.speech-mic').click();
        await page.evaluate(error => window.__speechCalls.at(-1).onerror?.({ error }), error);
        await main.locator('.speech-error').waitFor();
        assert.equal((await saved()).session.draft.speech.attempts, undefined);
      }
      await main.locator('.speech-mic').click(); await page.evaluate(text => window.__result(text, false), phrase.en);
      assert.equal((await saved()).session.draft.speech.attempts, undefined);
      await page.evaluate(() => window.__speechCalls.at(-1).onend?.());
      await main.locator('.speech-error').waitFor();
      await main.locator('.speech-mic').click(); await page.evaluate(() => window.__result(''));
      await main.locator('.speech-error').waitFor();
      assert.equal((await saved()).session.answers.length, 0);
      assert.equal((await saved()).session.draft.speech.attempts, undefined);
    });
  }
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
