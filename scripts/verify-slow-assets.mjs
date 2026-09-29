import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { slowReadingInventory } from './slow-reading-inventory.mjs';
import { pronunciationKeys } from '../src/slowPronunciations.ts';
import { slowReadingUnits } from '../src/slowReadingText.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = data => createHash('sha256').update(data).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
export function verifySlowAssets(audio = resolve(root, 'public/audio')) {
  const inventoryPath = resolve(root, 'src/slowReadingInventory.json');
  const inventory = json(inventoryPath);
  if (JSON.stringify(inventory) !== JSON.stringify(slowReadingInventory())) throw new Error('Slow reading inventory is stale; rescan current content');
  const manifest = json(resolve(audio, 'slow/manifest.json'));
  const runtime = json(resolve(root, 'src/slowReadingClips.json'));
  if (manifest.version !== 1 || manifest.inventorySha256 !== sha(readFileSync(inventoryPath))) throw new Error('Slow recording manifest is stale');
  const expected = new Set();
  for (const voice of ['aria', 'guy']) {
    for (const entry of inventory.entries) {
      const key = `${voice}:${entry.text}`; expected.add(key);
      const clip = manifest.clips[key];
      if (!clip || clip.text !== entry.text || clip.spoken !== entry.spoken || clip.voice !== (voice === 'aria' ? 'en-US-AriaNeural' : 'en-US-GuyNeural')) throw new Error(`Wrong slow voice/text: ${key}`);
      if (!new RegExp(`^(?:(?:reading|foundation|slow)/)?${voice}/[a-z0-9-]+\\.mp3$`).test(clip.path)) throw new Error(`Unsafe slow path: ${key}`);
      if (!entry.generated && clip.path !== entry.path.replace('{voice}',voice)) throw new Error(`Wrong reused source: ${key}`);
      if (entry.generated && !clip.path.startsWith(`slow/${voice}/pack-`)) throw new Error(`Unpacked generated source: ${key}`);
      if (!Number.isFinite(clip.startMs) || !Number.isFinite(clip.endMs) || clip.startMs < 0 || clip.endMs <= clip.startMs || clip.endMs-clip.startMs > 30000 || clip.endMs > 600000) throw new Error(`Invalid segment bounds: ${key}`);
      for (const field of ['leadingMs','trailingMs']) if (!Number.isFinite(clip[field]) || clip[field] < 0 || clip[field] > 100) throw new Error(`Invalid silence analysis: ${key}`);
      const { text, spoken, voice: voiceName, ...bounds } = clip;
      if (!manifest.files[clip.path]) throw new Error(`Missing slow file metadata: ${key}`);
      if (JSON.stringify({...bounds,version:manifest.files[clip.path].sha256.slice(0,16)}) !== JSON.stringify(runtime[key])) throw new Error(`Runtime bounds mismatch: ${key}`);
    }
    for (const text of inventory.texts) {
      const units = slowReadingUnits(text);
      if (units.length < 2) continue;
      if (units.length > 256) throw new Error(`Native queue limit exceeded: ${text}`);
      for (const key of pronunciationKeys(text)) if (!manifest.clips[`${voice}:${key}`]) throw new Error(`Uncovered sentence token: ${text} / ${key}`);
    }
  }
  if (Object.keys(manifest.clips).length !== expected.size || Object.keys(runtime).length !== expected.size) throw new Error('Unexpected slow clip count');
  for (const [path, record] of Object.entries(manifest.files)) {
    if (!/^(?:(?:reading|foundation|slow)\/)?(?:aria|guy)\/[a-z0-9-]+\.mp3$/.test(path)) throw new Error('Unsafe manifest path');
    const data = readFileSync(resolve(audio,path));
    if (data.length !== record.bytes || sha(data) !== record.sha256) throw new Error(`Slow audio hash mismatch: ${path}`);
    if (data.length > 25 * 1024 * 1024) throw new Error(`Pages single-file limit exceeded: ${path}`);
  }
  const packed = ['aria','guy'].flatMap(voice => readdirSync(resolve(audio,'slow',voice)).filter(name=>name.endsWith('.mp3')).map(name=>`slow/${voice}/${name}`));
  for (const path of packed) if (!manifest.files[path]) throw new Error(`Unreferenced slow pack: ${path}`);
  return { texts: inventory.texts.length, units: inventory.entries.length, reusedRecordings: inventory.entries.filter(x=>!x.generated).length*2, generatedRecordings: inventory.entries.filter(x=>x.generated).length*2, packedFiles: packed.length, packedBytes: packed.reduce((sum,path)=>sum+statSync(resolve(audio,path)).size,0), verifiedFiles: Object.keys(manifest.files).length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(verifySlowAssets()));
