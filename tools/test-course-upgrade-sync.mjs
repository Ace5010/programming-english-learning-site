import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveProgrammingLessons as lessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession, createDailyDraft, updateDailyDraft, checkDailyAttempt, updateDailyPairs, parseDailyProgress, submitDailyAnswer, recordSpeechTranscript } from '../src/dailyProgress.ts';
import { reconcileSavedQuestion } from '../src/adaptiveLearning.ts';
import { selectPair } from '../src/pairPractice.ts';
import { ProgressSync } from '../src/progressSync.ts';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';
import { correctDraft } from './helpers/course-answer.mjs';

const key = 'codewords-programming-course-v1', now = 1800000000000;
function fixture(predicate) {
  const source = lessons.find(lesson => lesson.practice.some(predicate)), task = source.practice.find(predicate);
  const progress = createDailyProgress();
  progress.session = { ...createDailySession({ ...source, exercises: [task] }, 'review', now), focused: true };
  return { progress, task, lesson: source };
}
function client(server) { const storage = new MemoryStore(), engine = new ProgressSync({ storage, fetch: server.fetch, validate: validateProgressSnapshot }); engine.initialize(); return { storage, engine }; }

test('speech retry counters and failed outcome survive isolated two-client sync', async () => {
  let { progress, task, lesson } = fixture(task => task.speechActivity === 'repeat' && task.readAloud?.[0].en === 'Please check my pull request.');
  const phrase = task.readAloud[0];
  for (let attempt = 0; attempt < 2; attempt++) progress.session = updateDailyDraft(progress.session,
    recordSpeechTranscript(progress.session.draft, phrase.id, 'please change my blue request'));
  const server = syncServer(), a = client(server), b = client(server);
  a.storage.setItem(key, JSON.stringify(progress)); await a.engine.connect(); await b.engine.connect(a.engine.code());
  assert.equal(b.engine.status.state, 'synced');
  let restored = parseDailyProgress(b.storage.getItem(key), lessons);
  assert.equal(restored.writable, true, restored.warning);
  assert.equal(restored.progress.session.draft.speech.attempts[phrase.id], 2);
  progress = restored.progress;
  progress.session = updateDailyDraft(progress.session, recordSpeechTranscript(progress.session.draft, phrase.id, 'please change my blue request'));
  progress = submitDailyAnswer(progress, lesson, {}, now + 1000);
  b.storage.setItem(key, JSON.stringify(progress)); await b.engine.sync(); await a.engine.sync();
  restored = parseDailyProgress(a.storage.getItem(key), lessons);
  assert.equal(restored.writable, true, restored.warning);
  assert.deepEqual(restored.progress, progress);
  assert.equal(restored.progress.session.answers[0].speech.assessment, 'failed');
  assert.equal(restored.progress.session.answers[0].correct, false);
  assert.equal(a.storage.getItem('codewords-daily-v1'), null);
});

for (const kind of ['correction', 'pairs']) test(`${kind} survives two-client synchronization before and after submission`, async () => {
  const server = syncServer(), a = client(server), b = client(server);
  let { progress, task, lesson } = fixture(task => kind === 'pairs' ? task.kind === 'match' : task.kind === 'fill' && task.blanks[0][0].length >= 5);
  if (kind === 'correction') {
    progress.session = updateDailyDraft(progress.session, { blanks: [task.blanks[0][0].slice(0, -1) + 'z'] });
    progress = checkDailyAttempt(progress, lesson, now);
    assert.ok(progress.session.draft.correction);
  } else {
    progress.session = updateDailyDraft(progress.session, { pairs: selectPair(progress.session.draft.pairs, task.pairs[0].id) });
    progress = updateDailyPairs(progress, lesson, task.pairs[1].id, now);
  }
  a.storage.setItem(key, JSON.stringify(progress)); await a.engine.connect(); await b.engine.connect(a.engine.code());
  assert.equal(b.engine.status.state, 'synced'); assert.deepEqual(JSON.parse(b.storage.getItem(key)), progress);
  progress = parseDailyProgress(b.storage.getItem(key), lessons).progress;
  if (kind === 'correction') progress.session = updateDailyDraft(progress.session, { blanks: task.blanks.map(options => options[0]) });
  else for (const item of task.pairs) if (!progress.session.draft.pairs.matches[item.id]) {
    progress.session = updateDailyDraft(progress.session, { pairs: selectPair(progress.session.draft.pairs, item.id) });
    progress = updateDailyPairs(progress, lesson, item.id, now + 1000);
  }
  progress = checkDailyAttempt(progress, lesson, now + 1000); b.storage.setItem(key, JSON.stringify(progress));
  await b.engine.sync(); await a.engine.sync(); assert.equal(a.engine.status.state, 'synced');
  const restored = parseDailyProgress(a.storage.getItem(key), lessons); assert.equal(restored.writable, true, restored.warning);
  assert.equal(restored.progress.session.answers.length, 1); assert.equal(restored.progress.session.answers[0].outcome, 'assisted');
  assert.deepEqual(restored.progress, progress);
  assert.equal(a.storage.getItem('codewords-daily-v1'), null);
});

