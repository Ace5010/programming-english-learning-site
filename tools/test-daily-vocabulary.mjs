import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPhrases, dailyLessons } from '../src/dailyCourse.ts';
import { dailyVocabularyWords, dailyVocabularyGroups, dailyStudyInfo } from '../src/dailyVocabulary.ts';
import { adaptiveDailyLessons as lessons, legacyAdaptiveDailyLessons, dailyVocabularyUnits } from '../src/dailyPractice.ts';
import { createDailyProgress, createDailySession, createDailyDraft, checkDailyAttempt, checkDailyAnswer, parseDailyProgress, dailyKnowledgeReviewable, createDailyReviewSession, learnDailyLesson } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, advanceAdaptiveSession, previewAdaptiveScope, reconcileSavedQuestion, hasAdaptiveContent } from '../src/adaptiveLearning.ts';
import { courseOverview } from '../src/courseOverviewData.ts';
import { correctDraft } from './helpers/course-answer.mjs';

const now = 1800000000000;
const active = lessons.filter(lesson => !lesson.referenceOnly);
const catalog = new Map(lessons.flatMap(lesson => lesson.practice).map(task => [task.id, task]));
const getTask = p => catalog.get(p.session.queue[p.session.index].exerciseId);
function runRound(progress, failed = false, seed = .37) {
  progress = { ...progress, session: planAdaptiveSession(progress, lessons, now, () => seed) };
  assert.ok(progress.session);
  progress = beginAdaptiveLearning(progress, lessons, now);
  let count = 0;
  while (progress.session.stage !== 'summary') {
    assert.ok(count++ < 20);
    const task = getTask(progress), allowed = new Set(Object.keys(progress.learning.targets));
    assert.ok(task.knowledgeIds.every(id => allowed.has(id)), task.id);
    assert.ok((task.prerequisiteIds ?? []).every(id => allowed.has(id)), task.id);
    if (task.knowledgeIds[0].startsWith('daily-word-') && task.options) {
      for (const option of task.options) {
        const word = dailyVocabularyWords.find(word => word.en === option || word.zh === option);
        assert.ok(!word || allowed.has(word.id), `Unknown distractor in ${task.id}: ${option}`);
      }
    }
    progress.session.draft = { ...correctDraft(task), ...(failed ? { helped: true } : {}) };
    progress = checkDailyAttempt(progress, resolveAdaptiveLesson(progress.session, lessons), now + count * 1000);
    assert.ok(progress.session.feedback, task.id);
    progress = advanceAdaptiveSession(progress, lessons, now + count * 1000);
    const parsed = parseDailyProgress(JSON.stringify(progress), lessons);
    assert.ok(parsed.writable, parsed.warning);
    progress = parsed.progress;
  }
  return progress;
}

test('four word-led units contain 72 unique words, two authored contexts each, and useful expressions', () => {
  assert.equal(dailyVocabularyUnits.length, 4); assert.equal(active.length, 12);
  assert.equal(dailyVocabularyWords.length, 72);
  assert.equal(new Set(dailyVocabularyWords.map(word => word.id)).size, 72);
  assert.equal(new Set(dailyPhrases.map(item => item.id)).size, dailyPhrases.length);
  for (const group of dailyVocabularyGroups) {
    assert.equal(group.words.length, 6);
    for (const word of group.words) {
      assert.ok(word.phonetic && dailyStudyInfo(word.id).phonetic);
      assert.equal(new Set(word.examples.map(example => example.en)).size, 2);
      assert.ok(word.examples.every(example => new RegExp(`\\b${word.en}\\b`, 'i').test(example.en)));
    }
  }
  for (const lesson of active) {
    assert.equal(lesson.learningTargets.filter(id => id.startsWith('daily-word-')).length, 6);
    assert.equal(lesson.learningTargets.filter(id => !id.startsWith('daily-word-')).length, 2);
    const examples = lesson.phrases.filter(item => item.id.includes('-example-')).map(item => item.en);
    for (const id of lesson.learningTargets.filter(id => !id.startsWith('daily-word-'))) {
      const expression = lesson.phrases.find(item => item.id === id);
      assert.ok(!examples.includes(expression.en), 'Useful expressions must add something beyond the word examples');
    }
  }
  assert.ok(active.some(lesson => lesson.learningTargets.includes('hello')));
  assert.ok(active.some(lesson => lesson.learningTargets.includes('daily-expression-thank-you')));
  const live = dailyPhrases.find(item => item.id === 'daily-word-live');
  assert.deepEqual(live.pronunciationContext, { text: 'I live here.', targetIndex: 1 });
  assert.equal(live.audioRevision, 'verb-v1');
});

test('preview teaches words with examples, remains pure, and audio or preview creates no progress', () => {
  const progress = createDailyProgress(), original = JSON.stringify(progress);
  const overview = courseOverview(progress, lessons);
  assert.ok(overview.vocabulary);
  assert.equal(overview.targets.filter(item => item.id.startsWith('daily-word-')).length, 6);
  assert.equal(overview.studyPhrases.length, 14);
  const session = planAdaptiveSession(progress, lessons, now, () => .3);
  assert.deepEqual(session.adaptive.focusIds, overview.targets.map(item => item.id));
  assert.equal(JSON.stringify(progress), original);
  const taught = beginAdaptiveLearning({ ...progress, session }, lessons, now);
  assert.equal(Object.keys(taught.learning.targets).length, 8);
  for (const target of Object.values(taught.learning.targets)) { assert.equal(target.readyAt, 0); assert.deepEqual(target.abilities, {}); }
});

