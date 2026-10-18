import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { createDailyProgress, createDailySession, createDailyDraft, parseDailyProgress, updateDailyDraft, submitDailyAnswer, submitOptionalDailySpeaking, recordSpeechTranscript, getDailyLessonProgress, summarizeDailySession } from '../src/dailyProgress.ts';
import { correctDraft } from './helpers/course-answer.mjs';

const at = 1792281600000;
const lesson = lessons[0];
const task = lesson.practice.find(item => item.speechActivity === 'repeat');
function savedOral() {
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, lessons, at, () => .371);
  progress = beginAdaptiveLearning(progress, lessons, at);
  progress.session.queue = [{ exerciseId: task.id, retry: false }];
  progress.session.draft = createDailyDraft(task);
  return progress;
}
const reload = progress => {
  const parsed = parseDailyProgress(JSON.stringify(progress), lessons);
  assert.equal(parsed.writable, true, parsed.warning);
  return parsed.progress;
};

test('legacy self-check draft and historical learning survive reload and optional continuation', () => {
  let progress = savedOral();
  progress.favorites = ['hello'];
  progress.lessons['A1-01-02'] = { ...getDailyLessonProgress(progress, 'A1-01-02'), completedAt: at - 10000 };
  progress.session.draft = { ...progress.session.draft, text: 'My own saved expression.', checks: task.checks.map(() => true), speech: { mode: 'self', transcripts: { self: 'My own saved expression.' }, sources: { self: 'recognition' } } };
  const before = structuredClone(progress);
  progress = reload(progress);
  assert.deepEqual(progress, before);
  const resolved = resolveAdaptiveLesson(progress.session, lessons);
  const answered = submitOptionalDailySpeaking(progress, resolved, at + 1000);
  assert.deepEqual(progress, before, 'input is not mutated');
  assert.deepEqual(answered.session.draft, before.session.draft, 'saved draft remains available until the learner continues');
  assert.equal(answered.session.answers[0].speech.source, 'skipped');
  assert.deepEqual(answered.lessons, before.lessons);
  assert.deepEqual(answered.knowledge, before.knowledge);
  const next = reload(advanceAdaptiveSession(recordAdaptiveAnswer(answered, lessons, at + 1000), lessons, at + 1000));
  assert.deepEqual(next.favorites, before.favorites);
  assert.deepEqual(next.lessons, before.lessons);
  assert.deepEqual(next.knowledge, before.knowledge);
  for (const id of task.knowledgeIds) {
    assert.equal(next.learning.targets[id].confidence, before.learning.targets[id].confidence);
    assert.equal(next.learning.targets[id].readyAt, before.learning.targets[id].readyAt);
    assert.deepEqual(next.learning.targets[id].abilities, before.learning.targets[id].abilities);
  }
  assert.equal(summarizeDailySession(next.session).self, 0);
});

test('completed recognition persists as oral activity and does not award independent mastery', () => {
  let progress = savedOral();
  for (const phrase of task.readAloud) progress.session = updateDailyDraft(progress.session, recordSpeechTranscript(progress.session.draft, phrase.id, phrase.en));
  progress = reload(progress);
  const answered = reload(submitOptionalDailySpeaking(progress, resolveAdaptiveLesson(progress.session, lessons), at + 1000));
  assert.equal(answered.session.answers[0].speech.source, 'recognition');
  assert.equal(answered.session.answers[0].correct, true);
  assert.equal(answered.session.answers[0].outcome, 'self');
  assert.equal(answered.lessons[lesson.id].skills.speaking.selfReports, 1);
  assert.equal(answered.lessons[lesson.id].skills.speaking.independentAnswers, 0);
  const recorded = recordAdaptiveAnswer(answered, lessons, at + 1000);
  for (const id of task.knowledgeIds) assert.equal(recorded.learning.targets[id].confidence, progress.learning.targets[id].confidence);
});

test('empty or mismatched recordings can continue without recording an error or oral success', () => {
  for (const text of ['', 'unrelated words']) {
    let progress = savedOral();
    if (text) progress.session = updateDailyDraft(progress.session, recordSpeechTranscript(progress.session.draft, task.readAloud[0].id, text));
    const next = reload(submitOptionalDailySpeaking(progress, resolveAdaptiveLesson(progress.session, lessons), at + 1000));
    assert.equal(next.session.answers[0].speech.source, 'skipped');
    assert.deepEqual(next.lessons, progress.lessons);
    assert.deepEqual(next.knowledge, progress.knowledge);
    assert.equal(summarizeDailySession(next.session).needsReview, 0);
    assert.equal(summarizeDailySession(next.session).self, 0);
  }
});

test('existing dynamic budget and question scheduling remain in use when oral practice is skipped', () => {
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, lessons, at, () => .371);
  const budget = progress.session.adaptive.budget;
  assert.equal(budget, 12, 'the original first-round plan is not replaced with ten questions');
  progress = beginAdaptiveLearning(progress, lessons, at);
  let oral = 0;
  while (progress.session.stage === 'exercise') {
    assert.ok(progress.session.answers.length < 20);
    const resolved = resolveAdaptiveLesson(progress.session, lessons);
    const current = resolved.exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
    if (current.kind === 'speak') {
      oral++;
      progress = submitOptionalDailySpeaking(progress, resolved, at + progress.session.index * 1000);
    } else {
      progress.session = updateDailyDraft(progress.session, correctDraft(current));
      progress = submitDailyAnswer(progress, resolved, {}, at + progress.session.index * 1000);
    }
    progress = reload(advanceAdaptiveSession(recordAdaptiveAnswer(progress, lessons), lessons));
  }
  assert.ok(oral > 0, 'original oral items are retained');
  assert.equal(progress.session.answers.length, budget);
  assert.equal(progress.session.adaptive.budget, budget);
  assert.equal(progress.learning.rounds, 1);
  assert.equal(summarizeDailySession(progress.session).self, 0);
});

test('optional continuation cannot bypass objective questions or overwrite existing feedback', () => {
  const objective = lesson.exercises.find(item => item.kind !== 'speak');
  let progress = savedOral();
  progress.session = { ...createDailySession({ ...lesson, exercises: [objective] }, 'lesson', at), stage: 'exercise' };
  assert.equal(submitOptionalDailySpeaking(progress, lesson), progress);
  progress = savedOral();
  const resolved = resolveAdaptiveLesson(progress.session, lessons);
  const answered = submitOptionalDailySpeaking(progress, resolved, at + 1000);
  assert.equal(submitOptionalDailySpeaking(answered, resolved, at + 2000), answered);
  assert.equal(answered.session.answers.length, 1);
});
