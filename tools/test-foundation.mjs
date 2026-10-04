import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foundationTopics, foundationTutorialCatalog, foundationLessons, foundationPhrases, foundationAlphabet, FOUNDATION_KEY } from '../src/foundationCourse.ts';
import { foundationTutorials, tutorialExamples } from '../src/foundationTutorials.ts';
import { foundationDemoDefinitions, foundationDemoPath } from '../src/foundationDemos.ts';
import { foundationAudioPath } from '../src/foundationAudio.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, advanceAdaptiveSession, recordAdaptiveAnswer } from '../src/adaptiveLearning.ts';
import { createDailyProgress, parseDailyProgress, updateDailyDraft, submitDailyAnswer, markDailyHelp, dailyKnowledgeReviewable, persistDailyProgress } from '../src/dailyProgress.ts';
import { emptySnapshot, assertSnapshot, mergeSnapshots } from '../src/syncProtocol.ts';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { ProgressSync, SYNC_META, SYNC_ENDPOINT } from '../src/progressSync.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';
import { readingWords, readingKey } from '../src/readingText.ts';
import { prepareFoundationLearning } from '../src/foundationProgress.ts';

const tasks = foundationLessons.flatMap(item => item.exercises);
test('four batches cover every requested goal without changing historical lessons', () => {
  assert.deepEqual(Object.fromEntries(['A', 'B', 'C', 'D'].map(batch => [batch, foundationTutorials.filter(item => item.batch === batch).length])), { A: 4, B: 6, C: 5, D: 6 });
  assert.equal(new Set(foundationTutorialCatalog.map(item => item.id)).size, foundationTutorialCatalog.length);
  assert.equal(new Set(tutorialExamples.map(item => item.id)).size, tutorialExamples.length);
  for (const tutorial of foundationTutorials) {
    assert.ok(tutorial.question && tutorial.boundary && tutorial.takeaway);
    assert.ok(tutorial.sections.length >= 2 && tutorial.sections.every(section => section.text.length));
    assert.ok(tutorial.try.options.length === tutorial.try.explanation.length);
    assert.ok(tutorial.related.every(id => id === 'foundation-noun-roles' || foundationTutorialCatalog.some(item => item.id === id && !item.hidden)));
    assert.equal(foundationTutorialCatalog.filter(item => item.id === tutorial.id).length, 1);
    if (!foundationTopics.some(item => item.id === tutorial.id)) assert.ok(!foundationLessons.some(item => item.id === tutorial.id));
  }
  assert.deepEqual(foundationTutorialCatalog.filter(item => item.hidden).map(item => item.id), foundationTopics.filter(item => item.hidden).map(item => item.id));
  for (const phrase of tutorialExamples) {
    if (phrase.parts) assert.equal(phrase.parts.map(([, text]) => text).join(' '), phrase.en.replace(/[.,!?]/g, ''), phrase.en);
    if (phrase.demo) assert.ok(foundationDemoPath(phrase.demo));
  }
});
test('all new word, phrase and sentence buttons have exact text recordings; IPA stays outside TTS', () => {
  const texts = new Set(JSON.parse(readFileSync('src/foundationAudio.json', 'utf8')).map(item => item.text));
  for (const phrase of tutorialExamples) {
    assert.ok(texts.has(phrase.en), phrase.en);
    for (const [, part] of phrase.parts ?? []) assert.ok(texts.has(part), part);
    if (phrase.separate) for (const word of phrase.en.replace(/[.,!?]/g, '').split(/\s+/)) assert.ok(texts.has(word), word);
  }
  assert.ok(![...texts].some(text => /^\/[^/]+\/$/.test(text)));
  assert.equal(foundationDemoDefinitions.length, 6);
  assert.ok(foundationDemoDefinitions.filter(item => item.id.startsWith('focus-')).every(item => item.voice.includes('David') && item.text === 'I want tea.'));
});
test('present read pronunciation overrides are tutorial-scoped and preserve historical sound paths', () => {
  const entries = JSON.parse(readFileSync('src/foundationAudio.json', 'utf8'));
  for (const entry of entries.filter(item => item.ttsText)) {
    assert.equal(entry.ttsText, entry.text.replace(/\bread\b/g, 'reed'));
    assert.equal(entry.tutorialOnly, true);
  }
  for (const text of ['read', 'We read books.']) {
    assert.match(foundationAudioPath(text, 'aria'), /\/f-[0-9a-f]+\.mp3/);
    assert.match(foundationAudioPath(text, 'aria', true), /\/ft-[0-9a-f]+\.mp3/);
    assert.notEqual(foundationAudioPath(text, 'aria'), foundationAudioPath(text, 'aria', true));
  }
});
const orderAnswer = task => {
  const used = new Set();
  return task.answers[0].replace(/[.!?]$/, '').split(/\s+/).map(token => {
    const index = task.options.findIndex((option, i) => option === token && !used.has(i)); assert.ok(index >= 0); used.add(index); return index;
  });
};
const draft = task => task.kind === 'order' ? { order: orderAnswer(task) } : task.kind === 'fill' ? { blanks: task.blanks.map(values => values[0]) } : { choice: task.answers[0] };
function start(progress = createDailyProgress(), seed = () => 0.45) {
  const session = planAdaptiveSession(progress, foundationLessons, Date.now(), seed);
  return session ? beginAdaptiveLearning({ ...progress, session }, foundationLessons) : progress;
}
function answer(progress, correct = true) {
  const lesson = resolveAdaptiveLesson(progress.session, foundationLessons);
  const task = lesson.exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
  const change = correct ? draft(task) : task.kind === 'order' ? { order: [0] } : { choice: task.options.find(value => !task.answers.includes(value)) };
  return recordAdaptiveAnswer(submitDailyAnswer({ ...progress, session: updateDailyDraft(progress.session, change) }, lesson), foundationLessons);
}
test('complete curriculum has original teaching, two-way examples, safe IDs and all 26 letters', () => {
  assert.ok(foundationTopics.length >= 50);
  assert.equal(new Set(foundationTopics.map(t => t.id)).size, foundationTopics.length);
  assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length);
  assert.equal(foundationAlphabet.length, 26);
  for (const [i, item] of foundationTopics.entries()) {
    assert.ok(item.explanation.length >= 2 && item.examples.length >= 2 && item.checks.length >= 2);
    assert.ok(item.prerequisiteIds.every(id => foundationTopics.slice(0, i).some(prerequisite => prerequisite.id === id)));
  }
  for (const item of tasks) {
    assert.ok(item.knowledgeIds.every(id => foundationTopics.some(t => t.id === id)));
    if (item.audioId) assert.ok(foundationPhrases.some(p => p.id === item.audioId));
    if (item.kind === 'choice' || item.kind === 'listen') { assert.ok(item.options.includes(item.answers[0])); assert.equal(new Set(item.options).size, item.options.length); }
    else if (item.kind === 'order') assert.ok(item.options.length <= 8);
    else assert.equal(item.parts.length, item.blanks.length + 1);
  }
});
test('every sound example, alphabet letter and connected-speech word has exact audio text', () => {
  const texts = new Set(JSON.parse(readFileSync('src/foundationAudio.json', 'utf8')).map(item => item.text));
  for (const p of [...foundationPhrases, ...foundationAlphabet]) assert.ok(texts.has(p.en), p.en);
  for (const topic of foundationTopics.filter(t => t.source === 'connected')) for (const phrase of topic.examples) {
    for (const word of phrase.en.replace(/[.,!?]/g, '').split(/\s+/)) assert.ok(texts.has(word), word);
  }
});
test('first teaching only introduces its foundation concept, never legacy vocabulary', () => {
  const session = planAdaptiveSession(createDailyProgress(), foundationLessons, Date.now(), () => 0.1);
  assert.deepEqual(session.adaptive.newIds, ['foundation-word-concepts']);
  assert.deepEqual(session.adaptive.focusIds, ['foundation-word-concepts']);
  const progress = beginAdaptiveLearning({ ...createDailyProgress(), session }, foundationLessons);
  assert.deepEqual(Object.keys(progress.knowledge), ['foundation-word-concepts']);
  assert.equal(dailyKnowledgeReviewable(progress, 'foundation-word-concepts'), false);
  assert.equal(parseDailyProgress(JSON.stringify(progress), foundationLessons).writable, true);
});
test('incorrect answers and hints persist, and refresh keeps exact draft, seed and next question', () => {
  let progress = start();
  progress = answer(progress, false);
  const copy = parseDailyProgress(JSON.stringify(progress), foundationLessons);
  assert.equal(copy.writable, true);
  assert.deepEqual(copy.progress.session, progress.session);
  assert.ok(copy.progress.learning.targets['foundation-word-concepts'].lastFailureTurn > 0);
  const next = advanceAdaptiveSession(copy.progress, foundationLessons);
  assert.equal(next.session.stage, 'exercise');
  const lesson = resolveAdaptiveLesson(next.session, foundationLessons);
  const helped = recordAdaptiveAnswer(markDailyHelp(next, lesson), foundationLessons);
  assert.equal(helped.session.draft.helped, true);
  assert.equal(helped.learning.targets['foundation-word-concepts'].readyAt, 0);
});
test('adaptive path is finite, respects prerequisites, interleaves sound study and progresses through all topics', () => {
  let progress = createDailyProgress(), count = 0;
  const covered = new Set();
  const scheduledTopics = foundationTopics.filter(item => !item.referenceOnly);
  for (let round = 0; round < 350 && covered.size < scheduledTopics.length; round++) {
    const before = new Set(Object.keys(progress.learning?.targets ?? {}));
    progress = start({ ...progress, session: null }, () => (round % 17 + 1) / 19);
    assert.ok(progress.session, `no next lesson at round ${round}`);
    assert.ok(progress.session.adaptive.focusIds.length <= 2);
    for (const id of progress.session.adaptive.newIds) {
      const topic = foundationTopics.find(item => item.id === id);
      assert.equal(!!topic.referenceOnly, false);
      assert.ok(topic.prerequisiteIds.every(prereq => before.has(prereq)));
      covered.add(id);
    }
    let questions = 0;
    while (progress.session.stage !== 'summary') {
      progress = advanceAdaptiveSession(answer(progress), foundationLessons);
      assert.ok(progress.session.queue.every(entry => !/^foundation-(handwriting|letters|words|sentence)-/.test(entry.exerciseId)));
      questions++; count++;
      assert.ok(questions <= 20);
    }
    assert.equal(parseDailyProgress(JSON.stringify(progress), foundationLessons).writable, true);
  }
  assert.equal(covered.size, scheduledTopics.length, `covered ${covered.size}; ${count} answers`);
  assert.ok(Object.values(progress.learning.targets).some(t => t.readyAt));
});
test('sound learning never admits from grammar knowledge alone', () => {
  const topic = foundationTopics.find(t => t.sound), lesson = foundationLessons.find(l => l.id === topic.id);
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 10, rounds: 1, targets: { [topic.id]: { introducedAt: Date.now(), confidence: 0.99, abilities: { meaning: 0.99 }, lastSeenTurn: 1, lastFailureTurn: 0, signatures: ['old', 'other'], transfer: true, readyAt: 0 } } };
  const task = lesson.exercises.find(t => t.kind === 'choice');
  const session = planAdaptiveSession(progress, [lesson], Date.now(), () => 0);
  progress.session = { ...session, stage: 'exercise', queue: [{ exerciseId: task.id, retry: false }], draft: { choice: task.answers[0], order: [], blanks: [], text: '', checks: [], helped: false, revealed: false } };
  const checked = recordAdaptiveAnswer(submitDailyAnswer(progress, lesson), [lesson]);
  assert.equal(checked.learning.targets[topic.id].readyAt, 0);
});
test('favorites and writes stay in their own storage key; corrupt and concurrent records are preserved', () => {
  const values = new Map([['codewords-daily-v1', '{old-daily}'], ['codewords-favorites', '[1,2]']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, raw) => values.set(key, raw) };
  const progress = { ...createDailyProgress(), favorites: ['foundation-letters'] };
  assert.equal(persistDailyProgress(storage, progress, null, FOUNDATION_KEY).saved, true);
  assert.equal(values.get('codewords-daily-v1'), '{old-daily}');
  assert.equal(values.get('codewords-favorites'), '[1,2]');
  assert.equal(persistDailyProgress(storage, progress, null, FOUNDATION_KEY).saved, false);
  const damaged = '{broken';
  assert.equal(parseDailyProgress(damaged, foundationLessons).raw, damaged);
  assert.equal(parseDailyProgress(damaged, foundationLessons).writable, false);
});
test('old sync snapshots load, third-section evidence merges independently and conflicts stay visible', () => {
  const old = emptySnapshot(); delete old[FOUNDATION_KEY];
  validateProgressSnapshot(old); assert.equal(old[FOUNDATION_KEY], null);
  const base = emptySnapshot(), local = emptySnapshot(), remote = emptySnapshot();
  local[FOUNDATION_KEY] = JSON.stringify({ ...createDailyProgress(), favorites: ['foundation-letters'] });
  remote['codewords-daily-v1'] = JSON.stringify({ ...createDailyProgress(), favorites: ['hello'] });
  const merge = mergeSnapshots(base, local, remote); validateProgressSnapshot(merge.snapshot);
  assert.equal(merge.snapshot[FOUNDATION_KEY], local[FOUNDATION_KEY]);
  assert.equal(merge.snapshot['codewords-daily-v1'], remote['codewords-daily-v1']);
  assert.deepEqual(merge.conflicts, []);
  remote[FOUNDATION_KEY] = JSON.stringify({ ...createDailyProgress(), favorites: ['foundation-be'] });
  assert.deepEqual(mergeSnapshots(base, local, remote).conflicts, ['英语基础']);
  assert.throws(() => assertSnapshot({ ...emptySnapshot(), unexpected: null }));
});
test('removed alphabet and handwriting sessions retain drafts and evidence while new rounds start with word concepts', () => {
  for (const id of ['foundation-letters', 'foundation-handwriting', 'foundation-words', 'foundation-sentence']) {
  const legacy = { ...foundationLessons.find(item => item.id === id), referenceOnly: false, prerequisiteIds: [] };
  const session = planAdaptiveSession(createDailyProgress(), [legacy], Date.now(), () => 0.1);
  let progress = beginAdaptiveLearning({ ...createDailyProgress(), session }, [legacy]);
  const task = legacy.exercises.find(item => item.id === session.queue[0].exerciseId);
  progress = { ...progress, session: updateDailyDraft(progress.session, { choice: task.answers[0] }) };
  const loaded = parseDailyProgress(JSON.stringify(progress), foundationLessons);
  assert.equal(loaded.writable, true);
  assert.deepEqual(loaded.progress, progress);
  assert.deepEqual(planAdaptiveSession(progress, foundationLessons), progress.session);
  const prepared = prepareFoundationLearning(progress);
  assert.deepEqual(prepared.retiredFoundationSession, progress.session);
  assert.deepEqual(prepared.learning, progress.learning);
  assert.equal(prepared.session, null);
  assert.equal(parseDailyProgress(JSON.stringify(prepared), foundationLessons).writable, true);
  const next = planAdaptiveSession(prepared, foundationLessons);
  assert.deepEqual(next.adaptive.newIds, ['foundation-word-concepts']);
  assert.equal(progress.learning.targets['foundation-word-concepts'], undefined);
  validateProgressSnapshot({ ...emptySnapshot(), [FOUNDATION_KEY]: JSON.stringify({ ...prepared, session: next }) });
  }
  const current = start(); assert.equal(prepareFoundationLearning(current), current);
});
test('phonetic symbols stay notation instead of being read as letter names', () => {
  assert.deepEqual(readingWords('thin /θɪn/ 和 /j/，then /ðen/').map(item => item.text), ['thin', 'then']);
  assert.equal(readingKey('/uː/'), '');
  assert.ok(readingWords('open /src/main.ts').some(item => item.text === 'src'));
});
test('foundation drafts cross two clients through the real Function and SQLite; old writers cannot erase them', async () => {
  const server = syncServer();
  const create = () => { const storage = new MemoryStore(); const engine = new ProgressSync({ storage, fetch: server.fetch, validate: validateProgressSnapshot }); engine.initialize(); return { storage, engine }; };
  const a = create(), b = create();
  let progress = start();
  const currentTask = resolveAdaptiveLesson(progress.session, foundationLessons).exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
  progress.session = updateDailyDraft(progress.session, draft(currentTask));
  a.storage.setItem(FOUNDATION_KEY, JSON.stringify(progress));
  a.storage.setItem('codewords-favorites', '[1,2]');
  await a.engine.connect(); await b.engine.connect(a.engine.code());
  assert.equal(a.engine.status.state, 'synced'); assert.equal(b.engine.status.state, 'synced');
  assert.equal(b.storage.getItem(FOUNDATION_KEY), JSON.stringify(progress));
  progress = { ...progress, favorites: ['foundation-letters'] };
  b.storage.setItem(FOUNDATION_KEY, JSON.stringify(progress)); await b.engine.sync(); await a.engine.sync();
  assert.equal(a.storage.getItem(FOUNDATION_KEY), b.storage.getItem(FOUNDATION_KEY));
  const meta = JSON.parse(a.storage.getItem(SYNC_META));
  const old = { ...meta.base }; delete old[FOUNDATION_KEY];
  const response = await server.fetch(SYNC_ENDPOINT, { method: 'PUT', headers: { Authorization: `Bearer ${a.engine.code()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, revision: meta.revision, snapshot: old }) });
  assert.equal(response.status, 426);
  const check = await server.fetch(SYNC_ENDPOINT, { headers: { Authorization: `Bearer ${a.engine.code()}` } });
  assert.equal((await check.json()).snapshot[FOUNDATION_KEY], JSON.stringify(progress));
});
