import { grammarContrastPhrases, tutorialExamples, foundationTutorials } from '../src/foundationSamples.ts';
import { foundationDemoDefinitions, foundationDemoPath } from '../src/foundationDemos.ts';
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
  const required = [...foundationPhrases, ...foundationAlphabet, ...grammarContrastPhrases, ...tutorialExamples].map(phrase => phrase.en);
  for (const phrase of tutorialExamples) {
    required.push(...(phrase.parts ?? []).map(([, text]) => text));
    if (phrase.separate) required.push(...phrase.en.replace(/[.,!?]/g, '').split(/\s+/));
  }
  for (const text of required) if (!entries.some(entry => entry.text === text)) throw new Error(`Foundation audio text missing: ${text}`);
  for (const [voice, name] of [['aria', 'en-US-AriaNeural'], ['guy', 'en-US-GuyNeural']]) {
    if (readdirSync(resolve(folder, voice)).filter(file => file.endsWith('.mp3')).length !== entries.length) throw new Error(`Unexpected foundation recording count: ${voice}`);
    for (const entry of entries) {
      const relative = `${voice}/${entry.id}.mp3`, path = resolve(folder, relative), record = manifest.entries[relative];
      if (!existsSync(path) || !statSync(path).size || !record || record.text !== entry.text || record.voice !== name
        || (entry.ttsText && record.spoken !== entry.ttsText) || record.synthesisSha256 !== hash(`${name}\n+0%\n${entry.ttsText ?? entry.text}`) || record.fileSha256 !== hash(readFileSync(path))) throw new Error(`Foundation recording mismatch: ${relative}`);
    }
  }
  const demos = JSON.parse(readFileSync(resolve(folder, 'demo-manifest.json'), 'utf8'));
  const versions = JSON.parse(readFileSync(resolve(root, 'src/foundationDemoVersions.json'), 'utf8'));
  for (const demo of foundationDemoDefinitions) {
    const path = resolve(folder, 'demos', `${demo.id}.mp3`), record = demos.entries[demo.id];
    if (!existsSync(path) || !record || record.text !== demo.text || record.voice !== demo.voice || record.definitionSha256 !== hash(JSON.stringify(demo)) || record.fileSha256 !== hash(readFileSync(path))) throw new Error(`Foundation demonstration mismatch: ${demo.id}`);
    if (versions[demo.id] !== record.fileSha256.slice(0, 16)) throw new Error(`Stale demonstration URL: ${demo.id}`);
    if ('source' in demo && (!record.sourceAudio?.startsWith('https://dictionary.cambridge.org/media/english/uk_pron/') || record.sourcePage !== demo.source)) throw new Error(`Foundation demonstration source mismatch: ${demo.id}`);
  }
  for (const tutorial of foundationTutorials) for (const section of tutorial.sections) for (const [, id] of section.sounds ?? []) {
    if (!existsSync(resolve(root, 'public', foundationDemoPath(`sound:${id}`)))) throw new Error(`Tutorial phoneme missing: ${id}`);
  }
  return { historicalTopics: foundationTopics.length, expandedTutorials: foundationTutorials.length, texts: new Set(entries.map(item => item.text)).size, recordingVariants: entries.length, audioFiles: entries.length * 2, demonstrationFiles: foundationDemoDefinitions.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('Foundation assets verified:', verifyFoundationAssets());
