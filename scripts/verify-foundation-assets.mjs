import { grammarContrastPhrases } from '../src/foundationSamples.ts';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationPhrases, foundationAlphabet, foundationTopics } from '../src/foundationCourse.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
export function verifyFoundationAssets(folder = resolve(root, 'public/audio/foundation')) {
  const entries = JSON.parse(readFileSync(resolve(root, 'src/foundationAudio.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(resolve(folder, 'neural-manifest.json'), 'utf8'));
  for (const phrase of [...foundationPhrases, ...foundationAlphabet, ...grammarContrastPhrases]) if (!entries.some(entry => entry.text === phrase.en)) throw new Error(`Foundation audio text missing: ${phrase.id}`);
  for (const [voice, name] of [['aria', 'en-US-AriaNeural'], ['guy', 'en-US-GuyNeural']]) {
    if (readdirSync(resolve(folder, voice)).filter(file => file.endsWith('.mp3')).length !== entries.length) throw new Error(`Unexpected foundation recording count: ${voice}`);
    for (const entry of entries) {
      const relative = `${voice}/${entry.id}.mp3`, path = resolve(folder, relative), record = manifest.entries[relative];
      if (!existsSync(path) || !statSync(path).size || !record || record.text !== entry.text || record.voice !== name
        || record.synthesisSha256 !== hash(`${name}\n+0%\n${entry.text}`) || record.fileSha256 !== hash(readFileSync(path))) throw new Error(`Foundation recording mismatch: ${relative}`);
    }
  }
  return { topics: foundationTopics.length, texts: entries.length, audioFiles: entries.length * 2 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('Foundation assets verified:', verifyFoundationAssets());
