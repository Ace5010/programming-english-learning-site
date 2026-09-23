import test from 'node:test';
import assert from 'node:assert/strict';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from '../src/adaptiveLearning.ts';
import { createDailyProgress, createDailySession, updateDailyDraft, submitDailyAnswer, markDailyHelp, parseDailyProgress, getDailyLessonProgress } from '../src/dailyProgress.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';

const NOW = new Date(2026, 8, 22, 10).getTime();
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(id, ids, goal = 'reading') {
  const practice = ids.flatMap(target => Array.from({ length: 10 }, (_, index) => ({
    id: `${id}-${target}-${index}`, kind: index === 9 ? 'write' : 'choice',
    prompt: `Question ${target} ${index}`, explanation: `${target} explanation`,
    options: index === 9 ? undefined : ['right', 'wrong'], answers: ['right'], knowledgeIds: [target],
    ability: index < 2 ? 'meaning' : index === 9 ? 'spelling' : 'context',
    learningDifficulty: index < 2 ? 'recognition' : index === 9 ? 'recall' : 'context',
    learningSignature: `${target}-variant-${index}`,
  })));
  return { id, title: id, goal: id, explanation: `${id} teaching`,
    phrases: ids.flatMap(target => [{ id: target, en: target, zh: target }, ...(target.startsWith('word-') ? [{ id: target.replace('word-', 'example-'), en: `${target} example`, zh: '例句' }] : [])]),
    exercises: practice.slice(0, 1), rechecks: [], practice, learningTargets: ids, learningGoal: goal };
}
const lessons = [fixture('one', ['word-1', 'word-2', 'word-3', 'word-4']), fixture('two', ['word-5', 'word-6', 'word-7', 'word-8'])];
function start(progress = createDailyProgress(), catalog = lessons, value = 0.37) {
  const session = planAdaptiveSession(progress, catalog, NOW, () => value);
  assert.ok(session);
  return beginAdaptiveLearning({ ...progress, session }, catalog, NOW);
}
function currentTask(progress, catalog = lessons) {
  return resolveAdaptiveLesson(progress.session, catalog).exercises.find(task => task.id === progress.session.queue[progress.session.index].exerciseId);
}
function correctDraft(task) {
  if (task.kind === 'order') {
    const remaining = task.options.map((value, index) => ({ value, index }));
    const desired = task.answers[0];
    const ordered = [];
    let tail = desired;
    while (remaining.length) {
      const index = remaining.findIndex(item => tail === item.value || tail.startsWith(`${item.value} `));
      assert.notEqual(index, -1, `Cannot order ${task.id}`);
      const [item] = remaining.splice(index, 1); ordered.push(item.index); tail = tail.slice(item.value.length).trimStart();
    }
    return { order: ordered };
  }
  if (task.kind === 'fill') return { blanks: task.blanks.map(values => values[0]) };
  if (task.kind === 'write') return { text: task.answers[0] };
  if (task.kind === 'speak') return { text: task.sample, checks: task.checks.map(() => true) };
  return { choice: task.answers[0] };
}
function answer(progress, catalog = lessons, failed = false, time = NOW) {
  const task = currentTask(progress, catalog);
  let next = { ...progress, session: updateDailyDraft(progress.session, correctDraft(task)) };
  if (failed) next = markDailyHelp(next, resolveAdaptiveLesson(next.session, catalog), true, time);
  next = submitDailyAnswer(next, resolveAdaptiveLesson(next.session, catalog), {}, time);
  assert.ok(next.session.feedback, `Submitted ${task.id}`);
  return recordAdaptiveAnswer(next, catalog, time);
}
function round(progress, catalog = lessons, failed = false) {
  let next = progress;
  let count = 0;
  while (next.session.stage !== 'summary') {
    assert.ok(count++ <= 20, 'Round must end');
    next = answer(next, catalog, failed, NOW + count * 1000);
    const parsed = parseDailyProgress(JSON.stringify(next), catalog);
    assert.equal(parsed.writable, true, parsed.warning);
    next = advanceAdaptiveSession(next, catalog, NOW + count * 1000);
    assert.equal(parseDailyProgress(JSON.stringify(next), catalog).writable, true);
  }
  return next;
}

