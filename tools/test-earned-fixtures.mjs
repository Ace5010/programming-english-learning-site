import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveEarnedFixtures } from './helpers/earned-fixtures.mjs';

test('failed, partial and malformed runs preserve the previous earned fixture byte for byte', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codewords-earned-'));
  const file = path.join(directory, 'earned.json');
  const previous = await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8');
  try {
    await writeFile(file, previous);
    for (const status of [{ complete: false, failed: false }, { complete: true, failed: true }]) {
      assert.equal(await saveEarnedFixtures(file, {}, status), false);
      assert.equal(await readFile(file, 'utf8'), previous);
    }
    await assert.rejects(saveEarnedFixtures(file, {}, { complete: true, failed: false }));
    assert.equal(await readFile(file, 'utf8'), previous);
    assert.equal(await saveEarnedFixtures(file, JSON.parse(previous), { complete: true, failed: false }), true);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), JSON.parse(previous));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
