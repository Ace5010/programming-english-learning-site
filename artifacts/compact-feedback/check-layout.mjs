import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
import { dailyLessons } from '../../src/dailyCourse.ts';
import { createDailyProgress, createDailySession, beginDailyExercises } from '../../src/dailyProgress.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase = process.env.FEEDBACK_PHASE || 'before';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const result = [], errors = [];
const lesson = dailyLessons[0];
const progress = { ...createDailyProgress(), session: beginDailyExercises(createDailySession(lesson)) };
await mkdir('artifacts/compact-feedback', { recursive: true });
try {
  for (const theme of phase === 'before' ? ['minimal'] : ['minimal', 'sketch', 'print', 'graffiti']) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ progress, theme }) => {
        localStorage.setItem('codewords-section', 'daily'); localStorage.setItem('codewords-theme', theme);
        localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
      }, { progress, theme });
      await page.goto('http://localhost:5186/');
      await page.locator('.daily-option').filter({ hasText: lesson.exercises[0].answers[0] }).click();
      await page.locator('.daily-controls .primary').click();
      await page.locator('.daily-feedback').waitFor();
      const dimensions = await page.evaluate(() => {
        const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
        return { feedback: bounds('.daily-feedback'), controls: bounds('.daily-controls'), scrollY, height: innerHeight, documentHeight: document.documentElement.scrollHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      result.push({ theme, ...viewport, ...dimensions });
      await page.screenshot({ path: `artifacts/compact-feedback/${phase}-${theme}-${viewport.width}.png`, fullPage: phase === 'before' });
      if (phase === 'after') {
        assert.ok(dimensions.feedback.top >= 0 && dimensions.feedback.bottom <= viewport.height, 'Feedback is visible without scrolling');
        assert.ok(dimensions.controls.bottom <= viewport.height && dimensions.controls.height < 130, 'Compact fixed controls fit the viewport');
        assert.equal(dimensions.horizontalOverflow, false);
        const beforeDetails = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.getByText('解析', { exact: true }).click();
        await page.locator('.daily-feedback-explanation').waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), beforeDetails, 'Optional explanation does not lengthen the page');
        await page.getByText('解析', { exact: true }).click();
        await page.locator('.daily-controls .primary').press('Enter');
        await page.locator(`.daily-question[data-exercise-id="${lesson.exercises[1].id}"]`).waitFor();
        assert.equal(await page.locator('.daily-feedback').count(), 0);
      }
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(`artifacts/compact-feedback/${phase}-results.json`, JSON.stringify({ result, errors }, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