test('teaching persists exposure without readiness, unknown targets, or fabricated answers', () => {
  const fresh = createDailyProgress();
  const session = planAdaptiveSession(fresh, lessons, NOW, () => 0.5);
  assert.equal(fresh.learning, undefined);
  assert.equal(session.queue.length, 1);
  assert.ok(session.adaptive.budget >= 8 && session.adaptive.budget <= 16);
  const progress = beginAdaptiveLearning({ ...fresh, session }, lessons, NOW);
  assert.deepEqual(Object.keys(progress.learning.targets).sort(), [...session.adaptive.focusIds].sort());
  assert.deepEqual(Object.keys(progress.knowledge).sort(), [...session.adaptive.focusIds].sort());
  for (const target of Object.values(progress.learning.targets)) {
    assert.equal(target.readyAt, 0); assert.equal(target.confidence, 0); assert.deepEqual(target.abilities, {});
  }
  assert.equal(progress.learning.rounds, 0);
  assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, true);
});

test('saved sessions replay exactly and historical live sessions remain untouched', () => {
  const progress = start();
  assert.strictEqual(planAdaptiveSession(progress, lessons, NOW + 10000, () => 0.99), progress.session);
  const restored = parseDailyProgress(JSON.stringify(progress), lessons).progress;
  assert.deepEqual(planAdaptiveSession(restored, lessons, NOW + 10000, () => 0.01), progress.session);
  const oldSession = createDailySession(lessons[0], 'lesson', NOW);
  assert.strictEqual(planAdaptiveSession({ ...createDailyProgress(), session: oldSession }, lessons), oldSession);
});

test('teaching includes focused words and examples, with at most two source explanations', () => {
  const progress = start();
  const resolved = resolveAdaptiveLesson(progress.session, lessons);
  const allowed = new Set(progress.session.adaptive.focusIds.flatMap(id => [id, id.replace('word-', 'example-')]));
  assert.ok(resolved.phrases.length);
  assert.ok(resolved.phrases.every(phrase => allowed.has(phrase.id)));
  assert.ok(progress.session.adaptive.focusIds.every(id => resolved.phrases.some(phrase => phrase.id === id.replace('word-', 'example-'))));
  assert.ok(resolved.explanation.split('\n\n').length <= 2);
  assert.ok(resolved.exercises.some(task => task.id.startsWith('two-')));
});

test('new targets begin with recognition and one answer never grants admission', () => {
  for (const value of [0, 0.1, 0.5, 0.999]) {
    const progress = start(createDailyProgress(), lessons, value);
    assert.equal(currentTask(progress).learningDifficulty, 'recognition');
    const next = answer(progress);
    assert.ok(Object.values(next.learning.targets).every(target => !target.readyAt));
    assert.equal(next.learning.turns, 1);
    assert.deepEqual(recordAdaptiveAnswer(next, lessons), next);
  }
});

test('hints immediately lower confidence once and cannot transfer or invent another answer', () => {
  let progress = start();
  const task = currentTask(progress), id = task.knowledgeIds[0];
  progress.learning.targets[id] = { ...progress.learning.targets[id], confidence: 0.7, abilities: { meaning: 0.7 }, transfer: true };
  progress = markDailyHelp(progress, resolveAdaptiveLesson(progress.session, lessons), false, NOW);
  const hinted = recordAdaptiveAnswer(progress, lessons, NOW);
  assert.ok(hinted.learning.targets[id].confidence < 0.7);
  assert.equal(hinted.learning.targets[id].transfer, false);
  assert.equal(hinted.learning.turns, 0);
  assert.deepEqual(recordAdaptiveAnswer(hinted, lessons, NOW + 1000), hinted);
  const checked = answer(hinted);
  assert.equal(checked.learning.turns, 1);
  assert.equal(checked.learning.targets[id].readyAt, 0);
});

