import { grammarContrastPhrases, tutorialExamples } from '../src/foundationSamples.ts';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { foundationTopics, foundationPhrases, foundationAlphabet } from '../src/foundationCourse.ts';
import { readingWords, spokenEnglish } from '../src/readingText.ts';

const texts = new Set([...foundationPhrases, ...foundationAlphabet, ...grammarContrastPhrases].map(item => item.en));
const tutorialTexts = new Set(tutorialExamples.map(item => item.en));
for (const phrase of tutorialExamples) {
  for (const [, part] of phrase.parts ?? []) tutorialTexts.add(part);
  if (phrase.separate) for (const word of phrase.en.replace(/[.,!?]/g, '').split(/\s+/)) tutorialTexts.add(word);
}
for (const item of foundationTopics) {
  const strings = [...item.explanation, ...item.examples.flatMap(p => [p.en, p.note ?? '']), ...item.checks.flat()];
  for (const original of strings) {
    const cleaned = original.replace(/\/[^/]+\//g, '').replace(/‿/g, ' ');
    for (const word of readingWords(cleaned)) texts.add(spokenEnglish(word.text));
  }
}
const historicalTexts = new Set(texts);
// Retain obsolete assets too. Only new tutorial-only text stays outside the
// main courses' word-by-word audio inventory.
for (const entry of JSON.parse(readFileSync(new URL('../src/foundationAudio.json', import.meta.url), 'utf8')).filter(entry => !entry.tutorialOverride)) {
  texts.add(entry.text);
  if (!entry.tutorialOnly && !tutorialTexts.has(entry.text)) historicalTexts.add(entry.text);
}
for (const text of tutorialTexts) texts.add(text);
const entries = [...texts].filter(Boolean).sort().map(text => ({ id: `f-${createHash('sha256').update(text).digest('hex').slice(0, 16)}`, text,
  ...(!historicalTexts.has(text) && tutorialTexts.has(text) ? { tutorialOnly: true,
    ...(/\bread\b/.test(text) ? { ttsText: text.replace(/\bread\b/g, 'reed') } : {}) } : {}) }));
// Neural TTS guesses short read sentences as past tense. The homophone is an
// explicit synthesis-only pronunciation spelling; captions remain read. Keep
// historical recordings untouched and add tutorial variants when necessary.
for (const text of tutorialTexts) if (historicalTexts.has(text) && /\bread\b/.test(text)) entries.push({
  id: `ft-${createHash('sha256').update(text).digest('hex').slice(0, 16)}`, text, ttsText: text.replace(/\bread\b/g, 'reed'), tutorialOnly: true, tutorialOverride: true,
});
writeFileSync(new URL('../src/foundationAudio.json', import.meta.url), JSON.stringify(entries, null, 2) + '\n');
console.log(`${foundationTopics.length} foundation topics; ${entries.length} recording texts.`);
