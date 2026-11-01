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
  const normalRuntime = json(resolve(root, 'src/contextualAudioClips.json'));
  const recipesPath = resolve(root, 'scripts/audio-pronunciation-recipes.json');
  const recipes = json(recipesPath);
  if (manifest.version !== 2 || manifest.profile !== 'clear-slow-v2' || manifest.synthesisRate !== '-40%' || manifest.playbackRate !== 1 || manifest.inventorySha256 !== sha(readFileSync(inventoryPath)) || manifest.recipesSha256 !== sha(readFileSync(recipesPath))) throw new Error('Slow recording manifest is stale');
  const expected = new Set();
  for (const voice of ['aria', 'guy']) {
    for (const entry of inventory.entries) {
      const key = `${voice}:${entry.text}`; expected.add(key);
      const clip = manifest.clips[key];
      const ordinary = /^[A-Z][a-z]+$/.test(entry.text) ? entry.text.toLowerCase() : entry.text;
      const recipe = recipes[entry.text] ?? recipes[ordinary];
      const expectedSpoken = recipe?.voiceOverrides?.[voice]?.spoken ?? recipe?.spoken ?? entry.spoken;
      if (!clip || clip.text !== entry.text || clip.spoken !== expectedSpoken || clip.voice !== (voice === 'aria' ? 'en-US-AriaNeural' : 'en-US-GuyNeural')) throw new Error(`Wrong slow voice/text: ${key}`);
      if (!new RegExp(`^(?:(?:reading|foundation|slow)/)?${voice}/[a-z0-9-]+\\.mp3$`).test(clip.path)) throw new Error(`Unsafe slow path: ${key}`);
      if (!clip.path.startsWith(`slow/${voice}/pack-v2-`)) throw new Error(`Missing native slow source: ${key}`);
      if (!Number.isFinite(clip.startMs) || !Number.isFinite(clip.endMs) || clip.startMs < 0 || clip.endMs <= clip.startMs || clip.endMs-clip.startMs > 30000 || clip.endMs > 600000) throw new Error(`Invalid segment bounds: ${key}`);
      for (const field of ['leadingMs','trailingMs']) if (!Number.isFinite(clip[field]) || clip[field] < 0 || clip[field] > 100) throw new Error(`Invalid silence analysis: ${key}`);
      const { text, spoken, voice: voiceName, ...bounds } = clip;
      if (!manifest.files[clip.path]) throw new Error(`Missing slow file metadata: ${key}`);
      if (JSON.stringify({...bounds,version:manifest.files[clip.path].sha256.slice(0,16)}) !== JSON.stringify(runtime[key])) throw new Error(`Runtime bounds mismatch: ${key}`);
    }
    for (const text of inventory.texts) {
      const units = slowReadingUnits(text);
      if (!units.length) continue;
      if (units.length > 256) throw new Error(`Native queue limit exceeded: ${text}`);
      for (const key of pronunciationKeys(text)) if (!manifest.clips[`${voice}:${key}`]) throw new Error(`Uncovered sentence token: ${text} / ${key}`);
    }
  }
  if (Object.keys(manifest.clips).length !== expected.size || Object.keys(runtime).length !== expected.size) throw new Error('Unexpected slow clip count');
  const contextual = inventory.entries.filter(entry => entry.text.includes('@') && !entry.text.startsWith('tutorial@'));
  if (manifest.normalSynthesisRate !== '+0%' || Object.keys(manifest.normalClips ?? {}).length !== contextual.length*2 || Object.keys(normalRuntime).length !== contextual.length*2) throw new Error('Incomplete normal contextual recordings');
  for (const voice of ['aria','guy']) for (const entry of contextual) {
    const key = `${voice}:${entry.text}`, clip = manifest.normalClips[key], recipe = recipes[entry.text];
    if (!clip || clip.spoken !== (recipe?.voiceOverrides?.[voice]?.spoken ?? recipe?.spoken ?? entry.spoken) || clip.voice !== (voice === 'aria' ? 'en-US-AriaNeural' : 'en-US-GuyNeural') || !clip.path.startsWith(`slow/${voice}/pack-v2-normal-`) || clip.endMs <= clip.startMs || clip.startMs < 0 || clip.endMs > 600000) throw new Error(`Wrong contextual recording: ${key}`);
    const { text, spoken, voice: voiceName, ...bounds } = clip;
    if (JSON.stringify({...bounds,version:manifest.files[clip.path]?.sha256.slice(0,16)}) !== JSON.stringify(normalRuntime[key])) throw new Error(`Contextual runtime mismatch: ${key}`);
  }
  for (const [path, record] of Object.entries(manifest.files)) {
    if (!/^(?:(?:reading|foundation|slow)\/)?(?:aria|guy)\/[a-z0-9-]+\.mp3$/.test(path)) throw new Error('Unsafe manifest path');
    const data = readFileSync(resolve(audio,path));
    if (data.length !== record.bytes || sha(data) !== record.sha256) throw new Error(`Slow audio hash mismatch: ${path}`);
    if (data.length > 25 * 1024 * 1024) throw new Error(`Pages single-file limit exceeded: ${path}`);
  }
  for (const [key, source] of Object.entries(manifest.sourceOverrides ?? {})) {
    if (!expected.has(key) || source.method !== 'pitch-preserving-tempo' || source.rate !== .6 || !/^(?:(?:reading|foundation|daily)\/)?(?:aria|guy)\/[a-z0-9-]+\.mp3$/.test(source.path) || sha(readFileSync(resolve(audio,source.path))) !== source.sha256) throw new Error(`Changed preserved slow source: ${key}`);
  }
  const packed = ['aria','guy'].flatMap(voice => readdirSync(resolve(audio,'slow',voice)).filter(name=>name.endsWith('.mp3')).map(name=>`slow/${voice}/${name}`));
  for (const path of packed) if (!manifest.files[path]) throw new Error(`Unreferenced slow pack: ${path}`);
  const preservedSourceRecordings = Object.keys(manifest.sourceOverrides ?? {}).length;
  return { texts: inventory.texts.length, units: inventory.entries.length, slowRecordings: inventory.entries.length*2, nativeSlowRecordings: inventory.entries.length*2-preservedSourceRecordings, preservedSourceRecordings, contextualNormalRecordings: Object.keys(normalRuntime).length, packedFiles: packed.length, packedBytes: packed.reduce((sum,path)=>sum+statSync(resolve(audio,path)).size,0), verifiedFiles: Object.keys(manifest.files).length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(verifySlowAssets()));
