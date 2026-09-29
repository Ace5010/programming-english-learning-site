import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { vocabulary } from '../src/vocabulary.ts';
import { dailyPhrases } from '../src/dailyCourse.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { readingKey, readingWords, spokenEnglish } from '../src/readingText.ts';

export function readingInventory() {
  const known = new Set([...vocabulary.flatMap(item => [item.word, item.example]), ...dailyPhrases.map(item => item.en)].map(readingKey));
  const texts = new Map();
  const add = text => { const key = readingKey(text); if (key && !known.has(key)) texts.set(key, spokenEnglish(text)); };
  const scan = value => {
    if (typeof value === 'string') { for (const word of readingWords(value)) add(word.text); }
    else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (['title', 'goal', 'en', 'zh', 'note', 'prompt', 'explanation', 'options', 'answers', 'parts', 'sample', 'checks', 'phrases', 'exercises', 'rechecks', 'practice', 'readAloud'].includes(key)) scan(item);
      // Options/tiles can be replayed as a whole without changing a selection.
      if (['options', 'answers'].includes(key) && Array.isArray(item)) item.forEach(add);
    }
  };
  scan([...adaptiveDailyLessons, ...adaptiveProgrammingLessons]);
  return [...texts].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, text]) => ({ id: `read-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`, text }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entries = readingInventory();
  if (process.argv.includes('--write')) {
    writeFileSync(new URL('../src/readingAudio.json', import.meta.url), JSON.stringify(entries, null, 2) + '\n');
    console.log(`Reading inventory: ${entries.length} additional texts, ${entries.length * 2} recordings.`);
  } else process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
}