test('next selection is deterministic after restoring feedback and never mutates the input', () => {
  const answered = answer(start());
  const before = JSON.stringify(answered);
  const next = advanceAdaptiveSession(answered, lessons, NOW);
  const afterReload = advanceAdaptiveSession(copy(answered), lessons, NOW);
  assert.deepEqual(next, afterReload);
  assert.equal(JSON.stringify(answered), before);
  assert.equal(next.session.queue.length, 2);
  assert.notEqual(next.session.queue[0].exerciseId, next.session.queue[1].exerciseId);
});

test('failures produce bounded extra practice, no duplicate questions, and no unseen targets', () => {
  const progress = round(start(), lessons, true);
  assert.ok(progress.session.answers.length >= 8 && progress.session.answers.length <= 20);
  assert.equal(new Set(progress.session.queue.map(item => item.exerciseId)).size, progress.session.queue.length);
  const allowed = new Set(Object.keys(progress.learning.targets));
  for (const entry of progress.session.queue) {
    const task = resolveAdaptiveLesson(progress.session, lessons).exercises.find(task => task.id === entry.exerciseId);
    assert.ok(task.knowledgeIds.every(id => allowed.has(id)));
  }
  assert.equal(progress.learning.rounds, 1);
  assert.ok(progress.lessons.one.completedAt);
  assert.equal(progress.lessons.two?.completedAt ?? 0, 0);
  assert.ok(Object.values(progress.learning.targets).every(target => !target.readyAt));
  const next = planAdaptiveSession(progress, lessons, NOW + 100000, () => 0.1);
  assert.deepEqual(next.adaptive.newIds, []);
  assert.equal(next.adaptive.round, 2);
});

test('mastered-looking history only migrates exposure and does not suppress supplemental lessons', () => {
  const history = { ...createDailyProgress(), lessons: { one: { ...getDailyLessonProgress(createDailyProgress(), 'one'), completedAt: NOW } } };
  const session = planAdaptiveSession(history, lessons, NOW + 1000, () => 0.2);
  const progress = beginAdaptiveLearning({ ...history, session }, lessons, NOW + 1000);
  assert.equal(progress.lessons.one.completedAt, NOW);
  assert.ok(progress.learning.targets['word-1']);
  assert.ok(Object.values(progress.learning.targets).every(target => !target.readyAt));
  assert.equal(session.adaptive.newIds.length, 0);
  assert.equal(hasAdaptiveContent(progress, lessons), true);
});

test('eligibility needs spaced changed context, not repeated choices or immediate corrected memory', () => {
  let progress = start();
  const target = 'word-1';
  const exercises = lessons[0].practice.filter(task => task.knowledgeIds[0] === target);
  const inject = (task, turns, failure, priorSignature, confidence = 0.79) => {
    const base = copy(progress);
    base.learning.turns = turns;
    base.learning.lastAnswer = undefined;
    base.learning.targets[target] = { ...base.learning.targets[target], confidence, abilities: { context: 0.6 }, lastSeenTurn: 1, lastFailureTurn: failure, signatures: priorSignature, transfer: false };
    base.session = { ...base.session, index: 0, queue: [{ exerciseId: task.id, retry: false }], answers: [], feedback: null, draft: { ...base.session.draft, choice: null, helped: false, revealed: false } };
    return answer(base);
  };
  const recognition = inject(exercises[0], 4, 0, ['different']);
  assert.equal(recognition.learning.targets[target].readyAt, 0);
  const immediate = inject(exercises[2], 1, 1, ['different']);
  assert.equal(immediate.learning.targets[target].readyAt, 0);
  const transferred = inject(exercises[2], 4, 1, ['different']);
  assert.equal(transferred.learning.targets[target].readyAt, NOW);
  assert.equal(transferred.learning.targets[target].transfer, true);
  assert.equal(transferred.learning.targets[target].abilities.spelling, undefined);
});

