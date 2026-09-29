import {
  createDailyDraft, dailyExerciseAbility, dailyExerciseKnowledgeIds, getDailyLessonProgress,
  learnDailyLesson, type DailyProgress, type DailySession,
} from './dailyProgress.ts';
import type { AdaptivePlan, LearningExercise, LearningLesson, LearningState, LearningTarget } from './learningTypes.ts';
import { wordsForPhrase, dailyWordTargets, localWordError } from './dailyWordTargets.ts';

const READY_CONFIDENCE = 0.8;
const MAX_ROUND = 20;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const unique = <T,>(items: T[]) => [...new Set(items)];
const needsLearning = (target?: LearningTarget) => !target?.readyAt || target.confidence < READY_CONFIDENCE || !(target.transfer || target.independentRecallAt);
const freshTarget = (at: number): LearningTarget => ({
  introducedAt: at, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0,
  signatures: [], transfer: false, readyAt: 0,
});

/** Historical exposure is retained, but a completed old lesson is not mastery evidence. */
function learningState(progress: DailyProgress, lessons: LearningLesson[]): LearningState {
  const old = progress.learning;
  const targets = { ...old?.targets };
  for (const lesson of lessons) for (const id of lesson.learningTargets) {
    if (targets[id]) continue;
    const introducedAt = progress.knowledge?.[id]?.firstLearnedAt || (!id.startsWith('daily-word-') && progress.lessons[lesson.id]?.completedAt);
    if (introducedAt) targets[id] = freshTarget(introducedAt);
  }
  return old ? { ...old, targets } : { version: 1, turns: 0, rounds: 0, targets };
}

type Candidate = { exercise: LearningExercise; lesson: LearningLesson; ids: string[] };
function candidates(lessons: LearningLesson[]): Candidate[] {
  const seen = new Set<string>();
  return lessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice].flatMap(exercise => {
    if (seen.has(exercise.id)) return [];
    seen.add(exercise.id);
    return [{ exercise, lesson, ids: dailyExerciseKnowledgeIds(lesson, exercise) }];
  }));
}

function step(seed: number): number {
  let result = seed >>> 0 || 1;
  result ^= result << 13; result ^= result >>> 17; result ^= result << 5;
  return result >>> 0 || 1;
}

function weighted<T>(items: T[], weight: (item: T) => number, value: number): T | undefined {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let remaining = clamp(value) * total;
  for (const item of items) { remaining -= weight(item); if (remaining <= 0) return item; }
  return items[items.length - 1];
}

function ability(exercise: LearningExercise): string {
  return exercise.ability ?? dailyExerciseAbility(exercise);
}

function difficulty(exercise: LearningExercise): 'recognition' | 'context' | 'recall' {
  return exercise.learningDifficulty ?? (exercise.kind === 'write' || exercise.kind === 'fill' ? 'recall'
    : exercise.ability === 'context' || exercise.kind === 'order' ? 'context' : 'recognition');
}

function signature(exercise: LearningExercise): string {
  // Duplicate IDs or shuffled options cannot turn the same question into transfer evidence.
  const raw = exercise.learningSignature ?? `${ability(exercise)}:${exercise.prompt.trim().toLowerCase()}:${(exercise.answers ?? exercise.blanks?.flat() ?? []).join('|').toLowerCase()}`;
  let hash = 2166136261;
  for (const letter of raw) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
  return `sig-${raw.slice(0, 145)}-${hash.toString(36)}`;
}

