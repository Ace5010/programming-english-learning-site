import test from 'node:test';
import assert from 'node:assert/strict';
import { localAnswerCorrection } from '../src/answerCorrection.ts';
import { createDailyProgress, createDailySession, beginDailyExercises, updateDailyDraft, checkDailyAttempt, markDailyHelp, updateDailyPairs, parseDailyProgress, dailyExerciseAbility, submitDailyAnswer } from '../src/dailyProgress.ts';
import { recordAdaptiveAnswer, planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { createPairState, selectPair, choosePair, pairOrder, pairsComplete } from '../src/pairPractice.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { getSkill, updateReviewProgress } from '../src/review.ts';
import { FeedbackAudio } from '../src/feedbackAudio.ts';
import { readReviewSession, saveReviewSession, closeReviewSession } from '../src/reviewSession.ts';
import { vocabulary } from '../src/vocabulary.ts';

const now = 1800000000000;
const order = { id: 'order', kind: 'order', options: ['This', 'is', 'a', 'pen.'], answers: ['This is a pen.'], prompt: '这是一支笔', explanation: 'This is a pen.', knowledgeIds: ['pen'], learningDifficulty: 'context' };
const makeLesson = task => ({ id: 'unit', title: '练习', goal: '', explanation: '', phrases: [{ id: 'pen', en: 'pen', zh: '笔' }], exercises: [task], rechecks: [], practice: [], learningTargets: task.knowledgeIds, learningGoal: 'communication' });
const start = task => { const lesson = makeLesson(task); return { lesson, progress: { ...createDailyProgress(), session: beginDailyExercises(createDailySession(lesson, 'workbook', now)) } }; };
const edit = (progress, draft) => ({ ...progress, session: updateDailyDraft(progress.session, draft) });
const check = (progress, lesson, at = now) => checkDailyAttempt(progress, lesson, at);

test('local correction marks swapped words, insertions and spelling without exposing expected text', () => {
  const swap = localAnswerCorrection('This a is pen.', ['This is a pen.']);
  assert.ok(swap); assert.equal(swap.original, 'This a is pen.'); assert.ok(swap.marks.length > 0);
  const plural = localAnswerCorrection('student', ['students']);
  assert.deepEqual(plural.marks, [{ start: 7, end: 7 }]); assert.match(plural.message, /单复数/);
  assert.ok(localAnswerCorrection('repositry', ['repository']));
  assert.equal(localAnswerCorrection('unrelated sentence here', ['This is a pen.']), null);
  assert.equal(localAnswerCorrection("I'm Ben", ['I am Ben.']), null);
  assert.equal(localAnswerCorrection('', ['pen']), null);
});

test('first error is durable, unchanged/empty clicks consume nothing, one edited retry is assisted', () => {
  let { lesson, progress } = start(order);
  progress = check(edit(progress, { order: [0, 2, 1, 3] }), lesson);
  assert.equal(progress.session.feedback, null); assert.equal(progress.session.answers.length, 0);
  assert.ok(progress.session.draft.correction); assert.ok(progress.lessons.unit.errors.order);
  assert.equal(progress.knowledge.pen.skills.writing.attempts, 0);
  assert.equal(check(progress, lesson), progress);
  const parsed = parseDailyProgress(JSON.stringify(progress), [lesson]);
  assert.equal(parsed.writable, true, parsed.warning);
  assert.deepEqual(parsed.progress, progress);
  const empty = edit(progress, { order: [] }); assert.equal(check(empty, lesson), empty);
  progress = check(edit(parsed.progress, { order: [0, 1, 2, 3] }), lesson, now + 1000);
  assert.equal(progress.session.answers.length, 1);
  assert.equal(progress.session.answers[0].outcome, 'assisted'); assert.equal(progress.session.answers[0].corrected, true);
  assert.equal(progress.knowledge.pen.skills.writing.attempts, 1); assert.equal(progress.knowledge.pen.skills.writing.independentAnswers, 0);
  assert.equal(check(progress, lesson), progress);
});

test('single-word correction preserves punctuation and leading spaces without treating punctuation as an error', () => {
  const bare = localAnswerCorrection('Helo', ['Hello!']);
  assert.ok(bare); assert.equal(bare.original, 'Helo');
  const padded = localAnswerCorrection('  Helo! ', ['Hello!']);
  assert.ok(padded);
  assert.deepEqual(padded.marks, bare.marks.map(mark => ({ start: mark.start + 2, end: mark.end + 2 })));
  assert.equal(localAnswerCorrection('Hello.', ['Hello!']), null);
  assert.equal(localAnswerCorrection('yellow!', ['Hi!']), null);
});

test('second error ends the retry and choices do not invite elimination guessing', () => {
  let { lesson, progress } = start(order);
  progress = check(edit(progress, { order: [0, 2, 1, 3] }), lesson);
  progress = check(edit(progress, { order: [0, 1, 3, 2] }), lesson);
  assert.equal(progress.session.feedback.outcome, 'revealed'); assert.equal(progress.session.answers.length, 1);
  const choice = { ...order, kind: 'choice', options: ['yes', 'no'], answers: ['yes'] };
  ({ lesson, progress } = start(choice)); progress = check(edit(progress, { choice: 'no' }), lesson);
  assert.equal(progress.session.feedback.outcome, 'revealed'); assert.equal(progress.session.draft.correction, undefined);
});

test('local fill and fixed writing can retry; revealed answers cannot regain a retry', () => {
  for (const kind of ['fill', 'write']) {
    const task = { ...order, kind, parts: ['', ''], blanks: [['repository']], answers: ['repository'] };
    let { lesson, progress } = start(task);
    progress = check(edit(progress, kind === 'fill' ? { blanks: ['repositry'] } : { text: 'repositry' }), lesson);
    assert.ok(progress.session.draft.correction);
    progress = markDailyHelp(progress, lesson, true, now); progress = check(progress, lesson);
    assert.equal(progress.session.feedback.outcome, 'revealed');
  }
});

test('adaptive correction lowers confidence only at the first error, including refresh and next-day completion', () => {
  let { lesson, progress } = start(order);
  progress.learning = { version: 1, turns: 7, rounds: 1, targets: { pen: { introducedAt: now - 10000, confidence: .6, abilities: { writing: .6 }, lastSeenTurn: 2, lastFailureTurn: 0, signatures: ['old'], transfer: true, readyAt: 0 } } };
  progress = recordAdaptiveAnswer(check(edit(progress, { order: [0, 2, 1, 3] }), lesson), [lesson], now);
  assert.ok(Math.abs(progress.learning.targets.pen.confidence - .34) < 1e-9);
  const loss = progress.learning.targets.pen.confidence;
  assert.equal(recordAdaptiveAnswer(progress, [lesson], now), progress);
  progress = parseDailyProgress(JSON.stringify(progress), [lesson]).progress;
  progress = recordAdaptiveAnswer(check(edit(progress, { order: [0, 1, 2, 3] }), lesson, now + 86400000), [lesson], now + 86400000);
  assert.equal(progress.learning.targets.pen.confidence, loss); assert.equal(progress.learning.targets.pen.readyAt, 0);
  assert.equal(progress.learning.turns, 8);
});

const pairs = ['one', 'two', 'three', 'four'].map(id => ({ id, en: id, zh: id + '的含义', audioId: id }));
test('pair mistakes affect only that target and the last pair waits for an explicit choice without claiming recall', () => {
  let state = selectPair(createPairState(), 'one');
  const positions = pairOrder(pairs, 'seed');
  state = choosePair(pairs, state, 'two', now);
  assert.equal(state.mistakes.one, 1); assert.deepEqual(state.matches, {}); assert.ok(!state.message.includes('的含义'));
  assert.equal(choosePair(pairs, state, 'two', now), state);
  state = choosePair(pairs, state, 'one', now); assert.equal(state.matches.one, 'assisted');
  state = choosePair(pairs, selectPair(state, 'two'), 'two', now);
  state = choosePair(pairs, selectPair(state, 'three'), 'three', now);
  assert.deepEqual(state.matches, { one: 'assisted', two: 'independent', three: 'independent' });
  assert.equal(pairsComplete(pairs, state), false);
  state = choosePair(pairs, selectPair(state, 'four'), 'four', now);
  assert.deepEqual(state.matches, { one: 'assisted', two: 'independent', three: 'independent', four: 'unmeasured' });
  assert.equal(pairsComplete(pairs, state), true);
  assert.deepEqual(pairOrder(pairs, 'seed'), positions);
  let wrong = choosePair(pairs, selectPair(createPairState(), 'one'), 'two', now);
  wrong = choosePair(pairs, wrong, 'three', now);
  assert.equal(wrong.matches.one, 'revealed');
});

test('pair course progress preserves mixed per-target evidence and last-pair non-evidence on reload', () => {
  const task = { ...order, id: 'pairs', kind: 'match', pairs, pairMode: 'audio', knowledgeIds: pairs.map(item => item.id) };
  let { lesson, progress } = start(task);
  progress = edit(progress, { pairs: selectPair(progress.session.draft.pairs, 'one') });
  progress = updateDailyPairs(progress, lesson, 'two', now);
  assert.deepEqual(Object.keys(progress.knowledge), ['one']);
  progress = updateDailyPairs(progress, lesson, 'one', now);
  for (const id of ['two', 'three']) { progress = edit(progress, { pairs: selectPair(progress.session.draft.pairs, id) }); progress = updateDailyPairs(progress, lesson, id, now); }
  progress = check(progress, lesson);
  assert.equal(progress.session.feedback, null);
  assert.equal(progress.session.answers.length, 0);
  progress = parseDailyProgress(JSON.stringify(progress), [lesson]).progress;
  assert.equal(progress.session.draft.pairs.matches.four, undefined);
  progress = edit(progress, { pairs: selectPair(progress.session.draft.pairs, 'four') });
  progress = updateDailyPairs(progress, lesson, 'four', now);
  progress = check(progress, lesson);
  assert.equal(progress.knowledge.one.skills.listening.assistedAnswers, 1);
  assert.equal(progress.knowledge.two.skills.listening.independentAnswers, 1);
  assert.equal(progress.knowledge.four, undefined);
  assert.equal(progress.knowledge.two.skills.writing.attempts, 0);
  const parsed = parseDailyProgress(JSON.stringify(progress), [lesson]); assert.equal(parsed.writable, true, parsed.warning);
  assert.deepEqual(parsed.progress.session.answers[0].targets, progress.session.answers[0].targets);
});

test('new variations stay bounded, reference existing targets, and only count the tested ability', () => {
  for (const catalog of [adaptiveDailyLessons, adaptiveProgrammingLessons]) {
    const ids = new Set(catalog.flatMap(lesson => lesson.learningTargets));
    for (const task of catalog.flatMap(lesson => lesson.practice)) {
      for (const id of task.prerequisiteIds ?? []) assert.ok(ids.has(id), task.id);
      if (task.id.endsWith('-order-words')) { assert.ok(task.options.length <= 8); assert.ok(task.prerequisiteIds.length > 0); }
      if (task.audioPrompt) assert.equal(dailyExerciseAbility(task), 'listening');
    }
  }
  const blocked = { ...order, id: 'blocked', prerequisiteIds: ['future'] };
  const lesson = { ...makeLesson(order), exercises: [order, blocked] };
  for (const seed of [.1, .5, .99]) {
    let progress = createDailyProgress(); progress.session = planAdaptiveSession(progress, [lesson], now, () => seed);
    progress = beginAdaptiveLearning(progress, [lesson], now);
    assert.notEqual(progress.session.queue[0].exerciseId, 'blocked');
  }
});

test('showing masked speech text and self checks never add mastery evidence', () => {
  const task = { ...order, kind: 'speak', speechSupport: 'hidden', sample: 'pen', checks: ['完成'], readAloud: [{ id: 'pen', en: 'pen', zh: '笔' }] };
  let { lesson, progress } = start(task);
  progress.learning = { version: 1, turns: 3, rounds: 1, targets: { pen: { introducedAt: now, confidence: .5, abilities: {}, lastSeenTurn: 2, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 } } };
  progress = edit(progress, { helped: true, text: 'pen', checks: [true], speech: { mode: 'self', transcripts: {}, revealed: ['pen'] } });
  assert.equal(recordAdaptiveAnswer(progress, [lesson]), progress);
  progress = recordAdaptiveAnswer(submitDailyAnswer(progress, lesson, {}, now), [lesson]);
  assert.equal(progress.learning.targets.pen.confidence, .5); assert.deepEqual(progress.learning.targets.pen.abilities, {}); assert.equal(progress.learning.targets.pen.readyAt, 0);
});

test('an already recorded review difficulty is not demoted again after a next-day correction', () => {
  const q = { wordId: 1, ability: 'spelling', level: 2, exposed: true, retry: false };
  let progress = { 1: { spelling: { ...getSkill({}, 1, 'spelling'), level: 2 } } };
  progress = updateReviewProgress(progress, q, 'assisted', now, false);
  const before = getSkill(progress, 1, 'spelling');
  progress = updateReviewProgress(progress, q, 'assisted', now + 86400000, true, true);
  const after = getSkill(progress, 1, 'spelling');
  assert.equal(after.lastFailureDay, before.lastFailureDay); assert.equal(after.dueAt, before.dueAt); assert.equal(after.attempts, 1); assert.equal(after.level, 1);
});

test('review draft restores a correction and rejects malformed state without touching long-term keys', t => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), data = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'sessionStorage', old); else delete globalThis.sessionStorage; });
  const word = vocabulary[0], task = { id: 'test', kind: 'dictation', words: [word], options: [], evidence: [{ wordId: word.id, ability: 'spelling', level: 3 }], difficulty: 3, retry: false };
  const resume = { version: 1, active: true, lesson: { id: 'round', items: [word], tasks: [task], index: 0, results: [], finished: false }, feedback: null,
    draft: { taskId: 'test', selected: null, input: 'repositry', gaps: {}, hints: [], excluded: [], pairResults: [], pairLeft: null, note: '', done: false, observed: [word.id], pairMistakes: {}, correction: localAnswerCorrection('repositry', ['repository']) } };
  assert.equal(saveReviewSession(resume), true); assert.deepEqual(readReviewSession(), resume);
  closeReviewSession(); assert.equal(readReviewSession().active, false);
  resume.draft.correction.marks[0].end = 999; saveReviewSession(resume); assert.equal(readReviewSession(), undefined);
  assert.deepEqual([...data.keys()], ['codewords-review-session-v1']);
});

