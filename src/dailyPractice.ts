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
  return { ...task, knowledgeIds, learningDifficulty, learningSignature: `daily:original:${task.id}`, learningContext: `phrase:${knowledgeIds.join(',')}`,
    ...(task.kind === 'speak' ? { speechExposureIds: [...new Set((task.readAloud ?? []).flatMap(phrase => [phrase.id, ...wordsForPhrase(phrase.id).map(word => word.id)]))] } : {}) };
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
const oralQuestions: Record<string, string> = {
  hello: 'hello', hi: 'hello', goodbye: 'goodbye', bye: 'goodbye',
  'i-am-ben': 'whats-your-name', 'im-ben': 'whats-your-name', 'my-name-is-ben': 'whats-your-name',
  'i-am-mia': 'whats-your-name', 'im-mia': 'whats-your-name', 'my-name-is-mia': 'whats-your-name',
  'from-china': 'where-are-you-from', 'from-japan': 'where-are-you-from', 'from-the-us': 'where-are-you-from',
  'yes-i-am': 'are-you-ben', 'no-im-ben': 'are-you-mia', 'no-im-mia': 'are-you-ben',
  'he-is-ben': 'who-is-he', 'she-is-mia': 'who-is-she', 'yes-he-is': 'is-he-a-teacher', 'no-she-isnt': 'is-she-a-student',
  'it-is-a-book': 'what-is-it', 'it-is-a-pen': 'what-is-it', 'it-is-a-bag': 'what-is-it',
  'it-is-an-apple': 'what-is-it', 'it-is-an-egg': 'what-is-it', 'this-is-a-book': 'what-is-this',
  'this-is-a-pen': 'what-is-this', 'yes-it-is': 'is-that-a-bag', 'no-it-isnt': 'is-that-a-bag',
};
const oralGlosses: Record<string, string> = {
  i: '我', am: '是', is: '是', are: '是', he: '他', she: '她', we: '我们', they: '他们／它们',
  you: '你', my: '我的', your: '你的', name: '名字', from: '来自', a: '一名／一个', an: '一个', the: '这个／该',
  student: '学生', students: '学生（复数）', teacher: '老师', teachers: '老师（复数）', china: '中国', japan: '日本', us: '美国',
  chinese: '中国人', japanese: '日本人', american: '美国人', happy: '高兴的', tired: '累的', not: '不', no: '不／不是', yes: '是的',
  this: '这个', that: '那个', these: '这些', those: '那些', it: '它', book: '书', books: '书（复数）',
  pen: '笔', pens: '笔（复数）', bag: '包', apple: '苹果', apples: '苹果（复数）', egg: '鸡蛋',
  hello: '你好', hi: '嗨', goodbye: '再见', bye: '再见', where: '哪里', who: '谁', what: '什么', ben: '人名 Ben', mia: '人名 Mia',
};
function oralVariants(lesson: DailyLesson, target: DailyPhrase): AdaptiveDailyExercise[] {
  let phrase = target.id.startsWith('daily-word-') ? byId.get(dailyWordTargets.find(word => word.id === target.id)!.contexts[0])! : target;
  // Ordinary activities contain one short utterance, never an entire dialogue.
  if ((phrase.en.match(/[.!?]/g) ?? []).length > 1) {
    const parts = (phrase.en.match(/[^.!?]+[.!?]/g) ?? []).map(text => text.trim()).reverse();
    const short = parts.map(en => dailyPhrases.find(item => item.en === en)).find(Boolean);
    if (!short) return [];
    phrase = short;
  }
  const question = byId.get(oralQuestions[phrase.id]);
  return (['repeat', 'recall', ...(question && !target.id.startsWith('daily-word-') ? ['answer'] : [])] as ('repeat' | 'recall' | 'answer')[]).map(activity => ({
    id: `${lesson.id}-p-${target.id}-oral-${activity}`, kind: 'speak', ability: 'speaking',
    speechActivity: activity, speechSupport: activity === 'repeat' ? 'full' : activity === 'recall' ? 'partial' : 'hidden',
    knowledgeIds: [target.id], readAloud: [phrase], sample: phrase.en, checks: ['我已核对表达的意思，姓名或来源可以使用自己的内容。'],
    speechExposureIds: [phrase.id, ...wordsForPhrase(phrase.id).map(word => word.id)],
    ...(activity === 'answer' ? { speechQuestion: question, prerequisiteIds: [question!.id], answers: [phrase.en] } : {}),
    supportWords: [...new Set(phrase.en.match(/[A-Za-z]+/g) ?? [])].flatMap(en => oralGlosses[en.toLowerCase()] ? [{ en, zh: oralGlosses[en.toLowerCase()] }] : []),
    prompt: activity === 'repeat' ? '听示范，试着读出这句表达。' : activity === 'recall' ? '根据中文和部分英文提示，说出这句表达。' : '听问题，简短回答。姓名和来源可以换成自己的内容。',
    explanation: `${phrase.en} 表示“${phrase.zh}”。${phrase.note ?? ''}`,
    learningDifficulty: activity === 'repeat' ? 'recognition' : 'recall', learningSignature: `daily:${target.id}:${phrase.id}:oral:${activity}`,
    learningContext: `phrase:${phrase.id}`,
  }));
}
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
        ...[...lesson.phrases, ...focusWords].flatMap(phrase => oralVariants(lesson, phrase)),
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
