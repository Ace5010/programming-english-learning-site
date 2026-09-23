import { compareSpeech } from './speechComparison.ts';
import { writtenAnswersMatch } from './writtenAnswer.ts';
import type { AdaptivePlan, LearningState } from './learningTypes';

/** Daily English owns this key only; programming-English records are never migrated. */
export const DAILY_KEY = 'codewords-daily-v1';

export type DailyAbility = 'meaning' | 'listening' | 'writing' | 'speaking';
export type DailyOutcome = 'independent' | 'assisted' | 'revealed' | 'self';
export type DailyMode = 'lesson' | 'review' | 'workbook';
export interface DailyExerciseSpec {
  id: string;
  kind: 'choice' | 'listen' | 'order' | 'fill' | 'write' | 'speak';
  prompt: string;
  explanation: string;
  audioId?: string;
  options?: string[];
  answers?: string[];
  parts?: string[];
  blanks?: string[][];
  sample?: string;
  checks?: string[];
  readAloud?: { id: string; en: string; zh: string }[];
  /** Stable knowledge targets, when an exercise covers more than its audio phrase. */
  knowledgeIds?: string[];
  /** Adapted curricula may distinguish targets that share the same UI kind. */
  ability?: 'meaning' | 'listening' | 'spelling' | 'context';
  learningDifficulty?: 'recognition' | 'context' | 'recall';
  learningSignature?: string;
}
export interface DailyLessonSpec {
  id: string;
  exercises: DailyExerciseSpec[];
  rechecks: DailyExerciseSpec[];
  phrases?: { id: string; en: string; zh: string }[];
  knowledgeIds?: string[];
  practice?: DailyExerciseSpec[];
  learningTargets?: string[];
}
export interface DailySkillProgress {
  attempts: number;
  independentAnswers: number;
  assistedAnswers: number;
  revealedAnswers: number;
  selfReports: number;
  /** Separate-day recall evidence, never a proficiency certificate. */
  successDays: number;
  lastPracticedAt: number;
  lastSuccessDay: string;
  lastDifficultyDay: string;
  dueAt: number;
  needsPractice: boolean;
}
export interface DailyError {
  lastAt: number;
  lastDay: string;
  dueAt: number;
  outcome: 'assisted' | 'revealed';
  resolvedAt: number;
}
export interface DailyLessonProgress {
  completedAt: number;
  lastPracticedAt: number;
  skills: Record<DailyAbility, DailySkillProgress>;
  errors: Record<string, DailyError>;
}
export interface DailyKnowledgeProgress {
  firstLearnedAt: number;
  lessonIds: string[];
  skills: Record<DailyAbility, DailySkillProgress>;
}
export interface DailyDraft {
  choice: string | null;
  order: number[];
  blanks: string[];
  text: string;
  checks: boolean[];
  helped: boolean;
  revealed: boolean;
  /** Optional extension: old drafts remain valid. Audio is never stored here. */
  speech?: { mode: 'read' | 'self'; transcripts: Record<string, string> };
}
export interface DailyQueueEntry {
  exerciseId: string;
  retry: boolean;
  retryOf?: string;
}
export interface DailyAnswer {
  exerciseId: string;
  retry: boolean;
  ability: DailyAbility;
  outcome: DailyOutcome;
  correct: boolean;
  at: number;
}
export interface DailyFeedback {
  correct: boolean;
  outcome: DailyOutcome;
  expected: string[];
  explanation: string;
}
export interface DailySession {
  id: string;
  lessonId: string;
  mode: DailyMode;
  stage: 'study' | 'exercise' | 'summary';
  startedAt: number;
  queue: DailyQueueEntry[];
  index: number;
  answers: DailyAnswer[];
  draft: DailyDraft;
  feedback: DailyFeedback | null;
  /** New focused review queues; absent on historical whole-lesson sessions. */
  focused?: boolean;
  adaptive?: AdaptivePlan;
}
export interface DailyProgress {
  version: 1;
  revision: number;
  lessons: Record<string, DailyLessonProgress>;
  session: DailySession | null;
  /** Optional extensions leave existing course-level evidence intact. */
  knowledge?: Record<string, DailyKnowledgeProgress>;
  favorites?: string[];
  learning?: LearningState;
}
export interface DailyParseResult {
  progress: DailyProgress;
  writable: boolean;
  warning: string;
  /** Retained unchanged for exporting a damaged or newer-version record. */
  raw: string | null;
}

const abilities: DailyAbility[] = ['meaning', 'listening', 'writing', 'speaking'];
const outcomes: DailyOutcome[] = ['independent', 'assisted', 'revealed', 'self'];
const intervals = [1, 3, 7, 14, 30];
const MAX_QUEUE = 100;

function localDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function afterDays(at: number, days: number): number {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function freshSkill(): DailySkillProgress {
  return { attempts: 0, independentAnswers: 0, assistedAnswers: 0, revealedAnswers: 0, selfReports: 0, successDays: 0, lastPracticedAt: 0, lastSuccessDay: '', lastDifficultyDay: '', dueAt: 0, needsPractice: false };
}

function freshSkills(): Record<DailyAbility, DailySkillProgress> {
  return { meaning: freshSkill(), listening: freshSkill(), writing: freshSkill(), speaking: freshSkill() };
}

export function createDailyProgress(): DailyProgress {
  return { version: 1, revision: 0, lessons: {}, session: null };
}

export function getDailyLessonProgress(progress: DailyProgress, lessonId: string): DailyLessonProgress {
  return progress.lessons[lessonId] ?? {
    completedAt: 0,
    lastPracticedAt: 0,
    skills: freshSkills(),
    errors: {},
  };
}

export function dailyExerciseKnowledgeIds(lesson: DailyLessonSpec, exercise: DailyExerciseSpec): string[] {
  if (exercise.knowledgeIds?.length) return [...new Set(exercise.knowledgeIds)];
  if (exercise.audioId) return [exercise.audioId];
  const answers = exercise.answers ?? [];
  const phrases = (lesson.phrases ?? []).filter(phrase => answers.some(answer =>
    normalizeDailyAnswer(answer) === normalizeDailyAnswer(phrase.en) || normalizeDailyAnswer(answer) === normalizeDailyAnswer(phrase.zh)));
  return phrases.length ? phrases.map(phrase => phrase.id) : [`question-${exercise.id}`];
}

/** Confirming the teaching page records exposure, never a correct answer. */
export function learnDailyLesson(progress: DailyProgress, lesson: DailyLessonSpec, now = Date.now()): DailyProgress {
  const knowledge = { ...progress.knowledge };
  const ids = new Set([
    ...(lesson.knowledgeIds ?? []), ...(lesson.phrases ?? []).map(phrase => phrase.id),
    ...lesson.exercises.flatMap(exercise => dailyExerciseKnowledgeIds(lesson, exercise)),
  ]);
  for (const id of ids) {
    const previous = knowledge[id];
    knowledge[id] = previous
      ? { ...previous, lessonIds: [...new Set([...previous.lessonIds, lesson.id])] }
      : { firstLearnedAt: now, lessonIds: [lesson.id], skills: freshSkills() };
  }
  return { ...progress, knowledge };
}

export function dailyLessonLearned(progress: DailyProgress, lesson: DailyLessonSpec): boolean {
  const previous = progress.lessons[lesson.id];
  return !!(previous?.completedAt || previous?.lastPracticedAt
    || Object.values(progress.knowledge ?? {}).some(item => item.lessonIds.includes(lesson.id)));
}

export function dailyKnowledgeReviewable(progress: DailyProgress, id: string): boolean {
  const target = progress.learning?.targets[id];
  return target ? target.readyAt > 0 : !!progress.knowledge?.[id];
}

export function dailyLessonReviewable(progress: DailyProgress, lesson: DailyLessonSpec): boolean {
  if (!progress.learning) return dailyLessonLearned(progress, lesson);
  return [...lesson.exercises, ...(lesson.practice ?? [])].some(exercise => dailyExerciseKnowledgeIds(lesson, exercise)
    .every(id => dailyKnowledgeReviewable(progress, id)));
}

export function nextDailyLesson<T extends DailyLessonSpec>(progress: DailyProgress, lessons: T[]): T | undefined {
  return lessons.find(lesson => !progress.lessons[lesson.id]?.completedAt);
}

function knowledgeDue(item: DailyKnowledgeProgress, now: number, focus: DailyAbility | 'auto' = 'auto'): boolean {
  const observed = abilities.filter(ability => ability !== 'speaking' && (focus === 'auto' || ability === focus) && item.skills[ability].dueAt > 0);
  if (focus === 'speaking') return false;
  return observed.length ? observed.some(ability => item.skills[ability].dueAt <= now) : afterDays(item.firstLearnedAt, 1) <= now;
}

/** The most useful exercise comes first; mastered-looking abilities do not crowd out weak ones. */
export function createDailyReviewSession(
  progress: DailyProgress, lesson: DailyLessonSpec, focus: DailyAbility | 'auto' = 'auto', now = Date.now(),
): DailySession {
  const record = getDailyLessonProgress(progress, lesson.id);
  const priority = (exercise: DailyExerciseSpec): number => {
    const ability = dailyExerciseAbility(exercise);
    const error = record.errors[exercise.id];
    if (error && !error.resolvedAt) return error.dueAt <= now ? 0 : 1;
    const knowledge = dailyExerciseKnowledgeIds(lesson, exercise).map(id => progress.knowledge?.[id]).filter((item): item is DailyKnowledgeProgress => !!item);
    const skills = knowledge.length ? knowledge.map(item => item.skills[ability]) : [record.skills[ability]];
    if (skills.some(skill => skill.needsPractice)) return 1;
    if (ability !== 'speaking' && skills.some(skill => skill.attempts > 0 && skill.dueAt <= now)) return 2;
    if (ability !== 'speaking' && skills.some(skill => skill.attempts === 0)) return 3;
    return ability === 'speaking' ? 5 : 4;
  };
  let exercises = [...new Map([...lesson.exercises, ...(lesson.practice ?? [])].map(exercise => [exercise.id, exercise])).values()].filter(exercise => (focus === 'auto' || dailyExerciseAbility(exercise) === focus)
    && (!progress.learning || dailyExerciseKnowledgeIds(lesson, exercise).every(id => dailyKnowledgeReviewable(progress, id))));
  exercises = [...exercises].sort((a, b) => priority(a) - priority(b));
  if (focus === 'auto') {
    const urgent = exercises.filter(exercise => priority(exercise) <= 2);
    if (urgent.length) exercises = urgent;
    // A short, targeted round remains available even before the due date.
    exercises = exercises.slice(0, 5);
  }
  return { ...createDailySession({ ...lesson, exercises }, 'review', now), focused: true };
}

export function dailyExerciseAbility(exercise: DailyExerciseSpec): DailyAbility {
  if (exercise.kind === 'listen') return 'listening';
  if (exercise.kind === 'speak') return 'speaking';
  if (exercise.kind === 'write' || exercise.kind === 'fill' || exercise.kind === 'order') return 'writing';
  return 'meaning';
}

export function findDailyExercise(lesson: DailyLessonSpec, id: string): DailyExerciseSpec | undefined {
  return [...lesson.exercises, ...lesson.rechecks, ...(lesson.practice ?? [])].find(exercise => exercise.id === id);
}

export function createDailyDraft(exercise?: DailyExerciseSpec): DailyDraft {
  return {
    choice: null,
    order: [],
    blanks: (exercise?.blanks ?? []).map(() => ''),
    text: '',
    checks: (exercise?.checks ?? []).map(() => false),
    helped: false,
    revealed: false,
  };
}

export function createDailySession(lesson: DailyLessonSpec, mode: DailyMode = 'lesson', now = Date.now()): DailySession {
  if (lesson.exercises.length > MAX_QUEUE - 5) throw new Error('本课题目过多，请将课程拆成小课后再开始。');
  const queue = lesson.exercises.map(exercise => ({ exerciseId: exercise.id, retry: false }));
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    lessonId: lesson.id,
    mode,
    stage: mode === 'lesson' ? 'study' : queue.length ? 'exercise' : 'summary',
    startedAt: now,
    queue,
    index: 0,
    answers: [],
    draft: createDailyDraft(lesson.exercises[0]),
    feedback: null,
  };
}

