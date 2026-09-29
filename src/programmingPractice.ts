import { programmingUnits, type ProgrammingAbility, type ProgrammingExercise, type ProgrammingLesson, type ProgrammingUnit } from './programmingCourse.ts'
import { vocabulary, type VocabularyItem } from './vocabulary.ts'
import type { LearningExercise, LearningLesson } from './learningTypes.ts'
import { sentenceVariants } from './courseVariants.ts'

export type ProgrammingLearningDifficulty = 'recognition' | 'context' | 'recall'
export type AdaptiveProgrammingExercise = ProgrammingExercise & LearningExercise & {
  learningDifficulty: ProgrammingLearningDifficulty
  learningSignature: string
}
export type AdaptiveProgrammingLesson = Omit<ProgrammingLesson, 'exercises' | 'rechecks'> & LearningLesson & {
  exercises: AdaptiveProgrammingExercise[]
  rechecks: AdaptiveProgrammingExercise[]
  /** Available variants, not a checklist that a learner must finish in full. */
  practice: AdaptiveProgrammingExercise[]
  learningTargets: string[]
  learningGoal: 'reading'
}
export type AdaptiveProgrammingUnit = Omit<ProgrammingUnit, 'lessons'> & { lessons: AdaptiveProgrammingLesson[] }

const byId = new Map(vocabulary.map(item => [item.id, item]))
const contextualMeanings: Record<string, string> = {
  repository: '代码仓库', project: '项目', clone: '克隆仓库', fork: '派生仓库',
  checkout: '切换分支', main: '常见的主分支名', commit: '提交或提交记录',
  change: '修改', message: '说明或消息', remote: '远程仓库', origin: '常见的远程仓库名',
  parameter: '形参', argument: '实参', issue: '问题单', 'pull request': '请求合并代码修改',
  bug: '程序缺陷', fail: '失败', pass: '通过', fix: '修复', log: '日志',
}

// These terms may overlap in translation. They are contrasted explicitly in
// authored lessons, never treated as interchangeable automatic distractors.
const similarGroups = [
  ['repository', 'project'], ['clone', 'fork'], ['branch', 'main'],
  ['folder', 'directory'], ['parameter', 'argument'], ['function', 'method'],
  ['error', 'bug'], ['request', 'pull request'], ['build', 'compile'],
  ['change', 'fix'], ['message', 'log'], ['variable', 'constant'],
  ['package', 'dependency', 'module'],
]
const meaning = (item: VocabularyItem) => contextualMeanings[item.word] ?? item.meaning.split(/[；;]/)[0].trim()
const normalize = (value: string) => value.toLocaleLowerCase('en').replace(/[\s\p{P}\p{S}]/gu, '')
const similar = (left: VocabularyItem, right: VocabularyItem) =>
  similarGroups.some(group => group.includes(left.word) && group.includes(right.word)) || normalize(meaning(left)) === normalize(meaning(right))

function hash(value: string): number {
  let state = 2166136261
  for (const char of value) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  return state
}

function arranged(values: string[], seed: string): string[] {
  const options = [...new Map(values.map(value => [normalize(value), value])).values()]
  return options.sort((left, right) => hash(`${seed}:${left}`) - hash(`${seed}:${right}`) || left.localeCompare(right))
}

function alternatives(item: VocabularyItem, taught: VocabularyItem[], seed: string): VocabularyItem[] {
  const candidates = taught.filter(other => other.id !== item.id && !similar(item, other))
    .sort((left, right) => hash(`${seed}:${left.id}`) - hash(`${seed}:${right.id}`) || left.id - right.id)
  const selected: VocabularyItem[] = []
  for (const candidate of candidates) {
    if (selected.some(other => similar(candidate, other))) continue
    selected.push(candidate)
    if (selected.length === 2) return selected
  }
  throw new Error(`Not enough distinct taught alternatives for programming word ${item.word}`)
}

type PracticeDraft = Pick<ProgrammingExercise, 'kind' | 'prompt' | 'explanation'> & Partial<Pick<ProgrammingExercise, 'audioId' | 'options' | 'answers' | 'parts' | 'blanks'>>

