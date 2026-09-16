import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = 'D:/coding项目/交互式英语学习网站';
const files = ['src/vocabulary.ts'];
for (const voice of ['aria', 'guy', 'piper-lessac']) {
  for (const file of (await readdir(path.join(root, 'public/audio', voice))).sort()) {
    files.push(`public/audio/${voice}/${file}`);
  }
}
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
const target = process.argv[2] || 'asset-hashes-before.json';
await writeFile(path.join(root, 'artifacts/busuu-redesign', target), JSON.stringify(hashes, null, 2) + '\n');
console.log(`${files.length} SHA256 hashes saved to ${target}`);
