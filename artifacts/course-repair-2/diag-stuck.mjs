// Diagnostic 3: run long enough to see which programming targets never reach admission, and why.
import { correctDraft } from '../../tools/helpers/course-answer.mjs';
import { adaptiveProgrammingLessons as catalog } from '../../src/programmingPractice.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from '../../src/adaptiveLearning.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer } from '../../src/dailyProgress.ts';

const NOW = new Date(2026, 8, 22, 10).getTime();
const needsLearning = (t) => !t?.readyAt || t.confidence < 0.8 || !(t.transfer || t.independentRecallAt);

// Which sentence contexts does each word have available in the whole catalog?
const contextsFor = new Map();
for (const lesson of catalog) for (const task of [...lesson.exercises, ...lesson.rechecks, ...lesson.practice]) {
  for (const id of task.knowledgeIds ?? []) {
    if (!contextsFor.has(id)) contextsFor.set(id, new Set());
    contextsFor.get(id).add(task.learningContext ?? '(none)');
  }
}

let course = createDailyProgress();
let now = NOW;
let rounds = 0;
let answers = 0;
const MAX = 130;

while (hasAdaptiveContent(course, catalog) && rounds < MAX) {
  now += 1000;
  const session = planAdaptiveSession(course, catalog, now, () => ((rounds * 137 + 371) % 997) / 997);
  if (!session) break;
  course = { ...course, session };
  course = beginAdaptiveLearning(course, catalog, now);
  let guard = 0;
  while (course.session.stage !== 'summary' && guard++ < 25) {
    const resolved = resolveAdaptiveLesson(course.session, catalog);
    const task = resolved.exercises.find(item => item.id === course.session.queue[course.session.index].exerciseId);
    course = { ...course, session: updateDailyDraft(course.session, correctDraft(task)) };
    now += 1000;
    course = submitDailyAnswer(course, resolved, {}, now);
    course = recordAdaptiveAnswer(course, catalog, now);
    course = advanceAdaptiveSession(course, catalog, now);
    answers++;
  }
  rounds++;
  if (rounds % 20 === 0) {
    const stuck = Object.entries(course.learning.targets).filter(([, t]) => needsLearning(t));
    console.log(`... round ${rounds}: answers=${answers} introduced=${Object.keys(course.learning.targets).length} needing=${stuck.length}`);
  }
}
const targets = course.learning.targets;
const stuck = Object.entries(targets).filter(([, t]) => needsLearning(t));
console.log(`\nFINAL rounds=${rounds} answers=${answers} introduced=${Object.keys(targets).length}/63 needing=${stuck.length}`);
console.log('hasAdaptiveContent=', hasAdaptiveContent(course, catalog));
for (const [id, t] of stuck) {
  const all = [...(contextsFor.get(id) ?? [])];
  const sentences = all.filter(c => c.startsWith('sentence:'));
  console.log(`\n${id}: c=${t.confidence.toFixed(2)} ctxAbility=${t.abilities.context ?? 0} sig=${t.signatures.length} transfer=${t.transfer} readyAt=${t.readyAt}`);
  console.log(`   seenContexts(${(t.contexts ?? []).length}): ${JSON.stringify(t.contexts ?? [])}`);
  console.log(`   catalogSentenceContexts(${sentences.length}): ${JSON.stringify(sentences.slice(0, 6))}`);
}
