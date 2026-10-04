import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { vocabulary } from '../src/vocabulary.ts';
import { dailyPhrases } from '../src/dailyCourse.ts';
import reading from '../src/readingAudio.json' with { type: 'json' };
import foundationEntries from '../src/foundationAudio.json' with { type: 'json' };
// Reading-only tutorials play continuous slow clips and their own word buttons.
// Their additions must not replace existing course pronunciation sources.
const foundation = foundationEntries.filter(item => !item.tutorialOnly);
import { slowReadingUnits } from '../src/slowReadingText.ts';
import { contextualReadings } from '../src/slowPronunciations.ts';

// Case-sensitive explicit pronunciation spellings. Never silently discard technical notation.
export const spokenForms = { '=': 'that is', '+': 'plus', '&': 'and', '3+': 'three plus', 'C++': 'C plus plus', 'C#': 'C sharp', 'Node.js': 'Node dot J S', 'node.js': 'Node dot J S', 'US': 'U S', 'app.json': 'app dot J S O N', 'main.js': 'main dot J S', 'h-e-l-l-o': 'H E L L O' };
export function slowReadingInventory() {
  const texts = [...new Set([...vocabulary.flatMap(x => [x.word, x.example]), ...dailyPhrases.map(x => x.en), ...reading.map(x => x.text), ...foundation.map(x => x.text)])].sort();
  const known = new Map();
  const add = (text, path) => { if (slowReadingUnits(text).length === 1 && !known.has(text)) known.set(text, path); };
  vocabulary.forEach(x => add(x.word, `{voice}/word-${x.id}.mp3`));
  reading.forEach(x => add(x.text, `reading/{voice}/${x.id}.mp3`));
  foundation.forEach(x => add(x.text, `foundation/{voice}/${x.id}.mp3`));
  const tokens = [...new Set(texts.flatMap(text => slowReadingUnits(text).map(x => x.text)))].sort();
  const entries = tokens.map(text => {
    // Sentence-initial capitalization can reuse a lowercase ordinary word; capitals/initialisms cannot.
    const ordinary = /^[A-Z][a-z]+$/.test(text) ? text.toLowerCase() : text;
    const path = spokenForms[text] ? undefined : known.get(text) ?? known.get(ordinary);
    return { text, spoken: spokenForms[text] ?? text, path: path ?? `slow/{voice}/s-${createHash('sha256').update(text).digest('hex').slice(0, 16)}.mp3`, generated: !path };
  });
  for (const item of contextualReadings) entries.push({ ...item, path: `slow/{voice}/s-${createHash('sha256').update(item.text).digest('hex').slice(0,16)}.mp3`, generated: true });
  return { version: 1, texts, entries };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inventory = slowReadingInventory();
  if (process.argv.includes('--write')) writeFileSync(new URL('../src/slowReadingInventory.json', import.meta.url), JSON.stringify(inventory, null, 2) + '\n');
  console.log(JSON.stringify({ texts: inventory.texts.length, tokens: inventory.entries.length, reused: inventory.entries.filter(x => !x.generated).length, missing: inventory.entries.filter(x => x.generated).length, special: inventory.entries.filter(x => !/^[A-Za-z]+(?:'[A-Za-z]+)*$/.test(x.text)).map(x => x.text) }));
}
