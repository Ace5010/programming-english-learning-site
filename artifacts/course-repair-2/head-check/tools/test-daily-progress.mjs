// Node 22.18+ / 24: node --test tools/test-daily-progress.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_KEY, createDailyProgress, getDailyLessonProgress, createDailyDraft,
  createDailySession, beginDailyExercises, updateDailyDraft, normalizeDailyAnswer,
  checkDailyAnswer, markDailyHelp, submitDailyAnswer, advanceDailySession,
  finishDailySession, summarizeDailySession, parseDailyProgress, persistDailyProgress,
  dailyUnresolvedErrors, dueDailyLessons,
} from '../src/dailyProgress.ts';

const at = (date, hour = 10) => new Date(2026, 8, date, hour).getTime();
const exercise = (id, kind, extra = {}) => ({ id, kind, prompt: '测试', explanation: '解释', ...extra });
const lesson = {
  id: 'A1-01-01',
  exercises: [
    exercise('meaning', 'choice', { options: ['Hello', 'Goodbye'], answers: ['Hello'] }),
    exercise('listening', 'listen', { options: ['Ben', 'Anna'], answers: ['Ben'], audioId: 'name-ben' }),
    exercise('writing', 'fill', { parts: ['I ', ' Ben. You ', ' Anna.'], blanks: [['am'], ['are']] }),
    exercise('speaking', 'speak', { sample: "Hello. I'm Ben.", checks: ['说出问候', '介绍姓名'] }),
  ],
  rechecks: [exercise('meaning-retry', 'choice', { options: ['Hi', 'Bye'], answers: ['Hi'] })],
};
const empty = () => createDailyProgress();
const start = (mode = 'lesson', now = at(15), course = lesson, progress = empty()) => ({ ...progress, session: createDailySession(course, mode, now) });
const begin = progress => ({ ...progress, session: beginDailyExercises(progress.session) });
const draft = (progress, values) => ({ ...progress, session: updateDailyDraft(progress.session, values) });
const answer = (progress, values, now = at(15), course = lesson, options = {}) => submitDailyAnswer(draft(progress, values), course, options, now);
const next = (progress, now = at(15), course = lesson) => advanceDailySession(progress, course, now);
const skill = (progress, ability = 'meaning', course = lesson) => getDailyLessonProgress(progress, course.id).skills[ability];
const complete = (progress, now = at(15), course = lesson) => {
  if (progress.session.stage === 'study') progress = begin(progress);
  for (let guard = 0; progress.session.stage === 'exercise' && guard < 100; guard++) {
    const id = progress.session.queue[progress.session.index].exerciseId;
    const item = [...course.exercises, ...course.rechecks].find(item => item.id === id);
    const values = item.kind === 'speak' ? { text: '我已开口练习', checks: item.checks.map(() => true) }
      : item.kind === 'fill' ? { blanks: item.blanks.map(answers => answers[0]) }
        : item.kind === 'order' ? { order: item.options.map((_, index) => index) }
          : item.kind === 'write' ? { text: item.answers[0] } : { choice: item.answers[0] };
    progress = next(answer(progress, values, now, course), now, course);
  }
  assert.equal(progress.session.stage, 'summary');
  return progress;
};

test('written matching accepts equivalent contractions while preserving negation and word boundaries', () => {
  assert.equal(normalizeDailyAnswer('  HELLO！ '), 'hello');
  assert.equal(normalizeDailyAnswer('  I’m   Ben. '), "i'm ben");
  const item = exercise('x', 'write', { answers: ['I am Ben.'] });
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), text: 'I  am Ben!' }).correct, true);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), text: "I'm Ben." }).correct, true);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), text: 'I am not Ben.' }).correct, false);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), text: 'Iam Ben.' }).correct, false);
  item.answers.push("I'm Ben.");
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), text: 'I’m Ben.' }).correct, true);
});

test('multi-blank checking validates each position and supports explicit alternatives', () => {
  const item = exercise('x', 'fill', { parts: ['', ' from China. You ', ' from China.'], blanks: [['I am', "I'm"], ['are']] });
  assert.deepEqual(checkDailyAnswer(item, { ...createDailyDraft(item), blanks: ["I'm", 'are'] }), { complete: true, correct: true, expected: ['I am from China. You are from China.'] });
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), blanks: ['are', 'I am'] }).correct, false);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), blanks: ['I am', ''] }).complete, false);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), blanks: ['I am', 'are', 'extra'] }).correct, false);
});