function pickNext(state: LearningState, plan: AdaptivePlan, lessons: LearningLesson[], used: Set<string>, random?: () => number, wordsOnly = false) {
  const allowed = new Set([...Object.keys(state.targets), ...plan.newIds]);
  const focus = new Set(plan.focusIds);
  const catalog = candidates(lessons);
  const available = catalog.filter(item => (!wordsOnly || item.ids.every(id => focus.has(id))) && (!item.lesson.referenceOnly || item.ids.some(id => focus.has(id))) && !used.has(item.exercise.id) && item.ids.length > 0
    && item.ids.every(id => allowed.has(id)) && (item.exercise.prerequisiteIds ?? []).every(id => allowed.has(id)) && (item.exercise.kind !== 'speak'
      || item.ids.every(id => (state.targets[id]?.confidence ?? 0) >= (item.exercise.speechSupport === 'hidden' ? 0.65 : item.exercise.speechSupport === 'partial' ? 0.45 : 0.3))
        && (item.exercise.readAloud ?? []).every(phrase => allowed.has(phrase.id))
        && !catalog.some(other => used.has(other.exercise.id) && other.exercise.kind === 'speak')));
  const pool = available.filter(item => difficulty(item.exercise) === 'recognition' || !item.ids.some(id =>
    (state.targets[id]?.confidence ?? 0) < 0.2
      && available.some(other => other.ids.includes(id) && difficulty(other.exercise) === 'recognition')
      && !catalog.some(other => used.has(other.exercise.id) && other.ids.includes(id) && difficulty(other.exercise) === 'recognition')));
  const seed = step(plan.seed);
  const weight = (item: Candidate) => {
    let score = 0;
    for (const id of item.ids) {
      const target = state.targets[id];
      const confidence = target?.confidence ?? 0;
      const skill = target?.abilities[ability(item.exercise)] ?? 0;
      const gap = target && Object.keys(target.abilities).length ? state.turns - target.lastSeenTurn : 10;
      const focused = focus.has(id);
      let contribution = (1 + (1 - confidence) * 4 + (1 - skill) * 3) * (focused ? 3 : 0.4);
      // Interleave targets instead of making an immediate repeat look like recall.
      if (gap <= 1) contribution *= 0.08;
      else if (gap === 2) contribution *= 0.45;
      if (focused && (!target || !Object.keys(target.abilities).length)) contribution *= 2;
      if (target?.signatures.includes(signature(item.exercise))) contribution *= 0.45;
      if (confidence < 0.2 && difficulty(item.exercise) === 'recognition') contribution *= 1.4;
      if (confidence >= 0.25 && difficulty(item.exercise) !== 'recognition') contribution *= 1.8;
      if (target?.lastErrorAbility === 'spelling' && difficulty(item.exercise) === 'recall') contribution *= 2;
      if (target?.lastErrorAbility === 'context' && item.exercise.ability === 'context') contribution *= 2;
      if (item.exercise.id.endsWith('-order-blocks')) contribution *= confidence < 0.4 ? 1.6 : 0.3;
      if (item.exercise.id.endsWith('-order-words')) contribution *= confidence >= 0.35 ? 1.4 : 0.15;
      score += contribution;
    }
    // Pilot baseline around 4 word opportunities in 10; weakness still changes the weight.
    const pilot = plan.focusIds.some(id => id.startsWith('daily-word-'));
    const wordTask = item.ids.some(id => id.startsWith('daily-word-'));
    const wordCount = catalog.filter(other => used.has(other.exercise.id) && other.ids.some(id => id.startsWith('daily-word-'))).length;
    const balance = pilot && !wordsOnly ? wordTask ? (wordCount / Math.max(1, used.size) < .4 ? 2 : .35) : 1 : 1;
    return Math.max(0.01, balance * score / item.ids.length * (item.exercise.kind === 'speak' ? 0.25 : item.exercise.kind === 'match' ? 0.65 : 1));
  };
  return { picked: weighted(pool, weight, random ? random() : seed / 0x100000000), seed };
}

export function hasAdaptiveContent(progress: DailyProgress, lessons: LearningLesson[]): boolean {
  const state = learningState(progress, lessons);
  return lessons.some(lesson => !lesson.referenceOnly && lesson.learningTargets.some(id => needsLearning(state.targets[id])));
}

