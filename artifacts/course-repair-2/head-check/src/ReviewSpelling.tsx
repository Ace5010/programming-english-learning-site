/** Spelling normalization and local-correction helpers shared with dictation practice. */

const isLetter = (character: string) => /^[a-z]$/i.test(character);

// Only English letters are practiced. Fixed characters may be omitted; when
// supplied explicitly, they are checked separately against the template.
export function normalizeSpelling(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

export function spellingFixedCharacterError(word: string, answer: string): string | null {
  const fixedByPosition = (value: string) => {
    const fixed: Record<number, string> = {};
    let position = 0;
    for (const character of value) {
      if (isLetter(character)) position++;
      else if (!/\s/.test(character)) fixed[position] = (fixed[position] ?? '') + character;
    }
    return fixed;
  };
  const expected = fixedByPosition(word);
  const supplied = fixedByPosition(answer);
  for (const [position, characters] of Object.entries(supplied)) {
    const template = expected[Number(position)] ?? '';
    let cursor = 0;
    for (const character of characters) {
      const match = template.indexOf(character, cursor);
      if (match < 0) return '字母已对上，但输入的数字或符号与模板不一致。可以省略固定字符，只输入英文字母。';
      cursor = match + 1;
    }
  }
  return null;
}

/** Positions count English letters, rather than punctuation or UTF-16 units. */
export function spellingGapPositions(word: string, mode: 'gap' | 'gaps') {
  const length = normalizeSpelling(word).length;
  if (!length) return [];
  if (mode === 'gap') return [Math.floor(length / 2)];
  const count = Math.min(4, Math.max(1, Math.floor(length / 3)));
  return Array.from({ length: count }, (_, index) => Math.floor((index + 1) * length / (count + 1)));
}

/** Diagnose the first useful correction without disclosing its replacement. */
export function spellingCorrection(word: string, answer: string): string | null {
  const expected = normalizeSpelling(word);
  const actual = normalizeSpelling(answer);
  if (expected === actual) return null;
  let first = 0;
  while (first < Math.min(expected.length, actual.length) && expected[first] === actual[first]) first++;
  if (actual.length === expected.length && first + 1 < expected.length
    && actual[first] === expected[first + 1] && actual[first + 1] === expected[first]
    && actual.slice(first + 2) === expected.slice(first + 2)) {
    return `第 ${first + 1}、${first + 2} 个字母顺序反了，试着交换它们。`;
  }
  if (actual.length === expected.length - 1 && actual.slice(first) === expected.slice(first + 1)) {
    return `第 ${first + 1} 个位置漏了一个字母，其他字母保留。`;
  }
  if (actual.length === expected.length + 1 && actual.slice(first + 1) === expected.slice(first)) {
    return `第 ${first + 1} 个位置多了一个字母，其他字母保留。`;
  }
  if (actual.length < expected.length) {
    return `还少 ${expected.length - actual.length} 个字母，请从第 ${first + 1} 个位置开始检查。`;
  }
  if (actual.length > expected.length) {
    return `多了 ${actual.length - expected.length} 个字母，请从第 ${first + 1} 个位置开始检查。`;
  }
  return `第 ${first + 1} 个字母还需要调整，先试着自己改正。`;
}
