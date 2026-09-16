/** Text alignment of recognized speech; it does not assess sounds or pronunciation. */
export type SpeechWordStatus = 'matched' | 'missing' | 'different'

export type SpeechTargetWord = {
  text: string
  start: number
  end: number
  status: SpeechWordStatus
  heard: string[]
  missingParts: string[]
}

export type SpeechExtraWord = {
  text: string
  sourceText: string
  status: 'extra'
  /** Insert before this targetWords index, or at the end when equal to totalCount. */
  beforeTargetIndex: number
}

export type SpeechComparison = {
  targetWords: SpeechTargetWord[]
  extras: SpeechExtraWord[]
  matchedCount: number
  totalCount: number
  allMatched: boolean
}

type Word = { text: string; start: number; end: number; normalized: string }
type Part = { value: string; wordIndex: number }
type Operation = { kind: 'matched' | 'different' | 'missing' | 'extra'; expected: number; heard: number }

const contractions: Record<string, string[]> = {
  "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'],
  "he's": ['he', 'is'], "she's": ['she', 'is'], "it's": ['it', 'is'], "that's": ['that', 'is'],
  "there's": ['there', 'is'], "here's": ['here', 'is'], "what's": ['what', 'is'],
  "who's": ['who', 'is'], "where's": ['where', 'is'], "how's": ['how', 'is'],
  "i've": ['i', 'have'], "you've": ['you', 'have'], "we've": ['we', 'have'], "they've": ['they', 'have'],
  "i'll": ['i', 'will'], "you'll": ['you', 'will'], "he'll": ['he', 'will'], "she'll": ['she', 'will'],
  "it'll": ['it', 'will'], "we'll": ['we', 'will'], "they'll": ['they', 'will'],
  "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'],
  "isn't": ['is', 'not'], "aren't": ['are', 'not'], "wasn't": ['was', 'not'], "weren't": ['were', 'not'],
  "can't": ['can', 'not'], cannot: ['can', 'not'], "couldn't": ['could', 'not'],
  "won't": ['will', 'not'], "wouldn't": ['would', 'not'], "shouldn't": ['should', 'not'],
  "hasn't": ['has', 'not'], "haven't": ['have', 'not'], "hadn't": ['had', 'not'],
  "let's": ['let', 'us'],
}
const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function readWords(text: string): Word[] {
  // Keep apostrophes inside words and keep decimal/grouped numbers intact. In particular,
  // "well" cannot become "we'll", "a part" cannot become "apart", and 2.5 cannot become 25.
  const expression = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’‘ʼ＇][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu
  return Array.from(text.matchAll(expression), match => ({
    text: match[0], start: match.index!, end: match.index! + match[0].length,
    normalized: match[0].normalize('NFKC').toLowerCase().replace(/[’‘ʼ＇]/g, "'"),
  }))
}

function expand(words: Word[]): Part[] {
  return words.flatMap((word, wordIndex) => {
    let values = Object.prototype.hasOwnProperty.call(contractions, word.normalized) ? contractions[word.normalized] : undefined
    // This A1 introduction is an is-contraction; other possessives remain intact.
    // Ambiguous 'd and general noun's contractions are deliberately not guessed.
    if (word.normalized === "name's" && /^(my|your|his|her|our|their)$/.test(words[wordIndex - 1]?.normalized ?? '')) {
      values = ['name', 'is']
    }
    if (!values && /^(0|[1-9]\d?)$/.test(word.normalized)) {
      const value = Number(word.normalized)
      values = value < 20 ? [smallNumbers[value]] : [tens[Math.floor(value / 10)], ...(value % 10 ? [smallNumbers[value % 10]] : [])]
    }
    if (word.normalized === '100') values = ['one', 'hundred']
    return (values ?? [word.normalized]).map(value => ({ value, wordIndex }))
  })
}

