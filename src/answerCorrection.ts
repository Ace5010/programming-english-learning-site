import { normalizeWrittenAnswer, writtenAnswersMatch } from './writtenAnswer.ts';
import type { DailyDraft, DailyExerciseSpec } from './dailyProgress.ts';

export interface AnswerCorrection {
  original: string;
  fingerprint: string;
  marks: { start: number; end: number }[];
  blanks: number[];
  message: string;
  at: number;
}

export function answerFingerprint(draft: Pick<DailyDraft, 'choice' | 'order' | 'blanks' | 'text'>): string {
  return JSON.stringify([draft.choice, draft.order, draft.blanks.map(normalizeWrittenAnswer), normalizeWrittenAnswer(draft.text)]);
}

/** Align only short, local differences. Empty ranges mark an insertion, never a wrong neighbour. */
function changes(actual: string[], expected: string[]) {
  const costs = Array.from({ length: actual.length + 1 }, (_, i) => Array.from({ length: expected.length + 1 }, (_, j) => i ? j ? 0 : i : j));
  for (let i = 1; i <= actual.length; i++) for (let j = 1; j <= expected.length; j++) {
    costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1, costs[i - 1][j - 1] + Number(actual[i - 1] !== expected[j - 1]));
  }
  const positions: { start: number; end: number }[] = [];
  let i = actual.length, j = expected.length;
  while (i || j) {
    if (i && j && actual[i - 1] === expected[j - 1]) { i--; j--; }
    else if (i && j && costs[i][j] === costs[i - 1][j - 1] + 1) { positions.push({ start: i - 1, end: i }); i--; j--; }
    else if (i && costs[i][j] === costs[i - 1][j] + 1) { positions.push({ start: i - 1, end: i }); i--; }
    else { positions.push({ start: i, end: i }); j--; }
  }
  return { distance: costs[actual.length][expected.length], positions: positions.reverse() };
}

export function localAnswerCorrection(actual: string, alternatives: string[]): Pick<AnswerCorrection, 'original' | 'marks' | 'message'> | null {
  if (!actual.trim() || alternatives.some(expected => writtenAnswersMatch(actual, expected))) return null;
  const tokens = [...actual.matchAll(/\S+/g)];
  if (actual.length > 240 || tokens.length > 18) return null;
  const candidates = alternatives.flatMap(expected => {
    const reference = expected.trim().split(/\s+/);
    const actualWord = actual.match(/^(\s*)([a-z]+)[.!?,;:]*\s*$/i), expectedWord = expected.match(/^\s*([a-z]+)[.!?,;:]*\s*$/i);
    if (actualWord && expectedWord) {
      const value = actualWord[2].toLowerCase(), target = expectedWord[1].toLowerCase();
      const diff = changes([...value], [...target]);
      if (!diff.distance || diff.distance > 2 || diff.distance > Math.max(value.length, target.length) * 0.5) return [];
      const offset = actualWord[1].length;
      return [{ distance: diff.distance, original: actual, marks: diff.positions.map(mark => ({ start: mark.start + offset, end: mark.end + offset })), message: target === value + 's' ? '检查词尾的单复数，再修改一次。' : '标记处的字母需要调整，再修改一次。' }];
    }
    if (tokens.length < 2 || reference.length < 2) return [];
    const diff = changes(tokens.map(token => normalizeWrittenAnswer(token[0])), reference.map(normalizeWrittenAnswer));
    if (!diff.distance || diff.distance > 2 || diff.distance > Math.max(tokens.length, reference.length) * 0.5) return [];
    const marks = diff.positions.map(({ start, end }) => ({
      start: tokens[start]?.index ?? actual.length,
      end: end === start ? tokens[start]?.index ?? actual.length : (tokens[end - 1].index! + tokens[end - 1][0].length),
    }));
    return [{ distance: diff.distance, original: actual, marks, message: '检查标记处的用词或顺序，再修改一次。' }];
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
}

export function prepareAnswerCorrection(exercise: DailyExerciseSpec, draft: DailyDraft, now: number): AnswerCorrection | null {
  if (draft.correction || draft.revealed || !['fill', 'write', 'order'].includes(exercise.kind)) return null;
  const fingerprint = answerFingerprint(draft);
  if (exercise.kind === 'fill') {
    const wrong = (exercise.blanks ?? []).flatMap((answers, index) => answers.some(answer => writtenAnswersMatch(draft.blanks[index] ?? '', answer)) ? [] : [index]);
    if (!wrong.length || wrong.length > 2) return null;
    const local = wrong.length === 1 ? localAnswerCorrection(draft.blanks[wrong[0]], exercise.blanks![wrong[0]]) : null;
    if (wrong.length === exercise.blanks?.length && !local) return null;
    return { original: local?.original ?? draft.blanks.join(' / '), marks: local?.marks ?? [], message: local?.message ?? '标记的空格还需要调整，再修改一次。', blanks: wrong, fingerprint, at: now };
  }
  const actual = exercise.kind === 'order' ? draft.order.map(index => exercise.options?.[index] ?? '').join(' ') : draft.text;
  const local = localAnswerCorrection(actual, exercise.answers ?? []);
  return local ? { ...local, blanks: [], fingerprint, at: now } : null;
}
