/** Written-answer tolerance, separate from speech recognition and pronunciation feedback. */
type Token = { value: string; start: number; end: number }

const contractions: Record<string, string[]> = {
  "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'],
  "i've": ['i', 'have'], "you've": ['you', 'have'], "we've": ['we', 'have'], "they've": ['they', 'have'],
  "i'll": ['i', 'will'], "you'll": ['you', 'will'], "he'll": ['he', 'will'], "she'll": ['she', 'will'],
  "it'll": ['it', 'will'], "we'll": ['we', 'will'], "they'll": ['they', 'will'],
  "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'],
  "isn't": ['is', 'not'], "aren't": ['are', 'not'], "wasn't": ['was', 'not'], "weren't": ['were', 'not'],
  "can't": ['can', 'not'], cannot: ['can', 'not'], "couldn't": ['could', 'not'],
  "won't": ['will', 'not'], "wouldn't": ['would', 'not'], "shouldn't": ['should', 'not'],
  "hasn't": ['has', 'not'], "haven't": ['have', 'not'], "hadn't": ['had', 'not'],
}

const isSubjects = ['he', 'she', 'it', 'that', 'there', 'here', 'what', 'who', 'where', 'how']
const knownContractions = [...Object.keys(contractions).filter(value => value.includes("'")), ...isSubjects.map(value => `${value}'s`), "name's"]

// Unambiguous missing apostrophes can be normalized without a reference sentence.
// Ordinary words such as were and its are handled only while matching the reference.
const missingApostrophes: Record<string, string> = Object.fromEntries([
  "i'm", "you're", "they're", "he's", "she's", "that's", "there's", "here's", "what's", "who's", "where's", "how's",
  "i've", "you've", "we've", "they've", "you'll", "it'll", "they'll",
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "couldn't", "wouldn't", "shouldn't", "hasn't", "haven't", "hadn't",
].map(value => [value.replace("'", ''), value]))

const contextualApostrophes: Record<string, string> = Object.fromEntries([
  "we're", "it's", "we'll", "I'll", "he'll", "she'll", "can't", "won't", "name's",
].map(value => [value.toLowerCase().replace("'", ''), value.toLowerCase()]))

function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
}

