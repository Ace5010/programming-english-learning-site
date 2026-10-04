import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession, courseActivity, speakingEligible, hasAdaptiveContent } from '../src/adaptiveLearning.ts';
import { createDailyProgress, createDailySession, updateDailyDraft, submitDailyAnswer, parseDailyProgress, speechCompletion } from '../src/dailyProgress.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { vocabulary } from '../src/vocabulary.ts';
import { dailyPhrases } from '../src/dailyCourse.ts';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { ProgressSync } from '../src/progressSync.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';
const now = 1791000000000;
const catalogues = { daily: adaptiveDailyLessons, programming: adaptiveProgrammingLessons };
const reports = [];
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/speaking-first');
const current = (progress, lessons) => resolveAdaptiveLesson(progress.session, lessons).exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
function answer(progress, lessons, skip = false) {
  const task = current(progress, lessons), resolved = resolveAdaptiveLesson(progress.session, lessons);
  progress = { ...progress, session: updateDailyDraft(progress.session, correctDraft(task)) };
  const at = now + (progress.learning?.turns ?? 0) * 1000;
  progress = recordAdaptiveAnswer(submitDailyAnswer(progress, resolved, { skipSpeech: skip && task.kind === 'speak' }, at), lessons, at);
  assert.ok(progress.session.feedback, task.id);
  assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, true);
  return advanceAdaptiveSession(progress, lessons, at);
}
for (const [section, lessons] of Object.entries(catalogues)) {
  test(`${section}: real selection across fixed seeds, ordinary activity mix and bounded continuation`, () => {
    const counts = { speaking: 0, understanding: 0, input: 0 };
    let maximumInput = 0;
    for (const seed of [.01, .19, .37, .51, .79, .99]) {
      let progress = createDailyProgress();
      const rounds = [];
      for (let round = 0; round < 12; round++) {
        if (section === 'programming' && !hasAdaptiveContent(progress, lessons)) break;
        const session = planAdaptiveSession(progress, lessons, now + round * 100000, () => seed);
        assert.ok(session, 'new and weak material must produce a next round');
        progress = beginAdaptiveLearning({ ...progress, session }, lessons, now);
        if (!round && section === 'daily') assert.equal(current(progress, lessons).speechActivity, 'repeat', 'beginners can repeat immediately');
        const distribution = { speaking: 0, understanding: 0, input: 0 };
        const seenOral = new Set();
        let run = 0;
        while (progress.session.stage !== 'summary') {
          const task = current(progress, lessons), activity = courseActivity(task);
          assert.ok(progress.session.answers.length < 20);
          const allowed = new Set(Object.keys(progress.learning.targets));
          assert.ok(task.knowledgeIds.every(id => allowed.has(id)));
          assert.ok((task.prerequisiteIds ?? []).every(id => allowed.has(id)));
          if (activity === 'speaking') {
            assert.equal(task.readAloud.length, 1, 'one ordinary utterance per budget item');
            const key = `${task.readAloud[0].en}:${task.speechActivity}:${task.speechSupport}`;
            assert.equal(seenOral.has(key), false, 'same material/mode cannot repeat by changing IDs');
            seenOral.add(key);
          }
          distribution[activity]++; counts[activity]++;
          run = activity === 'input' ? run + 1 : 0;
          maximumInput = Math.max(maximumInput, run);
          assert.ok(run <= 2);
          progress = answer(progress, lessons);
        }
        if (section === 'daily') assert.ok(distribution.speaking >= 3);
        else {
          assert.equal(distribution.speaking, 0);
          assert.ok(distribution.input <= 1);
          assert.equal(progress.session.answers.length, Math.min(10, session.adaptive.focusIds.length * 2));
          assert.deepEqual(session.adaptive.focusIds, session.adaptive.newIds);
        }
        assert.ok(distribution.understanding > 0);
        rounds.push({ round: round + 1, distribution, focus: session.adaptive.focusIds, admitted: Object.values(progress.learning.targets).filter(item => item.readyAt).length });
      }
      if (section === 'daily') assert.ok(Object.values(progress.learning.targets).some(item => item.readyAt), 'actual objective checks still earn admission');
      else {
        assert.equal(rounds.length, Math.ceil(new Set(lessons.flatMap(lesson => lesson.learningTargets)).size / 6));
        assert.equal(hasAdaptiveContent(progress, lessons), false);
        assert.ok(Object.values(progress.learning.targets).every(item => item.introducedAt && !item.readyAt));
      }
      reports.push({ section, seed, rounds });
    }
    const total = Object.values(counts).reduce((a,b) => a+b,0);
    const desired = section === 'daily' ? .6 : 0;
    assert.ok(Math.abs(counts.speaking / total - desired) < .08, JSON.stringify(counts));
    assert.ok(counts.input / total < .23, JSON.stringify(counts));
    reports.push({ section, totals: counts, shares: Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,value/total])), maximumInput });
    mkdirSync(output, { recursive: true });
    writeFileSync(path.join(output, 'selection.json'), JSON.stringify(reports, null, 2));
  });
  test(`${section}: all teaching ranges contain full repeat and reduced support candidates with existing recordings`, () => {
    for (const lesson of lessons) {
      const oral = lesson.practice.filter(item => item.kind === 'speak' && item.speechActivity);
      assert.ok(oral.some(item => item.speechActivity === 'repeat'));
      assert.ok(oral.some(item => item.speechActivity === 'recall'));
      assert.ok(lesson.learningTargets.every(id => oral.some(item => item.knowledgeIds.includes(id))), 'every formal target has a short oral opportunity');
      for (const task of oral) for (const phrase of [...task.readAloud, ...(task.speechQuestion ? [task.speechQuestion] : [])]) {
        if (section === 'daily') assert.equal(dailyPhrases.find(item => item.id === phrase.id)?.en, phrase.en);
        else {
          const word = vocabulary.find(item => item.id === Number(phrase.id.split('-')[1]));
          assert.equal(phrase.en, phrase.id.startsWith('example-') ? word.example : word.word);
        }
      }
    }
  });
  test(`${section}: ${section === 'daily' ? 'cannot speak path' : 'check without speech'} finishes and schedules next round without claiming familiarity`, () => {
    let progress = createDailyProgress();
    progress.session = planAdaptiveSession(progress, lessons, now, () => .37);
    progress = beginAdaptiveLearning(progress, lessons, now);
    while (progress.session.stage !== 'summary') progress = answer(progress, lessons, true);
    assert.ok(planAdaptiveSession(progress, lessons, now+100000, () => .5));
    assert.equal(progress.learning.selfKnown, undefined);
    if (section === 'programming') assert.ok(progress.session.answers.every(item => item.ability !== 'speaking'));
    for (const item of progress.session.answers.filter(item=>item.ability==='speaking')) {
      assert.equal(item.speech.source, 'skipped'); assert.equal(item.correct, false);
    }
    assert.equal(progress.lessons[progress.session.lessonId].skills.speaking.attempts, 0);
  });
}
test('supported programming sentence with an unintroduced technical helper is material, not homework', () => {
  const lessons = adaptiveProgrammingLessons;
  const task = lessons.flatMap(lesson=>lesson.practice).find(item=>item.speechActivity === 'repeat' && item.readAloud[0].en === 'Use checkout to change branches.');
  assert.ok(task);
  const lesson = lessons.find(item=>item.practice.includes(task));
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, lessons, now, () => .37);
  progress = beginAdaptiveLearning(progress, lessons, now);
  // Branch is confirmed for this activity; feature stays an auxiliary word.
  const id = task.knowledgeIds[0];
  progress.learning.targets[id] = { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 };
  const helpers = task.supportWords.map(item=>item.en.toLowerCase());
  assert.ok(helpers.includes('change'));
  const feature = vocabulary.find(item=>item.word==='change');
  assert.equal(progress.learning.targets[`word-${feature.id}`], undefined);
  assert.equal(speakingEligible(task, progress.learning, new Set([id])), true);
  progress.session = { ...progress.session, lessonId: lesson.id, adaptive: { ...progress.session.adaptive, sourceLessonId: lesson.id, focusIds: [id], newIds: [id] }, queue: [{exerciseId:task.id,retry:false}], index:0, answers:[], feedback:null, draft:correctDraft(task) };
  const before = JSON.stringify(progress.learning.targets[id]);
  progress = answer(progress, lessons);
  assert.equal(progress.learning.targets[id].confidence, JSON.parse(before).confidence);
  assert.equal(progress.learning.targets[id].readyAt, 0);
  assert.equal(progress.learning.targets[`word-${feature.id}`], undefined);
  assert.equal(progress.knowledge?.[`word-${feature.id}`], undefined);
  assert.equal(progress.learning.selfKnown?.[`word-${feature.id}`], undefined);
  assert.equal(speakingEligible({ ...task, speechActivity:'answer' }, progress.learning, new Set([id])), false);
  assert.ok(lessons.flatMap(item=>item.practice).some(item=>item.kind==='choice' && item.prerequisiteIds.includes(`word-${feature.id}`)), 'ordinary assessment retains helper scope protection');
});
test('speech sources, mode and reference use survive serialization and distinguish edited/manual from ASR', () => {
  const task = adaptiveDailyLessons.flatMap(item=>item.practice).find(item=>item.speechActivity==='answer' && item.readAloud[0].id !== item.speechQuestion.id);
  const draft = correctDraft(task);
  draft.speech = { mode:'self', transcripts:{}, sources:{self:'recognition'}, revealed:[], heard:[task.speechQuestion.id] };
  assert.equal(speechCompletion(task,draft).usedReference,false);
  assert.equal(speechCompletion(task,draft).source,'recognition');
  draft.speech.sources.self='edited'; draft.speech.revealed=['self'];
  assert.equal(speechCompletion(task,draft).usedReference,true);
  assert.equal(speechCompletion(task,draft).source,'edited');
  draft.speech.sources.self='typed';
  assert.equal(speechCompletion(task,draft).source,'typed');
});
test('daily full teaching scope earns admission through actual interleaved objective checks, never oral confidence', () => {
  const lessons = adaptiveDailyLessons;
  let progress = createDailyProgress(), rounds = 0, activities = 0;
  while (hasAdaptiveContent(progress, lessons)) {
    assert.ok(rounds < 180, 'keep the original complete-course guard, not a raised test limit');
    progress.session = planAdaptiveSession(progress, lessons, now + rounds * 100000, () => ((rounds * 137 + 371) % 997) / 997);
    assert.ok(progress.session);
    progress = beginAdaptiveLearning(progress, lessons, now + rounds * 100000);
    while (progress.session.stage !== 'summary') {
      const task = current(progress, lessons), before = task.knowledgeIds.map(id => progress.learning.targets[id].confidence);
      progress = answer(progress, lessons); activities++;
      if (task.kind === 'speak') assert.deepEqual(task.knowledgeIds.map(id => progress.learning.targets[id].confidence), before);
    }
    rounds++;
  }
  assert.equal(Object.keys(progress.learning.targets).length, new Set(lessons.flatMap(lesson => lesson.learningTargets)).size);
  assert.ok(Object.values(progress.learning.targets).every(target => target.readyAt > 0));
  mkdirSync(output, {recursive:true});
  writeFileSync(path.join(output, 'daily-complete.json'), JSON.stringify({rounds, activities, targets:progress.learning.targets},null,2));
});
test('oral draft, completion provenance and material exposure survive isolated two-client sync', async () => {
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, adaptiveDailyLessons, now, () => .37);
  progress = beginAdaptiveLearning(progress, adaptiveDailyLessons, now);
  const task = current(progress, adaptiveDailyLessons), draft = correctDraft(task);
  draft.speech = { mode:'read', transcripts:{[task.readAloud[0].id]:task.readAloud[0].en}, sources:{[task.readAloud[0].id]:'edited'}, heard:[task.readAloud[0].id], revealed:[] };
  progress.session = updateDailyDraft(progress.session, draft);
  progress = recordAdaptiveAnswer(submitDailyAnswer(progress, resolveAdaptiveLesson(progress.session, adaptiveDailyLessons), {}, now), adaptiveDailyLessons, now);
  assert.equal(progress.session.answers[0].speech.source, 'edited');
  const server = syncServer(), a = new MemoryStore(), b = new MemoryStore();
  const first = new ProgressSync({storage:a,fetch:server.fetch,validate:validateProgressSnapshot});
  const second = new ProgressSync({storage:b,fetch:server.fetch,validate:validateProgressSnapshot});
  first.initialize();second.initialize();a.setItem('codewords-daily-v1',JSON.stringify(progress));
  await first.connect();await second.connect(first.code());
  assert.equal(second.status.state,'synced');
  assert.deepEqual(JSON.parse(b.getItem('codewords-daily-v1')),progress);
  assert.equal(b.getItem('codewords-programming-course-v1'),null);
  progress.session.answers[0].speech.source='made-up';
  assert.equal(parseDailyProgress(JSON.stringify(progress),adaptiveDailyLessons).writable,false);
});
test('missing oral and understanding candidates end a round without a third consecutive keyboard response', () => {
  const tasks = Array.from({length:7},(_,i)=>({id:`input-${i}`,kind:'fill',prompt:`题目 ${i}`,parts:['',''],blanks:[['word']],explanation:'释义',knowledgeIds:['word'],learningDifficulty:'recall',learningSignature:`input-${i}`}));
  const lessons = [{id:'fallback',title:'补练',goal:'练习',explanation:'讲解',phrases:[{id:'word',en:'word',zh:'词'}],exercises:tasks,rechecks:[],practice:[],learningTargets:['word'],learningGoal:'communication'}];
  let progress=createDailyProgress();progress.session=planAdaptiveSession(progress,lessons,now,()=>.37);
  progress=beginAdaptiveLearning(progress,lessons,now);
  while(progress.session.stage!=='summary')progress=answer(progress,lessons);
  assert.equal(progress.session.answers.length,2);
  assert.ok(planAdaptiveSession(progress,lessons,now+100000,()=>.37));
});
test('known incidental words reset actual spacing without new knowledge or confidence', () => {
  const lessons = adaptiveProgrammingLessons;
  const lesson = lessons.find(item=>item.id==='P1-01-03');
  const task = lesson.practice.find(item=>item.speechActivity==='repeat'&&item.readAloud[0].en==='Use checkout to change branches.');
  const helper = vocabulary.find(item=>item.word==='change'), id=`word-${helper.id}`;
  let progress=createDailyProgress();
  progress.session={...createDailySession({...lesson,exercises:[task]},'lesson',now),adaptive:{version:1,round:1,sourceLessonId:lesson.id,focusIds:task.knowledgeIds,newIds:task.knowledgeIds,seed:1,budget:1}};
  progress=beginAdaptiveLearning(progress,lessons,now);
  progress.learning.turns=10;
  const before={introducedAt:now,confidence:.6,abilities:{context:.6},lastSeenTurn:1,lastFailureTurn:0,signatures:[],transfer:false,readyAt:0};
  progress.learning.targets[id]={...before};
  progress=answer(progress,lessons);
  assert.equal(progress.learning.targets[id].lastSeenTurn,11);
  const after={...progress.learning.targets[id],lastSeenTurn:before.lastSeenTurn};
  assert.deepEqual(after,before);
  assert.equal(progress.knowledge[id],undefined);
});
