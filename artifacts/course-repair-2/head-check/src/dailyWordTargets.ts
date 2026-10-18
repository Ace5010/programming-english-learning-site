import type { DailyPhrase } from './dailyCourse.ts';
import type { DailyExerciseSpec, DailyDraft } from './dailyProgress.ts';
import { normalizeWrittenAnswer } from './writtenAnswer.ts';

/** Authored pilot, not automatic extraction of every word in a sentence. */
export const dailyWordTargets: (DailyPhrase & { contexts: string[]; chunk?: string })[] = [
  { id: 'daily-word-from', en: 'from', zh: '来自', contexts: ['from-china', 'from-japan', 'he-is-from-china', 'she-is-from-japan'], note: '放在身份表达后面，再接来源地点。' },
  { id: 'daily-word-student', en: 'student', zh: '学生', contexts: ['i-am-a-student', 'she-is-a-student', 'is-she-a-student'], chunk: 'a student', note: '说一名学生时，保留前面的 a。' },
  { id: 'daily-word-teacher', en: 'teacher', zh: '老师', contexts: ['i-am-a-teacher', 'he-is-a-teacher'], chunk: 'a teacher', note: '说一名老师时，保留前面的 a。' },
];

export const wordsForPhrase = (id: string) => dailyWordTargets.filter(word => word.contexts.includes(id));

/** Fail closed: only one near-spelling substitution, with every other token intact. */
export function localWordError(task: DailyExerciseSpec, draft: DailyDraft): { id: string; ability: 'spelling' | 'context' } | undefined {
  if (task.kind !== 'write' || !task.answers?.length) return;
  const supplied = normalizeWrittenAnswer(draft.text).split(' ');
  for (const expected of task.answers) {
    const tokens = normalizeWrittenAnswer(expected).split(' ');
    for (const word of dailyWordTargets) {
      const at = tokens.indexOf(word.en);
      if (at < 0) continue;
      if (tokens.length === supplied.length && tokens.every((token, index) => index === at || token === supplied[index])) {
        const wrong = supplied[at];
        // A single substitution/deletion/insertion or adjacent transposition.
        const near = wrong !== word.en && Math.abs(wrong.length - word.en.length) <= 1 && (
          [...word.en].some((_, i) => word.en.slice(0, i) + word.en.slice(i + 1) === wrong)
          || [...wrong].some((_, i) => wrong.slice(0, i) + wrong.slice(i + 1) === word.en)
          || wrong.length === word.en.length && ([...wrong].filter((char, i) => char !== word.en[i]).length === 1
            || [...wrong].some((_, i) => wrong.slice(0, i) + (wrong[i + 1] ?? '') + wrong[i] + wrong.slice(i + 2) === word.en)));
        if (near) return { id: word.id, ability: 'spelling' };
      }
      if (word.chunk && tokens[at - 1] === 'a' && tokens.filter((_, i) => i !== at - 1).join(' ') === supplied.join(' ')) {
        return { id: word.id, ability: 'context' };
      }
    }
  }
}