function prepare(value: string): string {
  let result = value.normalize('NFKC').toLowerCase().replace(/[’‘ʼ`]/g, "'").replace(/−/g, '-')
  // Dots in a country abbreviation are not decimal points or word separators.
  result = result.replace(/\bu\s*\.\s*s\s*\.\s*a(?:\.(?!\w)|\b)/g, 'usa')
    .replace(/\bu\s*\.\s*s(?:\.(?!\w)|\b)/g, 'us')
    .replace(/\bu\s*\.\s*k(?:\.(?!\w)|\b)/g, 'uk')
  for (const contraction of knownContractions) {
    const [stem, suffix] = contraction.split("'")
    // Both "I 'm" and "I m" keep the contraction attached to its own subject.
    result = result.replace(new RegExp(`\\b${stem}(?:\\s*'\\s*|\\s+)${suffix}\\b`, 'g'), contraction)
  }
  return result
}

function tokens(value: string): Token[] {
  // Keep signs and decimal points: -2, 2, 2.5 and 25 must remain different answers.
  // Other sentence punctuation separates words, never joins them (a part != apart).
  const expression = /[+-]?\p{N}+(?:[.,]\p{N}+)+|[+-]\p{N}+|[\p{L}\p{N}\p{M}]+(?:'[\p{L}\p{N}\p{M}]+)*|[+\-*/=]/gu
  return Array.from(value.matchAll(expression), match => ({ value: ownValue(missingApostrophes, match[0]) ?? match[0], start: match.index!, end: match.index! + match[0].length }))
}

/** Normalize typography and unambiguous missing apostrophes; do not infer sentence meaning. */
export function normalizeWrittenAnswer(value: string): string {
  return tokens(prepare(value)).map(token => token.value).join(' ')
}

function atClauseEnd(words: Token[], index: number, source: string): boolean {
  const next = words[index + 1]
  return !next || /[.!?;:,。！？；：，]/.test(source.slice(words[index].end, next.start)) || /^(and|but|or)$/.test(next.value)
}

function isContext(words: Token[], index: number, source: string): boolean {
  // 's can mean is or has. Limit expansion to the taught A1 predicates, rather than
  // interpreting e.g. "he's read" as "he is read" or altering noun possessives.
  const clause: string[] = []
  for (let next = index + 1; next < words.length; next++) {
    if (/[.!?;:,。！？；：，]/.test(source.slice(words[next - 1].end, words[next].start))) break
    if (/^(and|but|or)$/.test(words[next].value)) break
    // A learner may omit sentence punctuation between the same short introductions.
    // Recognize a following subject only after a complete predicate could exist.
    if (next > index + 1 && /^(?:i|you|we|they|he|she|it|this|that|these|those)(?:'(?:m|re|s))?$/.test(words[next].value)) break
    clause.push(words[next].value)
  }
  const predicate = clause.join(' ').replace(/^not /, '')
  return /^(?:not|ben|mia|happy|tired|chinese|japanese|american|a (?:student|teacher|book|pen|bag)|an (?:apple|egg)|from (?:china|japan|the us)|your name|he|she|it|this|that)$/.test(predicate)
}

function expandToken(value: string, words: Token[], index: number, source: string, reference: boolean): string[] {
  let expansion = ownValue(contractions, value)
  if (!expansion && value.endsWith("'s") && isContext(words, index, source)) {
    const subject = value.slice(0, -2)
    if (isSubjects.includes(subject) || (subject === 'name' && /^(my|your|his|her|our|their)$/.test(words[index - 1]?.value ?? ''))) expansion = [subject, 'is']
  }
  // Positive auxiliary contractions cannot stand at the end of a clause:
  // "Yes, I'm" differs from "Yes, I am", while "No, I'm not" remains valid.
  // An explicitly supplied reference is authoritative and also accepts its full form.
  if (expansion && value.includes("'") && expansion[expansion.length - 1] !== 'not' && !reference && atClauseEnd(words, index, source)) return [value]
  return expansion ?? [value]
}

function expanded(value: string, reference: boolean): string {
  const source = prepare(value)
  const words = tokens(source)
  return words.flatMap((word, index) => expandToken(word.value, words, index, source, reference)).join(' ')
}

function matchesReference(actual: string, expected: string[]): boolean {
  const source = prepare(actual)
  const words = tokens(source)
  let positions = new Set([0])
  for (const [index, word] of words.entries()) {
    const alternatives = [expandToken(word.value, words, index, source, false)]
    const contraction = ownValue(contextualApostrophes, word.value)
    if (contraction) {
      const candidate = expandToken(contraction, words, index, source, false)
      if (candidate.length > 1) alternatives.push(candidate)
    }
    // Only an exact sequence at this reference position can consume a candidate.
    // Thus "were teachers" can match "we are teachers", while the past-tense
    // were in "they were teachers" cannot become are, or a missing subject.
    const next = new Set<number>()
    for (const position of positions) {
      for (const alternative of alternatives) {
        if (alternative.every((value, offset) => expected[position + offset] === value)) next.add(position + alternative.length)
      }
    }
    if (!next.size) return false
    positions = next
  }
  return positions.has(expected.length)
}

/** Compare complete written answers without hiding missing words or grammatical changes. */
export function writtenAnswersMatch(actual: string, expected: string): boolean {
  const normalizedActual = normalizeWrittenAnswer(actual)
  const normalizedExpected = normalizeWrittenAnswer(expected)
  if (!normalizedActual || !normalizedExpected) return false
  if (normalizedActual === normalizedExpected) return true
  return matchesReference(actual, expanded(expected, true).split(' '))
}