test('every current candidate is answerable, has one accepted option, and audio matches the written gap', () => {
  const ids = new Set();
  for (const lesson of active) for (const task of lesson.practice) {
    assert.ok(!ids.has(task.id)); ids.add(task.id);
    assert.ok(checkDailyAnswer(task, correctDraft(task)).correct, task.id);
    assert.equal(checkDailyAnswer(task, createDailyDraft(task)).correct, false, task.id);
    if (task.options) assert.equal(task.options.filter(choice => checkDailyAnswer(task, { ...createDailyDraft(task), choice }).correct).length, 1, task.id);
    if (task.audioId) assert.ok(dailyPhrases.some(item => item.id === task.audioId), task.id);
    if (task.kind === 'fill') assert.equal(checkDailyAnswer(task, correctDraft(task)).expected[0], dailyPhrases.find(item => item.id === task.audioId).en, task.id);
  }
});

test('remaining optional expressions cannot turn the word course into an expression-only backlog', () => {
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(dailyVocabularyWords.map(word => [word.id, {
    introducedAt: now, confidence: 1, abilities: { meaning: 1 }, signatures: ['one', 'two'], lastSeenTurn: 0, lastFailureTurn: 0, transfer: true, readyAt: now,
  }])) };
  assert.equal(hasAdaptiveContent(progress, lessons), false);
  assert.equal(previewAdaptiveScope(progress, lessons), null);
});

for (const failed of [false, true]) test(`${failed ? 'helped' : 'correct'} rounds prioritize words, cover every new word and save exact results`, () => {
  for (const seed of [.01, .37, .99]) {
    const result = runRound(createDailyProgress(), failed, seed);
    const tasks = result.session.queue.map(entry => catalog.get(entry.exerciseId));
    const words = tasks.filter(task => task.knowledgeIds.every(id => id.startsWith('daily-word-')));
    assert.ok(words.length / tasks.length >= .70, `${words.length}/${tasks.length}`);
    assert.ok(words.length / tasks.length <= .85);
    assert.ok(tasks.every(task => task.kind !== 'speak' && task.kind !== 'order'));
    assert.ok(tasks.filter(task => task.ability === 'spelling').length <= 1);
    assert.ok(result.session.adaptive.newIds.filter(id => id.startsWith('daily-word-')).every(id => words.some(task => task.knowledgeIds.includes(id))));
    assert.deepEqual(reconcileSavedQuestion(result, lessons), result);
  }
});

test('continued rounds introduce all 72 words while weaknesses change the next scope', () => {
  let progress = createDailyProgress();
  for (let index = 0; index < 28 && dailyVocabularyWords.some(word => !progress.learning?.targets[word.id]); index++) progress = runRound(progress, index % 4 === 1, (index % 9 + 1) / 10);
  assert.ok(dailyVocabularyWords.every(word => progress.learning.targets[word.id]), 'Every authored word must be reachable');
  assert.ok(previewAdaptiveScope(progress, lessons).focusIds.some(id => progress.learning.targets[id].confidence < .8));
});

test('all 24 historical sessions, drafts, favorites and tested skill records still parse and resume unchanged', () => {
  for (const lesson of legacyAdaptiveDailyLessons) {
    let progress = learnDailyLesson(createDailyProgress(), lesson, now);
    progress.favorites = ['hello', 'from-china', 'daily-word-student'];
    progress.session = createDailySession(lesson, 'lesson', now);
    progress.session.stage = 'exercise';
    progress.session.draft = correctDraft(lesson.exercises[0]);
    progress = checkDailyAttempt(progress, lesson, now + 1);
    const raw = JSON.stringify(progress), parsed = parseDailyProgress(raw, lessons);
    assert.ok(parsed.writable, parsed.warning);
    assert.equal(JSON.stringify(parsed.progress), raw);
    assert.deepEqual(reconcileSavedQuestion(parsed.progress, lessons), progress);
    assert.deepEqual(planAdaptiveSession(parsed.progress, lessons), progress.session);
  }
  const old = { ...createDailyProgress(), lessons: { 'A1-03-02': { completedAt: now } } };
  const scope = previewAdaptiveScope(old, lessons);
  assert.ok(scope.newIds.includes('daily-word-i'));
  assert.equal(old.learning, undefined);
  assert.equal(dailyLessons.length, 24);
});

test('one word can enter review without enrolling its examples or untested neighboring words', () => {
  let progress = runRound(createDailyProgress());
  const word = 'daily-word-i';
  progress.learning.targets[word].readyAt = now;
  assert.ok(dailyKnowledgeReviewable(progress, word));
  assert.equal(dailyKnowledgeReviewable(progress, 'daily-word-you'), false);
  const session = createDailyReviewSession(progress, active[0], 'auto', now + 86400000);
  assert.ok(session.queue.length);
  for (const entry of session.queue) assert.deepEqual(catalog.get(entry.exerciseId).knowledgeIds, [word]);
  assert.equal(progress.learning.targets['daily-word-i-example-1'], undefined);
});