/** Read-only scope shared by the homepage and session creation; never draws a question. */
export function previewAdaptiveScope(progress: DailyProgress, lessons: LearningLesson[]): Omit<AdaptivePlan, 'seed'> | null {
  const state = learningState(progress, lessons);
  const knownIds = new Set(lessons.filter(lesson => !lesson.referenceOnly).flatMap(lesson => lesson.learningTargets));
  const weak = Object.keys(state.targets).filter(id => knownIds.has(id) && needsLearning(state.targets[id]))
    .sort((a, b) => state.targets[a].confidence - state.targets[b].confidence || state.targets[a].lastSeenTurn - state.targets[b].lastSeenTurn);
  const severe = weak.filter(id => state.targets[id].confidence < 0.45);
  const newSource = lessons.find(lesson => !lesson.referenceOnly && lesson.learningTargets.some(id => !state.targets[id])
    && (lesson.prerequisiteIds ?? []).every(id => !!state.targets[id]?.introducedAt));
  if (!weak.length && !newSource) return null;
  const focusLimit = Math.max(1, Math.min(4, lessons[0]?.focusLimit ?? 4));
  const oldCount = Math.min(focusLimit - (newSource && severe.length < 2 ? 1 : 0), severe.length >= 4 ? 4 : Math.min(weak.length, weak.length >= 3 ? 3 : 2));
  const oldIds = weak.slice(0, oldCount);
  const newCount = severe.length >= 4 ? 0 : severe.length >= 2 ? 1 : Math.max(1, 4 - oldIds.length);
  const newIds = newSource?.learningTargets.filter(id => !state.targets[id]).slice(0, Math.min(newCount, focusLimit - oldIds.length)) ?? [];
  const pairedWords = unique([...oldIds, ...newIds].flatMap(id => wordsForPhrase(id).map(word => word.id))).slice(0, 2);
  const focusIds = unique([...oldIds, ...newIds, ...pairedWords]);
  for (const id of pairedWords) if (!state.targets[id] && !newIds.includes(id)) newIds.push(id);
  const source = newIds.length ? newSource : lessons.find(lesson => lesson.learningTargets.some(id => oldIds.includes(id)));
  if (!source || !focusIds.length) return null;
  return {
    version: 1, round: state.rounds + 1, focusIds, newIds, sourceLessonId: source.id,
    budget: Math.min(16, 8 + Math.max(0, focusIds.length - 2) * 2 + Math.min(4, severe.length)),
  };
}

/** Only the next question is committed; later questions respond to the saved answer. */
export function planAdaptiveSession(
  progress: DailyProgress, lessons: LearningLesson[], now = Date.now(), random: () => number = Math.random,
): DailySession | null {
  if (progress.session && progress.session.stage !== 'summary') return progress.session;
  const scope = previewAdaptiveScope(progress, lessons);
  if (!scope) return null;
  const state = learningState(progress, lessons);
  const seed = (Math.floor(clamp(random()) * 0xffffffff) >>> 0) || 1;
  const plan: AdaptivePlan = { ...scope, seed };
  const { picked, seed: nextSeed } = pickNext(state, plan, lessons, new Set());
  if (!picked) return null;
  return {
    id: `${now}-adaptive-${seed.toString(36)}`, lessonId: scope.sourceLessonId, mode: 'lesson', stage: 'study', startedAt: now,
    queue: [{ exerciseId: picked.exercise.id, retry: false }], index: 0, answers: [],
    draft: createDailyDraft(picked.exercise), feedback: null, adaptive: { ...plan, seed: nextSeed },
  };
}

/** The UI keeps existing question components and audio IDs while teaching just this round. */
export function resolveAdaptiveLesson(session: DailySession, lessons: LearningLesson[]): LearningLesson {
  const source = lessons.find(lesson => lesson.id === (session.adaptive?.sourceLessonId ?? session.lessonId));
  if (!source) throw new Error('这节课的教学内容无法读取，请保留记录后重新加载。');
  if (!session.adaptive) return source;
  const focus = new Set(session.adaptive.focusIds);
  const phraseIds = new Set([...focus, ...[...focus].filter(id => id.startsWith('word-')).map(id => id.replace(/^word-/, 'example-'))]);
  for (const word of dailyWordTargets.filter(word => focus.has(word.id))) {
    // Teach one authored sentence alongside an independently introduced word.
    if (!word.contexts.some(id => phraseIds.has(id))) phraseIds.add(word.contexts[0]);
  }
  const phraseMap = new Map(lessons.flatMap(lesson => lesson.phrases).filter(phrase => phraseIds.has(phrase.id)).map(phrase => [phrase.id, phrase]));
  const sources = unique([source, ...lessons.filter(lesson => lesson.learningTargets.some(id => focus.has(id) && !id.startsWith('daily-word-')))]).slice(0, 2);
  return {
    ...source, title: `第 ${session.adaptive.round} 节`,
    goal: session.adaptive.newIds.length ? '学习新的内容，并穿插巩固还不熟悉的内容。' : '换一些题目，巩固还不熟悉的内容。',
    explanation: sources.map(lesson => lesson.explanation).join('\n\n'), phrases: [...phraseMap.values()],
    learningTargets: [...focus], exercises: candidates(lessons).map(item => item.exercise), rechecks: [], practice: [],
  };
}

