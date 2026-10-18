// Diagnostic 4: what questions does a permanently-stuck target actually receive?
import { correctDraft } from '../../tools/helpers/course-answer.mjs';
import { adaptiveProgrammingLessons as catalog } from '../../src/programmingPractice.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from '../../src/adaptiveLearning.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer } from '../../src/dailyProgress.ts';

const NOW = new Date(2026, 8, 22, 10).getTime();
const needsLearning = (t) => !t?.readyAt || t.confidence < 0.8 || !(t.transfer || t.independentRecallAt);
const level = (e) => e.learningDifficulty ?? (e.kind === 'write' || e.kind === 'fill' ? 'recall' : e.ability === 'context' || e.kind === 'order' ? 'context' : 'recognition');

let course = createDailyProgress();
let now = NOW, rounds = 0, answers = 0;
const history = [];
const MAX = 130;
while (hasAdaptiveContent(course, catalog) && rounds < MAX) {
  now += 1000;
  const session = planAdaptiveSession(course, catalog, now, () => ((rounds * 137 + 371) % 997) / 997);
  if (!session) break;
  course = { ...course, session };
  course = beginAdaptiveLearning(course, catalog, now);
  const focus = session.adaptive.focusIds.slice();
  let guard = 0;
  while (course.session.stage !== 'summary' && guard++ < 25) {
    const resolved = resolveAdaptiveLesson(course.session, catalog);
    const task = resolved.exercises.find(item => item.id === course.session.queue[course.session.index].exerciseId);
    history.push({ round: rounds, focus, id: task.id, lv: level(task), ab: task.ability, ctx: task.learningContext, ids: task.knowledgeIds });
    course = { ...course, session: updateDailyDraft(course.session, correctDraft(task)) };
    now += 1000;
    course = submitDailyAnswer(course, resolved, {}, now);
    course = recordAdaptiveAnswer(course, catalog, now);
    course = advanceAdaptiveSession(course, catalog, now);
    answers++;
  }
  rounds++;
}
const stuck = Object.entries(course.learning.targets).filter(([, t]) => needsLearning(t));
console.log(`rounds=${rounds} answers=${answers} stuck=${stuck.map(([id]) => id).join(',')}`);
for (const [id] of stuck) {
  const mine = history.filter(h => h.ids.includes(id));
  console.log(`\n${id}: ${mine.length} questions received`);
  const byId = {};
  for (const h of mine) { const k = `${h.id} lv=${h.lv} ab=${h.ab} ctx=${h.ctx}`; byId[k] = (byId[k] ?? 0) + 1; }
  for (const [k, n] of Object.entries(byId).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ${n}x ${k}`);
  // all catalog candidates containing this id and their levels/contexts
  const all = [];
  for (const lesson of catalog) for (const t of [...lesson.exercises, ...lesson.rechecks, ...lesson.practice])
    if ((t.knowledgeIds ?? []).includes(id)) all.push(`${t.id} lv=${level(t)} ctx=${t.learningContext}`);
  console.log(`   catalog candidates containing ${id}: ${all.length}`);
  for (const a of all.slice(0, 40)) console.log('     ', a);
}
