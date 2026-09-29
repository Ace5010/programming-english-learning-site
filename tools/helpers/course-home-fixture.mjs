import assert from 'node:assert/strict';
import { createDailyProgress, createDailySession, createDailyDraft } from '../../src/dailyProgress.ts';
import { previewAdaptiveScope } from '../../src/adaptiveLearning.ts';

export function courseFixture(lessons, kind) {
  const progress = createDailyProgress();
  if (kind === 'fresh') return progress;
  const targets = lessons[0].learningTargets;
  progress.learning = { version: 1, turns: 8, rounds: 2, targets: Object.fromEntries(targets.map((id, index) => [id, {
    introducedAt: 1700000000000, confidence: kind === 'weak' || index === 0 ? .1 : 1,
    abilities: {}, lastSeenTurn: index, lastFailureTurn: 0, signatures: [], transfer: kind !== 'weak' && index !== 0,
    readyAt: kind !== 'weak' && index !== 0 ? 1700000000000 : 0,
  }])) };
  if (kind === 'saved') {
    const scope = previewAdaptiveScope(progress, lessons);
    const source = lessons.find(item => item.id === scope.sourceLessonId);
    const task = source.practice.find(item => ['write', 'fill'].includes(item.kind) && item.knowledgeIds.every(id => scope.focusIds.includes(id)));
    assert.ok(task);
    progress.session = { ...createDailySession({ ...source, exercises: [task] }, 'lesson', 1700000000000), stage: 'exercise',
      adaptive: { ...scope, seed: 123 }, draft: { ...createDailyDraft(task), text: 'unfinished answer', ...(task.kind === 'fill' ? { blanks: ['unfinished answer'] } : {}) } };
  }
  if (kind === 'legacy') progress.session = createDailySession(lessons[3], 'lesson', 1700000000000);
  if (kind === 'review') progress.session = createDailySession(lessons[0], 'review', 1700000000000);
  return progress;
}