export function beginAdaptiveLearning(progress: DailyProgress, lessons: LearningLesson[], now = Date.now()): DailyProgress {
  const session = progress.session;
  if (!session?.adaptive || session.stage !== 'study') return progress;
  const state = learningState(progress, lessons);
  const targets = { ...state.targets };
  let next = progress;
  const taughtIds = unique([...session.adaptive.focusIds, ...resolveAdaptiveLesson(session, lessons).phrases.map(phrase => phrase.id).filter(id => !id.startsWith('example-'))]);
  for (const id of taughtIds) {
    targets[id] ??= freshTarget(now);
    const sources = lessons.filter(lesson => lesson.learningTargets.includes(id));
    for (const source of sources) {
      // The resolved lesson contains every exercise; never enroll that entire pool.
      next = learnDailyLesson(next, { id: source.id, exercises: [], rechecks: [], knowledgeIds: [id] }, now);
    }
  }
  return { ...next, learning: { ...state, targets }, session: { ...session, stage: 'exercise' } };
}

function readiness(target: LearningTarget, goal: LearningLesson['learningGoal'], id: string): boolean {
  const relevant = goal === 'reading' ? target.abilities.context ?? 0 : goal === 'listening' ? target.abilities.listening ?? 0
    : Math.max(target.abilities.meaning ?? 0, target.abilities.listening ?? 0, target.abilities.writing ?? 0, target.abilities.context ?? 0);
  const evidence = target.transfer || goal === 'communication' && !id.startsWith('daily-word-') && !!target.independentRecallAt;
  return target.confidence >= READY_CONFIDENCE && relevant >= 0.5 && evidence && target.signatures.length >= 2;
}

