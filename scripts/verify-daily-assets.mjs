// Fast deployment integrity check. Full MP3 decoding remains in verify_daily_audio.py.
// The course source is TypeScript. Transpile it with the project's own TypeScript
// dependency instead of importing the .ts file directly, so the deployment build works
// on any Node.js version the hosting platform provides (type stripping only became the
// default in Node 22.18; Cloudflare Pages currently builds with an older 22.x).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));

function loadDailyCourse() {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../src/dailyCourse.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'exports', 'module', compiled)(require, loaded.exports, loaded);
  return loaded.exports;
}

const { dailyPhrases, dailyLessons } = loadDailyCourse();
const hash = text => createHash('sha256').update(text).digest('hex');
export function verifyDailyAssets(folder) {
  const manifest = JSON.parse(readFileSync(resolve(folder, 'neural-manifest.json'), 'utf8'));
  const pairs = dailyPhrases.map(item => [item.id, item.en]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const revision = hash(JSON.stringify(pairs)).slice(0, 16);
  if (manifest.version !== 1 || manifest.revision !== revision || manifest.phraseCount !== dailyPhrases.length) throw new Error('Daily course audio manifest does not match the course text.');
  const expectedIds = new Set(dailyPhrases.map(item => item.id));
  if (expectedIds.size !== dailyPhrases.length || dailyLessons.some(lesson => [...lesson.exercises, ...lesson.rechecks].some(item => item.audioId && !expectedIds.has(item.audioId)))) throw new Error('Invalid daily course audio references.');
  for (const [voice, voiceName] of Object.entries({ aria: 'en-US-AriaNeural', guy: 'en-US-GuyNeural' })) {
    const actual = readdirSync(resolve(folder, voice)).filter(name => name.endsWith('.mp3'));
    if (actual.length !== dailyPhrases.length) throw new Error(`Unexpected daily ${voice} audio count.`);
    for (const phrase of dailyPhrases) {
      if (!/^[a-z0-9_-]+$/.test(phrase.id)) throw new Error(`Unsafe phrase ID ${phrase.id}`);
      const file = `${voice}/${phrase.id}.mp3`;
      const item = manifest.entries[file];
      const bytes = readFileSync(resolve(folder, file));
      if (!item || item.id !== phrase.id || item.text !== phrase.en || item.voice !== voiceName || item.rate !== '+0%' || item.synthesisSha256 !== hash(`${voiceName}\n+0%\n${phrase.en}`) || item.fileSha256 !== hash(bytes) || item.bytes !== bytes.length || bytes.length < 100 || !(item.durationSeconds > 0)) throw new Error(`Daily audio is missing, stale or damaged: ${file}`);
    }
  }
  if (Object.keys(manifest.entries).length !== dailyPhrases.length * 2) throw new Error('Unexpected daily audio manifest entries.');
  return { lessons: dailyLessons.length, phrases: dailyPhrases.length, audioFiles: dailyPhrases.length * 2, revision };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyDailyAssets(resolve(root, process.argv[2] ?? 'public/audio/daily'))));
}
