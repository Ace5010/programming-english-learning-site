// Diagnostic: why does the real programming course stop finishing after the dedup/focus change?
import { correctDraft } from '../../tools/helpers/course-answer.mjs';
import { adaptiveProgrammingLessons as catalog } from '../../src/programmingPractice.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent, previewAdaptiveScope } from '../../src/adaptiveLearning.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer } from '../../src/dailyProgress.ts';

const NOW = new Date(2026, 8, 22, 10).getTime();
let course = createDailyProgress();
let now = NOW;
let rounds = 0;
const MAX = 40;

while (hasAdaptiveContent(course, catalog) && rounds < MAX) {
  now += 1000;
  const session = planAdaptiveSession(course, catalog, now, () => ((rounds * 137 + 371) % 997) / 997);
  if (!session) { console.log(`round ${rounds}: NO SESSION but hasAdaptiveContent=true`); break; }
  course = { ...course, session };
  course = beginAdaptiveLearning(course, catalog, now);
  const focus = session.adaptive.focusIds;
  const scope = previewAdaptiveScope(course, catalog);
  let count = 0;
  const usedIds = [];
  while (course.session.stage !== 'summary' && count < 25) {
    count++;
    const resolved = resolveAdaptiveLesson(course.session, catalog);
    const task = resolved.exercises.find(item => item.id === course.session.queue[course.session.index].exerciseId);
    usedIds.push(task.id);
    course = { ...course, session: updateDailyDraft(course.session, correctDraft(task)) };
    now += 1000;
    course = submitDailyAnswer(course, resolved, {}, now);
    course = recordAdaptiveAnswer(course, catalog, now);
    course = advanceAdaptiveSession(course, catalog, now);
  }
  const targets = course.learning.targets;
  const need = Object.keys(targets).filter(id => { const t = targets[id]; return !t.readyAt || t.confidence < 0.8 || !(t.transfer || t.independentRecallAt); });
  const introduced = Object.keys(targets).length;
  console.log(`round ${rounds}: focus=[${focus.join(',')}] newIds=[${session.adaptive.newIds.join(',')}] answers=${count} introduced=${introduced} needLearning=${need.length} :: ${usedIds.join(' ')}`);
  if (need.length) {
    const sample = need.slice(0, 4).map(id => { const t = targets[id]; return `${id}(c=${t.confidence.toFixed(2)},ctx=${t.abilities.context ?? 0},sig=${t.signatures.length},tr=${t.transfer},ready=${t.readyAt ? 1 : 0})`; });
    console.log(`    still: ${sample.join(' | ')}`);
  }
  rounds++;
}
console.log(`\nstopped at rounds=${rounds}, hasAdaptiveContent=${hasAdaptiveContent(course, catalog)}`);
const scope = previewAdaptiveScope(course, catalog);
console.log('scope:', scope ? JSON.stringify({ focusIds: scope.focusIds, newIds: scope.newIds, source: scope.sourceLessonId, budget: scope.budget }) : null);
