import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phonemes, phonemeAudioURL, phonemeAudioPath, phonemicSource } from '../src/phonemeInventory.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
export function verifyPhonemicAssets(folder = resolve(root, 'public/audio/phonemes')) {
  const manifest = JSON.parse(readFileSync(resolve(folder, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (manifest.version !== 1 || manifest.entries.length !== 88 || new Set(manifest.entries.map(item => item.file)).size !== 88) throw new Error('Expected 88 unique phonemic recordings');
  if (readdirSync(resolve(folder, 'uk')).filter(name => name.endsWith('.mp3')).length !== 88) throw new Error('Unexpected phonemic MP3 count');
  let bytes = 0;
  for (const item of phonemes) for (const kind of ['sound', 'word']) {
    const file = phonemeAudioPath(item.id, kind).replace('audio/phonemes/', '');
    const entry = manifest.entries.find(entry => entry.file === file);
    if (!entry || entry.id !== item.id || entry.ipa !== item.ipa || entry.word !== item.word || entry.kind !== kind || entry.sourceURL !== phonemeAudioURL(item.id, kind) || entry.sourcePage !== phonemicSource) throw new Error(`Phonemic source mapping mismatch: ${file}`);
    const path = resolve(folder, file), size = statSync(path).size;
    if (size < 100 || size !== entry.bytes || createHash('sha256').update(readFileSync(path)).digest('hex') !== entry.sha256) throw new Error(`Phonemic recording damaged: ${file}`);
    bytes += size;
  }
  return { phonemes: phonemes.length, recordings: 88, bytes };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('Phonemic audio verified:', verifyPhonemicAssets());
