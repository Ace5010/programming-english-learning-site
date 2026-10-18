import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyUnits, dailyLessons, dailyPhrases } from '../src/dailyCourse.ts';
import { createDailyDraft, checkDailyAnswer, normalizeDailyAnswer } from '../src/dailyProgress.ts';

test('four complete units provide taught material, varied tasks and unique stable IDs', () => {
  assert.equal(dailyUnits.length, 4);
  assert.equal(dailyLessons.length, 24);
  const ids = new Set();
  const kinds = new Set();
  for (const unit of dailyUnits) {
    assert.equal(unit.lessons.length, 6);
    for (const lesson of unit.lessons) {
      assert.ok(lesson.explanation.length > 20 && lesson.goal && lesson.phrases.length >= 3);
      assert.equal(lesson.exercises.length, 5);
      assert.equal(lesson.rechecks.length, 2);
      for (const task of [...lesson.exercises, ...lesson.rechecks]) {
        assert.ok(!ids.has(task.id), task.id); ids.add(task.id); kinds.add(task.kind);
        assert.ok(task.prompt && task.explanation);
        if (task.audioId) assert.ok(lesson.phrases.some(phrase => phrase.id === task.audioId));
        if (task.kind === 'speak') assert.ok(task.sample && task.checks.length >= 2);
      }
    }
  }
  assert.equal(ids.size, 168);
  assert.deepEqual([...kinds].sort(), ['choice', 'fill', 'listen', 'order', 'speak', 'write']);
});

test('every audio ID resolves to one bilingual expression', () => {
  assert.equal(new Set(dailyPhrases.map(item => item.id)).size, dailyPhrases.length);
  for (const phrase of dailyPhrases) {
    assert.match(phrase.id, /^[a-z0-9_-]+$/);
    assert.ok(phrase.en.trim() && phrase.zh.trim());
  }
  for (const lesson of dailyLessons) for (const task of [...lesson.exercises, ...lesson.rechecks]) {
    if (['listen', 'order', 'fill', 'write', 'speak'].includes(task.kind)) assert.ok(dailyPhrases.some(item => item.id === task.audioId));
  }
});

test('all objective items have satisfiable answers and exact matching audio text', () => {
  for (const lesson of dailyLessons) for (const task of [...lesson.exercises, ...lesson.rechecks]) {
    const draft = createDailyDraft(task);
    const phrase = dailyPhrases.find(item => item.id === task.audioId);
    if (task.kind === 'choice' || task.kind === 'listen') {
      const correctOptions = task.options.filter(option => task.answers.some(answer => normalizeDailyAnswer(option) === normalizeDailyAnswer(answer)));
      assert.equal(correctOptions.length, 1, task.id);
      draft.choice = correctOptions[0];
    } else if (task.kind === 'order') {
      const remaining = new Set(task.options.map((_, index) => index));
      for (const token of task.answers[0].split(' ')) {
        const index = [...remaining].find(index => task.options[index] === token);
        assert.notEqual(index, undefined, task.id); draft.order.push(index); remaining.delete(index);
      }
    } else if (task.kind === 'fill') {
      assert.equal(task.parts.length, task.blanks.length + 1);
      draft.blanks = task.blanks.map(answers => answers[0]);
      assert.equal(checkDailyAnswer(task, draft).expected[0], phrase.en, task.id);
    } else if (task.kind === 'write') draft.text = task.answers[0];
    else { draft.text = task.sample; draft.checks = task.checks.map(() => true); }
    assert.ok(checkDailyAnswer(task, draft).correct, task.id);
    if (['order', 'write'].includes(task.kind)) assert.equal(task.answers[0], phrase.en, task.id);
    if (task.kind !== 'speak') assert.equal(checkDailyAnswer(task, createDailyDraft(task)).correct, false);
  }
});

test('first four units culminate in a cross-unit task, without blind first-lesson long spelling', () => {
  const final = dailyLessons.at(-1);
  assert.match(final.goal, /姓名.*来源.*人物.*物品/);
  assert.ok(final.exercises.some(item => item.kind === 'speak' && item.checks.some(check => check.includes('from'))));
  assert.ok(![...dailyLessons[0].exercises, ...dailyLessons[0].rechecks].some(item => item.kind === 'write' && normalizeDailyAnswer(item.answers[0]).length > 3));
});
