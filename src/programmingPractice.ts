import { programmingUnits, type ProgrammingAbility, type ProgrammingExercise, type ProgrammingLesson, type ProgrammingUnit } from './programmingCourse.ts'
import { vocabulary, type VocabularyItem } from './vocabulary.ts'
import type { LearningExercise, LearningLesson } from './learningTypes.ts'

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
  ]
}

const taughtIds = new Set<number>()
function authoredMetadata(exercise: ProgrammingExercise): AdaptiveProgrammingExercise {
  return { ...exercise,
    learningDifficulty: exercise.ability === 'context' ? 'context' : exercise.ability === 'spelling' ? 'recall' : 'recognition',
    learningSignature: `authored:${exercise.id}`,
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
