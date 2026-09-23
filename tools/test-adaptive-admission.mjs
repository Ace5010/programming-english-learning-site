import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveProgrammingLessons as catalog } from '../src/programmingPractice.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from '../src/adaptiveLearning.ts';
import { createDailyProgress, createDailyDraft, checkDailyAnswer, updateDailyDraft, submitDailyAnswer, parseDailyProgress, persistDailyProgress } from '../src/dailyProgress.ts';
import { initializeProgrammingReview, mergeProgrammingCourse, PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { applyProgrammingReviewToLearning, programmingReview } from '../src/programmingReview.ts';
import { REVIEW_KEY, getSkill, reviewAbilities, isReviewEligible, isWordDue, updateReviewProgress, parseReviewProgress, serializeReviewProgress, createReviewSession } from '../src/review.ts';
import { vocabulary } from '../src/vocabulary.ts';

const NOW = new Date(2026, 8, 22, 10).getTime();
const afterDays = (at, days) => { const result = new Date(at); result.setDate(result.getDate() + days); return result.getTime(); };
const clone = value => JSON.parse(JSON.stringify(value));
const storage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

function correctDraft(task) {
  const draft = createDailyDraft(task);
  if (task.kind === 'choice' || task.kind === 'listen') draft.choice = task.answers[0];
  else if (task.kind === 'fill') draft.blanks = task.blanks.map(values => values[0]);
  else if (task.kind === 'write') draft.text = task.answers[0];
  else if (task.kind === 'order') {
    const solve = (selected, available) => {
      const text = selected.map(index => task.options[index]).join(' ');
      if (task.answers.includes(text)) return selected;
      if (!task.answers.some(answer => answer.startsWith(text))) return null;
      for (const index of available) {
        const solution = solve([...selected, index], available.filter(value => value !== index));
        if (solution) return solution;
      }
      return null;
    };
    draft.order = solve([], task.options.map((_, index) => index));
    assert.ok(draft.order, `unsatisfiable order task: ${task.id}`);
  } else assert.fail(`Unexpected programming task kind: ${task.kind}`);
  assert.deepEqual(checkDailyAnswer(task, draft).correct, true, task.id);
  return draft;
}

let completedRun;
function completeActualCourse() {
  if (completedRun) return clone(completedRun);
  const saved = storage();
  let course = createDailyProgress();
  let review = {};
  let now = NOW;
  let submitted = 0;
  let rounds = 0;
  let firstTeachingChecked = false;
  let firstAnswerChecked = false;
  const admissionAnswers = {};
  const seenQuestions = new Set();
  const tested = new Map();

  function persistAndMerge() {
    const previous = saved.getItem(PROGRAMMING_COURSE_KEY);
    const persisted = persistDailyProgress(saved, course, previous, PROGRAMMING_COURSE_KEY);
    assert.equal(persisted.saved, true, persisted.warning);
    const restored = parseDailyProgress(saved.getItem(PROGRAMMING_COURSE_KEY), catalog);
    assert.equal(restored.writable, true, restored.warning);
    assert.deepEqual(restored.progress, persisted.progress, 'all adaptive state survives storage');
    course = restored.progress;
    const old = review;
    review = mergeProgrammingCourse(review, course, catalog, now);
    for (const [id, word] of Object.entries(review)) if (isReviewEligible(review, Number(id)) && !isReviewEligible(old, Number(id))) {
      assert.ok(word.reviewReadyAt > NOW, `${id} requires actual later practice`);
      assert.ok((tested.get(Number(id)) ?? 0) > 1, `${id} cannot enter review after its first answer`);
      admissionAnswers[id] = tested.get(Number(id));
      for (const ability of reviewAbilities) {
        assert.equal(getSkill(review, Number(id), ability).dueAt, afterDays(word.reviewReadyAt, 1), `${id}:${ability} baseline starts at admission`);
        assert.equal(getSkill(review, Number(id), ability).intervalDays, 1);
      }
    }
    const serialized = serializeReviewProgress(review);
    saved.setItem(REVIEW_KEY, serialized);
    review = parseReviewProgress(saved.getItem(REVIEW_KEY));
    assert.deepEqual(JSON.parse(serializeReviewProgress(review)), JSON.parse(serialized), 'storage preserves evidence, independent of object key order');
    assert.deepEqual(mergeProgrammingCourse(review, course, catalog, now + 500), review, 'replaying course evidence is idempotent');
    assert.deepEqual(initializeProgrammingReview(saved, now + 500), review, 'initialization preserves pending or admitted course states');
  }

  while (hasAdaptiveContent(course, catalog)) {
    assert.ok(rounds < 180, 'correct real-content practice must eventually finish the teaching scope');
    now += 1000;
    const session = planAdaptiveSession(course, catalog, now, () => ((rounds * 137 + 371) % 997) / 997);
    assert.ok(session, 'unfinished targets must produce a next lesson');
    course = { ...course, session };
    persistAndMerge();
    course = beginAdaptiveLearning(course, catalog, now);
    persistAndMerge();
    if (!firstTeachingChecked) {
      assert.ok(Object.keys(review).length > 0);
      for (const id of session.adaptive.focusIds) {
        const wordId = Number(id.slice(5));
        assert.equal(isReviewEligible(review, wordId), false, 'first teaching is pending');
        assert.equal(review[wordId].reviewReadyAt, 0);
        assert.equal(isWordDue(review, wordId, afterDays(now, 30)), false, 'time alone cannot admit a pending word');
        for (const ability of reviewAbilities) assert.equal(getSkill(review, wordId, ability).attempts ?? 0, 0);
      }
      firstTeachingChecked = true;
    }
    let count = 0;
    while (course.session.stage !== 'summary') {
      assert.ok(count++ < 20, 'every dynamically generated lesson remains bounded');
      const resolved = resolveAdaptiveLesson(course.session, catalog);
      const task = resolved.exercises.find(item => item.id === course.session.queue[course.session.index].exerciseId);
      assert.ok(task);
      assert.ok(task.knowledgeIds.every(id => course.learning.targets[id]?.introducedAt), `never assess untaught ${task.id}`);
      course = { ...course, session: updateDailyDraft(course.session, correctDraft(task)) };
      persistAndMerge();
      now += 1000;
      course = submitDailyAnswer(course, resolved, {}, now);
      assert.equal(course.session.feedback.correct, true, task.id);
      assert.equal(course.session.feedback.outcome, 'independent', task.id);
      course = recordAdaptiveAnswer(course, catalog, now);
      submitted++;
      seenQuestions.add(task.id);
      for (const wordId of task.wordIds) tested.set(wordId, (tested.get(wordId) ?? 0) + 1);
      persistAndMerge();
      if (!firstAnswerChecked) {
        assert.ok(Object.keys(review).every(id => !isReviewEligible(review, Number(id))));
        assert.ok(Object.values(course.learning.targets).every(target => target.readyAt === 0));
        firstAnswerChecked = true;
      }
      assert.deepEqual(recordAdaptiveAnswer(course, catalog, now + 100), course, 'answer evidence is replay-safe');
      course = advanceAdaptiveSession(course, catalog, now);
      persistAndMerge();
    }
    rounds++;
    assert.equal(course.learning.rounds, rounds);
  }
  const expectedIds = [...new Set(catalog.flatMap(lesson => lesson.wordIds))].sort((a, b) => a - b);
  assert.deepEqual(Object.keys(review).map(Number).sort((a, b) => a - b), expectedIds);
  assert.equal(expectedIds.length, 63);
  for (const id of expectedIds) {
    assert.equal(isReviewEligible(review, id), true);
    assert.ok(course.learning.targets[`word-${id}`].readyAt > 0);
    assert.ok(course.learning.targets[`word-${id}`].transfer);
    assert.ok(course.learning.targets[`word-${id}`].abilities.context >= 0.5);
    assert.equal(isWordDue(review, id, review[id].reviewReadyAt), false);
    assert.equal(isWordDue(review, id, afterDays(review[id].reviewReadyAt, 1)), true);
  }
  assert.equal(planAdaptiveSession(course, catalog, now + 1000), null);
  completedRun = { course, review, now, submitted, rounds, admissionAnswers, questionCount: seenQuestions.size };
  return clone(completedRun);
}

test('actual adaptive programming content completes teaching, delayed admission and replay-safe storage', t => {
  const result = completeActualCourse();
  assert.ok(result.submitted > 63);
  assert.ok(result.questionCount > 63);
  assert.ok(result.rounds > 1);
  assert.equal(Object.keys(result.admissionAnswers).length, 63);
  const counts = Object.values(result.admissionAnswers);
  t.diagnostic(`Real-content run: ${result.rounds} generated lessons, ${result.submitted} checked answers, ${result.questionCount} distinct questions; admission after ${Math.min(...counts)}-${Math.max(...counts)} answers per target.`);
});

test('historical self-confirmed words remain reviewable and prepareLearning skips their initial teaching', () => {
  const legacyIds = catalog[0].wordIds;
  const saved = storage({ 'codewords-mastered': JSON.stringify(legacyIds) });
  const review = initializeProgrammingReview(saved, NOW);
  const fresh = createDailyProgress();
  const prepared = applyProgrammingReviewToLearning(fresh, review);
  assert.deepEqual(fresh, createDailyProgress(), 'preparation does not mutate existing course state');
  assert.deepEqual(applyProgrammingReviewToLearning(prepared, review), prepared);
  assert.deepEqual(prepared.lessons, {});
  for (const id of legacyIds) {
    assert.equal(review[id].source, 'legacy');
    assert.equal(isReviewEligible(review, id), true);
    assert.equal(isWordDue(review, id, NOW), true);
    assert.ok(prepared.learning.targets[`word-${id}`].readyAt);
    assert.deepEqual(prepared.learning.targets[`word-${id}`].abilities, {});
    assert.deepEqual(prepared.learning.targets[`word-${id}`].signatures, []);
    for (const ability of reviewAbilities) assert.equal(getSkill(review, id, ability).attempts ?? 0, 0);
  }
  const session = planAdaptiveSession(prepared, catalog, NOW + 1000, () => 0.45);
  assert.ok(session.adaptive.newIds.length);
  assert.ok(session.adaptive.newIds.every(id => !legacyIds.includes(Number(id.slice(5)))));
  assert.equal(session.adaptive.sourceLessonId, catalog[1].id);
  const begun = beginAdaptiveLearning({ ...prepared, session }, catalog, NOW + 1000);
  const merged = mergeProgrammingCourse(review, begun, catalog, NOW + 1000);
  assert.ok(legacyIds.every(id => merged[id].source === 'legacy' && isReviewEligible(merged, id)));
  assert.equal(saved.getItem('codewords-mastered'), JSON.stringify(legacyIds));
  assert.equal(parseDailyProgress(JSON.stringify(begun), catalog).writable, true);
});

test('later word-review failures return the weak target to the next generated lesson only once', () => {
  const { course, review, now } = completeActualCourse();
  const id = catalog[0].wordIds[0];
  const at = afterDays(now, 2);
  const question = { wordId: id, ability: 'spelling', level: getSkill(review, id, 'spelling').level, retry: false, source: 'review' };
  const failed = updateReviewProgress(review, question, 'revealed', at);
  assert.equal(getSkill(failed, id, 'spelling').needsPractice, true);
  const prepared = applyProgrammingReviewToLearning(course, failed);
  const target = prepared.learning.targets[`word-${id}`];
  assert.ok(target.confidence < course.learning.targets[`word-${id}`].confidence);
  assert.equal(target.abilities.spelling, 0.2);
  assert.equal(target.transfer, false);
  assert.equal(target.readyAt, course.learning.targets[`word-${id}`].readyAt, 'review admission is durable');
  assert.equal(isReviewEligible(failed, id), true);
  assert.deepEqual(applyProgrammingReviewToLearning(prepared, failed), prepared, 'same failure cannot repeatedly lower confidence');
  const session = planAdaptiveSession(prepared, catalog, at + 1000, () => 0.55);
  assert.ok(session.adaptive.focusIds.includes(`word-${id}`));
  assert.deepEqual(session.adaptive.newIds, [], 'finished scope needs weak-item teaching, not invented new content');
  assert.equal(parseDailyProgress(JSON.stringify({ ...prepared, session }), catalog).writable, true);

  const ordinary = updateReviewProgress(review, question, 'independent', at);
  assert.deepEqual(applyProgrammingReviewToLearning(course, ordinary), course, 'normal independent review does not create a weakness');
  const courseOnly = updateReviewProgress(review, { ...question, source: 'course' }, 'revealed', at);
  assert.deepEqual(applyProgrammingReviewToLearning(course, courseOnly), course, 'course feedback already belongs to the learning engine');
});

test('each focused review contains only its selected ability and excludes pending targets', () => {
  const { course, review, now } = completeActualCourse();
  const planner = programmingReview(review, afterDays(now, 2));
  assert.deepEqual(new Set(planner.options.map(option => option.value)), new Set(reviewAbilities));
  for (const focus of reviewAbilities) {
    const offered = planner.lessons(course, catalog, focus);
    assert.ok(offered.length > 0, focus);
    for (const lesson of offered) {
      const session = planner.session(lesson, focus);
      assert.ok(session.queue.length > 0, `${lesson.id}:${focus}`);
      for (const entry of session.queue) {
        const task = [...lesson.exercises, ...lesson.rechecks, ...lesson.practice].find(item => item.id === entry.exerciseId);
        assert.equal(task.ability, focus);
        assert.ok(task.wordIds.every(id => isReviewEligible(review, id)));
      }
      assert.equal(parseDailyProgress(JSON.stringify({ ...course, session }), catalog).writable, true);
    }
  }

  const pending = Object.fromEntries(Object.entries(review).map(([id, word]) => [id, { ...word, reviewReadyAt: 0 }]));
  const pendingPlanner = programmingReview(pending, afterDays(now, 30));
  for (const focus of ['auto', ...reviewAbilities]) {
    assert.deepEqual(pendingPlanner.lessons(course, catalog, focus), []);
    for (const lesson of catalog) {
      assert.equal(pendingPlanner.session(lesson, focus).queue.length, 0);
      assert.deepEqual(pendingPlanner.difficulties(lesson, focus), []);
    }
  }
  const eligiblePool = vocabulary.filter(word => isReviewEligible(pending, word.id));
  assert.deepEqual(eligiblePool, []);
  assert.equal(createReviewSession(eligiblePool, pending, {}, afterDays(now, 30)).finished, true);
  for (const id of Object.keys(pending).map(Number)) assert.equal(isWordDue(pending, id, afterDays(now, 30)), false);

  const shared = catalog[0].exercises.find(task => task.wordIds.length > 1);
  const mixed = { ...review, [shared.wordIds[0]]: { ...review[shared.wordIds[0]], reviewReadyAt: 0 } };
  const mixedSession = programmingReview(mixed, afterDays(now, 2)).session(catalog[0], shared.ability);
  assert.ok(!mixedSession.queue.some(entry => entry.exerciseId === shared.id), 'a mixed question cannot assess a pending word through an admitted peer');
});