/** Safe both after Check and after an immediate hint save; receipts survive reload. */
export function recordAdaptiveAnswer(progress: DailyProgress, lessons: LearningLesson[], now = Date.now()): DailyProgress {
  const session = progress.session;
  if (!session || session.stage !== 'exercise' || !session.adaptive && (!progress.learning || session.mode === 'lesson')) return progress;
  const item = candidates(lessons).find(candidate => candidate.exercise.id === session.queue[session.index]?.exerciseId);
  const answer = session.answers[session.index];
  const hint = !answer && !session.feedback && (session.draft.helped || session.draft.revealed);
  if (!item || !answer && !hint) return progress;
  if (item.exercise.kind === 'speak' && hint) return progress;
  const state = learningState(progress, lessons);
  const observedIds = session.draft.learningObserved ?? [];
  const hintIds = session.draft.pairs ? Object.keys(session.draft.pairs.mistakes) : item.ids;
  const receipt = `${session.id}:${session.index}:${answer ? answer.at : `hint:${hintIds.join(',')}`}`;
  if (state.lastAnswer === receipt) return progress;
  const turn = answer ? state.turns + 1 : state.turns;
  const targets = { ...state.targets };
  const taskSignature = signature(item.exercise);
  const taskAbility = ability(item.exercise);
  const diagnosis = !answer?.correct || session.draft.correction
    ? localWordError(item.exercise, session.draft.correction ? { ...session.draft, text: session.draft.correction.original } : session.draft) : undefined;
  for (const id of item.ids) {
    if (hint && (!hintIds.includes(id) || observedIds.includes(id))) continue;
    const outcome = answer?.targets ? answer.targets[id] : answer?.outcome;
    if (answer?.targets && (!outcome || outcome === 'unmeasured')) continue;
    const independent = outcome === 'independent' && (answer?.targets ? true : !!answer?.correct);
    const previous = targets[id];
    if (!previous) continue;
    const gap = Object.keys(previous.abilities).length ? turn - previous.lastSeenTurn : 0;
    const sinceFailure = previous.lastFailureTurn === 0 ? Number.POSITIVE_INFINITY : turn - previous.lastFailureTurn;
    const context = item.exercise.learningContext;
    const changed = context ? !!previous.contexts?.some(value => value !== context && value.startsWith('sentence:')) && context.startsWith('sentence:')
      : previous.signatures.length > 0 && previous.signatures[previous.signatures.length - 1] !== taskSignature;
    const delayed = gap >= 3 && sinceFailure >= 3;
    const level = difficulty(item.exercise);
    const repeated = previous.signatures.includes(taskSignature);
    const gain = independent ? (level === 'recognition' ? 0.08 : level === 'context' ? 0.22 : 0.28)
      * (delayed ? 1.2 : 0.6) * (repeated ? 0.35 : 1) : 0;
    const loss = hint ? session.draft.correction || session.draft.pairs ? 0.26 : 0.12
      : observedIds.includes(id) || independent || outcome === 'self' ? 0 : outcome === 'assisted' ? 0.14 : 0.26;
    const skill = clamp((previous.abilities[taskAbility] ?? 0) + gain - loss);
    const failure = hint || outcome === 'assisted' || outcome === 'revealed' || outcome !== 'self' && !answer?.targets && answer?.correct === false;
    const successfulSignatures = independent
      ? [...previous.signatures.filter(value => value !== taskSignature), taskSignature].slice(-24) : previous.signatures;
    const evidence = { ...previous.evidence };
    if (answer && outcome !== 'self') {
      const dimensions: (keyof NonNullable<LearningTarget['evidence']>)[] = [];
      if (level === 'recognition') dimensions.push('recognition');
      if (level === 'recall' && !item.exercise.recallSupport) dimensions.push('recall');
      if (changed) dimensions.push('newContext');
      if (level === 'recall' && !item.exercise.recallSupport && previous.lastSessionId && previous.lastSessionId !== session.id) dimensions.push('laterSession');
      for (const dimension of dimensions) {
        const counts = evidence[dimension] ?? { attempts: 0, independent: 0, assisted: 0, revealed: 0, elapsedMs: 0 };
        evidence[dimension] = { attempts: counts.attempts + 1, independent: counts.independent + Number(independent),
          assisted: counts.assisted + Number(outcome === 'assisted'), revealed: counts.revealed + Number(outcome === 'revealed'),
          elapsedMs: counts.elapsedMs + Math.max(0, answer.at - (session.answers[session.index - 1]?.at ?? session.startedAt)) };
      }
    }
    const target: LearningTarget = {
      ...previous, confidence: clamp(previous.confidence + gain - loss),
      abilities: outcome === 'self' ? previous.abilities : { ...previous.abilities, [taskAbility]: skill },
      lastSeenTurn: turn, lastFailureTurn: failure ? turn : previous.lastFailureTurn,
      signatures: successfulSignatures,
      ...(independent && context ? { contexts: unique([...(previous.contexts ?? []), context]).slice(-24) } : {}),
      ...(independent && level === 'recall' && !item.exercise.recallSupport && delayed ? { independentRecallAt: now } : {}),
      ...(failure ? { independentRecallAt: 0 } : {}),
      ...(answer && outcome !== 'self' ? { evidence, lastSessionId: session.id } : {}),
      lastEvidenceAt: now,
      transfer: failure ? false : previous.transfer || independent && level !== 'recognition' && delayed && changed,
    };
    // Admission is durable. A later failure is handled by the long-term review state.
    if (!target.readyAt && readiness(target, item.lesson.learningGoal, id)) target.readyAt = answer?.at ?? now;
    targets[id] = target;
  }
  if (diagnosis && !item.ids.includes(diagnosis.id) && targets[diagnosis.id] && !observedIds.includes(diagnosis.id)) {
    const target = targets[diagnosis.id];
    targets[diagnosis.id] = { ...target, confidence: clamp(target.confidence - .26),
      abilities: { ...target.abilities, [diagnosis.ability]: clamp((target.abilities[diagnosis.ability] ?? 0) - .26) },
      transfer: false, independentRecallAt: 0, lastFailureTurn: turn, lastSeenTurn: turn, lastErrorAbility: diagnosis.ability, lastEvidenceAt: now };
  }
  const knowledge = { ...progress.knowledge };
  for (const id of item.ids) {
    if (state.targets[id]?.readyAt || !targets[id]?.readyAt || !knowledge[id]) continue;
    const due = new Date(targets[id].readyAt); due.setDate(due.getDate() + 1);
    const skills = { ...knowledge[id].skills };
    for (const ability of ['meaning', 'listening', 'writing'] as const) skills[ability] = { ...skills[ability], dueAt: due.getTime() };
    knowledge[id] = { ...knowledge[id], skills };
  }
  return { ...progress, knowledge, learning: { ...state, turns: turn, targets, lastAnswer: receipt },
    ...(hint && (session.draft.correction || session.draft.pairs) ? { session: { ...session, draft: { ...session.draft, learningObserved: unique([...observedIds, ...hintIds, ...(diagnosis ? [diagnosis.id] : [])]) } } } : {}) };
}