function candidate(
  lessonId: string, item: VocabularyItem, variant: string, ability: ProgrammingAbility,
  learningDifficulty: ProgrammingLearningDifficulty, draft: PracticeDraft,
): AdaptiveProgrammingExercise {
  const id = `${lessonId}-p-${item.id}-${variant}`
  return {
    ...draft, id, wordIds: [item.id], knowledgeIds: [`word-${item.id}`], ability, learningDifficulty,
    // The same task in a later integrated lesson is still the same exposure.
    learningSignature: `word-${item.id}:${variant}`,
    learningContext: ['sentence', 'translation', 'cloze', 'recall', 'listen-gap', 'order-blocks', 'order-words', 'free-gap'].includes(variant)
      ? `sentence:${item.example.toLowerCase()}` : `word:${item.id}`,
    ...(variant === 'recall' ? { recallSupport: true } : {}),
    ...(draft.options ? { options: arranged(draft.options, id) } : {}),
  }
}

function practiceForWord(lessonId: string, item: VocabularyItem, taught: VocabularyItem[]): AdaptiveProgrammingExercise[] {
  const ownMeaning = meaning(item)
  const context = item.word === 'main' ? 'Git 分支名称' : item.word === 'origin' ? 'Git 远程仓库名称' : '本课的编程'
  const distractors = (variant: string) => alternatives(item, taught, `${lessonId}:${item.id}:${variant}`)
  const meaningDistractors = distractors('meaning')
  const wordDistractors = distractors('word')
  const listeningDistractors = distractors('listen')
  const sentenceDistractors = distractors('sentence')
  const translationDistractors = distractors('translation')
  const clozeDistractors = distractors('cloze')
  const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(item.example)
  if (!match) throw new Error(`Programming example does not contain its target word: ${item.word}`)
  const before = item.example.slice(0, match.index)
  const after = item.example.slice(match.index + match[0].length)
  const missingWord = match[0]
  const optionWord = (other: VocabularyItem) => match.index === 0 ? other.word[0].toUpperCase() + other.word.slice(1) : other.word
  const sentenceExplanation = `${item.example} 表示“${item.exampleZh}”；${item.word} 在这里表示“${ownMeaning}”。`

  return [
    candidate(lessonId, item, 'free-gap', 'context', 'recall', {
      kind: 'fill', prompt: `根据中文补上重点词：\n${item.exampleZh}`,
      parts: [before, after], blanks: [[missingWord]], explanation: sentenceExplanation,
    }),
    candidate(lessonId, item, 'meaning', 'meaning', 'recognition', {
      kind: 'choice', prompt: `在${context}语境中，${item.word} 表示什么？`,
      options: [ownMeaning, ...meaningDistractors.map(meaning)], answers: [ownMeaning],
      explanation: `${item.word} 在本课表示“${ownMeaning}”。`,
    }),
    candidate(lessonId, item, 'word', 'meaning', 'recognition', {
      kind: 'choice', prompt: `选择本课表示“${ownMeaning}”的英文词或词组。`,
      options: [item.word, ...wordDistractors.map(other => other.word)], answers: [item.word],
      explanation: `“${ownMeaning}”对应 ${item.word}。`,
    }),
    candidate(lessonId, item, 'listen', 'listening', 'recognition', {
      kind: 'listen', audioId: `word-${item.id}`, prompt: '听录音，选出听到的词或词组。',
      options: [item.word, ...listeningDistractors.map(other => other.word)], answers: [item.word],
      explanation: `录音是 ${item.word}，在本课表示“${ownMeaning}”。`,
    }),
    candidate(lessonId, item, 'sentence', 'context', 'context', {
      kind: 'choice', prompt: `阅读这句话，选择对应的意思：\n${item.example}`,
      options: [item.exampleZh, ...sentenceDistractors.map(other => other.exampleZh)], answers: [item.exampleZh],
      explanation: sentenceExplanation,
    }),
    candidate(lessonId, item, 'translation', 'context', 'context', {
      kind: 'choice', prompt: `哪句英文表达了下面的意思？\n${item.exampleZh}`,
      options: [item.example, ...translationDistractors.map(other => other.example)], answers: [item.example],
      explanation: sentenceExplanation,
    }),
    candidate(lessonId, item, 'cloze', 'context', 'context', {
      kind: 'choice', prompt: `根据中文，选择能补完整句子的词或词组：\n${item.exampleZh}\n${before}____${after}`,
      options: [missingWord, ...clozeDistractors.map(optionWord)], answers: [missingWord],
      explanation: sentenceExplanation,
    }),
    candidate(lessonId, item, 'recall', 'spelling', 'recall', {
      kind: 'fill', prompt: `根据中文补完整本课的词或词组，首字母已给出：\n${item.exampleZh}`,
      parts: [`${before}${missingWord[0]}`, after], blanks: [[missingWord.slice(1)]],
      explanation: sentenceExplanation,
    }),
    ...sentenceVariants(item.example, item.exampleZh, `example-${item.id}`, taught.map(word => word.word)).map(({ variant, distractor, ...draft }) => ({
      ...candidate(lessonId, item, variant, draft.audioPrompt ? 'listening' : 'context', variant === 'order-blocks' ? 'recognition' : 'context', draft),
      ...draft,
      // This course records word-level listening: the blank must test that word,
      // rather than whichever surrounding word happens to be longest.
      ...(draft.audioPrompt ? { parts: [before, after], blanks: [[missingWord]] } : {}),
      ...(distractor ? { prerequisiteIds: [`word-${taught.find(word => word.word === distractor)!.id}`] } : {}),
    })),
    ...(['text', 'audio'] as const).map(pairMode => {
      const group = [item, ...meaningDistractors];
      return { id: `${lessonId}-p-${item.id}-match-${pairMode}`, kind: 'match' as const, pairMode,
        prompt: pairMode === 'audio' ? '听声音，选择对应的中文。' : '配对英文和中文。', explanation: '配对后读一遍，记住声音、英文和含义。',
        pairs: group.map(word => ({ id: `word-${word.id}`, en: word.word, zh: meaning(word), audioId: `word-${word.id}` })),
        wordIds: group.map(word => word.id), knowledgeIds: group.map(word => `word-${word.id}`), ability: pairMode === 'audio' ? 'listening' as const : 'meaning' as const,
        learningDifficulty: 'recognition' as const, learningSignature: `pairs:${pairMode}:${group.map(word => word.id).sort((a, b) => a - b).join(',')}` };
    }),
  ]
}

