import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyLessons, dailyPhrases } from '../src/dailyCourse.ts';
import { createDailyProgress, createDailySession, createDailyDraft, checkDailyAnswer, parseDailyProgress, submitDailyAnswer, persistDailyProgress, recordSpeechTranscript, speechRetriesExhausted, advanceDailySession, summarizeDailySession } from '../src/dailyProgress.ts';

const lesson = dailyLessons[0];
const exercise = lesson.exercises.find(item => item.kind === 'speak');
const subset = { ...lesson, exercises: [exercise] };
const draft = () => createDailyDraft(exercise);
const progress = (draft) => ({ ...createDailyProgress(), session: { ...createDailySession(subset, 'workbook'), draft } });

test('third failed ASR result finishes without a pass, skill gain or another retry', () => {
  let values = draft();
  for (let attempt = 1; attempt <= 3; attempt++) {
    values = { ...values, ...recordSpeechTranscript(values, 'hello', 'yellow') };
    assert.equal(values.speech.attempts.hello, attempt);
    assert.equal(speechRetriesExhausted(exercise, values), attempt === 3);
    assert.equal(checkDailyAnswer(exercise, values).complete, attempt === 3);
    const parsed = parseDailyProgress(JSON.stringify(progress(values)), dailyLessons);
    assert.equal(parsed.writable, true);
    values = parsed.progress.session.draft;
  }
  const done = submitDailyAnswer(progress(values), lesson);
  assert.equal(done.session.answers[0].correct, false);
  assert.equal(done.session.answers[0].speech.assessment, 'failed');
  assert.equal(done.session.answers[0].speech.source, 'skipped');
  assert.deepEqual(done.session.answers[0].speech.attempts, { hello: 3 });
  assert.deepEqual(done.lessons, {});
  assert.deepEqual(done.knowledge, progress(values).knowledge);
  assert.equal(summarizeDailySession(done.session).self, 0);
  assert.equal(parseDailyProgress(JSON.stringify(done), dailyLessons).writable, true);
  assert.equal(submitDailyAnswer(done, lesson), done, 'submission is replay-safe');
  const advanced = advanceDailySession(done, lesson);
  assert.equal(advanced.session.stage, 'summary');
  assert.equal(advanced.session.answers.length, 1);
});

test('empty results, edits and self-expression do not consume sentence attempts; success on attempt three passes', () => {
  let values = draft();
  for (const text of ['', '  ', '...']) assert.deepEqual(recordSpeechTranscript(values, 'hello', text), {});
  values = { ...values, ...recordSpeechTranscript(values, 'hello', 'yellow') };
  values = { ...values, ...recordSpeechTranscript(values, 'hello', 'yellow') };
  values = { ...values, ...recordSpeechTranscript(values, 'self', 'my own answer') };
  assert.deepEqual(values.speech.attempts, { hello: 2 });
  assert.equal(speechRetriesExhausted(exercise, values), false);
  values = { ...values, ...recordSpeechTranscript(values, 'hello', 'hello') };
  values = { ...values, ...recordSpeechTranscript(values, 'goodbye', 'goodbye') };
  assert.equal(speechRetriesExhausted(exercise, values), false);
  assert.equal(checkDailyAnswer(exercise, values).correct, true);
  const done = submitDailyAnswer(progress(values), lesson);
  assert.equal(done.session.answers[0].speech.assessment, 'exact');
  assert.equal(done.session.answers[0].correct, true);
  assert.equal(done.lessons[lesson.id].skills.speaking.independentAnswers, 0);
});

test('sentence tolerance does not silently turn manual edits into recognition success', () => {
  const sentence = { ...exercise, readAloud: [{ id: 'pull', en: 'Please check my pull request.' }] };
  const values = { ...draft(), speech: { mode: 'read', transcripts: { pull: 'please check my poll request' }, sources: { pull: 'recognition' } } };
  assert.deepEqual(checkDailyAnswer(sentence, values), { complete: true, correct: true, expected: ['Please check my pull request.'] });
  const done = submitDailyAnswer(progress(values), { ...subset, exercises: [sentence] });
  assert.equal(done.session.answers[0].speech.assessment, 'context');
  assert.equal(done.session.draft.speech.transcripts.pull, 'please check my poll request');
  values.speech.sources.pull = 'edited';
  const edited = submitDailyAnswer(progress(values), { ...subset, exercises: [sentence] });
  assert.equal(edited.session.answers[0].speech.source, 'edited');
});

test('multiple contextual ASR differences pass on the third attempt without rewriting text or granting mastery', () => {
  const sentence = { ...exercise, readAloud: [{ id: 'pull', en: 'Please check my pull request.' }] };
  const targetLesson = { ...subset, exercises: [sentence] };
  let values = draft();
  for (const text of ['please change my blue question', 'please change my blue question', 'please cheque my pool requests']) {
    values = { ...values, ...recordSpeechTranscript(values, 'pull', text) };
  }
  assert.equal(values.speech.attempts.pull, 3);
  assert.equal(speechRetriesExhausted(sentence, values), false);
  assert.equal(checkDailyAnswer(sentence, values).correct, true);
  const before = progress(values);
  const done = submitDailyAnswer(before, targetLesson);
  assert.equal(done.session.answers[0].correct, true);
  assert.equal(done.session.answers[0].speech.assessment, 'context');
  assert.equal(done.session.answers[0].speech.source, 'recognition');
  assert.equal(done.session.draft.speech.transcripts.pull, 'please cheque my pool requests');
  assert.equal(done.lessons[lesson.id].skills.speaking.independentAnswers, 0);
  assert.equal(done.lessons[lesson.id].skills.speaking.successDays, 0);
  assert.equal(done.session.answers[0].outcome, 'self');
  for (const target of Object.values(done.knowledge)) {
    for (const skill of Object.values(target.skills)) {
      assert.equal(skill.independentAnswers, 0);
      assert.equal(skill.successDays, 0);
      assert.equal(skill.dueAt, 0);
    }
  }
  assert.equal(parseDailyProgress(JSON.stringify(done), [targetLesson]).writable, true);
});

test('manual skip is distinct from retry exhaustion and corrupt attempt counters stay readonly', () => {
  const skipped = submitDailyAnswer(progress(draft()), lesson, { skipSpeech: true });
  assert.equal(skipped.session.answers[0].speech.assessment, undefined);
  for (const attempts of [[], { hello: -1 }, { hello: 4 }, { hello: 1.5 }, { hello: '3' }]) {
    const raw = JSON.stringify(progress({ ...draft(), speech: { mode: 'read', transcripts: {}, attempts } }));
    const parsed = parseDailyProgress(raw, dailyLessons);
    assert.equal(parsed.writable, false);
    assert.equal(parsed.raw, raw);
  }
});

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