test('order checks answer sentence, allows distractors, and disallows duplicating a tile', () => {
  const item = exercise('x', 'order', { options: ['Ben.', 'I', 'am', 'are'], answers: ['I am Ben.'] });
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), order: [1, 2, 0] }).correct, true);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), order: [1, 3, 0] }).correct, false);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), order: [1, 2, 0, 0] }).complete, false);
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), order: [99] }).complete, false);
});

test('choice cannot be spoofed with an answer absent from its options', () => {
  const item = exercise('x', 'choice', { options: ['Bye'], answers: ['Hello'] });
  assert.equal(checkDailyAnswer(item, { ...createDailyDraft(item), choice: 'Hello' }).correct, false);
});

test('lesson completion is durable at summary; workbook and review cannot complete a new lesson', () => {
  const finished = complete(start());
  assert.equal(getDailyLessonProgress(finished, lesson.id).completedAt, at(15));
  assert.equal(parseDailyProgress(JSON.stringify(finished), [lesson]).writable, true);
  assert.equal(finishDailySession(finished).session, null);
  for (const mode of ['review', 'workbook']) {
    assert.equal(getDailyLessonProgress(complete(start(mode)), lesson.id).completedAt, 0);
  }
});

test('first lesson and repeated same-day independent work add observations, not delayed recall', () => {
  let progress = complete(start());
  assert.equal(skill(progress).independentAnswers, 1);
  assert.equal(skill(progress).successDays, 0);
  assert.equal(skill(progress).dueAt, at(16));
  progress = complete(start('review', at(15, 15), lesson, finishDailySession(progress)), at(15, 15));
  assert.equal(skill(progress).independentAnswers, 2);
  assert.equal(skill(progress).successDays, 0);
  assert.equal(skill(progress, 'writing').successDays, 0);
});

test('separate-day due independent review adds one success, while early practice does not', () => {
  let progress = complete(start());
  progress = complete(start('review', at(16), lesson, finishDailySession(progress)), at(16));
  assert.equal(skill(progress).successDays, 1);
  assert.equal(skill(progress, 'listening').successDays, 1);
  assert.equal(skill(progress, 'speaking').successDays, 0);
  progress = complete(start('review', at(17), lesson, finishDailySession(progress)), at(17));
  assert.equal(skill(progress).successDays, 2);
  assert.equal(skill(progress).dueAt, at(20));
  progress = complete(start('review', at(18), lesson, finishDailySession(progress)), at(18));
  assert.equal(skill(progress).successDays, 2);
  assert.equal(skill(progress).dueAt, at(20));
});

test('mistake saves immediate weakness and a bounded variant; retry cannot erase it', () => {
  const original = begin(start());
  let progress = answer(original, { choice: 'Goodbye' });
  assert.equal(original.session.answers.length, 0);
  assert.equal(progress.session.queue.length, 5);
  assert.deepEqual(progress.session.queue.at(-1), { exerciseId: 'meaning-retry', retry: true, retryOf: 'meaning' });
  assert.equal(skill(progress).needsPractice, true);
  assert.deepEqual(dailyUnresolvedErrors(progress, lesson.id), ['meaning']);
  progress = complete(next(progress));
  assert.equal(skill(progress).needsPractice, true);
  assert.equal(skill(progress).successDays, 0);
  assert.deepEqual(dailyUnresolvedErrors(progress, lesson.id), ['meaning']);
  assert.equal(summarizeDailySession(progress.session).revealed, 1);
  assert.equal(summarizeDailySession(progress.session).self, 1);
});

test('same-day second session cannot clear an error; independent next-day original can', () => {
  let progress = complete(next(answer(begin(start()), { choice: 'Goodbye' })));
  progress = complete(start('review', at(15, 16), lesson, finishDailySession(progress)), at(15, 16));
  assert.equal(skill(progress).needsPractice, true);
  assert.equal(dailyUnresolvedErrors(progress, lesson.id).length, 1);
  progress = complete(start('review', at(17), lesson, finishDailySession(progress)), at(17));
  assert.equal(skill(progress).successDays, 1);
  assert.equal(skill(progress).needsPractice, false);
  assert.equal(dailyUnresolvedErrors(progress, lesson.id).length, 0);
});

