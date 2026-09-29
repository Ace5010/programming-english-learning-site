import { readFileSync, writeFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../public/audio/slow/manifest.json', import.meta.url), 'utf8'));
const clips = Object.fromEntries(Object.entries(manifest.clips).map(([key, value]) => {
  const { text, spoken, voice, ...clip } = value;
  return [key, { ...clip, version: manifest.files[clip.path].sha256.slice(0,16) }];
}));
writeFileSync(new URL('../src/slowReadingClips.json', import.meta.url), JSON.stringify(clips, null, 2)+'\n');
console.log(`Indexed ${Object.keys(clips).length} voice-specific clips with content-versioned URLs.`);
