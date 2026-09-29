import { grammarContrastPhrases } from '../src/foundationSamples.ts';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { foundationTopics, foundationPhrases, foundationAlphabet } from '../src/foundationCourse.ts';
import { readingWords, spokenEnglish } from '../src/readingText.ts';

const texts = new Set([...foundationPhrases, ...foundationAlphabet, ...grammarContrastPhrases].map(item => item.en));
for (const item of foundationTopics) {
  const strings = [...item.explanation, ...item.examples.flatMap(p => [p.en, p.note ?? '']), ...item.checks.flat()];
  for (const original of strings) {
    const cleaned = original.replace(/\/[^/]+\//g, '').replace(/‿/g, ' ');
    for (const word of readingWords(cleaned)) texts.add(spokenEnglish(word.text));
  }
}
const entries = [...texts].filter(Boolean).sort().map(text => ({ id: `f-${createHash('sha256').update(text).digest('hex').slice(0, 16)}`, text }));
writeFileSync(new URL('../src/foundationAudio.json', import.meta.url), JSON.stringify(entries, null, 2) + '\n');
console.log(`${foundationTopics.length} foundation topics; ${entries.length} recording texts.`);
