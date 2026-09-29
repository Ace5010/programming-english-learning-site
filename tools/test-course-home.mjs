import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { courseFixture } from './helpers/course-home-fixture.mjs';
import { planAdaptiveSession, resolveAdaptiveLesson } from '../src/adaptiveLearning.ts';
import { courseOverview } from '../src/courseOverviewData.ts';


for (const [name, lessons] of [['daily', adaptiveDailyLessons], ['programming', adaptiveProgrammingLessons]]) {
  for (const kind of ['fresh', 'mixed', 'weak']) test(`${name}: ${kind} preview is pure and matches session targets for different seeds`, () => {
    const progress = courseFixture(lessons, kind), original = structuredClone(progress);
    const first = courseOverview(progress, lessons);
    assert.ok(first);
    for (const random of [.01, .5, .99]) {
      assert.deepEqual(courseOverview(progress, lessons), first);
      const session = planAdaptiveSession(progress, lessons, 1700000000000, () => random);
      assert.deepEqual(first.targets.map(item => item.id), session.adaptive.focusIds);
      assert.equal(first.newCount, session.adaptive.newIds.length);
      assert.equal(first.round, session.adaptive.round);
    }
    assert.deepEqual(progress, original);
    if (kind === 'fresh') assert.equal(first.oldCount, 0);
    if (kind === 'mixed') assert.ok(first.oldCount && first.newCount);
    if (kind === 'weak') assert.equal(first.newCount, 0);
  });
  for (const kind of ['saved', 'legacy']) test(`${name}: ${kind} session wins over next scope without changing queue or draft`, () => {
    const progress = courseFixture(lessons, kind), original = structuredClone(progress);
    const overview = courseOverview(progress, lessons);
    const lesson = resolveAdaptiveLesson(progress.session, lessons);
    assert.equal(overview.resume, true);
    assert.deepEqual(overview.targets.map(item => item.id), lesson.learningTargets);
    assert.equal(overview.source.id, progress.session.lessonId);
    assert.deepEqual(progress, original);
  });
  test(`${name}: unfinished review does not promise next-round content`, () => {
    assert.equal(courseOverview(courseFixture(lessons, 'review'), lessons), null);
  });
}
