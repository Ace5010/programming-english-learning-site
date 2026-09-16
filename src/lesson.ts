import { vocabulary, type VocabularyItem } from './vocabulary';
import {
  createReviewSession, getSkill, summarizeAbility,
  type Outcome, type ReviewProgress, type ReviewQuestion, type ReviewSession, type SpellingLevel,
} from './review';

export type LessonKind = 'meaning' | 'listen' | 'dictation' | 'cloze' | 'pairs';
export interface LessonTask {
  id: string;
  kind: LessonKind;
  words: VocabularyItem[];
  options: VocabularyItem[];
  evidence: ReviewQuestion[];
  sentence?: string;
  retry: boolean;
  difficulty: SpellingLevel;
}
export interface TaskResult { wordId: number; outcome: Outcome }
export interface LessonState {
  id: string;
  items: VocabularyItem[];
  tasks: LessonTask[];
  index: number;
  results: { task: LessonTask; answers: TaskResult[] }[];
  finished: boolean;
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function meaningParts(meaning: string): string[] {
  return meaning.toLowerCase().replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|〔[^〕]*〕/g, '')
    .split(/[；;，,、。\n/]+/).map(part => part.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
}

function meaningsOverlap(left: string, right: string): boolean {
  return meaningParts(left).some(a => meaningParts(right).some(b => {
    if (a.includes(b) || b.includes(a)) return true;
    return (a.match(/[\u4e00-\u9fff]+/g) ?? []).some(phrase =>
      [...phrase].some((_, index) => index + 1 < phrase.length && b.includes(phrase.slice(index, index + 2))));
  }));
}

/** Choose only from the supplied candidates; callers control exposure and scope. */
export function buildLessonOptions(item: VocabularyItem, candidates: VocabularyItem[]): VocabularyItem[] {
  const options = [item];
  const sound = (word: VocabularyItem) => word.phonetic.replace(/[\s/ˈˌ']/g, '').toLowerCase();
  for (const candidate of candidates) {
    if (candidate.meaning.length > 40 || meaningParts(candidate.meaning).length > 3) continue;
    if (options.some(option => option.id === candidate.id || option.word.toLowerCase() === candidate.word.toLowerCase()
      || (sound(option) !== '' && sound(option) === sound(candidate))
      || meaningsOverlap(option.meaning, candidate.meaning))) continue;
    options.push(candidate);
    if (options.length === 3) break;
  }
  return shuffled(options);
}

/** Match literal words/phrases and explicitly annotated uppercase abbreviations. */
export function buildCloze(item: VocabularyItem): string | null {
  const word = item.word.trim();
  if (!word || !item.example.trim()) return null;
  const forms = [word];
  const abbreviation = /^(.*?)\s*\(([A-Z][A-Z0-9+./-]{1,})\)$/.exec(word);
  if (abbreviation?.[1].trim()) forms.push(abbreviation[1].trim(), abbreviation[2]);
  const alternatives = [...new Set(forms)].sort((a, b) => b.length - a.length)
    .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
  const sentence = item.example.replace(pattern, (_match, prefix: string) => `${prefix}____`);
  return sentence === item.example ? null : sentence;
}

function singleTask(
  id: string, item: VocabularyItem, requested: LessonKind, difficulty: SpellingLevel,
  exposed: boolean, candidates: VocabularyItem[], retry = false,
): LessonTask {
  let kind = requested;
  const sentence = kind === 'cloze' ? buildCloze(item) : null;
  if (kind === 'cloze' && !sentence) kind = 'meaning';
  let options = kind === 'dictation' ? [] : buildLessonOptions(item, candidates);
  if (kind !== 'dictation' && options.length < 2) {
    kind = 'dictation';
    options = [];
  }
  const spelling = kind === 'dictation' || kind === 'listen';
  return {
    id, kind, words: [item], options, retry, difficulty,
    evidence: [{ wordId: item.id, ability: spelling ? 'spelling' : 'meaning', level: difficulty, retry, exposed: exposed || kind === 'listen' }],
    ...(kind === 'cloze' && sentence ? { sentence } : {}),
  };
}

export function createLesson(
  pool: VocabularyItem[], progress: ReviewProgress, legacy: Record<string, number>, now = Date.now(),
): LessonState {
  const review = createReviewSession(pool, progress, legacy, now);
  const items = review.items;
  const tasks: LessonTask[] = [];
  const seen = new Set<number>();
  const ids = new Set(items.map(item => item.id));
  const initialOptions = vocabulary.filter(item => !ids.has(item.id) && items.every(selected =>
    item.word.toLowerCase() !== selected.word.toLowerCase() && !meaningsOverlap(item.meaning, selected.meaning)));
  const allOptions = [...pool, ...vocabulary];
  const append = (item: VocabularyItem | undefined, kind: LessonKind, exposed: boolean) => {
    if (!item) return;
    const ability = kind === 'dictation' || kind === 'listen' ? 'spelling' : 'meaning';
    const level = getSkill(progress, item.id, ability).level;
    const difficulty = (kind === 'dictation' && exposed ? Math.min(3, level + 1) : level) as SpellingLevel;
    const candidates = exposed ? allOptions : [...pool.filter(candidate => seen.has(candidate.id)), ...initialOptions];
    tasks.push(singleTask(`${review.id}-${tasks.length}`, item, kind, difficulty, exposed, candidates));
    seen.add(item.id);
  };
  const first = (item: VocabularyItem) => {
    const preferred = review.questions.find(question => question.wordId === item.id && !question.exposed);
    append(item, preferred?.ability === 'spelling' ? 'dictation' : 'meaning', false);
  };
  items.slice(0, 2).forEach(first);
  const remaining = items.slice(2);
  const pairWords: VocabularyItem[] = [];
  for (const item of remaining) {
    if (pairWords.every(other => other.word.toLowerCase() !== item.word.toLowerCase() && !meaningsOverlap(other.meaning, item.meaning))) pairWords.push(item);
  }
  if (pairWords.length >= 2) {
    tasks.push({
      id: `${review.id}-${tasks.length}`, kind: 'pairs', words: pairWords, options: shuffled(pairWords), retry: false, difficulty: 0,
      evidence: pairWords.map(item => ({ wordId: item.id, ability: 'meaning', level: getSkill(progress, item.id, 'meaning').level, retry: false, exposed: false })),
    });
    pairWords.forEach(item => seen.add(item.id));
    remaining.filter(item => !seen.has(item.id)).forEach(first);
  } else remaining.forEach(first);

  const [a, b, c, d, e] = items;
  const followUps: [VocabularyItem | undefined, LessonKind][] = [
    [a, 'listen'], [b, 'cloze'], [c, 'dictation'], [d, 'cloze'], [e, 'dictation'], [a, 'dictation'], [b, 'dictation'],
  ];
  // Ambiguous pair meanings are split safely; trim follow-ups to keep the same
  // bounded lesson length when the first batch then needs more tasks.
  for (const [item, kind] of followUps) if (tasks.length < 10) append(item, kind, true);
  return { id: review.id, items, tasks, index: 0, results: [], finished: tasks.length === 0 };
}

function retryTask(lesson: LessonState, failedTask: LessonTask, wordId: number, id: string): LessonTask {
  const item = lesson.items.find(candidate => candidate.id === wordId)!;
  const evidence = failedTask.evidence.find(candidate => candidate.wordId === wordId)!;
  const spelling = evidence.ability === 'spelling';
  const kind = spelling ? 'dictation' : failedTask.kind === 'cloze' ? 'meaning' : buildCloze(item) ? 'cloze' : 'meaning';
  const difficulty = (spelling ? Math.max(0, failedTask.difficulty - 1) : failedTask.difficulty) as SpellingLevel;
  return singleTask(id, item, kind, difficulty, true, [...lesson.items, ...vocabulary], true);
}

/** All pairs must have individual results before committing the task once. */
export function answerLesson(lesson: LessonState, answers: TaskResult[]): LessonState {
  if (lesson.finished || lesson.results.length > lesson.index) return lesson;
  const task = lesson.tasks[lesson.index];
  if (!task) return lesson;
  const ids = new Set(task.words.map(item => item.id));
  if (answers.length !== ids.size || new Set(answers.map(answer => answer.wordId)).size !== ids.size
    || answers.some(answer => !ids.has(answer.wordId) || !['independent', 'assisted', 'revealed'].includes(answer.outcome))) {
    throw new Error('请为本题每个单词提供且仅提供一条有效结果。');
  }
  const results = [...lesson.results, { task, answers: answers.map(answer => ({ ...answer })) }];
  const tasks = [...lesson.tasks];
  const failures = new Map<number, { task: LessonTask; outcome: Outcome }>();
  const dictationLimits = new Map<number, SpellingLevel>();
  for (const result of results) {
    for (const answer of result.answers) {
      if (answer.outcome === 'independent') continue;
      const evidence = result.task.evidence.find(question => question.wordId === answer.wordId);
      if (evidence?.ability === 'spelling') {
        const easier = Math.max(0, result.task.difficulty - 1) as SpellingLevel;
        dictationLimits.set(answer.wordId, Math.min(dictationLimits.get(answer.wordId) ?? 3, easier) as SpellingLevel);
      }
      if (result.task.retry) continue;
      const previous = failures.get(answer.wordId);
      if (!previous || answer.outcome === 'revealed' || previous.outcome !== 'revealed') {
        failures.set(answer.wordId, { task: result.task, outcome: answer.outcome });
      }
    }
  }
  for (const [wordId, failure] of failures) {
    const existing = tasks.findIndex(candidate => candidate.retry && candidate.words.some(item => item.id === wordId));
    if (existing >= 0) {
      if (existing > lesson.index) tasks[existing] = retryTask(lesson, failure.task, wordId, tasks[existing].id);
      continue;
    }
    const lastPosition = tasks.reduce((position, candidate, index) => candidate.words.some(item => item.id === wordId) ? index : position, -1);
    if (tasks.length >= 15 || tasks.length - lastPosition < 2) continue;
    tasks.push(retryTask(lesson, failure.task, wordId, `${lesson.id}-retry-${wordId}`));
  }
  // Apply help to every remaining attempt, including newly scheduled retries.
  // Keep completed work intact and do not infer spelling trouble from meaning.
  const adjustedTasks = tasks.map((pending, index) => {
    if (index <= lesson.index || pending.kind !== 'dictation') return pending;
    const limit = dictationLimits.get(pending.words[0].id);
    if (limit === undefined || pending.difficulty <= limit) return pending;
    return {
      ...pending,
      difficulty: limit,
      evidence: pending.evidence.map(question => ({ ...question, level: limit })),
    };
  });
  return { ...lesson, tasks: adjustedTasks, results };
}

export function nextLesson(lesson: LessonState): LessonState {
  if (lesson.finished || lesson.results.length <= lesson.index) return lesson;
  const index = lesson.index + 1;
  return { ...lesson, index, finished: index >= lesson.tasks.length };
}

export function summarizeLesson(lesson: LessonState, wordId: number): { meaning: string; spelling: string } {
  const session: ReviewSession = {
    id: lesson.id, items: lesson.items, questions: lesson.tasks.flatMap(task => task.evidence), index: lesson.index, finished: lesson.finished,
    answers: lesson.results.flatMap(result => result.answers.map(answer => ({
      question: result.task.evidence.find(question => question.wordId === answer.wordId)!, outcome: answer.outcome,
    }))),
  };
  const listens = lesson.results.filter(result => result.task.kind === 'listen' && result.answers.some(answer => answer.wordId === wordId));
  const dictated = lesson.results.some(result => result.task.kind === 'dictation' && result.answers.some(answer => answer.wordId === wordId));
  let spelling = summarizeAbility(session, wordId, 'spelling');
  if (listens.length && !dictated) {
    const latest = listens[listens.length - 1].answers.find(answer => answer.wordId === wordId)!;
    spelling = latest.outcome === 'independent' ? '能听音选出单词，完整听写留待后续练习' : '听音辨认仍需练习，完整听写留待后续练习';
  }
  return { meaning: summarizeAbility(session, wordId, 'meaning'), spelling };
}
