import type { LessonState, LessonTask, TaskResult } from './lesson';
import type { AnswerCorrection } from './answerCorrection';
import { vocabulary } from './vocabulary.ts';

export interface ReviewExerciseDraft {
  taskId: string; selected: number | null; input: string; gaps: Record<number, string>; hints: number[]; excluded: number[];
  pairResults: TaskResult[]; pairLeft: number | null; note: string; done: boolean; observed: number[]; pairMistakes: Record<number, number>;
  correction?: Pick<AnswerCorrection, 'original' | 'marks' | 'message'>;
  pairWrong?: { left: number; right: number };
}
export interface ReviewResume {
  version: 1; active: boolean; lesson: LessonState; draft?: ReviewExerciseDraft;
  feedback: { correct: boolean; message: string; answer: string } | null;
}
const KEY = 'codewords-review-session-v1';
const ids = new Set(vocabulary.map(item => item.id));
const integers = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 100 && value.every(item => Number.isInteger(item) && item >= 0);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const shortText = (value: unknown): value is string => typeof value === 'string' && value.length <= 4000;
function validTask(task: LessonTask) {
  const word = (item: typeof vocabulary[number]) => item && ids.has(item.id) && ['word', 'meaning', 'phonetic', 'example', 'exampleZh'].every(key => shortText(item[key as keyof typeof item]));
  return task && shortText(task.id) && ['meaning', 'listen', 'dictation', 'cloze', 'pairs', 'context'].includes(task.kind)
    && Array.isArray(task.words) && task.words.length > 0 && task.words.length <= 5 && task.words.every(word)
    && Array.isArray(task.options) && task.options.length <= 5 && task.options.every(word)
    && [0, 1, 2, 3].includes(task.difficulty) && typeof task.retry === 'boolean'
    && Array.isArray(task.evidence) && task.evidence.length <= 5 && task.evidence.every(item => item && ids.has(item.wordId) && ['meaning', 'context', 'spelling', 'listening'].includes(item.ability) && [0, 1, 2, 3].includes(item.level));
}
const validResults = (answers: TaskResult[]) => Array.isArray(answers) && answers.length <= 5 && answers.every(item => item && ids.has(item.wordId) && ['independent', 'assisted', 'revealed'].includes(item.outcome) && (item.unmeasured === undefined || item.unmeasured === true && item.outcome === 'assisted'));
/** Temporary tab-local drafts do not replace or migrate any long-term learning records. */
export function readReviewSession(): ReviewResume | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as ReviewResume | null;
    const lesson = value?.lesson;
    if (!value || value.version !== 1 || typeof value.active !== 'boolean' || !lesson || typeof lesson.id !== 'string'
      || !Array.isArray(lesson.items) || lesson.items.length < 1 || lesson.items.length > 5 || !lesson.items.every(item => ids.has(item.id))
      || !Array.isArray(lesson.tasks) || lesson.tasks.length > 15 || !lesson.tasks.every(validTask)
      || !Number.isInteger(lesson.index) || lesson.index < 0 || lesson.index > lesson.tasks.length || !Array.isArray(lesson.results)
      || lesson.results.length !== lesson.index + Number(!!value.feedback) || typeof lesson.finished !== 'boolean'
      || !lesson.results.every(item => validTask(item.task) && validResults(item.answers))
      || value.feedback !== null && (!value.feedback || typeof value.feedback.correct !== 'boolean' || !shortText(value.feedback.message) || !shortText(value.feedback.answer))) return;
    const draft = value.draft;
    if (draft && (draft.taskId !== lesson.tasks[lesson.index]?.id || !shortText(draft.input) || !shortText(draft.note) || typeof draft.done !== 'boolean'
      || !record(draft.gaps) || !Object.values(draft.gaps).every(shortText) || !record(draft.pairMistakes)
      || !Object.entries(draft.pairMistakes).every(([id, count]) => ids.has(Number(id)) && Number.isInteger(count) && Number(count) >= 1 && Number(count) <= 2)
      || !integers(draft.hints) || !integers(draft.excluded) || !integers(draft.observed) || !validResults(draft.pairResults)
      || draft.selected !== null && !ids.has(draft.selected) || draft.pairLeft !== null && !ids.has(draft.pairLeft)
      || draft.pairWrong && (!ids.has(draft.pairWrong.left) || !ids.has(draft.pairWrong.right)))) return;
    const correction = draft?.correction;
    if (correction && (!shortText(correction.original) || !shortText(correction.message) || !Array.isArray(correction.marks) || correction.marks.length > 10
      || !correction.marks.every(mark => Number.isInteger(mark.start) && Number.isInteger(mark.end) && mark.start >= 0 && mark.end >= mark.start && mark.end <= correction.original.length))) return;
    return value;
  } catch { return; }
}
export function saveReviewSession(value: ReviewResume): boolean {
  try { sessionStorage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function closeReviewSession() {
  const current = readReviewSession();
  if (current) saveReviewSession({ ...current, active: false });
}