const flatTasks = lessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice].map(task => ({ lesson, task })));
const scoped = task => (task.prerequisiteIds ?? []).every(id => task.knowledgeIds.includes(id));

/** The shape the pre-fix code could save: only the question's own targets were
 * introduced, and nothing checked the words its text needs on resume. */
function legacyRecord({ lesson, task }, { text = '', helped = false } = {}) {
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 4, rounds: 1, targets: Object.fromEntries(task.knowledgeIds.map(id => [id, {
    introducedAt: now, confidence: .5, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0,
  }])) };
  progress.session = {
    id: 'legacy-session', lessonId: lesson.id, mode: 'lesson', stage: 'exercise', startedAt: now,
    queue: [{ exerciseId: task.id, retry: false }], index: 0, answers: [],
    draft: { ...createDailyDraft(task), text, helped }, feedback: null,
    adaptive: { version: 1, round: 1, focusIds: [...task.knowledgeIds], newIds: [], sourceLessonId: lesson.id, seed: 1, budget: 8 },
  };
  return progress;
}

const needsUnTaught = flatTasks.find(({ task }) => task.knowledgeIds.length === 1 && (task.prerequisiteIds ?? []).length > 0 && !scoped(task));
const stillInScope = flatTasks.find(({ task }) => scoped(task));

test('a question saved before the scope rule is set aside once, keeping its draft and evidence', () => {
  assert.ok(needsUnTaught, 'regression must include a question whose text needs untaught words');
  const original = legacyRecord(needsUnTaught, { text: 'half typed', helped: true });
  const parsed = parseDailyProgress(JSON.stringify(original), lessons);
  assert.equal(parsed.writable, true, parsed.warning);
  const fixed = reconcileSavedQuestion(parsed.progress, lessons, now + 1000);
  assert.notEqual(fixed.session.queue[0].exerciseId, parsed.progress.session.queue[0].exerciseId, 'the out-of-scope question must be replaced');
  assert.equal(fixed.session.answers.length, 0, 'replacing a question is not an answer');
  assert.equal(fixed.session.feedback, null);
  assert.deepEqual(fixed.learning, parsed.progress.learning, 'replacing a question writes no learning evidence');
  assert.deepEqual(fixed.lessons, parsed.progress.lessons, 'replacing a question writes no lesson record');
  assert.deepEqual(fixed.knowledge, parsed.progress.knowledge);
  assert.deepEqual(fixed.session.replaced.map(entry => entry.exerciseId), [parsed.progress.session.queue[0].exerciseId]);
  assert.equal(fixed.session.replaced[0].draft.text, 'half typed', 'the learner input survives');
  assert.equal(fixed.session.replaced[0].draft.helped, true, 'the recorded help survives');
  assert.notDeepEqual(fixed.session.draft, parsed.progress.session.draft, 'the new question must not inherit the old draft');
  assert.equal(parseDailyProgress(JSON.stringify(fixed), lessons).writable, true, 'the reconciled record must parse again');
  assert.deepEqual(reconcileSavedQuestion(fixed, lessons, now + 2000), fixed, 'reconciling twice must not replace a second question');
});

