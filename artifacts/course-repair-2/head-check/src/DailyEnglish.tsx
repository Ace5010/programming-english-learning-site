import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import Icon from './Icon';
import { progressStorage, blockSyncApply } from './progressStorage';
import { downloadRecord } from './nativeAndroid';
import SpeechControls, { type PlaybackSpeed } from './SpeechControls';
import DailySpeaking, { dailySpeakingMode } from './DailySpeaking';
import ReadAloudText, { ReadingControls, clickedReadingText, useReading } from './ReadAloud';
import type { FeedbackSound } from './feedbackAudio';
import CorrectionNotice from './CorrectionNotice';
import CoursePairs from './CoursePairs';
import CourseOverview from './CourseOverview';
import { courseOverview } from './courseOverviewData';
import { studyGroups, studyTitle } from './courseStudy';
import { answerFingerprint } from './answerCorrection';
import { dailyWordTargets, localWordError } from './dailyWordTargets';
import { planWordPractice } from './adaptiveLearning';
import { createPairState, selectPair, pairsComplete } from './pairPractice';
import './coursePractice.css';
import { dailyPhrases as defaultPhrases, type DailyPhrase, type DailyLesson, type DailyUnit } from './dailyCourse';
import { adaptiveDailyUnits as defaultUnits } from './dailyPractice';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from './adaptiveLearning';
import type { LearningLesson } from './learningTypes';
import {
  DAILY_KEY, createDailyProgress, parseDailyProgress, persistDailyProgress,
  beginDailyExercises, updateDailyDraft, submitDailyAnswer, checkDailyAttempt, updateDailyPairs,
  advanceDailySession, finishDailySession, markDailyHelp, markDailyAudioHelp, checkDailyAnswer,
  findDailyExercise, summarizeDailySession, dailyReviewErrors, dueDailyLessons,
  learnDailyLesson, dailyLessonReviewable, dailyKnowledgeReviewable, nextDailyLesson, createDailyReviewSession, dailyExerciseAbility,
  type DailyProgress, type DailyDraft, type DailyMode, type DailyAbility, type DailySession,
} from './dailyProgress';
import './daily.css';

type View = 'course' | 'review' | 'library' | 'favorites';
export interface DailyCurriculum {
  key: string;
  label: string;
  units: DailyUnit[];
  phrases: DailyPhrase[];
  description: string;
  contentId?: string;
  libraryNoun?: string;
  targetLabel?: (id: string) => string;
  renderStudy?: (lesson: LearningLesson) => ReactNode;
  renderLibrary?: (props: { progress: DailyProgress; writable: boolean; favorites: boolean; toggleFavorite: (id: string) => void }) => ReactNode;
  onProgress?: (progress: DailyProgress) => void;
  prepareLearning?: (progress: DailyProgress) => DailyProgress;
  prepareProgress?: (progress: DailyProgress) => DailyProgress;
  /** A curriculum can schedule from its existing skill records without duplicating them. */
  review?: {
    options: { value: string; label: string }[];
    ability: (exercise: DailyLesson['exercises'][number]) => string;
    lessons: (progress: DailyProgress, lessons: DailyLesson[], focus?: string) => DailyLesson[];
    difficulties: (lesson: DailyLesson, focus?: string) => string[];
    session: (lesson: DailyLesson, focus: string) => DailySession;
  };
}
interface Props {
  active: boolean;
  view: View;
  navigation: number;
  voice: 'aria' | 'guy';
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  speaking: string;
  play: (phrase: DailyPhrase, slow?: boolean) => void;
  playFeedback: (sound: FeedbackSound, eventId: string) => void;
  preload: (files: string[]) => void;
  stopAudio: () => void;
  openVoice: () => void;
  openLibrary: () => void;
  contentRef?: RefObject<HTMLElement | null>;
  headingRef?: RefObject<HTMLElement | null>;
  curriculum?: DailyCurriculum;
  renderReview?: (scenarios: ReactNode) => ReactNode;
  reviewDescription?: string;
  foundationHelp?: (phrase: DailyPhrase) => ReactNode;
}

function loadProgress(key: string, lessons: DailyLesson[]) {
  try { return parseDailyProgress(localStorage.getItem(key), lessons); }
  catch { return { progress: createDailyProgress(), writable: false, warning: '浏览器暂时无法读取课程记录。请恢复存储权限后重新加载。', raw: null }; }
}

