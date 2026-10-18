// Diagnostic 2: dump the exact reason `transfer` never becomes true for a stuck programming target.
import { correctDraft } from '../../tools/helpers/course-answer.mjs';
import { adaptiveProgrammingLessons as catalog } from '../../src/programmingPractice.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from '../../src/adaptiveLearning.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer, dailyExerciseAbility } from '../../src/dailyProgress.ts';

const NOW = new Date(2026, 8, 22, 10).getTime();
const level = (e) => e.learningDifficulty ?? (e.kind === 'write' || e.kind === 'fill' ? 'recall' : e.ability === 'context' || e.kind === 'order' ? 'context' : 'recognition');
const ability = (e) => e.ability ?? dailyExerciseAbility(e);

let course = createDailyProgress();
let now = NOW;
let rounds = 0;
const log = [];
let turns = 0;

while (hasAdaptiveContent(course, catalog) && rounds < 25) {
  now += 1000;
  const session = planAdaptiveSession(course, catalog, now, () => ((rounds * 137 + 371) % 997) / 997);
  course = { ...course, session };
  course = beginAdaptiveLearning(course, catalog, now);
  while (course.session.stage !== 'summary') {
    const resolved = resolveAdaptiveLesson(course.session, catalog);
    const task = resolved.exercises.find(item => item.id === course.session.queue[course.session.index].exerciseId);
    const state = course.learning;
    const before = {};
    for (const id of task.wordIds) before[`word-${id}`] = state.targets[`word-${id}`];
    course = { ...course, session: updateDailyDraft(course.session, correctDraft(task)) };
    now += 1000;
    course = submitDailyAnswer(course, resolved, {}, now);
    course = recordAdaptiveAnswer(course, catalog, now);
    turns++;
    for (const id of task.wordIds) {
      const key = `word-${id}`;
      const previous = before[key];
      if (!previous || previous.confidence < 0.9 || previous.transfer) continue;
      const ctx = task.learningContext;
      const gap = Object.keys(previous.abilities).length ? turns - previous.lastSeenTurn : 0;
      const sinceFailure = previous.lastFailureTurn === 0 ? Infinity : turns - previous.lastFailureTurn;
      const changed = ctx ? !!previous.contexts?.some(v => v !== ctx && v.startsWith('sentence:')) && ctx.startsWith('sentence:')
        : previous.signatures.length > 0 && previous.signatures[previous.signatures.length - 1] !== `authored:${task.id}`;
      const delayed = gap >= 3 && sinceFailure >= 3;
      const lv = level(task);
      log.push(`${key} r${rounds} ${task.id} lv=${lv} ab=${ability(task)} ctx=${ctx} gap=${gap} sf=${sinceFailure} delayed=${delayed} changed=${changed} ctxs=${JSON.stringify(previous.contexts ?? [])} lastDelayOK=${lv !== 'recognition' && delayed}`);
    }
    course = advanceAdaptiveSession(course, catalog, now);
  }
  rounds++;
}
console.log(`rounds=${rounds} caught ${log.length} stuck-at-transfer events`);
for (const line of log.slice(-40)) console.log(line);
const ctr = {};
for (const line of log) {
  const id = line.slice(0, line.indexOf(' r'));
  const m = /lv=(\w+).*delayed=(\w+) changed=(\w+)/.exec(line);
  const k = `${id} lv=${m[1]} delayed=${m[2]} changed=${m[3]}`;
  ctr[k] = (ctr[k] ?? 0) + 1;
}
console.log('\ncounts (id lv/delayed/changed):');
for (const [k, v] of Object.entries(ctr).slice(0, 25)) console.log(' ', k, v);
