import { vocabulary } from './vocabulary.ts';
import type { DailyProgress, DailyLessonSpec } from './dailyProgress.ts';
import { enrollWord, parseReviewProgress, serializeReviewProgress, updateReviewProgress, getSkill, REVIEW_KEY, type Ability, type ReviewProgress } from './review.ts';

export const PROGRAMMING_COURSE_KEY = 'codewords-programming-course-v1';
const validIds = new Set(vocabulary.map(word => word.id));
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
type MappedLesson = DailyLessonSpec & { wordIds: number[]; exercises: MappedExercise[]; rechecks: MappedExercise[]; practice?: MappedExercise[] };
type MappedExercise = DailyLessonSpec['exercises'][number] & { wordIds: number[]; ability: Ability };

/** Reading never changes the historical self-confirmed set. Enrollment is additive. */
export function initializeProgrammingReview(storage: Storage, now = Date.now()): ReviewProgress {
  const raw = storage.getItem(REVIEW_KEY);
  let progress = parseReviewProgress(raw);
  const old: unknown = JSON.parse(storage.getItem('codewords-mastered') ?? '[]');
  if (!Array.isArray(old) || old.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('旧学习标记无法读取，原记录已保留，请先导出记录。');
  for (const id of new Set([...old as number[], ...Object.keys(progress).map(Number)])) {
    if (validIds.has(id)) progress = enrollWord(progress, id, 'legacy', now);
  }
  const next = serializeReviewProgress(progress);
  if (next !== raw && Object.keys(progress).length) {
    if (storage.getItem(REVIEW_KEY) !== raw) throw new Error('另一页面更新了复习记录，请刷新后继续。');
    storage.setItem(REVIEW_KEY, next);
  }
  return progress;
}

/** Replay saved course evidence safely after reload; teaching never counts as an answer. */
export function mergeProgrammingCourse(progress: ReviewProgress, course: DailyProgress, lessons: MappedLesson[], now = Date.now()): ReviewProgress {
  let next = progress;
  const register = (wordId: number, at: number) => {
    next = enrollWord(next, wordId, 'course', at);
    const target = course.learning?.targets[`word-${wordId}`];
    if (!course.learning || next[wordId].source === 'legacy') return;
    const previousReady = next[wordId].reviewReadyAt;
    const readyAt = target?.readyAt ?? previousReady ?? 0;
    if (previousReady === readyAt) return;
    let word = { ...next[wordId], reviewReadyAt: readyAt };
    if (readyAt > 0 && !previousReady) {
      // Starting long-term review is separate from the earlier teaching events.
      const tomorrow = new Date(readyAt); tomorrow.setDate(tomorrow.getDate() + 1);
      word = { ...word, ...Object.fromEntries((['meaning', 'context', 'spelling', 'listening'] as const)
        .map(ability => [ability, { ...getSkill(next, wordId, ability), dueAt: tomorrow.getTime(), intervalDays: 1 }])) };
    }
    next = { ...next, [wordId]: word };
  };
  const knowledge = (course as DailyProgress & { knowledge?: Record<string, { firstLearnedAt: number }> }).knowledge ?? {};
  for (const [id, record] of Object.entries(knowledge)) {
    const match = /^(?:word|example)-(\d+)$/.exec(id);
    if (match && validIds.has(Number(match[1]))) register(Number(match[1]), record.firstLearnedAt);
  }
  const session = course.session;
  if (!session || session.stage === 'study') return next;
  const lesson = lessons.find(item => item.id === session.lessonId);
  if (!lesson) return next;
  const sessionWordIds = session.adaptive ? session.adaptive.focusIds.map(id => /^word-(\d+)$/.exec(id)).filter(Boolean).map(match => Number(match![1])) : lesson.wordIds;
  const exercises = session.adaptive ? lessons.flatMap(item => [...item.exercises, ...item.rechecks, ...(item.practice ?? [])]) : [...lesson.exercises, ...lesson.rechecks, ...(lesson.practice ?? [])];
  for (const wordId of sessionWordIds) {
    if (!validIds.has(wordId)) throw new Error('课程词汇引用无效，请保留当前记录。');
    register(wordId, session.startedAt);
  }
  for (let index = 0; index < session.answers.length; index++) {
    const answer = session.answers[index];
    const exercise = exercises.find(item => item.id === answer.exerciseId);
    if (!exercise || answer.outcome === 'self') continue;
    const receipt = `${session.id}:${answer.exerciseId}:${answer.at}`;
    for (const wordId of exercise.wordIds) {
      if (!validIds.has(wordId)) throw new Error('课程练习的词汇引用无效。');
      register(wordId, session.startedAt);
      if (next[wordId].courseReceipts?.includes(receipt)) continue;
      const exposed = session.mode === 'lesson' || session.answers.slice(0, index).some(previous => {
        const item = exercises.find(candidate => candidate.id === previous.exerciseId);
        return item?.wordIds.includes(wordId);
      });
      next = updateReviewProgress(next, { wordId, ability: exercise.ability, level: getSkill(next, wordId, exercise.ability).level,
        retry: answer.retry, exposed, kind: exercise.kind, source: session.mode === 'lesson' ? 'course' : 'review' }, answer.outcome, answer.at);
      next = { ...next, [wordId]: { ...next[wordId], courseReceipts: [...(next[wordId].courseReceipts ?? []), receipt] } };
    }
  }
  // A hint is durable even when the learner leaves before submitting an answer.
  if (session.stage === 'exercise' && !session.feedback && session.draft.helped) {
    const entry = session.queue[session.index];
    const exercise = exercises.find(item => item.id === entry?.exerciseId);
    // Recovery may happen days later. Keep the saved event date instead of
    // making a failed synchronization look like a new difficulty today.
    const hintAt = entry && course.lessons[lesson.id]?.errors[entry.retryOf ?? entry.exerciseId]?.lastAt;
    if (exercise) for (const wordId of exercise.wordIds) {
      const receipt = `${session.id}:${exercise.id}:hint`;
      if (next[wordId]?.courseReceipts?.includes(receipt)) continue;
      next = updateReviewProgress(next, { wordId, ability: exercise.ability, level: getSkill(next, wordId, exercise.ability).level,
        retry: false, exposed: true, kind: exercise.kind, source: session.mode === 'lesson' ? 'course' : 'review' }, 'assisted', hintAt ?? now, false);
      next = { ...next, [wordId]: { ...next[wordId], courseReceipts: [...(next[wordId].courseReceipts ?? []), receipt] } };
    }
  }
  return next;
}

/** Compare both source records immediately before committing a review result. */
export function persistProgrammingReviewSnapshot(
  storage: Storage,
  progress: ReviewProgress,
  expectedRaw: string | null,
  legacy?: { raw: string | null; history: Record<string, number> },
): void {
  const updated = serializeReviewProgress(progress);
  const historyKey = 'codewords-quiz-last-tested';
  if (legacy && storage.getItem(historyKey) !== legacy.raw) {
    throw new Error('另一页面更新了复习历史，已停止本页保存。当前练习仍保留在此页面。');
  }
  if (storage.getItem(REVIEW_KEY) !== expectedRaw) {
    throw new Error('另一页面更新了复习记录，已停止本页保存。当前练习仍保留在此页面。');
  }
  storage.setItem(REVIEW_KEY, updated);
  if (legacy) {
    // localStorage has no multi-key transaction. If history changes after the
    // primary save, preserve it and report the partial save instead of replacing it.
    if (storage.getItem(historyKey) !== legacy.raw) {
      throw new Error('复习结果已保存，但另一页面更新了复习历史；已保留较新的历史，停止本页后续保存。');
    }
    storage.setItem(historyKey, JSON.stringify(legacy.history));
  }
}

export function persistProgrammingCourseEvidence(storage: Storage, course: DailyProgress, lessons: MappedLesson[]): ReviewProgress {
  const raw = storage.getItem(REVIEW_KEY);
  const next = mergeProgrammingCourse(parseReviewProgress(raw), course, lessons);
  const updated = serializeReviewProgress(next);
  if (updated !== raw) {
    if (storage.getItem(REVIEW_KEY) !== raw) throw new Error('另一页面更新了词汇复习记录，请刷新后继续。');
    storage.setItem(REVIEW_KEY, updated);
  }
  return next;
}