export default function DailyEnglish({ active, view, navigation, voice, speed, onSpeedChange, speaking, play, playFeedback, preload, stopAudio, openVoice, openLibrary, contentRef, headingRef, curriculum, renderReview, reviewDescription, foundationHelp }: Props) {
  const reading = useReading();
  const storageKey = curriculum?.key ?? DAILY_KEY;
  const label = curriculum?.label ?? '日常英语';
  const libraryNoun = curriculum?.libraryNoun ?? '词汇';
  const dailyUnits = curriculum?.units ?? defaultUnits;
  const dailyPhrases = curriculum?.phrases ?? defaultPhrases;
  const dailyLessons = useMemo(() => dailyUnits.flatMap(unit => unit.lessons), [dailyUnits]);
  const learningLessons = dailyLessons as LearningLesson[];
  const scheduledLessons = dailyLessons.filter(item => !(item as LearningLesson).referenceOnly);
  const findDailyLesson = (id: string) => dailyLessons.find(lesson => lesson.id === id);
  const onProgress = useRef(curriculum?.onProgress);
  onProgress.current = curriculum?.onProgress;
  const [initial] = useState(() => loadProgress(storageKey, dailyLessons));
  const [progress, setProgress] = useState(initial.progress);
  const current = useRef(progress);
  const storedRaw = useRef(initial.raw);
  const [writable, setWritable] = useState(initial.writable);
  const [warning, setWarning] = useState(initial.warning);
  const [sessionOpen, setSessionOpen] = useState(!!initial.progress.session);
  const visibleProgress = curriculum?.prepareProgress?.(progress) ?? progress;
  const prepared = curriculum?.prepareLearning?.(visibleProgress) ?? visibleProgress;
  const canLearnMore = hasAdaptiveContent(prepared, learningLessons);
  const nextLesson = canLearnMore ? nextDailyLesson(progress, scheduledLessons) ?? scheduledLessons[0] : undefined;
  const [pendingStart, setPendingStart] = useState<{ lesson: DailyLesson; mode: DailyMode } | null>(null);
  const [reviewFocus, setReviewFocus] = useState<string>('auto');
  const [query, setQuery] = useState('');
  const [favoritesQuery, setFavoritesQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'learned' | 'favorites'>('all');
  const [needsInput, setNeedsInput] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const studyRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const session = visibleProgress.session;
  const lesson = session ? session.adaptive ? resolveAdaptiveLesson(session, learningLessons) : findDailyLesson(session.lessonId) : undefined;
  const groups = lesson ? studyGroups(lesson.phrases) : [];
  const newGroup = groups.find(group => session?.adaptive?.newIds.includes((group.word ?? group.expression)!.id));
  const guidePhrase = newGroup?.example ?? newGroup?.expression ?? groups.find(group => group.example)?.example ?? groups.find(group => group.expression)?.expression;
  const exercise = session && lesson ? findDailyExercise(lesson, session.queue[session.index]?.exerciseId ?? '') : undefined;
  const phrase = exercise?.audioId ? dailyPhrases.find(item => item.id === exercise.audioId) : undefined;
  const overview = view === 'course' ? courseOverview(prepared, learningLessons) : null;
  const completed = progress.learning?.rounds ?? dailyLessons.filter(item => progress.lessons[item.id]?.completedAt).length;
  const dueLessons = dueDailyLessons(progress, scheduledLessons, Date.now(), curriculum?.review ? 'auto' : reviewFocus as DailyAbility | 'auto');
  const difficultLessons = scheduledLessons.filter(item => dailyLessonReviewable(progress, item) && dailyReviewErrors(progress, item, reviewFocus as DailyAbility | 'auto').length > 0);
  const reviewLessons = curriculum?.review?.lessons(progress, dailyLessons, reviewFocus) ?? [...new Set([...dueLessons, ...difficultLessons])];
  const lessonDifficulties = (item: DailyLesson) => curriculum?.review?.difficulties(item, reviewFocus) ?? dailyReviewErrors(progress, item, reviewFocus as DailyAbility | 'auto');
  const learnedLessons = scheduledLessons.filter(item => dailyLessonReviewable(progress, item));
  const sessionVisible = !!session && !!lesson && (session.mode === 'lesson'
    ? view === 'course' || !!session.wordPractice
    : view === 'review' && dailyLessonReviewable(progress, lesson));
  const showSession = active && sessionOpen && sessionVisible;
  const feedback = session?.feedback;
  useEffect(() => {
    blockSyncApply(storageKey, !writable || speechBusy);
    return () => blockSyncApply(storageKey, false);
  }, [storageKey, writable, speechBusy]);
  const compactFeedback = feedback && feedback.correct && feedback.outcome !== 'revealed';
  const correction = session?.draft.correction;
  const wordError = exercise && session && (correction || feedback && feedback.outcome !== 'independent')
    ? localWordError(exercise, correction ? { ...session.draft, text: correction.original } : session.draft) : undefined;
  const retryUnchanged = !!correction && !!session && answerFingerprint(session.draft) === correction.fingerprint;
  const feedbackTitle = feedback?.outcome === 'self' ? session?.draft.speech?.mode === 'read' ? '这组表达已完成跟读' : '已记录你的自查' : exercise?.kind === 'match' ? '配对完成' : feedback?.outcome === 'revealed' ? '看看这句怎么表达' : feedback?.correct ? correction ? '修改正确' : session?.draft.helped ? '借助提示完成了' : '回答正确' : '再看一下这里';

  function notifyProgress(next: DailyProgress) {
    try { onProgress.current?.(next); }
    catch (error) {
      setWritable(false);
      setWarning(`课程记录已保存，复习记录尚未同步。${error instanceof Error ? error.message : '请重新加载记录后重试。'} 当前进度仍保留。`);
    }
  }

  function commit(next: DailyProgress) {
    if (!writable) return false;
    let result;
    try { result = persistDailyProgress(progressStorage, next, storedRaw.current, storageKey); }
    catch {
      current.current = next; setProgress(next);
      setWarning('浏览器无法访问存储。本页输入仍在，请导出记录，恢复存储权限后再继续。');
      setWritable(false); return false;
    }
    current.current = result.progress;
    setProgress(result.progress);
    if (result.saved) { storedRaw.current = result.raw; notifyProgress(result.progress); }
    else { setWarning(result.warning); setWritable(false); }
    return result.saved;
  }

  useEffect(() => {
    if (initial.writable) notifyProgress(initial.progress);
  }, [initial]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      if (event.newValue === storedRaw.current) return;
      setWarning('另一个页面更新了课程记录。当前输入仍保留在此页面，请重新加载最新记录后继续，以免覆盖。');
      setWritable(false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  useEffect(() => { setSessionOpen(false); setPendingStart(null); stopAudio(); }, [view, navigation, stopAudio]);
  useEffect(() => { if (!active) stopAudio(); else setSessionOpen(!!current.current.session); }, [active, stopAudio]);
  useEffect(() => {
    if (!showSession) return;
    if (!session?.feedback && session?.stage !== 'summary') stopAudio();
    setNeedsInput(false);
    const frame = requestAnimationFrame(() => {
      if (session?.stage === 'study' || session?.stage === 'summary') studyRef.current?.focus();
      else if (session?.feedback) {
        if (feedbackRef.current) {
          feedbackRef.current.focus({ preventScroll: true });
          feedbackRef.current.scrollIntoView({ block: 'center', behavior: 'instant' });
        } else submitRef.current?.focus();
      }
      else {
        const correction = formRef.current?.querySelector<HTMLElement>('.answer-correction');
        if (correction) {
          correction.focus({ preventScroll: true });
          correction.scrollIntoView({ block: 'center', behavior: 'instant' });
        } else formRef.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, .daily-option, .daily-token, .daily-audio')?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showSession, session?.id, session?.stage, session?.index, !!session?.feedback, stopAudio]);

  function start(lessonToStart: DailyLesson, mode: DailyMode, replace = false) {
    if (!writable) return;
    if (mode !== 'lesson' && !dailyLessonReviewable(current.current, lessonToStart)) return;
    const compatibleProgress = curriculum?.prepareProgress?.(current.current) ?? current.current;
    const sourceProgress = mode === 'lesson' ? curriculum?.prepareLearning?.(compatibleProgress) ?? compatibleProgress : compatibleProgress;
    const previous = sourceProgress.session;
    if (previous && previous.stage !== 'summary' && !replace) {
      if (previous.mode === mode && (mode === 'lesson' || previous.lessonId === lessonToStart.id)) { setSessionOpen(true); return; }
      setPendingStart({ lesson: lessonToStart, mode });
      return;
    }
    const nextSession = mode === 'lesson' ? planAdaptiveSession(replace ? { ...sourceProgress, session: null } : sourceProgress, learningLessons)
      : curriculum?.review?.session(lessonToStart, reviewFocus) ?? createDailyReviewSession(current.current, lessonToStart, reviewFocus as DailyAbility | 'auto');
    if (!nextSession?.queue.length) return;
    commit({ ...sourceProgress, session: nextSession });
    setPendingStart(null);
    setSessionOpen(true);
    stopAudio();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function draft(change: Partial<DailyDraft>) {
    const now = current.current;
    if (!now.session) return;
    commit({ ...now, session: updateDailyDraft(now.session, change) });
    setNeedsInput(false);
  }

  function practiceWords(ids: string[]) {
    if (!writable) return;
    const next = planWordPractice(prepared, learningLessons, ids);
    if (!next) return;
    if (commit({ ...prepared, session: next })) { setSessionOpen(true); stopAudio(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  }

  function checkOrContinue() {
    const now = current.current;
    if (!now.session || !lesson || !exercise || composing.current || !writable || speechBusy) return;
    if (now.session.feedback) {
      stopAudio();
      const next = now.session.adaptive ? advanceAdaptiveSession(now, learningLessons) : advanceDailySession(now, lesson);
      if (commit(next) && next.session?.stage === 'summary' && now.session.stage !== 'summary') playFeedback('complete', `${storageKey}:${now.session.id}`);
      return;
    }
    if (!checkDailyAnswer(exercise, now.session.draft).complete && !now.session.draft.revealed) {
      setNeedsInput(true);
      if (exercise.kind === 'fill') {
        const index = now.session.draft.blanks.findIndex(value => !value.trim());
        formRef.current?.querySelector<HTMLInputElement>(`[data-blank="${index}"]`)?.focus();
      } else if (exercise.kind === 'speak') {
        formRef.current?.querySelector<HTMLElement>(dailySpeakingMode(now.session.draft) === 'read' ? '.speech-target:not(.matched) .speech-mic' : !now.session.draft.text.trim() ? 'textarea' : 'input[type=checkbox]:not(:checked)')?.focus();
      } else formRef.current?.querySelector<HTMLElement>('textarea, .daily-option, .daily-token')?.focus();
      return;
    }
    const next = recordAdaptiveAnswer(checkDailyAttempt(now, lesson), learningLessons);
    if (next === now) return;
    if (commit(next) && next.session?.feedback?.correct && !['self', 'revealed'].includes(next.session.feedback.outcome)) {
      playFeedback('correct', `${storageKey}:${now.session.id}:${now.session.index}`);
    }
  }

  function readingHint() {
    const now = current.current;
    if (exercise?.kind === 'listen' && lesson && now.session && !now.session.feedback && !now.session.draft.helped && writable) commit(recordAdaptiveAnswer(markDailyAudioHelp(now, lesson), learningLessons));
  }

  function showHelp(reveal = false) {
    if (!lesson) return;
    let next = markDailyHelp(current.current, lesson, reveal);
    if (reveal || exercise?.kind === 'match' && pairsComplete(exercise.pairs ?? [], next.session?.draft.pairs)) next = submitDailyAnswer(next, lesson, { reveal });
    commit(recordAdaptiveAnswer(next, learningLessons));
  }

  function matchPair(id: string) {
    if (!lesson || !exercise || !writable) return;
    const now = current.current;
    let next = updateDailyPairs(now, lesson, id);
    if (next === now) return;
    next = recordAdaptiveAnswer(next, learningLessons);
    const complete = pairsComplete(exercise.pairs ?? [], next.session?.draft.pairs);
    if (complete) next = recordAdaptiveAnswer(submitDailyAnswer(next, lesson), learningLessons);
    if (commit(next)) {
      if (complete && next.session?.feedback?.correct) playFeedback('correct', `${storageKey}:${next.session.id}:${next.session.index}`);
      else if (next.session?.draft.pairs?.matches[id] === 'independent' || next.session?.draft.pairs?.matches[id] === 'assisted') playFeedback('pair', `${storageKey}:${next.session!.id}:${next.session!.index}:${id}`);
    }
  }

  function reloadSaved() {
    const next = loadProgress(storageKey, dailyLessons);
    storedRaw.current = next.raw;
    current.current = next.progress;
    setProgress(next.progress);
    setWarning(next.warning);
    setWritable(next.writable);
    setSessionOpen(!!next.progress.session);
    setPendingStart(null);
    if (next.writable) notifyProgress(next.progress);
  }

  function exportRecord() {
    // A failed save can leave a newer draft in memory. Export both versions,
    // including the exact original text when the stored record is damaged.
    const content = JSON.stringify(warning ? { savedRaw: storedRaw.current, currentProgress: current.current, warning } : current.current, null, 2);
    downloadRecord(`${storageKey}-record.json`, content);
  }

  const speechControls = <SpeechControls speed={speed} onSpeedChange={onSpeedChange} voice={voice} openVoice={openVoice} />;
  const audioButton = (audioPhrase: DailyPhrase, slow = false, label?: string, iconOnly = false) => {
    const key = `daily-${audioPhrase.id}-${slow ? 'slow' : 'normal'}`;
    return <button type="button" className={`daily-audio${speaking === key ? ' playing' : ''}${iconOnly ? ' icon-only' : ''}`} aria-label={slow ? !feedback && (exercise?.kind === 'listen' || exercise?.audioPrompt) ? '慢速播放录音' : `慢速朗读 ${audioPhrase.en}` : iconOnly ? label ?? '播放语音' : undefined} title={iconOnly ? label : undefined} aria-pressed={speaking === key} onClick={() => play(audioPhrase, slow)}><Icon name="sound" />{!iconOnly && (label ?? '播放语音')}</button>;
  };
  const slowAudioButton = (audioPhrase: DailyPhrase, context = '朗读') => <button type="button" className={`daily-inline-slow${speaking === `daily-${audioPhrase.id}-slow` ? ' playing' : ''}`} aria-label={`慢速${context} ${audioPhrase.en}`} aria-pressed={speaking === `daily-${audioPhrase.id}-slow`} onClick={() => play(audioPhrase, true)}>慢速</button>;
  const hasFocus = (item: DailyLesson) => reviewFocus === 'auto' || [...item.exercises, ...((item as LearningLesson).practice ?? [])].some(task => (curriculum?.review?.ability(task) ?? dailyExerciseAbility(task)) === reviewFocus);
  const reviewOptions = curriculum?.review?.options ?? [
    { value: 'meaning', label: '理解' }, { value: 'listening', label: '听力' }, { value: 'writing', label: '排序与书写' },
    ...(dailyLessons.some(item => item.exercises.some(task => task.kind === 'speak')) ? [{ value: 'speaking', label: '口语' }] : []),
  ];
  const phraseLearned = (id: string) => !!progress.knowledge?.[id] || dailyLessons.some(item => !!progress.lessons[item.id]?.completedAt && item.phrases.some(phrase => phrase.id === id));
  const showingFavorites = view === 'favorites';
  const listQuery = showingFavorites ? favoritesQuery : query;
  const updateListQuery = showingFavorites ? setFavoritesQuery : setQuery;
  const favoriteCount = dailyPhrases.filter(item => progress.favorites?.includes(item.id)).length;
  const libraryPhrases = dailyPhrases.filter(item => (showingFavorites ? progress.favorites?.includes(item.id) : libraryFilter === 'all' || libraryFilter === 'learned' && phraseLearned(item.id) || libraryFilter === 'favorites' && progress.favorites?.includes(item.id))
    && `${item.en} ${item.zh}`.toLocaleLowerCase().includes(listQuery.trim().toLocaleLowerCase()));
  const warmupFiles = JSON.stringify((!active ? [] : showSession ? [...(phrase ? [phrase] : []), ...(lesson?.phrases ?? [])] : view === 'library' || view === 'favorites' ? libraryPhrases.slice(0, 8) : [])
    .map(item => `${item.id}.mp3?v=${encodeURIComponent(item.en)}`));
  useEffect(() => { preload(JSON.parse(warmupFiles) as string[]); }, [warmupFiles, preload]);
  const customReview = view === 'review' && !!renderReview;
  const toggleFavorite = (id: string) => commit({ ...current.current, favorites: current.current.favorites?.includes(id)
    ? current.current.favorites.filter(value => value !== id) : [...(current.current.favorites ?? []), id] });
  const scenarios = <>
    <div className="daily-panel-heading">{!customReview && <h2>现在可以复习</h2>}<label className="daily-workbook-filter">练习内容<select aria-label="复习内容" value={reviewFocus} onChange={event => setReviewFocus(event.target.value as typeof reviewFocus)}><option value="auto">系统安排</option>{reviewOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    {reviewLessons.filter(hasFocus).length ? <ol className="daily-lessons">{reviewLessons.filter(hasFocus).map(item => <li className="daily-lesson-row" key={item.id}><div className="daily-lesson-copy"><h3>{item.title}</h3><p>{lessonDifficulties(item).length ? '有需要再练的内容' : '已到复习时间'}</p></div><button className="daily-button" disabled={!writable} onClick={() => start(item, 'review')}>开始复习<Icon name="arrow" /></button></li>)}</ol> : customReview ? <p className="daily-review-empty">{learnedLessons.length ? '暂时没有到期的场景练习。' : '课程中表现稳定的内容会出现在这里。'}</p> : <div className="daily-empty"><h2>{learnedLessons.length ? '暂时没有到期复习' : '先学习当前课程'}</h2><p>{learnedLessons.length ? '可以在下面选择已学内容提前练习。' : '在课程中反复练习，表现稳定的内容才会加入复习。'}</p></div>}
    {learnedLessons.filter(hasFocus).length > 0 && <details className="daily-early-review"><summary>主动练习已学内容</summary><ol className="daily-lessons">{learnedLessons.filter(hasFocus).map(item => <li className="daily-lesson-row" key={item.id}><div className="daily-lesson-copy"><h3>{item.title}</h3></div><button className="daily-button" disabled={!writable} onClick={() => start(item, 'review')}>开始练习</button></li>)}</ol></details>}
  </>;

  // Review is a word/expression workspace. Keep the existing admission and
  // scheduling rules; choosing a target opens its existing context exercises.
  const reviewTargets = [...new Map(learnedLessons.filter(hasFocus).flatMap(source => {
    const targetIds = (source as LearningLesson).learningTargets;
    return source.phrases.filter(item => (!targetIds || targetIds.includes(item.id))
      && (dailyKnowledgeReviewable(progress, item.id) || !progress.learning && !!progress.lessons[source.id]?.completedAt))
      .map(item => [item.id, { item, source }] as const);
  })).values()];
  const nextReview = session?.mode === 'review' && session.stage !== 'summary' && lesson
    ? lesson : reviewLessons.find(hasFocus) ?? learnedLessons.find(hasFocus);
  const dailyReview = <section className="daily-panel expression-review">
    <div className="review-list-heading"><h2>已学词汇</h2><button className="daily-button primary" disabled={!writable || !nextReview} onClick={() => nextReview && start(nextReview, 'review')}>{session?.mode === 'review' && session.stage !== 'summary' ? '继续练习' : '开始练习'}<Icon name="arrow" /></button></div>
    <div className="daily-panel-heading"><label className="daily-workbook-filter">练习内容<select aria-label="复习内容" value={reviewFocus} onChange={event => setReviewFocus(event.target.value)}><option value="auto">系统安排</option>{reviewOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    {reviewTargets.length ? <ul className="daily-expression-list">{reviewTargets.map(({ item, source }) => <li className="daily-expression" key={item.id}>
      <div className="daily-expression-copy"><strong className="daily-meaning">{item.zh}</strong><div className="daily-inline-reading"><button className={`daily-expression-content${speaking === `daily-${item.id}-normal` ? ' playing' : ''}`} aria-label={`朗读 ${item.en}`} onClick={() => play(item, false)} lang="en">{item.en}</button>{slowAudioButton(item)}</div>{item.note && <p>{item.note}</p>}</div>
      <button className="daily-button" disabled={!writable} onClick={() => start(source, 'review')}>练习相关词汇</button>
    </li>)}</ul> : <div className="daily-empty"><h2>暂无可复习的词汇</h2><p>课程中巩固好的词汇会显示在这里。</p></div>}
  </section>;

  const studyPhrase = (item: DailyPhrase) => <div key={item.id} className={`daily-phrase${item.id.startsWith('word-') ? ' daily-phrase-word' : item.id.startsWith('example-') ? ' daily-phrase-example' : ''}${speaking.startsWith(`daily-${item.id}-`) ? ' playing' : ''}`}><span className="daily-meaning" lang="zh-CN"><ReadAloudText text={item.zh} /></span><div className="daily-inline-reading"><button type="button" className="daily-phrase-content" aria-label={`朗读 ${item.en}`} aria-pressed={speaking === `daily-${item.id}-normal`} onClick={() => play(item, false)}><strong lang="en">{item.en}</strong></button>{slowAudioButton(item)}</div>{item.id.startsWith('daily-word-') && <p>本轮重点词{dailyWordTargets.find(word => word.id === item.id)?.chunk && <> · <ReadAloudText text={dailyWordTargets.find(word => word.id === item.id)!.chunk!} /><ReadingControls text={dailyWordTargets.find(word => word.id === item.id)!.chunk!} /></>}</p>}{item.note && <p><ReadAloudText text={item.note} /></p>}</div>;

  return <main ref={contentRef} id={curriculum?.contentId ?? (storageKey === DAILY_KEY ? 'daily-content' : 'programming-content')} className={`content daily-content${customReview && !showSession ? ' programming-review-page' : ''}`} hidden={!active}>
    {warning && <div className="daily-notice" role="alert"><p>{warning.split('日常英语').join(label)}</p><button className="daily-button" onClick={exportRecord}>导出记录</button><button className="daily-button" onClick={reloadSaved}>重新加载记录</button></div>}
    {showSession && session && lesson ? <div className={`daily-session${session.stage === 'study' ? ' is-studying' : ''}`}>
      <div className="daily-session-top"><button className="daily-button text" onClick={() => { setSessionOpen(false); stopAudio(); }}>〈 返回{view === 'review' ? '复习' : '课程'}{writable ? ' · 已保存' : ''}</button>{speechControls}</div>
      <header ref={headingRef} className="daily-session-heading"><h1 ref={studyRef} tabIndex={-1}>{session.mode === 'review' ? '读音与用法练习' : studyTitle(lesson, session, dailyLessons)}</h1>
        {session.stage === 'study' && !curriculum?.renderStudy && <p className="daily-study-intro">{storageKey === DAILY_KEY ? '先看这些表达在什么场景使用，再读一读；准备好后，开始练习。' : '先认识下面的词语，看它们怎样用在句子里；准备好后，开始练习。'}</p>}
        {session.stage !== 'study' && <>{!session.adaptive && <span className="progress-track" role="progressbar" aria-label="本课练习进度" aria-valuemin={0} aria-valuemax={session.queue.length} aria-valuenow={session.answers.length}><i style={{ width: `${session.stage === 'summary' ? 100 : Math.min(100, session.answers.length / Math.max(1, session.queue.length) * 100)}%` }} /></span>}<span className="daily-session-label">{session.adaptive ? session.stage === 'summary' ? `本轮完成 ${session.answers.length} 题` : `已完成 ${session.answers.length} 题 · 题数按表现调整，最多 20 题` : `${session.answers.length} / ${session.queue.length} 项`}{session.queue[session.index]?.retry ? ' · 换一道题复查' : ''}</span></>}
      </header>
      {session.stage === 'exercise' && exercise && <p className="course-step"><strong>{exercise.kind === 'speak' ? '试着说出来' : exercise.learningDifficulty === 'recall' ? '回忆与运用' : exercise.learningDifficulty === 'context' ? '组合与理解' : '先认一认'}</strong></p>}
      {session.stage === 'study' && <section className="daily-study-card daily-enter">
        {curriculum?.renderStudy ? curriculum.renderStudy(lesson as LearningLesson) : <>
          {groups.some(group => group.word) && <div className="daily-study-columns" aria-hidden="true"><span>词语</span><span>例句</span></div>}
          <div className="daily-phrases">
            {groups.map(group => group.word ? <section className="daily-study-pair" key={group.word.id} aria-label={`${group.word.en} 词语与例句`}>
              <div className="daily-study-cell"><h2>词语</h2>{studyPhrase(group.word)}</div>
              {group.example && <div className="daily-study-cell"><h2>例句</h2>{studyPhrase(group.example)}</div>}
            </section> : <div className="daily-study-expression" key={group.expression!.id}>{studyPhrase(group.expression!)}</div>)}
          </div>
          {guidePhrase && foundationHelp?.(guidePhrase)}
        </>}
        <div className="daily-session-actions"><button className="daily-button primary" disabled={!writable} onClick={() => { stopAudio(); commit(session.adaptive ? beginAdaptiveLearning(current.current, learningLessons) : { ...learnDailyLesson(current.current, lesson), session: beginDailyExercises(session) }); }}>开始练习<Icon name="arrow" /></button></div>
      </section>}
      {session.stage === 'exercise' && exercise && <>
        <form ref={formRef} className="daily-question daily-enter" key={`${session.id}-${session.index}`} data-exercise-id={exercise.id} data-kind={exercise.kind} onSubmit={event => { event.preventDefault(); checkOrContinue(); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || composing.current) return;
          if (event.key === 'Enter' && (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox' || event.target instanceof HTMLTextAreaElement && (exercise.kind !== 'speak' && !event.shiftKey || event.ctrlKey))) { event.preventDefault(); checkOrContinue(); }
        }}>
          <h2><ReadAloudText text={exercise.prompt} beforeRead={readingHint} /></h2>
          {(exercise.kind === 'listen' || exercise.audioPrompt) && phrase && <div className="daily-audio-row">{audioButton(phrase, false, '听一听')}{audioButton(phrase, true, '慢速')}</div>}
          {exercise.kind === 'match' && <CoursePairs id={exercise.id} items={exercise.pairs ?? []} mode={exercise.pairMode ?? 'text'} state={session.draft.pairs} disabled={!writable || !!feedback} speaking={speaking} play={play}
            onSelect={selected => draft({ pairs: selectPair(current.current.session?.draft.pairs ?? createPairState(), selected) })} onMatch={matchPair} />}
          {(exercise.kind === 'choice' || exercise.kind === 'listen') && <div className="daily-options" role="group" aria-label="答案选项">{exercise.options?.map(option => <div className="reading-option" key={option}>
            <button type="button" className={`daily-option${feedback && exercise.answers?.includes(option) ? ' correct' : feedback && session.draft.choice === option && !feedback.correct ? ' incorrect' : ''}`} aria-pressed={session.draft.choice === option} onClick={event => {
              const alreadySelected = current.current.session?.draft.choice !== null;
              if (!feedback && writable) { draft({ choice: option }); submitRef.current?.focus(); }
              reading.play(clickedReadingText(event.target, option), false, alreadySelected ? readingHint : undefined);
            }}><ReadAloudText text={option} inButton /></button><ReadingControls text={option} beforeRead={readingHint} />
          </div>)}</div>}
          {exercise.kind === 'listen' && <p className="reading-notice">选中后自动朗读；重听或更换英文选项会记为使用提示。</p>}
          {exercise.kind === 'order' && <><div className="daily-tokens daily-answer-tokens" aria-label="已排列的句子">{!session.draft.order.length && <p>按顺序选择词块；点已选词块可撤回。</p>}{session.draft.order.map((tokenIndex, index) => {
            const token = exercise.options?.[tokenIndex] ?? '';
            const start = session.draft.order.slice(0, index).reduce((length, selected) => length + (exercise.options?.[selected]?.length ?? 0) + 1, 0);
            const marked = !feedback && retryUnchanged && correction?.marks.some(mark => mark.end > start && mark.start < start + token.length);
            return <span className="reading-token" key={tokenIndex}><button type="button" className={`daily-token${marked ? ' needs-correction' : ''}`} aria-label={`撤回 ${token}`} onClick={event => {
              if (!feedback && writable) draft({ order: session.draft.order.filter((_, position) => position !== index) });
              reading.play(clickedReadingText(event.target, token));
            }}><ReadAloudText text={token} inButton /></button><ReadingControls text={token} /></span>;
          })}</div><div className="daily-tokens" aria-label="可选词块">{exercise.options?.map((token, index) => <span className="reading-token" key={index}>
            <button type="button" className={`daily-token${session.draft.order.includes(index) ? ' used' : ''}`} aria-pressed={session.draft.order.includes(index)} onClick={event => { if (!feedback && writable && !session.draft.order.includes(index)) draft({ order: [...session.draft.order, index] }); reading.play(clickedReadingText(event.target, token)); }}><ReadAloudText text={token} inButton /></button><ReadingControls text={token} />
          </span>)}</div></>}
          {exercise.kind === 'fill' && <div className="daily-fill">{exercise.parts?.map((part, index) => <Fragment key={index}><span><ReadAloudText text={part} /></span>{index < (exercise.blanks?.length ?? 0) && <input aria-label={`第 ${index + 1} 个空`} aria-invalid={!feedback && correction?.blanks.includes(index) || undefined} className={!feedback && correction?.blanks.includes(index) ? 'needs-correction' : ''} data-blank={index} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={session.draft.blanks[index] ?? ''} disabled={!!feedback || !writable}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; const value = event.currentTarget.value; const blanks = [...current.current.session!.draft.blanks]; blanks[index] = value; draft({ blanks }); if (value && exercise.blanks![index].every(answer => answer.length === 1)) formRef.current?.querySelector<HTMLInputElement>(`[data-blank="${index + 1}"]`)?.focus(); }}
            onChange={event => { const value = event.target.value; const blanks = [...current.current.session!.draft.blanks]; blanks[index] = value; draft({ blanks }); if (!composing.current && value && exercise.blanks![index].every(answer => answer.length === 1)) formRef.current?.querySelector<HTMLInputElement>(`[data-blank="${index + 1}"]`)?.focus(); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || composing.current) return;
              const input = event.currentTarget;
              let target = index;
              if (event.key === ' ' && exercise.blanks![index].every(answer => !answer.includes(' ')) && input.value && index < exercise.blanks!.length - 1) target++;
              if (event.key === 'ArrowRight' && input.selectionStart === input.value.length) target++;
              if (event.key === 'ArrowLeft' && input.selectionStart === 0 || event.key === 'Backspace' && !input.value) target--;
              if (target !== index) { const next = formRef.current?.querySelector<HTMLInputElement>(`[data-blank="${target}"]`); if (next) { event.preventDefault(); next.focus(); next.select(); } }
            }} />}</Fragment>)}</div>}
          {exercise.kind === 'write' && <><label className="daily-input-label" htmlFor="daily-written-answer">写出你的答案</label><textarea id="daily-written-answer" className="daily-write" rows={2} value={session.draft.text} disabled={!!feedback || !writable} autoComplete="off" autoCorrect="off" spellCheck={false} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onChange={event => draft({ text: event.target.value })} /></>}
          {exercise.kind === 'speak' && <DailySpeaking exercise={exercise} draft={session.draft} disabled={!!feedback || !writable} speaking={speaking} speed={speed} play={play} stopAudio={stopAudio} onChange={draft} onBusyChange={setSpeechBusy} />}
          {correction && !feedback && <CorrectionNotice correction={correction} />}{wordError && <p className="daily-help" role="status">{wordError.ability === 'spelling' ? '已记录这个重点词的拼写困难，后续会单独补练。' : '已记录单数身份表达的冠词搭配困难。'}</p>}
          {session.draft.helped && !feedback && !['correction', 'pairs'].includes(session.draft.helpSource ?? '') && <div className="daily-help" role="status">{session.draft.helpSource === 'audio' ? '已点读英文，本题会记录为借助提示完成。' : <ReadAloudText text={exercise.hint ?? exercise.explanation} />}</div>}
          {needsInput && <p className="daily-help" role="alert">{exercise.kind === 'speak' ? dailySpeakingMode(session.draft) === 'read' ? '请先点击麦克风，逐句完成跟读核对；也可选择“自己表达”完成自查。' : '请说出或填写你的表达，并逐项完成自查。' : '先完成当前答案；填空题会定位到还没填写的空格。'}</p>}
          {!feedback && exercise.kind !== 'speak' && exercise.kind !== 'match' && <p className="daily-key-hint">{exercise.kind === 'fill' ? 'Tab / 空格切换空格，方向键回看，Enter 检查。' : exercise.kind === 'write' ? 'Enter 检查，Shift + Enter 换行。' : '选好后点击检查，或按 Tab 移到检查按钮。'}</p>}
        </form>
        {feedback && !compactFeedback && <section ref={feedbackRef} tabIndex={-1} className="daily-feedback" role="status"><h3>{feedbackTitle}</h3>{feedback.expected[0] && <p className="daily-expected" lang="en"><ReadAloudText text={feedback.expected[0]} /><ReadingControls text={feedback.expected[0]} /></p>}<p><ReadAloudText text={feedback.explanation} /></p>{phrase && <div className="daily-feedback-audio">{audioButton(phrase, false, '听参考发音')}{slowAudioButton(phrase, '参考发音')}</div>}<p>这个难点已记录，后面会换题继续练习。</p></section>}
        <div className={`daily-controls${compactFeedback ? feedback.outcome === 'self' ? ' has-self-feedback' : ' has-correct-feedback' : ''}`}>
          {compactFeedback ? <section className={`daily-feedback compact ${feedback.outcome === 'self' ? 'self' : 'correct'}`} role="status">
            <h3><Icon name="check" />{feedbackTitle}</h3>
            {phrase && <span className="daily-feedback-audio">{audioButton(phrase, false, '听参考发音', true)}{slowAudioButton(phrase, '参考发音')}</span>}
            <details className="daily-feedback-details" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
              <summary>解析</summary><div className="daily-feedback-explanation">{feedback.expected.map((answer, index) => <p key={index} className="daily-expected" lang="en"><ReadAloudText text={answer} /><ReadingControls text={answer} /></p>)}<p><ReadAloudText text={feedback.explanation} /></p></div>
            </details>
          </section> : <div>{!feedback && exercise.kind !== 'speak' && <><button className="daily-button text" disabled={!writable || session.draft.helped && session.draft.helpSource !== 'audio'} onClick={() => showHelp()}>提示</button><button className="daily-button text" disabled={!writable} onClick={() => showHelp(true)}>暂时不会</button></>}</div>}
          <button ref={submitRef} className="daily-button primary" disabled={!writable || speechBusy || !feedback && (retryUnchanged || exercise.kind === 'match')} onClick={checkOrContinue}>{feedback ? '继续' : exercise.kind === 'speak' ? dailySpeakingMode(session.draft) === 'read' ? '完成跟读' : '完成自查' : correction ? '再检查' : exercise.kind === 'match' ? '请完成配对' : '检查'}<Icon name="arrow" /></button>
        </div>
      </>}
      {session.stage === 'summary' && (() => {
        const summary = summarizeDailySession(session);
        const corrected = session.answers.filter(answer => answer.corrected).length;
        const difficulties = session.adaptive ? session.adaptive.focusIds.filter(id => {
          const target = progress.learning?.targets[id];
          return !target?.readyAt || target.confidence < 0.8;
        }) : lessonDifficulties(lesson);
        const next = canLearnMore ? nextLesson ?? dailyLessons[0] : undefined;
        return <section className="daily-summary daily-enter"><h2>{session.mode === 'lesson' ? '这一课已完成' : '本轮练习已完成'}</h2><p>本节表现已保存，下一节会据此调整新内容和需要巩固的内容。</p><div className="daily-summary-counts"><p><strong>{summary.independent}</strong>项独立作答</p>{corrected > 0 && <p><strong>{corrected}</strong>项修改正确</p>}<p><strong>{summary.assisted + summary.revealed - corrected}</strong>项需要帮助</p>{summary.self > 0 && <p><strong>{summary.self}</strong>项口语练习</p>}</div>{difficulties.length > 0 ? <><h3>后续继续巩固</h3><ul>{difficulties.map(id => { const task = findDailyExercise(lesson, id); return <li key={id}><ReadAloudText text={session.adaptive ? curriculum?.targetLabel?.(id) ?? lesson.phrases.find(phrase => phrase.id === id)?.en ?? id : task?.explanation ?? lesson.goal} /></li>; })}</ul><p>需要巩固的内容会继续穿插到后面的学习中。</p></> : <p>后续课程和复习会按实际答题表现调整。</p>}<div className="daily-session-actions"><button className="daily-button" onClick={() => { commit(finishDailySession(current.current)); setSessionOpen(false); }}>返回{view === 'review' ? '复习' : '课程'}</button>{session.adaptive?.focusIds.some(id => id.startsWith('daily-word-') || id.startsWith('word-')) && <button className="daily-button" disabled={!writable} onClick={() => practiceWords(session.adaptive!.focusIds)}>巩固本课重点词</button>}{next && session.mode === 'lesson' && <button className="daily-button primary" disabled={!writable} onClick={() => start(next, 'lesson', true)}>开始下一课<Icon name="arrow" /></button>}</div></section>;
      })()}
    </div> : <>
      <header ref={headingRef} className="page-heading"><div className="page-heading-copy"><h1>{view === 'course' ? label : view === 'review' ? customReview || storageKey === DAILY_KEY || curriculum?.renderStudy ? '复习' : '场景复习' : showingFavorites ? `收藏的${libraryNoun}` : `${libraryNoun}库`}</h1></div>{speechControls}</header>
      {sessionVisible && session && (view !== 'course' || session.stage === 'summary') && <div className="daily-note daily-resume"><h2>{session.stage === 'summary' ? '查看上次结果' : '接着上次的位置'}</h2><p>{findDailyLesson(session.lessonId)?.title} · {session.stage === 'study' ? '正在学习' : session.adaptive ? `已完成 ${session.answers.length} 题` : `${session.answers.length} / ${session.queue.length} 项练习`}</p><button className="daily-button primary" onClick={() => { setSessionOpen(true); setPendingStart(null); }}>继续<Icon name="arrow" /></button></div>}
      {pendingStart && <div className="daily-notice" role="status"><p>还有一轮学习尚未结束。切换后保留已答记录，当前未提交的输入不再续接。</p>{sessionVisible && <button className="daily-button" onClick={() => { setSessionOpen(true); setPendingStart(null); }}>继续原来的练习</button>}<button className="daily-button" onClick={() => start(pendingStart.lesson, pendingStart.mode, true)}>开始“{pendingStart.lesson.title}”</button></div>}
      {view === 'library' || showingFavorites ? curriculum?.renderLibrary ? curriculum.renderLibrary({ progress, writable, favorites: showingFavorites, toggleFavorite }) : <section className="daily-panel daily-library" aria-label={showingFavorites ? '收藏的日常表达' : '表达查询'}>
        <div className="daily-library-tools"><label><span>查找表达</span><input type="search" value={listQuery} onChange={event => updateListQuery(event.target.value)} placeholder={showingFavorites ? '搜索收藏的英文或中文' : '输入英文或中文'} /></label>{!showingFavorites && <label><span>显示内容</span><select value={libraryFilter} onChange={event => setLibraryFilter(event.target.value as typeof libraryFilter)}><option value="all">全部表达</option><option value="learned">已学习</option><option value="favorites">收藏</option></select></label>}</div>
        {libraryPhrases.length ? <ul className="daily-expression-list">{libraryPhrases.map(item => {
          const favorite = !!progress.favorites?.includes(item.id);
          const learned = phraseLearned(item.id);
          return <li key={item.id} className="daily-expression"><div className="daily-expression-copy"><span className="daily-meaning" lang="zh-CN"><ReadAloudText text={item.zh} /></span><div className="daily-inline-reading"><button type="button" className={`daily-expression-content${speaking.startsWith(`daily-${item.id}-`) ? ' playing' : ''}`} aria-label={`朗读 ${item.en}`} aria-pressed={speaking === `daily-${item.id}-normal`} onClick={() => play(item, false)}><strong lang="en">{item.en}</strong></button>{slowAudioButton(item)}</div>{item.note && <span><ReadAloudText text={item.note} /></span>}</div><div className="daily-expression-state">{learned && item.id.startsWith('daily-word-') && <button className="daily-button" disabled={!writable || !!session && session.stage !== 'summary'} onClick={() => practiceWords([item.id])}>练习这个词</button>}<span>{dailyKnowledgeReviewable(progress, item.id) ? '已进入复习' : learned ? '正在学习' : '未学习'}</span><button type="button" className="daily-expression-star" aria-label={`${favorite ? '取消收藏' : '收藏'} ${item.en}`} aria-pressed={favorite} disabled={!writable} onClick={() => commit({ ...current.current, favorites: favorite ? (current.current.favorites ?? []).filter(id => id !== item.id) : [...(current.current.favorites ?? []), item.id] })}><Icon name="star" /></button></div></li>;
        })}</ul> : <div className="daily-empty">{showingFavorites ? <><h2>{favoriteCount ? '没有找到相符的词汇' : '还没有收藏词汇'}</h2><p>{favoriteCount ? '试试其他关键词。' : '在词汇旁点亮星标，就能在这里找到。'}</p><button className="daily-button" onClick={() => favoriteCount ? setFavoritesQuery('') : openLibrary()}>{favoriteCount ? '查看全部收藏' : '去词汇库收藏'}</button></> : <p>{query.trim() ? '没有找到相符的词汇。' : libraryFilter === 'favorites' ? '还没有收藏词汇。' : '完成教学后，学过的词汇会显示在这里。'}</p>}</div>}
      </section> : customReview && renderReview ? renderReview(scenarios) : <div className={`daily-layout${view === 'course' ? ' course-home' : ''}`}>
        {view === 'course' ? overview ? <CourseOverview overview={overview} disabled={!writable} start={() => start(overview.source, 'lesson')} renderPhrase={item => <><span className="course-example-meaning" lang="zh-CN">{item.zh}</span><div className="daily-inline-reading"><button type="button" className="daily-phrase-content" aria-label={`朗读 ${item.en}`} aria-pressed={speaking === `daily-${item.id}-normal`} onClick={() => play(item, false)} lang="en">{item.en}</button>{slowAudioButton(item)}</div></>} /> : <section className="daily-panel daily-empty"><h2>{session?.mode === 'review' && session.stage !== 'summary' ? '下一轮待安排' : '当前内容已完成'}</h2><p>{session?.mode === 'review' && session.stage !== 'summary' ? '还有一轮复习未结束。完成后，会依据最新表现安排课程。' : '到“复习”继续巩固学过的内容。'}</p></section> : dailyReview}
        <aside className="daily-rail" aria-label={`${label}课程进度`}><section className="daily-note"><h2>{view === 'course' ? '课程进度' : '本次复习'}</h2><p className="daily-total">{view === 'course' ? <>已完成 <strong>{completed}</strong> 节</> : <>可练习 <strong>{reviewTargets.length}</strong> 条词汇</>}</p><button className="daily-button text" onClick={exportRecord}>导出学习记录</button></section></aside></div>}
    </>}
  </main>;
}
