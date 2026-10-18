import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyWordTargets, localWordError } from '../src/dailyWordTargets.ts';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailyDraft, createDailySession, learnDailyLesson, checkDailyAttempt, updateDailyDraft, parseDailyProgress } from '../src/dailyProgress.ts';
import { recordAdaptiveAnswer, planWordPractice, advanceAdaptiveSession, resolveAdaptiveLesson } from '../src/adaptiveLearning.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { ProgressSync } from '../src/progressSync.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';

const now = 1800000000000;
const catalog = lessons.flatMap(lesson => lesson.practice);
const fresh = () => ({ introducedAt: now - 86400000, confidence: .7, abilities: { meaning: .7, spelling: .7, context: .7 }, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], contexts: [], transfer: false, readyAt: 0 });
function fixture(task) {
  const lesson = lessons.find(lesson => lesson.practice.some(item => item.id === task.id));
  let progress = learnDailyLesson(createDailyProgress(), lesson, now - 86400000);
  progress.learning = { version: 1, turns: 5, rounds: 0, targets: Object.fromEntries(Object.keys(progress.knowledge).map(id => [id, fresh()])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, sourceLessonId: lesson.id, focusIds: task.knowledgeIds, newIds: [], seed: 45, budget: 8 } };
  return { progress, lesson: resolveAdaptiveLesson(progress.session, lessons) };
}
test('same word across sentences shares one ID; gaps test from instead of China', () => {
  const tasks = catalog.filter(task => task.knowledgeIds[0] === 'daily-word-from' && task.audioPrompt);
  assert.ok(tasks.length >= 4);
  assert.ok(tasks.every(task => task.blanks[0][0].toLowerCase() === 'from'));
  assert.ok(tasks.every(task => task.prerequisiteIds.includes(task.audioId)));
  for (const word of dailyWordTargets) assert.ok(catalog.some(task => task.knowledgeIds[0] === word.id && task.kind === 'write' && !task.options));
});
test('reliable local attribution distinguishes spelling and article; uncertain changes remain expression-level', () => {
  const task = { kind: 'write', answers: ['I am a student.'] };
  assert.deepEqual(localWordError(task, { text: 'I am a studnet.' }), { id: 'daily-word-student', ability: 'spelling' });
  assert.deepEqual(localWordError(task, { text: 'I am student.' }), { id: 'daily-word-student', ability: 'context' });
  assert.equal(localWordError(task, { text: 'We was teacher.' }), undefined);
});
test('one typo affects only the named word, remains durable through correction and reload', () => {
  const task = catalog.find(task => task.id.endsWith('-i-am-a-student-write'));
  let { progress, lesson } = fixture(task);
  const other = structuredClone(progress.learning.targets['daily-word-teacher']);
  progress.session.draft.text = 'I am a studnet.';
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now), lessons, now);
  assert.equal(progress.learning.targets['daily-word-student'].lastErrorAbility, 'spelling');
  const loss = progress.learning.targets['daily-word-student'].confidence;
  assert.deepEqual(progress.learning.targets['daily-word-teacher'], other);
  const parsed = parseDailyProgress(JSON.stringify(progress), lessons); assert.ok(parsed.writable, parsed.warning);
  progress = parsed.progress;
  progress.session = updateDailyDraft(progress.session, { text: 'I am a student.' });
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now + 1000), lessons, now + 1000);
  assert.equal(progress.learning.targets['daily-word-student'].confidence, loss);
  assert.equal(progress.knowledge['daily-word-student'].skills.writing.assistedAnswers, 1);
  assert.equal(progress.knowledge['daily-word-teacher'].skills.writing.attempts, 0);
});
test('same sentence in a different format cannot grant transfer, different known sentence can', () => {
  const task = catalog.find(task => task.id.endsWith('daily-word-from-from-japan-recall'));
  for (const previousContext of [task.learningContext, 'sentence:i am from china.']) {
    let { progress, lesson } = fixture(task);
    const target = progress.learning.targets['daily-word-from'];
    target.contexts = [previousContext]; target.signatures = ['different-format']; target.confidence = .79;
    progress.session.draft = correctDraft(task);
    progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now), lessons, now);
    assert.equal(progress.learning.targets['daily-word-from'].transfer, previousContext !== task.learningContext);
    assert.equal(!!progress.learning.targets['daily-word-from'].readyAt, previousContext !== task.learningContext);
  }
});