test('a saved question that is still inside the taught scope is restored untouched', () => {
  const parsed = parseDailyProgress(JSON.stringify(legacyRecord(stillInScope, { text: 'kept' })), lessons);
  assert.equal(parsed.writable, true, parsed.warning);
  const expected = structuredClone(parsed.progress);
  expected.session.adaptive = { ...expected.session.adaptive, courseMode: 'word-check', budget: 10 };
  assert.deepEqual(reconcileSavedQuestion(parsed.progress, lessons, now + 1000), expected, 'only the new course policy changes; the queue, draft and all evidence survive');
});

test('a question that is already answered keeps its feedback and is never reshuffled', () => {
  const progress = legacyRecord(needsUnTaught);
  progress.session = updateDailyDraft(progress.session, correctDraft(needsUnTaught.task));
  const submitted = submitDailyAnswer(progress, needsUnTaught.lesson, {}, now + 10);
  assert.equal(submitted.session.answers.length, 1);
  assert.ok(submitted.session.feedback);
  const expected = structuredClone(submitted);
  expected.session.adaptive = { ...expected.session.adaptive, courseMode: 'word-check', budget: 10 };
  assert.deepEqual(reconcileSavedQuestion(submitted, lessons, now + 1000), expected);
  const restored = parseDailyProgress(JSON.stringify(submitted), lessons);
  assert.equal(restored.writable, true, restored.warning);
  assert.deepEqual(restored.progress.session, submitted.session);
});

test('a reconciled record survives two-client synchronization unchanged', async () => {
  const base = parseDailyProgress(JSON.stringify(legacyRecord(needsUnTaught, { text: 'kept' })), lessons);
  const fixed = reconcileSavedQuestion(base.progress, lessons, now + 1000);
  const server = syncServer(), a = client(server), b = client(server);
  a.storage.setItem(key, JSON.stringify(fixed));
  await a.engine.connect(); await b.engine.connect(a.engine.code());
  assert.equal(b.engine.status.state, 'synced');
  const restored = parseDailyProgress(b.storage.getItem(key), lessons);
  assert.equal(restored.writable, true, restored.warning);
  assert.equal(restored.progress.session.queue[0].exerciseId, fixed.session.queue[0].exerciseId);
  assert.deepEqual(restored.progress.session.draft, fixed.session.draft);
  assert.deepEqual(restored.progress.session.replaced, fixed.session.replaced);
  assert.equal(a.storage.getItem('codewords-daily-v1'), null);
});

test('an out-of-scope question with no legal replacement returns to the course page without a broken session', () => {
  const lesson = { id: 'resume-fixture', title: 'fixture', goal: '', explanation: '', learningGoal: 'reading',
    learningTargets: ['word-1'], phrases: [{ id: 'word-1', en: 'one', zh: '一' }], rechecks: [], exercises: [],
    practice: [{ id: 'only-question', kind: 'choice', prompt: 'One sentence.', options: ['right', 'wrong'], answers: ['right'],
      explanation: '', knowledgeIds: ['word-1'], prerequisiteIds: ['word-2'], ability: 'context', learningDifficulty: 'context',
      learningSignature: 'only', learningContext: 'sentence:one sentence.' }] };
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 1, rounds: 1, targets: { 'word-1': {
    introducedAt: now, confidence: .4, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 } } };
  progress.session = { id: 's', lessonId: 'resume-fixture', mode: 'lesson', stage: 'exercise', startedAt: now,
    queue: [{ exerciseId: 'only-question', retry: false }], index: 0, answers: [], draft: createDailyDraft(), feedback: null,
    adaptive: { version: 1, round: 1, focusIds: ['word-1'], newIds: [], sourceLessonId: 'resume-fixture', seed: 1, budget: 8 } };
  const result = reconcileSavedQuestion(progress, [lesson], now + 1000);
  assert.equal(result.session, null, 'no legal replacement returns the learner to the course page');
  assert.deepEqual(result.learning, progress.learning, 'the record is preserved');
  assert.equal(parseDailyProgress(JSON.stringify(result), [lesson]).writable, true);
});
