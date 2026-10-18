import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyLessons, dailyPhrases } from '../src/dailyCourse.ts';
import { createDailyProgress, createDailySession, createDailyDraft, checkDailyAnswer, parseDailyProgress, submitDailyAnswer, persistDailyProgress } from '../src/dailyProgress.ts';

const lesson = dailyLessons[0];
const exercise = lesson.exercises.find(item => item.kind === 'speak');
const subset = { ...lesson, exercises: [exercise] };
const draft = () => createDailyDraft(exercise);
const progress = (draft) => ({ ...createDailyProgress(), session: { ...createDailySession(subset, 'workbook'), draft } });

test('every speaking task has existing audio references; first greeting includes goodbye and final objects use distance correctly', () => {
  const tasks = dailyLessons.flatMap(lesson => lesson.exercises).filter(task => task.kind === 'speak');
  assert.equal(tasks.length, 12);
  for (const task of tasks) {
    assert.ok(task.readAloud.length);
    for (const phrase of task.readAloud) assert.deepEqual(phrase, dailyPhrases.find(item => item.id === phrase.id));
  }
  assert.deepEqual(exercise.readAloud.map(item => item.id), ['hello', 'goodbye']);
  assert.ok(tasks.at(-1).readAloud.some(item => item.en === 'Those are pens.'));
});
test('read-aloud requires every target, rejects manual text and mismatched or extra recognized words', () => {
  const values = { ...draft(), text: 'Hello! Goodbye!', checks: [true, true], speech: { mode: 'read', transcripts: {} } };
  assert.equal(checkDailyAnswer(exercise, values).complete, false);
  values.speech.transcripts.hello = 'hello';
  assert.equal(checkDailyAnswer(exercise, values).complete, false);
  values.speech.transcripts.goodbye = 'good boy';
  assert.equal(checkDailyAnswer(exercise, values).complete, false);
  values.speech.transcripts.goodbye = 'goodbye extra';
  assert.equal(checkDailyAnswer(exercise, values).complete, false);
  values.speech.transcripts.goodbye = 'Goodbye.';
  values.text = ''; values.checks = [false, false];
  assert.equal(checkDailyAnswer(exercise, values).complete, true);
});
test('recognized progress survives parsing and saving without upgrading speaking mastery or touching legacy keys', () => {
  const values = { ...draft(), speech: { mode: 'read', transcripts: { hello: 'Hello', goodbye: 'goodbye' } } };
  const current = progress(values);
  assert.equal(parseDailyProgress(JSON.stringify(current), dailyLessons).writable, true);
  const done = submitDailyAnswer(current, lesson);
  assert.equal(done.session.feedback.correct, true);
  assert.equal(done.session.feedback.outcome, 'self');
  assert.equal(done.lessons[lesson.id].skills.speaking.independentAnswers, 0);
  assert.equal(done.lessons[lesson.id].skills.speaking.successDays, 0);
  assert.equal(done.lessons[lesson.id].completedAt, 0);
  const writes = [];
  const save = persistDailyProgress({ getItem: () => null, setItem: (key, raw) => writes.push([key, raw]) }, done, null);
  assert.equal(save.saved, true);
  assert.deepEqual(writes.map(item => item[0]), ['codewords-daily-v1']);
  const restored = parseDailyProgress(writes[0][1], dailyLessons);
  assert.equal(restored.writable, true);
  assert.deepEqual(restored.progress.session.draft.speech, values.speech);
});
test('old self-check drafts and feedback still parse; switching to personal expression uses its own checklist', () => {
  const values = { ...draft(), text: 'Hi. Bye.', checks: [true, true] };
  assert.equal(parseDailyProgress(JSON.stringify(progress(values)), dailyLessons).writable, true);
  const done = submitDailyAnswer(progress(values), lesson);
  assert.equal(parseDailyProgress(JSON.stringify(done), dailyLessons).writable, true);
  const emptySelf = { ...draft(), speech: { mode: 'self', transcripts: { hello: 'Hello', goodbye: 'Goodbye' } } };
  assert.equal(checkDailyAnswer(exercise, emptySelf).complete, false);
});
test('corrupt speech extensions preserve the original data as readonly', () => {
  for (const speech of [null, { mode: 'read', transcripts: [] }, { mode: 'read', transcripts: { hello: true } }, { mode: 'auto', transcripts: {} }]) {
    const raw = JSON.stringify(progress({ ...draft(), speech }));
    const parsed = parseDailyProgress(raw, dailyLessons);
    assert.equal(parsed.writable, false);
    assert.equal(parsed.raw, raw);
  }
});