test('help is durable before submit and cannot be revoked by editing a draft', () => {
  let progress = markDailyHelp(begin(start()), lesson, false, at(15));
  assert.equal(skill(progress).attempts, 0);
  assert.equal(skill(progress).needsPractice, true);
  assert.equal(parseDailyProgress(JSON.stringify(progress), [lesson]).writable, true);
  progress = draft(progress, { choice: 'Hello', helped: false, revealed: false });
  assert.equal(progress.session.draft.helped, true);
  progress = submitDailyAnswer(progress, lesson, {}, at(15));
  assert.equal(progress.session.feedback.outcome, 'assisted');
  assert.equal(skill(progress).assistedAnswers, 1);
  assert.equal(skill(progress).successDays, 0);
});

test('revealed answers can be skipped, never counted independently, and duplicate submit is inert', () => {
  let progress = markDailyHelp(begin(start()), lesson, true, at(15));
  progress = submitDailyAnswer(progress, lesson, { reveal: true }, at(15));
  assert.equal(progress.session.feedback.outcome, 'revealed');
  assert.equal(progress.session.feedback.correct, false);
  assert.equal(submitDailyAnswer(progress, lesson, {}, at(15)), progress);
  assert.equal(updateDailyDraft(progress.session, { choice: 'Hello' }), progress.session);
});

test('speak needs nonempty learner action and complete checklist, never produces automatic mastery', () => {
  const course = { id: 'speak-only', exercises: [lesson.exercises[3]], rechecks: [] };
  let progress = start('workbook', at(15), course);
  assert.equal(submitDailyAnswer(progress, course, { self: true }, at(15)), progress);
  progress = draft(progress, { text: '我已说完', checks: [true, false] });
  assert.equal(submitDailyAnswer(progress, course, { reveal: true }, at(15)), progress);
  progress = draft(progress, { checks: [true, true] });
  progress = submitDailyAnswer(progress, course, {}, at(15));
  assert.equal(progress.session.feedback.outcome, 'self');
  assert.equal(skill(progress, 'speaking', course).selfReports, 1);
  assert.equal(skill(progress, 'speaking', course).successDays, 0);
  assert.equal(skill(progress, 'speaking', course).dueAt, 0);
});

test('one final question mistake defers its retry instead of immediate repetition', () => {
  const course = { id: 'single', exercises: [lesson.exercises[0]], rechecks: lesson.rechecks };
  const progress = answer(start('review', at(15), course), { choice: 'Goodbye' }, at(15), course);
  assert.equal(progress.session.queue.length, 1);
  assert.equal(skill(progress, 'meaning', course).needsPractice, true);
});

test('at most five unique variants and no retry-of-retry loops under repeated failure', () => {
  const course = {
    id: 'many',
    exercises: Array.from({ length: 10 }, (_, i) => ({ ...lesson.exercises[0], id: `m${i}` })),
    rechecks: Array.from({ length: 10 }, (_, i) => ({ ...lesson.rechecks[0], id: `r${i}` })),
  };
  let progress = start('review', at(15), course);
  let guard = 0;
  while (progress.session.stage === 'exercise' && guard++ < 100) {
    progress = next(submitDailyAnswer(progress, course, { reveal: true }, at(15)), at(15), course);
  }
  assert.equal(progress.session.stage, 'summary');
  assert.equal(progress.session.queue.length, 15);
  assert.equal(new Set(progress.session.queue.map(item => item.exerciseId)).size, 15);
});

test('refresh restores multi-blank draft, help flag, queue, feedback and summary exactly', () => {
  let progress = begin(start());
  progress = next(answer(progress, { choice: 'Goodbye' }));
  progress = next(answer(progress, { choice: 'Ben' }));
  progress = markDailyHelp(progress, lesson, false, at(15));
  progress = draft(progress, { blanks: ['am', ''] });
  const raw = JSON.stringify(progress);
  const restored = parseDailyProgress(raw, [lesson]);
  assert.equal(restored.writable, true);
  assert.deepEqual(restored.progress, progress);
  progress = answer(restored.progress, { blanks: ['am', 'are'] });
  const withFeedback = parseDailyProgress(JSON.stringify(progress), [lesson]);
  assert.equal(withFeedback.writable, true);
  assert.deepEqual(withFeedback.progress.session.feedback, progress.session.feedback);
  const summary = complete(next(withFeedback.progress));
  assert.deepEqual(parseDailyProgress(JSON.stringify(summary), [lesson]).progress, summary);
});

test('empty storage is writable; malformed or unsupported records remain available without overwrite', () => {
  assert.equal(parseDailyProgress(null).writable, true);
  for (const raw of ['', '{', 'null', '[]', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, revision: 0, lessons: {}, session: {} })]) {
    const result = parseDailyProgress(raw, [lesson]);
    assert.equal(result.writable, false, raw);
    assert.equal(result.raw, raw);
    assert.ok(result.warning);
  }
});

