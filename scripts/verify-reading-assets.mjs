import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');

export function verifyReadingAssets(audio = resolve(root, 'public/audio')) {
  const entries = json(resolve(root, 'src/readingAudio.json'));
  const manifest = json(resolve(audio, 'reading/neural-manifest.json'));
  if (manifest.version !== 1 || Object.keys(manifest.entries).length !== entries.length * 2) throw new Error('Reading audio inventory differs from the manifest');
  for (const [folder, voice] of [['aria', 'en-US-AriaNeural'], ['guy', 'en-US-GuyNeural']]) {
    if (readdirSync(resolve(audio, 'reading', folder)).filter(name => name.endsWith('.mp3')).length !== entries.length) throw new Error(`Unexpected reading audio count: ${folder}`);
    for (const { id, text } of entries) {
      if (!/^read-[a-f0-9]{16}$/.test(id) || !text) throw new Error(`Invalid reading recording: ${id}`);
      const relative = `${folder}/${id}.mp3`, path = resolve(audio, 'reading', relative), record = manifest.entries[relative];
      if (!record || record.text !== text || record.voice !== voice || record.rate !== '+0%' || record.synthesisSha256 !== sha(`${voice}\n+0%\n${text}`)) throw new Error(`Reading text mismatch: ${relative}`);
      if (statSync(path).size !== record.bytes || record.fileSha256 !== sha(readFileSync(path))) throw new Error(`Reading audio hash mismatch: ${relative}`);
    }
  }
  const effects = json(resolve(audio, 'feedback/manifest.json'));
  if (Object.keys(effects).sort().join(',') !== 'complete,correct,pair') throw new Error('Feedback sound inventory differs from the course controls');
  for (const name of ['correct', 'complete', 'pair']) {
    const path = resolve(audio, 'feedback', `${name}.mp3`);
    if (effects[name].sha256 !== sha(readFileSync(path))) throw new Error(`Feedback sample changed: ${name}`);
  }
  return { texts: entries.length, recordings: entries.length * 2, feedbackSounds: 3 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(verifyReadingAssets()));