function finishRound(progress: DailyProgress, lessons: LearningLesson[], now: number): DailyProgress {
  const session = progress.session!;
  const state = learningState(progress, lessons);
  const records = { ...progress.lessons };
  for (const lesson of lessons) if (lesson.learningTargets.length && lesson.learningTargets.every(id => !!state.targets[id]?.introducedAt)) {
    const previous = getDailyLessonProgress(progress, lesson.id);
    records[lesson.id] = { ...previous, completedAt: previous.completedAt || now };
  }
  return {
    ...progress, lessons: records, learning: { ...state, rounds: Math.max(state.rounds, session.adaptive!.round) },
    session: { ...session, stage: 'summary', index: session.answers.length, queue: session.queue.slice(0, session.answers.length), draft: createDailyDraft(), feedback: null },
  };
}

export function advanceAdaptiveSession(
  progress: DailyProgress, lessons: LearningLesson[], now = Date.now(), random?: () => number,
): DailyProgress {
  const previous = progress.session;
  if (!previous?.adaptive || previous.stage !== 'exercise' || !previous.feedback || previous.answers.length !== previous.index + 1) return progress;
  const next = recordAdaptiveAnswer(progress, lessons, now);
  const session = next.session!;
  const state = learningState(next, lessons);
  let plan = session.adaptive!;
  const answered = session.answers.length;
  const unsettled = plan.focusIds.some(id => needsLearning(state.targets[id]));
  const hadDifficulty = session.answers.some(answer => answer.outcome === 'assisted' || answer.outcome === 'revealed');
  if (answered >= plan.budget && unsettled && hadDifficulty && plan.budget < MAX_ROUND) plan = { ...plan, budget: Math.min(MAX_ROUND, plan.budget + 2) };
  if (answered >= plan.budget || answered >= MAX_ROUND || answered >= 8 && !unsettled) return finishRound(next, lessons, now);
  const used = new Set(session.queue.map(entry => entry.exerciseId));
  const { picked, seed } = pickNext(state, plan, lessons, used, random, session.wordPractice);
  if (!picked) return finishRound(next, lessons, now);
  return {
    ...next, session: {
      ...session, adaptive: { ...plan, seed }, index: answered,
      queue: [...session.queue.slice(0, answered), { exerciseId: picked.exercise.id, retry: false }],
      draft: createDailyDraft(picked.exercise), feedback: null,
    },
  };
}

/** Explicit practice remains a course round until admission; it shares all evidence. */
export function planWordPractice(progress: DailyProgress, lessons: LearningLesson[], ids: string[], now = Date.now()): DailySession | null {
  if (progress.session && progress.session.stage !== 'summary') return null;
  const state = learningState(progress, lessons);
  const focusIds = unique(ids).filter(id => (id.startsWith('daily-word-') || id.startsWith('word-')) && state.targets[id]?.introducedAt).slice(0, 4);
  const source = lessons.find(lesson => lesson.learningTargets.some(id => focusIds.includes(id)));
  if (!source || !focusIds.length) return null;
  const plan: AdaptivePlan = { version: 1, round: state.rounds + 1, sourceLessonId: source.id, focusIds, newIds: [], seed: now >>> 0 || 1, budget: 8 };
  const { picked, seed } = pickNext(state, plan, lessons, new Set(), undefined, true);
  if (!picked) return null;
  return { id: `${now}-word-practice`, lessonId: source.id, mode: 'lesson', stage: 'exercise', startedAt: now,
    queue: [{ exerciseId: picked.exercise.id, retry: false }], index: 0, answers: [], draft: createDailyDraft(picked.exercise), feedback: null,
    adaptive: { ...plan, seed }, wordPractice: true };
}
