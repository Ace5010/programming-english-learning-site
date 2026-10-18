/** Unlike readingWords, this tokenizer must account for every non-punctuation character. */
export function slowReadingUnits(text: string) {
  if (/^\/[^/]+\/$/.test(text.trim())) return [];
  const units: { text: string; pauseMs: number }[] = [];
  const pattern = /[$£€]\d+(?:[.,]\d+)*|\d+(?:[.,:]\d+)+(?:%)?(?![A-Za-z0-9])|[A-Za-z0-9]+(?:['’][A-Za-z]+)*(?:[._/+:=#-][A-Za-z0-9]+)*(?:\+\+?|#|%)?|[^\s]/g;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (/^[A-Za-z0-9$£€=+&]/.test(token)) units.push({ text: token.replace(/’/g, "'"), pauseMs: 300 });
    else if (/^[.!?。！？]$/.test(token)) { if (units.length) units[units.length - 1].pauseMs = 550; }
    else if (!/^[,;:，；：…“”"'‘’()[\]{}—–\-/]$/.test(token)) throw new Error(`Unmapped spoken character ${token} in ${text}`);
  }
  if (units.length) units[units.length - 1].pauseMs = 0;
  return units;
}
