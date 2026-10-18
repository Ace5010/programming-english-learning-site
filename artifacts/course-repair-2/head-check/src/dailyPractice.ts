import { dailyUnits, dailyPhrases, type DailyExercise, type DailyLesson, type DailyPhrase, type DailyUnit } from './dailyCourse.ts';
import type { LearningExercise, LearningLesson } from './learningTypes.ts';
import { normalizeWrittenAnswer, writtenAnswersMatch } from './writtenAnswer.ts';
import { sentenceVariants } from './courseVariants.ts';
import { dailyWordTargets, wordsForPhrase } from './dailyWordTargets.ts';

export type AdaptiveDailyExercise = LearningExercise & {
  knowledgeIds: string[];
  learningDifficulty: 'recognition' | 'context' | 'recall';
  learningSignature: string;
};
export type AdaptiveDailyLesson = LearningLesson & {
  exercises: AdaptiveDailyExercise[];
  rechecks: AdaptiveDailyExercise[];
  practice: AdaptiveDailyExercise[];
  learningGoal: 'communication';
};
export type AdaptiveDailyUnit = Omit<DailyUnit, 'lessons'> & { lessons: AdaptiveDailyLesson[] };

const byId = new Map(dailyPhrases.map(phrase => [phrase.id, phrase]));
const normalizedMeaning = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
// Different natural translations can express the same message. Do not make a
// learner choose between two valid greetings, farewells or self-introductions.
const equivalentGroups = [
  ['hello', 'hi'], ['goodbye', 'bye'],
  ['i-am-ben', 'im-ben', 'my-name-is-ben'],
  ['i-am-mia', 'im-mia', 'my-name-is-mia'],
];
function equivalent(left: DailyPhrase, right: DailyPhrase): boolean {
  return normalizedMeaning(left.zh) === normalizedMeaning(right.zh)
    || writtenAnswersMatch(left.en, right.en) || writtenAnswersMatch(right.en, left.en)
    || equivalentGroups.some(group => group.includes(left.id) && group.includes(right.id));
}
function hash(text: string): number {
  let result = 2166136261;
  for (const character of text) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result;
}
function arranged<T>(values: T[], seed: string): T[] {
  return values.map((value, index) => ({ value, index, rank: hash(`${seed}:${index}`) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index).map(item => item.value);
}
function choicesFor(phrase: DailyPhrase, taught: DailyPhrase[]): DailyPhrase[] {
  const choices = [phrase];
  // Nearby, already introduced expressions are easier to compare than unrelated
  // future sentences. Two distinct meanings suffice in the first greeting lesson.
  for (const candidate of taught) {
    if (choices.some(other => equivalent(candidate, other))) continue;
    choices.push(candidate);
    if (choices.length === 3) break;
  }
  if (choices.length < 2) throw new Error(`Daily phrase has no distinct taught alternative: ${phrase.id}`);
  return choices;
}

const partialAnswerTargets: Record<string, string> = {
  // This original item asks for the article+noun, not the complete recorded line.
  'A1-04-02-e01': 'it-is-an-apple',
};
function originalTarget(task: DailyExercise, taught: DailyPhrase[]): string[] {
  if (task.kind === 'speak' && task.readAloud?.length) {
    const targets = [...new Set(task.readAloud.map(phrase => phrase.id))];
    if (targets.some(id => !taught.some(phrase => phrase.id === id))) throw new Error(`Untaught daily speaking target: ${task.id}`);
    return targets;
  }
  if (task.audioId) {
    if (!taught.some(phrase => phrase.id === task.audioId)) throw new Error(`Untaught daily audio target: ${task.id}`);
    return [task.audioId];
  }
  const exact = taught.find(phrase => task.answers?.some(answer =>
    normalizeWrittenAnswer(answer) === normalizeWrittenAnswer(phrase.en)
    || normalizedMeaning(answer) === normalizedMeaning(phrase.zh)));
  if (exact) return [exact.id];
  const explicit = partialAnswerTargets[task.id];
  if (explicit && taught.some(phrase => phrase.id === explicit)) return [explicit];
  // Fail closed: a broad lesson-level fallback would blame every expression for
  // one incorrect answer and distort adaptive selection and review admission.
  throw new Error(`Daily exercise needs an explicit knowledge target: ${task.id}`);
}
function extendOriginal(task: DailyExercise, taught: DailyPhrase[]): AdaptiveDailyExercise {
  const knowledgeIds = originalTarget(task, taught);
  const phrase = task.audioId ? byId.get(task.audioId) : undefined;
  const literalListening = task.kind === 'listen' && phrase && task.answers?.includes(phrase.en);
  const learningDifficulty = task.kind === 'write' || task.kind === 'speak' ? 'recall'
    : literalListening ? 'recognition' : 'context';
  return { ...task, knowledgeIds, learningDifficulty, learningSignature: `daily:original:${task.id}`, learningContext: `phrase:${knowledgeIds.join(',')}` };
}

type PracticeDraft = Omit<LearningExercise, 'id' | 'knowledgeIds' | 'learningDifficulty' | 'learningSignature'>;
function candidate(lessonId: string, phrase: DailyPhrase, variant: string,
  difficulty: AdaptiveDailyExercise['learningDifficulty'], draft: PracticeDraft): AdaptiveDailyExercise {
  const id = `${lessonId}-p-${phrase.id}-${variant}`;
  return { ...draft, id, knowledgeIds: [phrase.id], learningDifficulty: difficulty,
    // Seeing an identical expression/format again in a later unit is not a new
    // transfer context merely because the surrounding lesson has changed.
    learningSignature: `daily:${phrase.id}:${variant}`, learningContext: `phrase:${phrase.id}`,
    ...(variant === 'letters' ? { recallSupport: true } : {}),
    ...(phrase.id.startsWith('daily-word-') && (variant === 'write' || variant === 'letters') ? { ability: 'spelling', hint: `首字母是 ${phrase.en[0]}，共 ${phrase.en.length} 个字母。` } : {}) };
}

const specificWritingPrompts: Record<string, string> = {
  hello: '写出较长的见面问候词“你好”。',
  hi: '写出较短的见面问候词“嗨”。',
  goodbye: '写出较长的告别词“再见”。',
  bye: '写出较短的告别词“再见”。',
};

function variants(lesson: DailyLesson, phrase: DailyPhrase, taught: DailyPhrase[]): AdaptiveDailyExercise[] {
  const alternatives = choicesFor(phrase, taught);
  const explain = `${phrase.en} 表示“${phrase.zh}”。${phrase.note ?? ''}`;
  const make = (variant: string, difficulty: AdaptiveDailyExercise['learningDifficulty'], draft: PracticeDraft) =>
    candidate(lesson.id, phrase, variant, difficulty, draft);
  const tasks = [
    make('meaning', 'recognition', {
      kind: 'choice', prompt: `这句表达是什么意思？\n${phrase.en}`,
      options: arranged(alternatives.map(item => item.zh), `${phrase.id}:meaning`),
      answers: [phrase.zh], explanation: explain,
    }),
    make('listen', 'recognition', {
      kind: 'listen', audioId: phrase.id, prompt: '听录音，选出听到的完整表达。',
      options: arranged(alternatives.map(item => item.en), `${phrase.id}:listen`),
      answers: [phrase.en], explanation: explain,
    }),
    make('expression', 'context', {
      kind: 'choice', prompt: `下面哪句能表达这个意思？\n${phrase.zh}`,
      options: arranged(alternatives.map(item => item.en), `${phrase.id}:expression`),
      answers: [phrase.en], explanation: explain,
    }),
  ];
  const words = phrase.en.trim().split(/\s+/);
  // Long introductions use sentence blocks, avoiding an overwhelming bank of
  // repeated pronouns and tiny tokens. All blocks come from the recorded text.
  const sentences = phrase.en.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(sentence => sentence.trim()) ?? [];
  const blocks = words.length > 8 && sentences.length > 1 ? sentences : words;
  if (blocks.length >= 2) {
    let options = arranged(blocks, `${phrase.id}:order`);
    if (options.every((value, index) => value === blocks[index])) options = [...options.slice(1), options[0]];
    tasks.push(make('order', 'context', {
      kind: 'order', audioId: phrase.id,
      prompt: `按顺序组成这句表达：\n${phrase.zh}`,
      options, answers: [phrase.en], explanation: explain,
    }));
  } else {
    const match = /^([A-Za-z]{4,})([.!?]*)$/.exec(phrase.en);
    if (match) {
      const split = Math.ceil(match[1].length / 2);
      tasks.push(make('letters', 'context', {
        kind: 'fill', audioId: phrase.id,
        prompt: `补完这个词，前面的字母已经给出：\n${phrase.zh}`,
        parts: [match[1].slice(0, split), match[2]], blanks: [[match[1].slice(split)]], explanation: explain,
      }));
    }
  }
  // The exact phrase is always accepted; established contraction and punctuation
  // tolerance remains in checkDailyAnswer. Same-name introductions also accept
  // the other introductions already taught, but greeting length is specified.
  const acceptable = specificWritingPrompts[phrase.id] ? [phrase.en]
    : [...new Set([phrase.en, ...taught.filter(item => equivalent(phrase, item)).map(item => item.en)])];
  tasks.push(make('write', 'recall', {
    kind: 'write', audioId: phrase.id,
    prompt: specificWritingPrompts[phrase.id] ?? `写出下面的英语表达，可使用合适的缩写：\n${phrase.zh}`,
    answers: acceptable, explanation: explain,
  }));
  for (const { variant, distractor, ...draft } of sentenceVariants(phrase.en, phrase.zh, phrase.id, taught.flatMap(item => item.en.split(/\s+/)))) {
    const source = distractor && taught.find(item => item.en.split(/\s+/).some(word => word.toLowerCase() === distractor.toLowerCase()));
    tasks.push(make(variant, variant === 'order-blocks' ? 'recognition' : 'context', { ...draft, ...(source ? { prerequisiteIds: [source.id] } : {}) }));
  }
  return tasks;
}

function pairVariants(lesson: DailyLesson, taught: DailyPhrase[]): AdaptiveDailyExercise[] {
  const selected: DailyPhrase[] = [];
  for (const phrase of [...lesson.phrases, ...taught]) {
    if (phrase.en.split(/\s+/).length > 7 || selected.some(other => equivalent(phrase, other))) continue;
    selected.push(phrase);
    if (selected.length === 4) break;
  }
  if (selected.length < 3) return [];
  return (['text', 'audio'] as const).map(pairMode => ({ id: `${lesson.id}-p-match-${pairMode}`, kind: 'match', pairMode,
    prompt: pairMode === 'audio' ? '听声音，选择对应的中文。' : '配对英文和中文。', explanation: '配对后读一遍，记住声音、英文和含义。',
    pairs: selected.map(item => ({ id: item.id, en: item.en, zh: item.zh, audioId: item.id })),
    knowledgeIds: selected.map(item => item.id), learningDifficulty: 'recognition', learningSignature: `daily:pairs:${pairMode}:${selected.map(item => item.id).sort().join(',')}`.slice(0, 180) }));
}

const introduced = new Map<string, DailyPhrase>();
export const adaptiveDailyUnits: AdaptiveDailyUnit[] = dailyUnits.map(unit => ({
  ...unit,
  lessons: unit.lessons.map(lesson => {
    for (const phrase of lesson.phrases) introduced.set(phrase.id, phrase);
    const focusWords = dailyWordTargets.filter(word => word.contexts.some(id => lesson.phrases.some(phrase => phrase.id === id)));
    for (const word of focusWords) introduced.set(word.id, word);
    const taught = [...new Map([...lesson.phrases, ...[...introduced.values()].reverse()].map(phrase => [phrase.id, phrase])).values()];
    const exercises = lesson.exercises.map(task => extendOriginal(task, taught));
    const rechecks = lesson.rechecks.map(task => extendOriginal(task, taught));
    return {
      ...lesson, phrases: [...lesson.phrases, ...focusWords], exercises, rechecks,
      learningTargets: [...lesson.phrases.map(phrase => phrase.id), ...focusWords.map(word => word.id)], learningGoal: 'communication',
      // A candidate pool, never a fixed per-phrase repetition quota or checklist.
      practice: [...exercises, ...rechecks, ...[...lesson.phrases, ...focusWords].flatMap(phrase => variants(lesson, phrase, taught)),
        ...lesson.phrases.flatMap(phrase => wordsForPhrase(phrase.id).flatMap(word => {
          const match = new RegExp(`\\b${word.en}\\b`, 'i').exec(phrase.en);
          if (!match) return [];
          const gaps: AdaptiveDailyExercise[] = [false, true].map(audioPrompt => ({
            id: `${lesson.id}-p-${word.id}-${phrase.id}-${audioPrompt ? 'hear' : 'recall'}`,
            kind: 'fill' as const, audioId: phrase.id, audioPrompt,
            prompt: audioPrompt ? '听完整句子，补上重点词。' : `根据中文补上重点词：\n${phrase.zh}`,
            parts: [phrase.en.slice(0, match.index), phrase.en.slice(match.index + match[0].length)], blanks: [[match[0]]],
            explanation: `${phrase.en} 表示“${phrase.zh}”。`, knowledgeIds: [word.id], prerequisiteIds: [phrase.id],
            learningDifficulty: 'recall' as const, learningSignature: `${word.id}:${phrase.id}:${audioPrompt ? 'hear' : 'recall'}`,
            learningContext: `sentence:${phrase.en.toLowerCase()}`,
            ability: audioPrompt ? 'listening' : 'context',
            hint: `重点词的首字母是 ${word.en[0]}。`,
          }));
          const article = phrase.en.indexOf(`a ${word.en}`);
          if (word.chunk && article >= 0) gaps.push({
            id: `${lesson.id}-p-${word.id}-${phrase.id}-chunk`, kind: 'fill', audioId: phrase.id,
            prompt: `补全这句身份表达：\n${phrase.zh}`, parts: [phrase.en.slice(0, article), phrase.en.slice(article + 1)], blanks: [['a']],
            explanation: `${phrase.en} 表示“${phrase.zh}”。单数身份表达保留冠词。`, knowledgeIds: [word.id], prerequisiteIds: [phrase.id],
            ability: 'context', learningDifficulty: 'context', learningSignature: `${word.id}:${phrase.id}:chunk`, learningContext: `chunk:${word.chunk}`,
          });
          return gaps;
        })), ...pairVariants(lesson, taught),
        ...exercises.filter(task => task.kind === 'speak' && task.readAloud?.length).flatMap(task => (['partial', 'hidden'] as const).map(speechSupport => ({
          ...task, id: `${task.id}-${speechSupport}`, speechSupport, prompt: speechSupport === 'partial' ? '听示范，补全遮住的词并说出整句。' : '听示范后，试着复述整句。',
          learningSignature: `${task.learningSignature}:${speechSupport}`,
        })))],
    };
  }),
}));
export const adaptiveDailyLessons = adaptiveDailyUnits.flatMap(unit => unit.lessons);
