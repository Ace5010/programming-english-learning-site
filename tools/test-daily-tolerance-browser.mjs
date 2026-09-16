// Regression for accepted written variants in real Chrome, with disposable records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dailyLessons } from '../src/dailyCourse.ts';
import { createDailyProgress, createDailySession } from '../src/dailyProgress.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
assert.ok(process.env.CODEWORDS_TEST_URL, 'Use the existing server via CODEWORDS_TEST_URL');
const output = path.resolve('artifacts/answer-tolerance');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const errors = [];
const cases = [
  ['A1-01-02-e04', ['m'], true, 'reported-m'],
  ['A1-01-02-e04', ["'m"], true, 'apostrophe-m'],
  ['A1-01-02-e04', ['am'], true, 'full-am'],
  ['A1-01-02-e04', ['are'], false, 'wrong-auxiliary'],
  ['A1-03-01-e04', ['s'], true, 'later-he'],
  ['A1-04-04-e04', ['re', 's'], true, 'later-plural'],
  ['A1-04-04-e04', ['re', ''], null, 'unfinished-plural'],
  ['A1-02-01-e04', ['from', 'United States of America'], true, 'country-full-name'],
  ['A1-01-02-e05', 'im ben', true, 'written-im'],
  ['A1-01-02-e05', "My name's Ben!", true, 'equivalent-name'],
  ['A1-03-05-e05', 'No shes not', true, 'equivalent-negative'],
  ['A1-02-04-e05', 'I am an American', true, 'equivalent-nationality'],
  ['A1-04-02-e05', 'its an apple', true, 'omitted-its-apostrophe'],
  ['A1-03-03-e05', 'were teachers', true, 'omitted-were-apostrophe'],
  ['A1-03-05-e05', 'Yes she is', false, 'wrong-meaning'],
  ['A1-01-02-e05', 'im Mia', false, 'wrong-name'],
];
try {
  for (const [id, value, correct, name] of cases) {
    const lesson = dailyLessons.find(item => item.exercises.some(task => task.id === id));
    assert.ok(lesson, id);
    const task = lesson.exercises.find(item => item.id === id);
    const progress = createDailyProgress();
    progress.session = createDailySession({ ...lesson, exercises: [task] }, 'workbook');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(progress => {
        if (sessionStorage.getItem('answer-test-seeded')) return;
        localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
        localStorage.setItem('codewords-section', 'daily');
        localStorage.setItem('codewords-theme', 'minimal');
        localStorage.setItem('codewords-mastered', '[1,3]');
        sessionStorage.setItem('answer-test-seeded', '1');
      }, progress);
      await page.goto(process.env.CODEWORDS_TEST_URL);
      const form = page.locator(`.daily-question[data-exercise-id="${id}"]`);
      await form.waitFor();
      if (Array.isArray(value)) {
        for (const [index, entry] of value.entries()) {
          const input = form.getByLabel(`第 ${index + 1} 个空`, { exact: true });
          if (name === 'country-full-name') await input.pressSequentially(entry);
          else await input.fill(entry);
        }
      } else await form.locator('textarea').fill(value);
      await form.locator(Array.isArray(value) ? 'input' : 'textarea').last().press('Enter');
      if (correct === null) {
        assert.equal(await page.locator('.daily-feedback').count(), 0);
        assert.equal(await page.locator(':focus').getAttribute('aria-label'), '第 2 个空');
      } else {
        const feedbackSelector = correct ? '.daily-feedback.correct' : '.daily-feedback:not(.correct)';
        await page.locator(feedbackSelector).waitFor();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
        assert.equal(saved.session.feedback.correct, correct, name);
        assert.equal(saved.session.feedback.outcome, correct ? 'independent' : 'revealed', name);
        assert.equal(Object.keys(saved.lessons[lesson.id].errors).length, correct ? 0 : 1, name);
        await page.reload();
        await page.locator(feedbackSelector).waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('codewords-mastered')), '[1,3]');
        if (name === 'reported-m') {
          await page.screenshot({ path: path.join(output, 'm-correct-1440.png') });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: path.join(output, 'm-correct-390.png') });
        }
        await page.locator('.daily-controls .primary').press('Enter');
        await page.locator('.daily-summary').waitFor();
      }
      results.push(name);
      console.log(`PASS ${name}`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ url: process.env.CODEWORDS_TEST_URL, cases: results, errors, testedAt: new Date().toISOString() }, null, 2));
  console.log(`PASS ${results.length} written-tolerance browser cases`);
} finally { await browser.close(); }