export function beginDailyExercises(session: DailySession): DailySession {
  return session.stage === 'study' ? { ...session, stage: session.queue.length ? 'exercise' : 'summary' } : session;
}

export function updateDailyDraft(session: DailySession, draft: Partial<DailyDraft>): DailySession {
  if (session.stage !== 'exercise' || session.feedback) return session;
  // Help cannot be revoked by editing a field, navigating back, or rerendering.
  return { ...session, draft: { ...session.draft, ...draft, helped: session.draft.helped || !!draft.helped, revealed: session.draft.revealed || !!draft.revealed } };
}

/** Ignore layout punctuation, but preserve word boundaries and internal apostrophes. */
export function normalizeDailyAnswer(value: string): string {
  return value.normalize('NFKC').replace(/[‘’]/g, "'").toLocaleLowerCase('en-US').trim().replace(/^[\s“”"!?.,;:]+|[\s“”"!?.,;:]+$/g, '').replace(/\s+/g, ' ');
}

function matches(value: string, alternatives: string[]): boolean {
  const normalized = normalizeDailyAnswer(value);
  return !!normalized && alternatives.some(answer => normalizeDailyAnswer(answer) === normalized);
}

export interface DailyAnswerCheck { complete: boolean; correct: boolean; expected: string[] }

export function checkDailyAnswer(exercise: DailyExerciseSpec, draft: DailyDraft): DailyAnswerCheck {
  const expected = exercise.answers?.length ? exercise.answers : exercise.sample ? [exercise.sample] : [];
  if (exercise.kind === 'speak') {
    if (draft.speech?.mode === 'read') {
      const targets = exercise.readAloud ?? [];
      const complete = targets.length > 0 && targets.every(target => compareSpeech(target.en, draft.speech!.transcripts[target.id] ?? '').allMatched);
      return { complete, correct: complete, expected: targets.map(target => target.en) };
    }
    // Self assessment says only that the learner has performed and checked the task.
    const complete = !!draft.text.trim() && (exercise.checks?.length ?? 0) > 0 && draft.checks.length === exercise.checks!.length && draft.checks.every(Boolean);
    return { complete, correct: complete, expected };
  }
  if (exercise.kind === 'fill') {
    const blanks = exercise.blanks ?? [];
    const complete = blanks.length > 0 && draft.blanks.length === blanks.length && draft.blanks.every(value => !!value.trim());
    const hasSentence = exercise.parts?.length === blanks.length + 1;
    const fullSentence = hasSentence
      ? exercise.parts!.map((part, index) => part + (blanks[index]?.[0] ?? '')).join('')
      : blanks.map(answers => answers[0] ?? '').join(' / ');
    const supplied = hasSentence ? exercise.parts!.map((part, index) => part + (draft.blanks[index]?.trim() ?? '')).join('') : '';
    // The fixed words are part of the answer: I + m is an omitted-apostrophe
    // contraction, while a standalone m is not another spelling of am.
    // Course-authored alternatives stay position-specific (e.g. US / USA).
    const matchesSentence = (index: number, prefix: string): boolean => index === blanks.length
      ? writtenAnswersMatch(supplied, prefix + exercise.parts![index])
      : blanks[index].some(answer => matchesSentence(index + 1, prefix + exercise.parts![index] + answer));
    const correct = complete && (hasSentence ? matchesSentence(0, '') : blanks.every((answers, index) => matches(draft.blanks[index], answers)));
    return { complete, correct, expected: [fullSentence] };
  }
  if (exercise.kind === 'order') {
    const options = exercise.options ?? [];
    const indicesValid = draft.order.every(index => Number.isInteger(index) && index >= 0 && index < options.length) && new Set(draft.order).size === draft.order.length;
    const text = draft.order.map(index => options[index] ?? '').join(' ');
    // Some sentences include distractors: the accepted answer, not tile count, is authoritative.
    return { complete: draft.order.length > 0 && indicesValid, correct: indicesValid && expected.some(answer => writtenAnswersMatch(text, answer)), expected };
  }
  const text = exercise.kind === 'choice' || exercise.kind === 'listen' ? draft.choice ?? '' : draft.text;
  const complete = !!text.trim();
  const optionValid = exercise.kind !== 'choice' && exercise.kind !== 'listen' || !!exercise.options?.includes(text);
  return { complete, correct: complete && optionValid && (exercise.kind === 'write' ? expected.some(answer => writtenAnswersMatch(text, answer)) : matches(text, expected)), expected };
}

