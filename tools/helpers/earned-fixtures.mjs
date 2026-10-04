import assert from 'node:assert/strict';
import { writeFile, rename } from 'node:fs/promises';
import { parseDailyProgress } from '../../src/dailyProgress.ts';
import { adaptiveDailyLessons } from '../../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../../src/programmingPractice.ts';

export function validateEarnedFixtures(fixtures) {
  for (const [section, lessons] of [['daily', adaptiveDailyLessons], ['programming', adaptiveProgrammingLessons]]) {
    assert.equal(typeof fixtures[section]?.course, 'string', `Missing ${section} earned course`);
    const parsed = parseDailyProgress(fixtures[section].course, lessons);
    assert.ok(parsed.writable, `${section} earned course must parse`);
    assert.ok(Object.values(parsed.progress.learning?.targets ?? {}).some(target => target.readyAt > 0), `${section} fixture must contain earned admission`);
  }
  return fixtures;
}

// Partial or failed browser runs must never replace the last complete fixture.
export async function saveEarnedFixtures(file, fixtures, { complete, failed }) {
  if (!complete || failed) return false;
  validateEarnedFixtures(fixtures);
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(fixtures));
  await rename(temporary, file);
  return true;
}