function align(expected: Part[], heard: Part[]): Operation[] {
  const width = heard.length + 1
  const cost = new Uint32Array((expected.length + 1) * width)
  const matches = new Uint32Array(cost.length)
  // Tie-break equal edit distances by keeping as many exact words as possible.
  const directions = new Uint8Array(cost.length) // 1 diagonal, 2 missing, 3 extra
  for (let i = 1; i <= expected.length; i++) { cost[i * width] = i; directions[i * width] = 2 }
  for (let j = 1; j <= heard.length; j++) { cost[j] = j; directions[j] = 3 }
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= heard.length; j++) {
      const index = i * width + j
      const same = expected[i - 1].value === heard[j - 1].value
      const diagonal = index - width - 1
      let bestCost = cost[diagonal] + (same ? 0 : 1)
      let bestMatches = matches[diagonal] + (same ? 1 : 0)
      let direction = 1
      for (const [previous, candidateDirection] of [[index - width, 2], [index - 1, 3]]) {
        const candidateCost = cost[previous] + 1
        if (candidateCost < bestCost || (candidateCost === bestCost && matches[previous] > bestMatches)) {
          bestCost = candidateCost
          bestMatches = matches[previous]
          direction = candidateDirection
        }
      }
      cost[index] = bestCost
      matches[index] = bestMatches
      directions[index] = direction
    }
  }
  const operations: Operation[] = []
  let i = expected.length
  let j = heard.length
  while (i || j) {
    const direction = directions[i * width + j]
    if (direction === 1) {
      i--; j--
      operations.push({ kind: expected[i].value === heard[j].value ? 'matched' : 'different', expected: i, heard: j })
    } else if (direction === 2) {
      i--
      operations.push({ kind: 'missing', expected: i, heard: j })
    } else {
      j--
      operations.push({ kind: 'extra', expected: i, heard: j })
    }
  }
  return operations.reverse()
}

/**
 * Compare a fixed read-aloud target with a recognizer's transcript. Case and punctuation
 * do not affect matching; common A1 contractions and integers 0–100 are expanded.
 * The is/has and would/had ambiguities are not inferred from sentence meaning.
 */
export function compareSpeech(expectedText: string, transcript: string): SpeechComparison {
  const words = readWords(expectedText)
  const spokenWords = readWords(transcript)
  const expected = expand(words)
  const heard = expand(spokenWords)
  const operations = align(expected, heard)
  const targetWords: SpeechTargetWord[] = words.map(word => ({
    text: word.text, start: word.start, end: word.end, status: 'matched', heard: [], missingParts: [],
  }))
  const targetHeard = words.map(() => new Set<number>())
  const extraGroups: { wordIndex: number; beforeTargetIndex: number; values: string[] }[] = []
  for (const operation of operations) {
    if (operation.kind === 'extra') {
      const part = heard[operation.heard]
      const beforeTargetIndex = expected[operation.expected]?.wordIndex ?? words.length
      const previous = extraGroups[extraGroups.length - 1]
      if (previous?.wordIndex === part.wordIndex && previous.beforeTargetIndex === beforeTargetIndex) previous.values.push(part.value)
      else extraGroups.push({ wordIndex: part.wordIndex, beforeTargetIndex, values: [part.value] })
      continue
    }
    const part = expected[operation.expected]
    const target = targetWords[part.wordIndex]
    if (operation.kind === 'different') target.status = 'different'
    if (operation.kind === 'missing') {
      if (target.status !== 'different') target.status = 'missing'
      target.missingParts.push(part.value)
    } else targetHeard[part.wordIndex].add(heard[operation.heard].wordIndex)
  }
  targetWords.forEach((target, index) => { target.heard = [...targetHeard[index]].map(heardIndex => spokenWords[heardIndex].text) })
  const extras: SpeechExtraWord[] = extraGroups.map(group => {
    const source = spokenWords[group.wordIndex]
    const entireWord = heard.filter(part => part.wordIndex === group.wordIndex).length === group.values.length
    return { text: entireWord ? source.text : group.values.join(' '), sourceText: source.text, status: 'extra', beforeTargetIndex: group.beforeTargetIndex }
  })
  const matchedCount = targetWords.filter(word => word.status === 'matched').length
  return {
    targetWords, extras, matchedCount, totalCount: targetWords.length,
    allMatched: targetWords.length > 0 && spokenWords.length > 0 && matchedCount === targetWords.length && extras.length === 0,
  }
}