function difficulty(record: DailyLessonProgress, exercise: DailyExerciseSpec, outcome: 'assisted' | 'revealed', now: number, errorId = exercise.id): DailyLessonProgress {
  const ability = dailyExerciseAbility(exercise);
  if (ability === 'speaking') return record;
  const skill = record.skills[ability];
  const day = localDay(now);
  const previous = record.errors[errorId];
  return {
    ...record,
    lastPracticedAt: now,
    skills: { ...record.skills, [ability]: { ...skill, successDays: 0, needsPractice: true, lastDifficultyDay: day, lastPracticedAt: now, dueAt: afterDays(now, 1) } },
    errors: { ...record.errors, [errorId]: { lastAt: now, lastDay: day, dueAt: afterDays(now, 1), outcome: previous?.lastDay === day && previous.outcome === 'revealed' ? 'revealed' : outcome, resolvedAt: 0 } },
  };
}

function recordKnowledge(
  progress: DailyProgress, lesson: DailyLessonSpec, exercise: DailyExerciseSpec,
  outcome: DailyOutcome, now: number, submitted: boolean,
): Record<string, DailyKnowledgeProgress> {
  const knowledge = { ...progress.knowledge };
  const ability = dailyExerciseAbility(exercise);
  const day = localDay(now);
  for (const id of dailyExerciseKnowledgeIds(lesson, exercise)) {
    const item = knowledge[id] ?? { firstLearnedAt: now, lessonIds: [lesson.id], skills: freshSkills() };
    const previous = item.skills[ability];
    let skill = { ...previous, lastPracticedAt: now };
    if (submitted) {
      skill.attempts++;
      if (outcome === 'independent') skill.independentAnswers++;
      if (outcome === 'assisted') skill.assistedAnswers++;
      if (outcome === 'revealed') skill.revealedAnswers++;
      if (outcome === 'self') skill.selfReports++;
      const session = progress.session;
      const entry = session?.queue[session.index];
      const earlierExposure = session?.answers.some(answer => {
        const task = findDailyExercise(lesson, answer.exerciseId);
        return answer.ability === ability && task && dailyExerciseKnowledgeIds(lesson, task).includes(id);
      });
      const deferred = outcome === 'independent' && session?.mode !== 'lesson' && !entry?.retry && !earlierExposure
        && previous.lastPracticedAt > 0 && localDay(previous.lastPracticedAt) !== day
        && previous.dueAt <= now && previous.lastSuccessDay !== day && previous.lastDifficultyDay !== day;
      if (deferred) {
        const successDays = previous.successDays + 1;
        skill = { ...skill, successDays, lastSuccessDay: day, needsPractice: false, dueAt: afterDays(now, intervals[Math.min(successDays - 1, intervals.length - 1)]) };
      } else if (outcome !== 'self' && !skill.dueAt) skill.dueAt = afterDays(now, 1);
    }
    if (ability !== 'speaking' && (outcome === 'assisted' || outcome === 'revealed')) {
      skill = { ...skill, successDays: 0, needsPractice: true, lastDifficultyDay: day, dueAt: afterDays(now, 1) };
    }
    knowledge[id] = { ...item, lessonIds: [...new Set([...item.lessonIds, lesson.id])], skills: { ...item.skills, [ability]: skill } };
  }
  return knowledge;
}

/** Record help immediately so exiting before Check does not discard a difficulty. */
export function markDailyHelp(progress: DailyProgress, lesson: DailyLessonSpec, reveal = false, now = Date.now()): DailyProgress {
  const session = progress.session;
  if (!session || session.lessonId !== lesson.id || session.stage !== 'exercise' || session.feedback) return progress;
  const entry = session.queue[session.index];
  const exercise = entry && findDailyExercise(lesson, entry.exerciseId);
  if (!exercise || exercise.kind === 'speak') return progress;
  const record = difficulty(getDailyLessonProgress(progress, lesson.id), exercise, reveal ? 'revealed' : 'assisted', now, entry.retryOf ?? exercise.id);
  return { ...progress, knowledge: recordKnowledge(progress, lesson, exercise, reveal ? 'revealed' : 'assisted', now, false), lessons: { ...progress.lessons, [lesson.id]: record }, session: updateDailyDraft(session, { helped: true, revealed: reveal }) };
}

