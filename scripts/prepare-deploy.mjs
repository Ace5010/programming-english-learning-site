// Retain the original recordings in source, but deploy only the two active voices.
import { rmSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDailyAssets } from './verify-daily-assets.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const readJSON = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const vocabulary = JSON.parse(readFileSync(resolve(root, 'src/vocabulary.ts'), 'utf8').split('export const vocabulary: VocabularyItem[] = ')[1].trim().replace(/;$/, ''));
const baseline = readJSON('scripts/vocabulary-baseline.json');
const expansion = readJSON('scripts/vocabulary-expansion.json');
const identities = [...baseline, ...expansion.additions];
if (baseline.length !== 3560 || vocabulary.length !== identities.length || identities.some((item, index) => item.id !== index + 1 || vocabulary[index].id !== item.id || vocabulary[index].word !== item.word) || new Set(vocabulary.map((item) => item.word.toLowerCase())).size !== vocabulary.length) {
  throw new Error('Vocabulary IDs must preserve the original 3,560 words and append the complete expansion');
}
const manifest = readJSON('dist/audio/neural-manifest.json');
const requiredManifest = new Set([
  ...expansion.additions.flatMap((item) => [`word-${item.id}`, `example-${item.id}`]),
  ...expansion.overrides.filter((item) => item.example).map((item) => `example-${item.id}`),
]);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const daily = verifyDailyAssets(resolve(dist, 'audio/daily'));
console.log(`Daily English verified: ${daily.lessons} lessons, ${daily.audioFiles} audio files.`);
for (const [voice, voiceName] of [['aria', 'en-US-AriaNeural'], ['guy', 'en-US-GuyNeural']]) {
  const folder = resolve(dist, 'audio', voice);
  const expected = ['voice-test.mp3', ...vocabulary.flatMap(({ id }) => [`word-${id}.mp3`, `example-${id}.mp3`])];
  for (const name of expected) {
    const path = resolve(folder, name);
    if (!existsSync(path) || statSync(path).size === 0) throw new Error(`Missing audio: ${path}`);
  }
  if (readdirSync(folder).filter((name) => name.endsWith('.mp3')).length !== expected.length) throw new Error(`Unexpected audio count: ${voice}`);
  for (const item of vocabulary) {
    for (const kind of ['word', 'example']) {
      const key = `${kind}-${item.id}`;
      const name = `${voice}/${key}.mp3`;
      const record = manifest[name];
      if (!record) {
        if (requiredManifest.has(key)) throw new Error(`Missing audio manifest: ${name}`);
        continue;
      }
      if (record.text !== item[kind] || record.voice !== voiceName || record.sha256 !== sha256(`${voiceName}\n+0%\n${item[kind]}`)) throw new Error(`Audio text mismatch: ${name}`);
      if (record.fileSha256 && record.fileSha256 !== sha256(readFileSync(resolve(dist, 'audio', name)))) throw new Error(`Audio hash mismatch: ${name}`);
    }
  }
}
const legacy = resolve(dist, 'audio', 'piper-lessac');
const withinDist = relative(dist, legacy);
if (!withinDist || withinDist.startsWith('..') || isAbsolute(withinDist)) throw new Error('Unsafe output path');
rmSync(legacy, { recursive: true, force: true });
function count(folder) { return readdirSync(folder, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(resolve(folder, e.name)) : 1), 0); }
const files = count(dist);
if (files > 20000) throw new Error(`Pages deployment file limit exceeded: ${files}`);
console.log(`Deployment verified: ${files} files, two complete voices.`);
