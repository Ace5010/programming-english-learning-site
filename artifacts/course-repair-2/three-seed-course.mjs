// Full programming-course progression for three fixed seeds, via the real
// answer -> storage -> restore chain. Reports rounds, answers and admission.
import { correctDraft } from '../../tools/helpers/course-answer.mjs';
import { adaptiveProgrammingLessons as catalog } from '../../src/programmingPractice.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from '../../src/adaptiveLearning.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer, parseDailyProgress, persistDailyProgress } from '../../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../../src/programmingProgress.ts';

const SEEDS = [371, 613, 887];
const MAX_ROUNDS = 200;
const MAX_QUESTIONS_PER_ROUND = 20;
const results = [];

for (const seed of SEEDS) {
  const storage = new Map();
  const random = () => ((round * seed + 137) % 997) / 997;
  let round = 0, answers = 0, questions = 0;
  let progress = createDailyProgress();
  const seen = new Set();
  const started = Date.now();
  let ok = true, reason = '';

  while (hasAdaptiveContent(progress, catalog)) {
    if (round >= MAX_ROUNDS) { ok = false; reason = `exceeded ${MAX_ROUNDS} rounds`; break; }
    const now = new Date(2026, 8, 22, 10).getTime() + round * 60000;
    let session = planAdaptiveSession(progress, catalog, now, random);
    if (!session) { ok = false; reason = 'unfinished targets produced no lesson'; break; }
    progress = { ...progress, session };
    progress = beginAdaptiveLearning(progress, catalog, now);
    // persist + restore through the real storage path
    const written = persistDailyProgress({ getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, progress, storage.get(PROGRAMMING_COURSE_KEY) ?? null, PROGRAMMING_COURSE_KEY);
    if (!written.saved) { ok = false; reason = written.warning; break; }
    const restored = parseDailyProgress(storage.get(PROGRAMMING_COURSE_KEY), catalog);
    if (!restored.writable) { ok = false; reason = restored.warning; break; }
    progress = restored.progress;

    let guard = 0;
    while (progress.session.stage !== 'summary') {
      if (guard++ >= MAX_QUESTIONS_PER_ROUND) { ok = false; reason = 'round did not end'; break; }
      const lesson = resolveAdaptiveLesson(progress.session, catalog);
      const task = lesson.exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
      if (!task) { ok = false; reason = 'queue referenced an unknown question'; break; }
      progress = { ...progress, session: updateDailyDraft(progress.session, correctDraft(task)) };
      progress = submitDailyAnswer(progress, lesson, {}, now);
      if (!progress.session.feedback?.correct) { ok = false; reason = `correct answer rejected: ${task.id}`; break; }
      progress = recordAdaptiveAnswer(progress, catalog, now);
      answers++; seen.add(task.id);
      const saved = persistDailyProgress({ getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, progress, storage.get(PROGRAMMING_COURSE_KEY) ?? null, PROGRAMMING_COURSE_KEY);
      if (!saved.saved) { ok = false; reason = `storage refused: ${saved.warning}`; break; }
      progress = parseDailyProgress(storage.get(PROGRAMMING_COURSE_KEY), catalog).progress;
      progress = advanceAdaptiveSession(progress, catalog, now);
    }
    if (!ok) break;
    round++;
  }
  const targets = progress.learning.targets;
  const admitted = Object.keys(targets).filter(id => targets[id].readyAt > 0);
  results.push({ seed, rounds: round, answers, distinctQuestions: seen.size, introduced: Object.keys(targets).length, admitted: admitted.length, admittedAll: admitted.length === 63, seconds: Math.round((Date.now() - started) / 1000), ok, reason });
}
for (const r of results) console.log(`${r.ok && r.admittedAll ? 'OK  ' : 'FAIL'} seed=${r.seed} rounds=${r.rounds} answers=${r.answers} distinctQuestions=${r.distinctQuestions} introduced=${r.introduced} admitted=${r.admitted}/63 ${r.seconds}s ${r.reason}`);
console.log(JSON.stringify(results));
