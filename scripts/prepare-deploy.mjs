// Retain the original recordings in source, but deploy only the two active voices.
import { rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDailyAssets } from './verify-daily-assets.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const daily = verifyDailyAssets(resolve(dist, 'audio/daily'));
console.log(`Daily English verified: ${daily.lessons} lessons, ${daily.audioFiles} audio files.`);
for (const voice of ['aria', 'guy']) {
  const folder = resolve(dist, 'audio', voice);
  for (const name of ['voice-test.mp3', ...Array.from({ length: 3560 }, (_, i) => [`word-${i + 1}.mp3`, `example-${i + 1}.mp3`]).flat()]) {
    const path = resolve(folder, name);
    if (!existsSync(path) || statSync(path).size === 0) throw new Error(`Missing audio: ${path}`);
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