export function submitDailyAnswer(
  progress: DailyProgress,
  lesson: DailyLessonSpec,
  options: { helped?: boolean; reveal?: boolean; self?: boolean } = {},
  now = Date.now(),
): DailyProgress {
  const session = progress.session;
  if (!session || session.lessonId !== lesson.id || session.stage !== 'exercise' || session.feedback || session.answers.length !== session.index) return progress;
  const entry = session.queue[session.index];
  const exercise = entry && findDailyExercise(lesson, entry.exerciseId);
  if (!exercise) return progress;
  const checked = checkDailyAnswer(exercise, session.draft);
  if (!checked.complete && !options.reveal && !session.draft.revealed) return progress;
  // Only genuine speaking tasks use self evidence. A caller cannot bypass a written answer.
  const outcome: DailyOutcome = exercise.kind === 'speak' ? 'self'
    : options.reveal || session.draft.revealed || !checked.correct ? 'revealed'
      : options.helped || session.draft.helped ? 'assisted' : 'independent';
  if (exercise.kind === 'speak' && !checked.complete) return progress;
  const ability = dailyExerciseAbility(exercise);
  let record = getDailyLessonProgress(progress, lesson.id);
  const previous = record.skills[ability];
  const day = localDay(now);
  let skill = { ...previous, attempts: previous.attempts + 1, lastPracticedAt: now };
  if (outcome === 'independent') skill.independentAnswers++;
  if (outcome === 'assisted') skill.assistedAnswers++;
  if (outcome === 'revealed') skill.revealedAnswers++;
  if (outcome === 'self') skill.selfReports++;
  const earlierExposure = session.answers.some(answer => answer.ability === ability);
  const deferred = outcome === 'independent' && session.mode !== 'lesson' && !entry.retry && !earlierExposure
    && previous.lastPracticedAt > 0 && localDay(previous.lastPracticedAt) !== day
    && previous.dueAt <= now && previous.lastSuccessDay !== day && previous.lastDifficultyDay !== day;
  if (deferred) {
    const successDays = previous.successDays + 1;
    skill = { ...skill, successDays, lastSuccessDay: day, needsPractice: false, dueAt: afterDays(now, intervals[Math.min(successDays - 1, intervals.length - 1)]) };
  } else if (outcome !== 'self' && skill.dueAt === 0) {
    skill.dueAt = afterDays(now, 1);
  }
  record = { ...record, lastPracticedAt: now, skills: { ...record.skills, [ability]: skill } };
  if (outcome === 'assisted' || outcome === 'revealed') record = difficulty(record, exercise, outcome, now, entry.retryOf ?? exercise.id);
  const previousError = record.errors[exercise.id];
  const delayedErrorCheck = outcome === 'independent' && session.mode !== 'lesson' && !entry.retry
    && previousError && !previousError.resolvedAt && previousError.lastDay !== day && previousError.dueAt <= now;
  if (delayedErrorCheck) {
    record = { ...record, errors: { ...record.errors, [exercise.id]: { ...previousError, resolvedAt: now } } };
  }
  // A success in one item must not hide another unresolved error in this ability.
  const unresolvedAbility = Object.entries(record.errors).some(([id, error]) => {
    const source = findDailyExercise(lesson, id);
    return !error.resolvedAt && source && dailyExerciseAbility(source) === ability;
  });
  if (unresolvedAbility && !record.skills[ability].needsPractice) {
    record = { ...record, skills: { ...record.skills, [ability]: { ...record.skills[ability], needsPractice: true } } };
  }
  const queue = [...session.queue];
  if (!session.adaptive && (outcome === 'assisted' || outcome === 'revealed') && !entry.retry && queue.length < MAX_QUEUE && queue.filter(item => item.retry).length < 5 && session.index < queue.length - 1) {
    const available = lesson.rechecks.filter(candidate => !queue.some(item => item.exerciseId === candidate.id)
      && (exercise.ability ? candidate.ability === exercise.ability
        && candidate.knowledgeIds?.some(id => exercise.knowledgeIds?.includes(id)) : dailyExerciseAbility(candidate) === ability));
    const variant = available.find(candidate => candidate.kind === exercise.kind) ?? available[0];
    if (variant) queue.push({ exerciseId: variant.id, retry: true, retryOf: exercise.id });
  }
  const answer: DailyAnswer = { exerciseId: exercise.id, retry: entry.retry, ability, outcome, correct: checked.correct, at: now };
  return {
    ...progress,
    knowledge: recordKnowledge(progress, lesson, exercise, outcome, now, true),
    lessons: { ...progress.lessons, [lesson.id]: record },
    session: { ...session, queue, answers: [...session.answers, answer], feedback: { correct: checked.correct, outcome, expected: checked.expected, explanation: exercise.kind === 'speak' && session.draft.speech?.mode === 'read' ? '识别文字已与这组参考表达对应。跟读记录不代表系统已确认发音质量或自由表达能力。' : exercise.explanation } },
  };
}

export function advanceDailySession(progress: DailyProgress, lesson: DailyLessonSpec, now = Date.now()): DailyProgress {
  const session = progress.session;
  if (!session || session.lessonId !== lesson.id || session.stage !== 'exercise' || !session.feedback || session.answers.length !== session.index + 1) return progress;
  const index = session.index + 1;
  const finished = index >= session.queue.length;
  let lessons = progress.lessons;
  if (finished && session.mode === 'lesson') {
    const record = getDailyLessonProgress(progress, lesson.id);
    lessons = { ...lessons, [lesson.id]: { ...record, completedAt: record.completedAt || now } };
  }
  const exercise = session.queue[index] && findDailyExercise(lesson, session.queue[index].exerciseId);
  return { ...progress, lessons, session: { ...session, index, stage: finished ? 'summary' : 'exercise', draft: createDailyDraft(exercise), feedback: null } };
}