test('completed source ranges still generate learning rounds until confidence is established', () => {
  let progress = createDailyProgress();
  for (const current of lessons) progress.lessons[current.id] = { ...getDailyLessonProgress(progress, current.id), completedAt: NOW };
  progress = round(start(progress), lessons, true);
  assert.equal(hasAdaptiveContent(progress, lessons), true);
  assert.ok(planAdaptiveSession(progress, lessons, NOW + 1000, () => 0.4));
  for (const target of Object.values(progress.learning.targets)) { target.readyAt = NOW; target.confidence = 1; target.transfer = true; }
  assert.equal(hasAdaptiveContent(progress, lessons), false);
  assert.equal(planAdaptiveSession(progress, lessons), null);
});

test('long-term review difficulties return admitted targets to teaching without revoking admission', () => {
  const progress = start();
  progress.session = null;
  for (const [id, target] of Object.entries(progress.learning.targets)) {
    progress.learning.targets[id] = { ...target, readyAt: NOW, confidence: 1, transfer: true };
  }
  progress.learning.targets['word-1'] = { ...progress.learning.targets['word-1'], confidence: 0.35, transfer: false };
  const planned = planAdaptiveSession(progress, lessons, NOW, () => 0.5);
  assert.ok(planned.adaptive.focusIds.includes('word-1'));
  assert.equal(progress.learning.targets['word-1'].readyAt, NOW);
});

test('nonadaptive review mistakes and hints flow back into learning with durable admission and replay protection', () => {
  let progress = start();
  const task = currentTask(progress), id = task.knowledgeIds[0];
  for (const target of Object.values(progress.learning.targets)) { target.confidence = 1; target.readyAt = NOW; target.transfer = true; }
  progress.learning.targets[id] = { ...progress.learning.targets[id], confidence: 0.9, abilities: { meaning: 0.9 }, readyAt: NOW, transfer: true };
  progress.session = { ...progress.session, adaptive: undefined, mode: 'review', focused: true };
  progress = markDailyHelp(progress, lessons[0], false, NOW + 1000);
  // The selected pool question can be a practice variant; resolve the global pool for shared components.
  if (!progress.session.draft.helped) progress.session = updateDailyDraft(progress.session, { helped: true });
  const hinted = recordAdaptiveAnswer(progress, lessons, NOW + 1000);
  assert.ok(hinted.learning.targets[id].confidence < 0.9);
  assert.equal(hinted.learning.targets[id].readyAt, NOW);
  assert.deepEqual(recordAdaptiveAnswer(hinted, lessons, NOW + 2000), hinted);
  const resolved = { ...lessons[0], exercises: lessons.flatMap(item => [...item.exercises, ...item.practice]) };
  const checked = submitDailyAnswer({ ...hinted, session: updateDailyDraft(hinted.session, correctDraft(task)) }, resolved, {}, NOW + 3000);
  const recorded = recordAdaptiveAnswer(checked, lessons, NOW + 3000);
  assert.equal(recorded.learning.turns, 1);
  assert.equal(recorded.learning.targets[id].transfer, false);
  assert.equal(recorded.learning.targets[id].readyAt, NOW);
  assert.deepEqual(recordAdaptiveAnswer(recorded, lessons, NOW + 4000), recorded);
  assert.ok(planAdaptiveSession({ ...recorded, session: null }, lessons, NOW, () => 0.5).adaptive.focusIds.includes(id));
});