test('isolated word typo is penalized and counted once, not twice by sentence diagnosis', () => {
  const task = catalog.find(task => task.id.endsWith('-daily-word-student-write'));
  let { progress, lesson } = fixture(task);
  const confidence = progress.learning.targets['daily-word-student'].confidence;
  progress.session.draft.text = 'studnet';
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now), lessons, now);
  assert.ok(Math.abs(progress.learning.targets['daily-word-student'].confidence - (confidence - .26)) < 1e-9);
  progress.session = updateDailyDraft(progress.session, { text: 'student' });
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now + 1000), lessons, now + 1000);
  assert.equal(progress.knowledge['daily-word-student'].skills.writing.attempts, 1);
});
test('programming context variants share actual sentence identity; unsupported spelling remains separate', () => {
  const tasks = adaptiveProgrammingLessons[0].practice.filter(task => task.knowledgeIds[0] === 'word-1');
  assert.equal(tasks.find(task => task.id.endsWith('-sentence')).learningContext, tasks.find(task => task.id.endsWith('-translation')).learningContext);
  assert.ok(tasks.find(task => task.id.endsWith('-recall')).recallSupport);
  assert.ok(tasks.find(task => task.id.endsWith('-free-gap')));
});
test('focused practice is bounded, stays in taught targets, restores exact question and saves in existing key', () => {
  const task = catalog.find(task => task.id.endsWith('daily-word-from-from-japan-recall'));
  let { progress } = fixture(task); progress.session = null;
  progress.session = planWordPractice(progress, lessons, ['daily-word-from', 'daily-word-teacher'], now);
  assert.deepEqual(progress.session.adaptive.focusIds, ['daily-word-from']);
  for (let index = 0; index < 21 && progress.session.stage !== 'summary'; index++) {
    const lesson = resolveAdaptiveLesson(progress.session, lessons);
    const exercise = lesson.exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
    assert.deepEqual(exercise.knowledgeIds, ['daily-word-from']);
    progress.session.draft = correctDraft(exercise);
    progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now + index), lessons, now + index);
    const raw = JSON.stringify(progress), parsed = parseDailyProgress(raw, lessons);
    assert.ok(parsed.writable, parsed.warning); assert.equal(JSON.stringify(parsed.progress), raw);
    progress = advanceAdaptiveSession(parsed.progress, lessons, now + index);
  }
  assert.equal(progress.session.stage, 'summary'); assert.ok(progress.session.answers.length <= 20);
});

test('word evidence separates choice, unassisted recall and later-session recall; sync preserves it', async () => {
  const task = catalog.find(task => task.id.endsWith('daily-word-from-from-japan-recall'));
  let { progress, lesson } = fixture(task);
  progress.learning.targets['daily-word-from'].lastSessionId = 'earlier-session';
  progress.session.draft = correctDraft(task);
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now), lessons, now);
  const evidence = progress.learning.targets['daily-word-from'].evidence;
  assert.equal(evidence.recall.independent, 1); assert.equal(evidence.laterSession.independent, 1);
  assert.equal(evidence.recognition, undefined);
  const server = syncServer();
  const a = new MemoryStore(), b = new MemoryStore();
  const engineA = new ProgressSync({ storage: a, fetch: server.fetch, validate: validateProgressSnapshot });
  const engineB = new ProgressSync({ storage: b, fetch: server.fetch, validate: validateProgressSnapshot });
  engineA.initialize(); engineB.initialize(); a.setItem('codewords-daily-v1', JSON.stringify(progress));
  await engineA.connect(); await engineB.connect(engineA.code());
  assert.equal(engineB.status.state, 'synced');
  assert.deepEqual(JSON.parse(b.getItem('codewords-daily-v1')), progress);
  assert.equal(b.getItem('codewords-programming-course-v1'), null);
  progress.learning.targets['daily-word-from'].evidence.recall.attempts = -1;
  assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, false);
});

test('historical completed lessons do not invent exposure for newly added pilot words', () => {
  const task = catalog.find(task => task.id.endsWith('daily-word-from-from-japan-recall'));
  let { progress } = fixture(task);
  delete progress.learning.targets['daily-word-from']; delete progress.knowledge['daily-word-from'];
  progress.lessons['A1-02-01'] = { ...progress.lessons['A1-02-01'], completedAt: now };
  progress.session = null;
  assert.equal(planWordPractice(progress, lessons, ['daily-word-from'], now), null);
});
