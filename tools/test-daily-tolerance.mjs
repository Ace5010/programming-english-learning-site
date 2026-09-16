import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLessons, findDailyExercise } from '../src/dailyCourse.ts';
import { createDailyDraft, checkDailyAnswer, createDailyProgress, createDailySession, submitDailyAnswer, parseDailyProgress } from '../src/dailyProgress.ts';

function check(id, values) {
  const exercise = findDailyExercise(id);
  assert.ok(exercise, id);
  return checkDailyAnswer(exercise, { ...createDailyDraft(exercise), ...values });
}
test('reported I [blank] Mia accepts full and abbreviated am, including an omitted apostrophe', () => {
  for (const value of ['am', "'m", '’m', 'm', 'M', '  m  ']) assert.equal(check('A1-01-02-e04', { blanks: [value] }).correct, true, value);
  for (const value of ['is', 'are', 'n', 'am not', '']) assert.equal(check('A1-01-02-e04', { blanks: [value] }).correct, false, value);
});
test('contraction fragments are accepted in later I, He, It, They and My name fill contexts', () => {
  const tasks = dailyLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks]);
  let count = 0;
  for (const exercise of tasks.filter(item => item.kind === 'fill')) {
    if (/简短.*肯定|肯定.*回答/.test(exercise.prompt)) continue;
    const values = exercise.blanks.map(answers => answers[0]);
    for (const [index, value] of values.entries()) {
      const short = value === 'am' ? 'm' : value === 'is' ? 's' : value === 'are' ? 're' : '';
      if (!short) continue;
      // Only declarative prefixes have a subject before the auxiliary gap.
      const prefix = exercise.parts.slice(0, index + 1).map((part, i) => part + (i < index ? values[i] : '')).join('');
      if (!/\b(I|He|She|It|They|We|You|My name)\s*$/i.test(prefix)) continue;
      for (const supplied of [short, `'${short}`, `’${short}`]) {
        const blanks = [...values]; blanks[index] = supplied;
        assert.equal(check(exercise.id, { blanks }).correct, true, `${exercise.id}: ${supplied}`);
      }
      count++;
    }
  }
  assert.ok(count >= 12, `Covered ${count} subject/auxiliary gaps`);
});
test('the template still preserves short-answer grammar, each gap, letters and plural endings', () => {
  assert.equal(check('A1-03-05-e04', { blanks: ['he', "'s"] }).correct, false);
  assert.equal(check('A1-03-05-e04', { blanks: ['he', 'is'] }).correct, true);
  assert.equal(check('A1-01-01-e03', { blanks: [' LO '] }).correct, true);
  assert.equal(check('A1-01-01-e03', { blanks: ['o'] }).correct, false);
  assert.equal(check('A1-04-04-e04', { blanks: ['re', 's'] }).correct, true);
  assert.equal(check('A1-04-04-e04', { blanks: ['re', ''] }).complete, false);
  assert.equal(check('A1-04-04-e04', { blanks: ['is', 's'] }).correct, false);
});
test('written equivalents cover ordinary name introductions, negative contractions and American as a noun', () => {
  for (const [id, text] of [
    ['A1-01-02-e05', 'im ben'], ['A1-01-02-e05', 'My name is Ben!'],
    ['A1-01-05-e04', "My name's Ben"], ['A1-01-02-r02', 'my name s Mia'],
    ['A1-01-06-r01', "My name's Mia"], ['A1-03-05-e05', 'No shes not'],
    ['A1-03-05-e05', "No, she's not."], ['A1-02-04-e05', 'I am an American'],
    ['A1-02-04-e05', 'im an American'],
    ['A1-04-02-e05', 'its an apple'], ['A1-03-03-e05', 'were teachers'],
  ]) assert.equal(check(id, { text }).correct, true, `${id}: ${text}`);
  for (const [id, text] of [
    ['A1-01-06-r01', "I'm Mia"], ['A1-01-02-e05', 'My name is Mia'],
    ['A1-03-05-e05', 'Yes she is'], ['A1-02-04-e05', 'I am a American'],
    ['A1-02-04-e05', 'I am Chinese'], ['A1-01-01-e04', 'Hello'],
  ]) assert.equal(check(id, { text }).correct, false, `${id}: ${text}`);
});
test('US alternatives stay in the country gap and preserve the given article and origin', () => {
  for (const country of ['US', 'U.S.', 'U. S.', 'USA', 'U.S.A.', 'United States', 'United States of America']) {
    assert.equal(check('A1-02-01-e04', { blanks: ['from', country] }).correct, true, country);
  }
  for (const country of ['UK', 'Japan', 'America', 'American']) assert.equal(check('A1-02-01-e04', { blanks: ['from', country] }).correct, false, country);
});
test('tolerated answers save as correct, add no false difficulty/recheck and survive refresh', () => {
  const lesson = dailyLessons.find(item => item.id === 'A1-01-02');
  const task = lesson.exercises[3];
  const session = createDailySession({ ...lesson, exercises: [task] }, 'workbook');
  session.draft.blanks = ['m'];
  const progress = submitDailyAnswer({ ...createDailyProgress(), session }, lesson);
  assert.equal(progress.session.feedback.correct, true);
  assert.equal(progress.session.feedback.outcome, 'independent');
  assert.deepEqual(progress.lessons[lesson.id].errors, {});
  assert.equal(progress.session.queue.length, 1);
  const restored = parseDailyProgress(JSON.stringify(progress), dailyLessons);
  assert.equal(restored.writable, true);
  assert.equal(restored.progress.session.draft.blanks[0], 'm');
  assert.equal(restored.progress.session.feedback.correct, true);
});