test('speaking remains available once per round but self-checks never grant confidence or readiness', () => {
  const catalog = [copy(lessons[0])];
  const speech = { id: 'oral', kind: 'speak', prompt: 'Say it', explanation: 'Speak', sample: 'Hello', checks: ['Said it'],
    knowledgeIds: ['word-1'], learningDifficulty: 'recall', learningSignature: 'oral-signature' };
  catalog[0].practice.push(speech, { ...speech, id: 'oral-two' });
  let progress = start(createDailyProgress(), catalog);
  for (const target of Object.values(progress.learning.targets)) { target.confidence = 0.7; target.abilities.context = 0.6; }
  // Selecting the final candidate with a controlled random value exercises the oral branch.
  progress = advanceAdaptiveSession(answer(progress, catalog), catalog, NOW, () => 1);
  assert.equal(currentTask(progress, catalog).kind, 'speak');
  const before = copy(progress.learning.targets['word-1']);
  progress = answer(progress, catalog);
  const after = progress.learning.targets['word-1'];
  assert.equal(after.confidence, before.confidence);
  assert.equal(after.readyAt, before.readyAt);
  assert.equal(after.transfer, before.transfer);
  assert.deepEqual(after.abilities, before.abilities);
  progress = advanceAdaptiveSession(progress, catalog, NOW, () => 1);
  assert.notEqual(currentTask(progress, catalog).kind, 'speak');
});

test('daily recall can establish transfer without requiring a context-ability field', () => {
  const catalog = [fixture('daily', ['hello', 'goodbye'], 'communication')];
  const recall = { ...catalog[0].practice.find(task => task.knowledgeIds[0] === 'hello' && task.kind === 'write'), ability: undefined };
  catalog[0].practice = catalog[0].practice.filter(task => task.id !== recall.id).concat(recall);
  let progress = start(createDailyProgress(), catalog);
  progress.learning.turns = 5;
  progress.learning.targets.hello = { ...progress.learning.targets.hello, confidence: 0.79, abilities: { writing: 0.6 }, lastSeenTurn: 1, signatures: ['a-prior-expression'], transfer: false };
  progress.session = { ...progress.session, queue: [{ exerciseId: recall.id, retry: false }], index: 0, answers: [], feedback: null, draft: { ...progress.session.draft, choice: null } };
  progress = answer(progress, catalog);
  assert.equal(progress.learning.targets.hello.readyAt, NOW);
  assert.equal(progress.learning.targets.hello.abilities.context, undefined);
});

test('random seeds vary the first question while keeping it in introduced teaching scope', () => {
  const chosen = new Set();
  for (let seed = 1; seed < 12; seed++) {
    const progress = start(createDailyProgress(), lessons, seed / 12);
    chosen.add(progress.session.queue[0].exerciseId);
    assert.ok(currentTask(progress).knowledgeIds.every(id => progress.session.adaptive.focusIds.includes(id)));
  }
  assert.ok(chosen.size > 1);
});

for (const [name, catalog] of [['programming', adaptiveProgrammingLessons], ['daily', adaptiveDailyLessons]]) {
  test(`${name} actual content completes bounded resumable rounds without leaking future targets`, () => {
    let progress = createDailyProgress();
    for (let index = 0; index < 3; index++) {
      progress = start(progress, catalog, (index + 1) / 4);
      const taught = new Set(Object.keys(progress.learning.targets));
      progress = round(progress, catalog);
      assert.ok(progress.session.answers.length <= 20);
      for (const entry of progress.session.queue) {
        const task = resolveAdaptiveLesson(progress.session, catalog).exercises.find(task => task.id === entry.exerciseId);
        assert.ok(task.knowledgeIds.every(id => taught.has(id)), `${name} ${task.id}`);
      }
      assert.equal(progress.learning.rounds, index + 1);
    }
    assert.ok(Object.values(progress.learning.targets).some(target => target.confidence > 0));
    assert.ok(Object.values(progress.learning.targets).some(target => target.readyAt > 0), `${name} independent practice must eventually earn admission`);
  });
}