test('invalid counters, unknown active lesson, invalid queue and draft are protected, not sanitized', () => {
  const finished = complete(start());
  const invalids = [];
  const negative = structuredClone(finished); negative.lessons[lesson.id].skills.meaning.attempts = -1; invalids.push(negative);
  const counts = structuredClone(finished); counts.lessons[lesson.id].skills.meaning.attempts = 999; invalids.push(counts);
  const unknown = begin(start()); unknown.session.lessonId = 'removed-course'; invalids.push(unknown);
  const index = begin(start()); index.session.index = 10; invalids.push(index);
  const draftInvalid = begin(start()); draftInvalid.session.draft.choice = 'unsupported'; invalids.push(draftInvalid);
  const feedbackInvalid = begin(start()); feedbackInvalid.session.feedback = { correct: true, outcome: 'independent', expected: ['Hello'], explanation: '' }; invalids.push(feedbackInvalid);
  const duplicate = begin(start()); duplicate.session.queue.push(duplicate.session.queue[0]); invalids.push(duplicate);
  for (const invalid of invalids) assert.equal(parseDailyProgress(JSON.stringify(invalid), [lesson]).writable, false);
});

test('unknown historical lesson records remain intact when current session is supported', () => {
  const progress = complete(start());
  const historical = structuredClone(progress.lessons[lesson.id]);
  progress.lessons['future-or-archived'] = historical;
  assert.deepEqual(parseDailyProgress(JSON.stringify(progress), [lesson]).progress.lessons['future-or-archived'], historical);
});

test('storage writes only the new daily key and detects stale tabs or damaged records', () => {
  const data = new Map([['codewords-mastered', '[1,2]'], ['codewords-review-v1', '{"version":1,"words":{}}']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const first = persistDailyProgress(storage, begin(start()), null);
  assert.equal(first.saved, true);
  assert.equal(first.progress.revision, 1);
  const stale = persistDailyProgress(storage, empty(), null);
  assert.equal(stale.saved, false);
  assert.equal(data.get(DAILY_KEY), first.raw);
  const second = persistDailyProgress(storage, first.progress, first.raw);
  assert.equal(second.saved, true);
  assert.equal(second.progress.revision, 2);
  assert.equal(data.get('codewords-mastered'), '[1,2]');
  assert.equal(data.get('codewords-review-v1'), '{"version":1,"words":{}}');
  data.set(DAILY_KEY, '{damaged');
  assert.equal(persistDailyProgress(storage, empty(), '{damaged').saved, false);
  assert.equal(data.get(DAILY_KEY), '{damaged');
});

test('quota/read errors preserve in-memory progress and warn without reporting success', () => {
  for (const storage of [
    { getItem() { throw new Error('blocked'); }, setItem() { assert.fail(); } },
    { getItem() { return null; }, setItem() { throw new Error('quota'); } },
  ]) {
    const progress = begin(start());
    const saved = persistDailyProgress(storage, progress, null);
    assert.equal(saved.saved, false);
    assert.equal(saved.progress, progress);
    assert.ok(saved.warning);
  }
});

test('due lessons use observed non-speaking evidence and keep unresolved errors separate', () => {
  const progress = complete(start());
  const speakOnly = { id: 'speak', exercises: [lesson.exercises[3]], rechecks: [] };
  assert.deepEqual(dueDailyLessons(progress, [lesson], at(15)), []);
  assert.deepEqual(dueDailyLessons(progress, [lesson], at(16)).map(item => item.id), [lesson.id]);
  assert.equal(dailyUnresolvedErrors(progress, lesson.id).length, 0);
  const spoken = complete(start('workbook', at(15), speakOnly), at(15), speakOnly);
  assert.deepEqual(dueDailyLessons(spoken, [speakOnly], at(30)), []);
});

test('unanswered exercises cannot advance or complete; changing other section data is impossible', () => {
  const progress = begin(start());
  const before = structuredClone(progress);
  assert.equal(advanceDailySession(progress, lesson, at(15)), progress);
  assert.equal(finishDailySession(progress), progress);
  assert.equal(submitDailyAnswer(progress, lesson, {}, at(15)), progress);
  assert.deepEqual(progress, before);
  assert.deepEqual(Object.keys(empty()).sort(), ['lessons', 'revision', 'session', 'version']);
});