export function finishDailySession(progress: DailyProgress): DailyProgress {
  return progress.session?.stage === 'summary' ? { ...progress, session: null } : progress;
}

export function summarizeDailySession(session: DailySession): Record<DailyOutcome | 'total' | 'needsReview', number> {
  return {
    total: session.answers.length,
    independent: session.answers.filter(answer => answer.outcome === 'independent').length,
    assisted: session.answers.filter(answer => answer.outcome === 'assisted').length,
    revealed: session.answers.filter(answer => answer.outcome === 'revealed').length,
    self: session.answers.filter(answer => answer.outcome === 'self').length,
    needsReview: session.answers.filter(answer => answer.outcome === 'assisted' || answer.outcome === 'revealed').length,
  };
}

export function dailyUnresolvedErrors(progress: DailyProgress, lessonId: string): string[] {
  return Object.entries(getDailyLessonProgress(progress, lessonId).errors).filter(([, error]) => !error.resolvedAt).map(([id]) => id);
}

export function dailyReviewErrors(progress: DailyProgress, lesson: DailyLessonSpec, focus: DailyAbility | 'auto' = 'auto'): string[] {
  return dailyUnresolvedErrors(progress, lesson.id).filter(id => {
    const exercise = findDailyExercise(lesson, id);
    return exercise && (focus === 'auto' || dailyExerciseAbility(exercise) === focus)
      && (!progress.learning || dailyExerciseKnowledgeIds(lesson, exercise).every(id => dailyKnowledgeReviewable(progress, id)));
  });
}