const taughtIds = new Set<number>()
// Code/command contexts have no sentence-final punctuation; keep their authored identity explicit.
const codeContexts: Record<string, string> = {
  'P1-01-03-e02': 'git checkout main',
  'P1-02-02-e02': 'function greet(name) { return name; }',
  'P1-02-02-e03': 'greet("Ben")',
  'P1-02-02-r02': 'function add(a, b); add(2, 3)',
  'P1-02-06-e02': 'function greet(name); greet("Kai")',
}
function authoredMetadata(exercise: ProgrammingExercise): AdaptiveProgrammingExercise {
  const sentence = codeContexts[exercise.id] ?? exercise.prompt.match(/[A-Za-z][A-Za-z0-9 ,'-]*[.!?]/)?.[0];
  return { ...exercise,
    learningDifficulty: exercise.ability === 'context' ? 'context' : exercise.ability === 'spelling' ? 'recall' : 'recognition',
    learningSignature: `authored:${exercise.id}`,
    learningContext: sentence ? `sentence:${sentence.toLowerCase()}` : `phrase:${exercise.knowledgeIds.join(',')}`,
  }
}

export const adaptiveProgrammingUnits: AdaptiveProgrammingUnit[] = programmingUnits.map(unit => ({
  ...unit,
  lessons: unit.lessons.map(lesson => {
    for (const id of lesson.wordIds) taughtIds.add(id)
    const taught = [...taughtIds].map(id => {
      const item = byId.get(id)
      if (!item) throw new Error(`Programming vocabulary ID not found: ${id}`)
      return item
    })
    return {
      ...lesson, learningTargets: lesson.wordIds.map(id => `word-${id}`), learningGoal: 'reading',
      exercises: lesson.exercises.map(authoredMetadata), rechecks: lesson.rechecks.map(authoredMetadata),
      practice: lesson.wordIds.flatMap(id => practiceForWord(lesson.id, byId.get(id)!, taught)),
    }
  }),
}))

export const adaptiveProgrammingLessons = adaptiveProgrammingUnits.flatMap(unit => unit.lessons)