test('feedback waits for speech, replaces a pending cue, and navigation or mute cancels it', async t => {
  let busy = true; const played = [];
  const audio = new FeedbackAudio(() => {}, value => value, url => ({ paused: true, currentTime: 0, load() {}, removeAttribute() {}, pause() { this.paused = true; this.onpause?.(); }, play() { played.push(url); this.paused = false; return Promise.resolve(); } }), () => busy);
  t.after(() => audio.dispose());
  audio.play('pair', '1'); audio.play('correct', '2'); assert.deepEqual(played, []);
  busy = false; await new Promise(resolve => setTimeout(resolve, 80)); assert.deepEqual(played, ['audio/feedback/correct.mp3']);
  busy = true; audio.play('pair', '3'); audio.stop(); busy = false;
  await new Promise(resolve => setTimeout(resolve, 70)); assert.equal(played.length, 1);
  busy = true; audio.play('complete', '4'); audio.enabled = false; busy = false; audio.enabled = true;
  await new Promise(resolve => setTimeout(resolve, 70)); assert.equal(played.length, 1);
  assert.equal(audio.play('complete', '4'), false);
});

for (const [section, list] of [['daily', adaptiveDailyLessons], ['programming', adaptiveProgrammingLessons]]) {
  for (const pairMode of ['text', 'audio']) test(`${section} ${pairMode} pairs: mixed results keep the assisted and final targets practising`, () => {
    const lesson = list.find(item => item.practice.some(task => task.kind === 'match' && task.pairMode === pairMode));
    const task = lesson.practice.find(item => item.kind === 'match' && item.pairMode === pairMode);
    const ids = [...new Set(task.knowledgeIds)];
    const progress = createDailyProgress();
    progress.learning = { version: 1, turns: 6, rounds: 1, targets: Object.fromEntries(ids.map(id => [id, {
      introducedAt: now, confidence: .5, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
    progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise',
      adaptive: { version: 1, round: 1, focusIds: ids, newIds: [], sourceLessonId: lesson.id, seed: 1, budget: 8 } };
    const pairIds = task.pairs.map(pair => pair.id);
    const last = pairIds[pairIds.length - 1];
    let current = progress;
    // A is matched outright, B needs one correction first, and the final pair is left for last.
    current = edit(current, { pairs: selectPair(current.session.draft.pairs, pairIds[0]) });
    current = updateDailyPairs(current, lesson, pairIds[0], now);
    current = edit(current, { pairs: selectPair(current.session.draft.pairs, pairIds[1]) });
    current = updateDailyPairs(current, lesson, last, now);
    current = edit(current, { pairs: selectPair(current.session.draft.pairs, pairIds[1]) });
    current = updateDailyPairs(current, lesson, pairIds[1], now);
    assert.equal(pairsComplete(task.pairs, current.session.draft.pairs), false, 'the final pair must still be outstanding');
    assert.deepEqual(current.session.feedback, null, 'no feedback and no answer until the last pair is chosen by hand');
    assert.equal(current.session.answers.length, 0);
    for (const id of pairIds.slice(2)) { current = edit(current, { pairs: selectPair(current.session.draft.pairs, id) }); current = updateDailyPairs(current, lesson, id, now); }
    const matches = current.session.draft.pairs.matches;
    assert.equal(matches[pairIds[0]], 'independent');
    assert.notEqual(matches[pairIds[1]], 'independent');
    assert.equal(matches[last], 'unmeasured', 'the last pair is never claimed as recall');
    current = submitDailyAnswer(current, lesson, {}, now);
    assert.ok(current.session.feedback, 'feedback appears only once the final pair has been chosen');
    const recorded = recordAdaptiveAnswer(current, list, now);
    const targets = recorded.learning.targets;
    assert.ok(targets[pairIds[0]].confidence > .5, 'the independent pair gains evidence');
    assert.ok(targets[pairIds[1]].confidence < .5, 'the assisted pair is not masked by the independent one');
    assert.equal(targets[last].confidence, .5, 'the final pair adds no evidence either way');
    assert.deepEqual(targets[last].signatures, []);
    assert.deepEqual(recordAdaptiveAnswer(recorded, list, now), recorded, 'the same answer cannot be counted twice');
    // Dedup removes the whole group that contains A, so B and C must keep their own single-target questions.
    const others = list.flatMap(item => [...item.exercises, ...item.rechecks, ...item.practice]);
    for (const id of [pairIds[1], last]) assert.ok(others.some(candidate => (candidate.knowledgeIds ?? []).includes(id) && !(candidate.knowledgeIds ?? []).includes(pairIds[0])),
      `${section} ${pairMode}: ${id} loses every practice option once the pair group is deduplicated`);
    const finished = advanceAdaptiveSession(recorded, list, now + 1000);
    assert.equal(parseDailyProgress(JSON.stringify(finished), list).writable, true);
    const next = planAdaptiveSession(finished, list, now + 2000, () => .5);
    assert.ok(next, 'the course must still be able to continue');
    assert.ok(next.adaptive.focusIds.includes(pairIds[1]) || next.adaptive.focusIds.includes(last),
      'the next round must still target what was not answered independently');
  });
}