export function dueDailyLessons<T extends DailyLessonSpec>(progress: DailyProgress, lessons: T[], now = Date.now(), focus: DailyAbility | 'auto' = 'auto'): T[] {
  return lessons.filter(lesson => {
    const record = progress.lessons[lesson.id];
    const targetIds = new Set([...lesson.exercises, ...(lesson.practice ?? [])].filter(exercise => exercise.kind !== 'speak' && (focus === 'auto' || dailyExerciseAbility(exercise) === focus)).flatMap(exercise => dailyExerciseKnowledgeIds(lesson, exercise)));
    const knowledge = Object.entries(progress.knowledge ?? {}).filter(([id, item]) => targetIds.has(id) && item.lessonIds.includes(lesson.id)
      && (!progress.learning || dailyKnowledgeReviewable(progress, id))).map(([, item]) => item);
    if (progress.learning && !knowledge.length) return false;
    return knowledge.length ? knowledge.some(item => knowledgeDue(item, now, focus))
      : !!record && abilities.some(ability => ability !== 'speaking' && (focus === 'auto' || ability === focus) && record.skills[ability].attempts > 0 && record.skills[ability].dueAt <= now);
  }).sort((a, b) => {
    const left = getDailyLessonProgress(progress, a.id);
    const right = getDailyLessonProgress(progress, b.id);
    const weak = (record: DailyLessonProgress) => abilities.some(ability => record.skills[ability].needsPractice && record.skills[ability].dueAt <= now) ? 0 : 1;
    return weak(left) - weak(right) || left.lastPracticedAt - right.lastPracticedAt || a.id.localeCompare(b.id);
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}
function count(value: unknown): value is number { return number(value) && Number.isInteger(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length <= 10000; }
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 180 && !['__proto__', 'constructor', 'prototype'].includes(value);
}
function day(value: unknown): value is string { return value === '' || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function validSkill(value: unknown): value is DailySkillProgress {
  if (!object(value)) return false;
  return ['attempts', 'independentAnswers', 'assistedAnswers', 'revealedAnswers', 'selfReports', 'successDays'].every(key => count(value[key]))
    && ['lastPracticedAt', 'dueAt'].every(key => number(value[key])) && day(value.lastSuccessDay) && day(value.lastDifficultyDay)
    && typeof value.needsPractice === 'boolean'
    && value.attempts === (value.independentAnswers as number) + (value.assistedAnswers as number) + (value.revealedAnswers as number) + (value.selfReports as number)
    && (value.successDays as number) <= (value.independentAnswers as number);
}
function validRecord(value: unknown): value is DailyLessonProgress {
  if (!object(value) || !number(value.completedAt) || !number(value.lastPracticedAt) || !object(value.skills) || !object(value.errors)) return false;
  const skills = value.skills;
  if (!abilities.every(ability => validSkill(skills[ability])) || Object.keys(value.errors).length > 5000) return false;
  const speaking = skills.speaking as DailySkillProgress;
  if (speaking.independentAnswers || speaking.assistedAnswers || speaking.revealedAnswers || speaking.successDays || speaking.needsPractice || speaking.dueAt) return false;
  if (abilities.some(ability => ability !== 'speaking' && (skills[ability] as DailySkillProgress).selfReports > 0)) return false;
  return Object.entries(value.errors).every(([key, error]) => id(key) && object(error) && number(error.lastAt) && day(error.lastDay) && number(error.dueAt) && number(error.resolvedAt) && ['assisted', 'revealed'].includes(String(error.outcome)));
}
function validKnowledge(value: unknown): value is DailyKnowledgeProgress {
  if (!object(value) || !number(value.firstLearnedAt) || !Array.isArray(value.lessonIds) || !value.lessonIds.length
    || value.lessonIds.length > 10000 || !value.lessonIds.every(id) || new Set(value.lessonIds).size !== value.lessonIds.length || !object(value.skills)) return false;
  return validRecord({ completedAt: 0, lastPracticedAt: 0, skills: value.skills, errors: {} });
}
function validDraft(value: unknown): value is DailyDraft {
  return object(value) && (value.choice === null || text(value.choice)) && Array.isArray(value.order) && value.order.length <= 100 && value.order.every(count)
    && new Set(value.order).size === value.order.length
    && Array.isArray(value.blanks) && value.blanks.length <= 100 && value.blanks.every(text)
    && text(value.text) && Array.isArray(value.checks) && value.checks.length <= 100 && value.checks.every(item => typeof item === 'boolean')
    && typeof value.helped === 'boolean' && typeof value.revealed === 'boolean'
    && (value.speech === undefined || object(value.speech) && ['read', 'self'].includes(String(value.speech.mode))
      && object(value.speech.transcripts) && Object.keys(value.speech.transcripts).length <= 100
      && Object.entries(value.speech.transcripts).every(([key, transcript]) => id(key) && text(transcript)));
}
function validLearning(value: unknown): boolean {
  if (!object(value) || value.version !== 1 || !count(value.turns) || !count(value.rounds) || !object(value.targets)
    || Object.keys(value.targets).length > 50000 || value.lastAnswer !== undefined && !text(value.lastAnswer)) return false;
  const score = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  return Object.entries(value.targets).every(([key, target]) => id(key) && object(target)
    && number(target.introducedAt) && score(target.confidence) && object(target.abilities)
    && Object.entries(target.abilities).every(([ability, value]) => ['meaning', 'context', 'spelling', 'listening', 'writing', 'speaking'].includes(ability) && score(value))
    && count(target.lastSeenTurn) && count(target.lastFailureTurn) && typeof target.transfer === 'boolean'
    && number(target.readyAt) && (target.reviewFeedbackAt === undefined || number(target.reviewFeedbackAt))
    && Array.isArray(target.signatures) && target.signatures.length <= 10000 && target.signatures.every(id));
}
function validAdaptive(value: unknown): boolean {
  if (!object(value) || !Array.isArray(value.focusIds)) return false;
  const focusIds = value.focusIds;
  return object(value) && value.version === 1 && count(value.round) && id(value.sourceLessonId)
    && count(value.seed) && count(value.budget) && value.budget >= 1 && value.budget <= 20
    && Array.isArray(value.focusIds) && value.focusIds.length > 0 && value.focusIds.length <= 20 && value.focusIds.every(id)
    && new Set(value.focusIds).size === value.focusIds.length
    && Array.isArray(value.newIds) && value.newIds.every(key => focusIds.includes(key))
    && new Set(value.newIds).size === value.newIds.length;
}
function validSession(value: unknown, lessons?: DailyLessonSpec[]): value is DailySession {
  if (!object(value) || !id(value.id) || !id(value.lessonId) || !['lesson', 'review', 'workbook'].includes(String(value.mode))
    || !['study', 'exercise', 'summary'].includes(String(value.stage)) || !number(value.startedAt) || !count(value.index)
    || !Array.isArray(value.queue) || value.queue.length > MAX_QUEUE || !Array.isArray(value.answers) || !validDraft(value.draft)
    || value.focused !== undefined && (value.focused !== true || value.mode !== 'review')
    || value.adaptive !== undefined && (!validAdaptive(value.adaptive) || value.mode !== 'lesson')) return false;
  const queue = value.queue;
  if (!queue.every(entry => object(entry) && id(entry.exerciseId) && typeof entry.retry === 'boolean' && (entry.retryOf === undefined || id(entry.retryOf)))) return false;
  if (new Set(queue.map(entry => entry.exerciseId)).size !== queue.length || queue.filter(entry => entry.retry).length > 5) return false;
  if (value.index > queue.length || value.answers.length > queue.length) return false;
  if (!value.answers.every((answer, index) => object(answer) && answer.exerciseId === queue[index]?.exerciseId && answer.retry === queue[index]?.retry
    && abilities.includes(answer.ability as DailyAbility) && outcomes.includes(answer.outcome as DailyOutcome) && typeof answer.correct === 'boolean' && number(answer.at))) return false;
  if (value.feedback !== null && (!object(value.feedback) || typeof value.feedback.correct !== 'boolean' || !outcomes.includes(value.feedback.outcome as DailyOutcome)
    || !Array.isArray(value.feedback.expected) || !value.feedback.expected.every(text) || !text(value.feedback.explanation))) return false;
  if (value.stage === 'study' && (value.mode !== 'lesson' || value.index !== 0 || value.answers.length !== 0 || value.feedback !== null)) return false;
  if (value.stage === 'summary' && (value.index !== queue.length || value.answers.length !== queue.length || value.feedback !== null)) return false;
  if (value.stage === 'exercise' && (value.index >= queue.length || value.answers.length !== value.index + (value.feedback ? 1 : 0))) return false;
  if (value.feedback && (value.answers[value.index]?.outcome !== value.feedback.outcome || value.answers[value.index]?.correct !== value.feedback.correct)) return false;
  if (lessons) {
    const source = lessons.find(candidate => candidate.id === value.lessonId);
    const lesson = source && value.adaptive ? { ...source, exercises: lessons.flatMap(item => [...item.exercises, ...item.rechecks, ...(item.practice ?? [])]), rechecks: [] } : source;
    if (!lesson || !queue.every(entry => findDailyExercise(lesson, entry.exerciseId))) return false;
    const base = queue.filter(entry => !entry.retry);
    if (value.adaptive) {
      const plan = value.adaptive as unknown as AdaptivePlan;
      const targets = new Set(lessons.flatMap(item => item.learningTargets ?? []));
      if (plan.sourceLessonId !== value.lessonId || !plan.focusIds.every(id => targets.has(id)) || !base.length || base.length !== queue.length) return false;
    } else if (value.mode === 'review' && value.focused) {
      if (!base.length || !base.every(entry => [...lesson.exercises, ...(lesson.practice ?? [])].some(exercise => exercise.id === entry.exerciseId))) return false;
    } else if (value.mode === 'workbook') {
      // A focused workbook deliberately keeps an ordered subset of the lesson.
      const positions = base.map(entry => lesson.exercises.findIndex(exercise => exercise.id === entry.exerciseId));
      if (!positions.length || positions.some((position, index) => position < 0 || index > 0 && position <= positions[index - 1])) return false;
    } else if (base.length !== lesson.exercises.length || !base.every((entry, index) => entry.exerciseId === lesson.exercises[index].id)) return false;
    if (queue.some(entry => entry.retry && !lesson.rechecks.some(exercise => exercise.id === entry.exerciseId))) return false;
    if (queue.some(entry => entry.retry && (!entry.retryOf || !lesson.exercises.some(exercise => exercise.id === entry.retryOf)))) return false;
    if (!value.answers.every(answer => {
      const exercise = findDailyExercise(lesson, answer.exerciseId)!;
      return answer.ability === dailyExerciseAbility(exercise) && (exercise.kind === 'speak' ? answer.outcome === 'self' : answer.outcome !== 'self');
    })) return false;
    const exercise = queue[value.index] && findDailyExercise(lesson, queue[value.index].exerciseId);
    if (exercise) {
      if (value.draft.order.some(index => index >= (exercise.options?.length ?? 0))) return false;
      if (value.draft.blanks.length !== (exercise.blanks?.length ?? 0) || value.draft.checks.length !== (exercise.checks?.length ?? 0)) return false;
      if (value.draft.choice !== null && !exercise.options?.includes(value.draft.choice)) return false;
    }
  }
  return true;
}

export function parseDailyProgress(raw: string | null, lessons?: DailyLessonSpec[]): DailyParseResult {
  const fail = (warning: string): DailyParseResult => ({ progress: createDailyProgress(), writable: false, warning, raw });
  if (raw === null) return { progress: createDailyProgress(), writable: true, warning: '', raw };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1) return fail('日常英语记录版本无法读取，原始记录已保留，本页暂不保存。');
    if (!count(value.revision) || !object(value.lessons) || Object.keys(value.lessons).length > 10000
      || !Object.entries(value.lessons).every(([key, record]) => id(key) && validRecord(record))
      || value.knowledge !== undefined && (!object(value.knowledge) || Object.keys(value.knowledge).length > 50000 || !Object.entries(value.knowledge).every(([key, item]) => id(key) && validKnowledge(item)))
      || value.favorites !== undefined && (!Array.isArray(value.favorites) || value.favorites.length > 10000 || !value.favorites.every(id) || new Set(value.favorites).size !== value.favorites.length)
      || value.learning !== undefined && !validLearning(value.learning)
      || value.session !== null && !validSession(value.session, lessons)) return fail('日常英语记录不完整或课程已变化，原始记录已保留，本页暂不保存。');
    return { progress: value as unknown as DailyProgress, writable: true, warning: '', raw };
  } catch {
    return fail('日常英语记录无法解析，原始记录已保留，本页暂不保存。');
  }
}

export interface DailyStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface DailySaveResult { saved: boolean; raw: string | null; progress: DailyProgress; warning: string }

/** Compare the exact previously read value before saving; never erase another tab's newer session. */
export function persistDailyProgress(storage: DailyStorage, progress: DailyProgress, expectedRaw: string | null, storageKey = DAILY_KEY): DailySaveResult {
  try {
    const current = storage.getItem(storageKey);
    if (current !== expectedRaw) return { saved: false, raw: current, progress, warning: '另一页面更新了日常英语记录，已暂停本页保存。请先导出本页记录，再刷新读取最新进度。' };
    if (!parseDailyProgress(current).writable) return { saved: false, raw: current, progress, warning: '已有日常英语记录无法安全读取，原始记录保留，本页暂不保存。' };
    const next = { ...progress, revision: progress.revision + 1 };
    const raw = JSON.stringify(next);
    if (!parseDailyProgress(raw).writable) return { saved: false, raw: current, progress, warning: '当前日常英语记录未通过完整性检查，已保留此前保存。' };
    storage.setItem(storageKey, raw);
    return { saved: true, raw, progress: next, warning: '' };
  } catch {
    return { saved: false, raw: expectedRaw, progress, warning: '浏览器无法保存日常英语进度。本次输入保留在此页面，请先导出记录，恢复存储后再继续。' };
  }
}
