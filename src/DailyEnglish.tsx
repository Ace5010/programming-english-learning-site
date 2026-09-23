import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import Icon from './Icon';
import { progressStorage, blockSyncApply } from './progressStorage';
import { downloadRecord } from './nativeAndroid';
import SpeechControls, { type PlaybackSpeed } from './SpeechControls';
import DailySpeaking, { dailySpeakingMode } from './DailySpeaking';
import { dailyPhrases as defaultPhrases, type DailyPhrase, type DailyLesson, type DailyUnit } from './dailyCourse';
import { adaptiveDailyUnits as defaultUnits } from './dailyPractice';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent } from './adaptiveLearning';
import type { LearningLesson } from './learningTypes';
import {
  DAILY_KEY, createDailyProgress, parseDailyProgress, persistDailyProgress,
  beginDailyExercises, updateDailyDraft, submitDailyAnswer,
  advanceDailySession, finishDailySession, markDailyHelp, checkDailyAnswer,
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
  onProgress?: (progress: DailyProgress) => void;
  prepareLearning?: (progress: DailyProgress) => DailyProgress;
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
  stopAudio: () => void;
  openVoice: () => void;
  openLibrary: () => void;
  contentRef?: RefObject<HTMLElement | null>;
  headingRef?: RefObject<HTMLElement | null>;
  curriculum?: DailyCurriculum;
  renderReview?: (scenarios: ReactNode) => ReactNode;
  reviewDescription?: string;
}

function loadProgress(key: string, lessons: DailyLesson[]) {
  try { return parseDailyProgress(localStorage.getItem(key), lessons); }
  catch { return { progress: createDailyProgress(), writable: false, warning: '浏览器暂时无法读取课程记录。请恢复存储权限后重新加载。', raw: null }; }
}

export default function DailyEnglish({ active, view, navigation, voice, speed, onSpeedChange, speaking, play, stopAudio, openVoice, openLibrary, contentRef, headingRef, curriculum, renderReview, reviewDescription }: Props) {
  const storageKey = curriculum?.key ?? DAILY_KEY;
  const label = curriculum?.label ?? '日常英语';
  const dailyUnits = curriculum?.units ?? defaultUnits;
  const dailyPhrases = curriculum?.phrases ?? defaultPhrases;
  const dailyLessons = useMemo(() => dailyUnits.flatMap(unit => unit.lessons), [dailyUnits]);
  const learningLessons = dailyLessons as LearningLesson[];
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
  const prepared = curriculum?.prepareLearning?.(progress) ?? progress;
  const canLearnMore = hasAdaptiveContent(prepared, learningLessons);
  const nextLesson = canLearnMore ? nextDailyLesson(progress, dailyLessons) ?? dailyLessons[0] : undefined;
  const [pendingStart, setPendingStart] = useState<{ lesson: DailyLesson; mode: DailyMode } | null>(null);
  const [reviewFocus, setReviewFocus] = useState<string>('auto');
  const [query, setQuery] = useState('');
  const [favoritesQuery, setFavoritesQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'learned' | 'favorites'>('all');
  const [needsInput, setNeedsInput] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const studyRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const session = progress.session;
  const lesson = session ? session.adaptive ? resolveAdaptiveLesson(session, learningLessons) : findDailyLesson(session.lessonId) : undefined;
  const exercise = session && lesson ? findDailyExercise(lesson, session.queue[session.index]?.exerciseId ?? '') : undefined;
  const phrase = exercise?.audioId ? dailyPhrases.find(item => item.id === exercise.audioId) : undefined;
  const unit = nextLesson ? dailyUnits.find(item => item.lessons.some(lesson => lesson.id === nextLesson.id)) : undefined;
  const completed = progress.learning?.rounds ?? dailyLessons.filter(item => progress.lessons[item.id]?.completedAt).length;
  const dueLessons = dueDailyLessons(progress, dailyLessons, Date.now(), curriculum?.review ? 'auto' : reviewFocus as DailyAbility | 'auto');
  const difficultLessons = dailyLessons.filter(item => dailyLessonReviewable(progress, item) && dailyReviewErrors(progress, item, reviewFocus as DailyAbility | 'auto').length > 0);
  const reviewLessons = curriculum?.review?.lessons(progress, dailyLessons, reviewFocus) ?? [...new Set([...dueLessons, ...difficultLessons])];
  const lessonDifficulties = (item: DailyLesson) => curriculum?.review?.difficulties(item, reviewFocus) ?? dailyReviewErrors(progress, item, reviewFocus as DailyAbility | 'auto');
  const learnedLessons = dailyLessons.filter(item => dailyLessonReviewable(progress, item));
  const sessionVisible = !!session && !!lesson && (session.mode === 'lesson'
    ? view === 'course' && (!!session.adaptive || lesson.id === nextLesson?.id || session.stage === 'summary')
    : view === 'review' && dailyLessonReviewable(progress, lesson));
  const showSession = active && sessionOpen && sessionVisible;
  const feedback = session?.feedback;
  useEffect(() => {
    blockSyncApply(storageKey, !writable || speechBusy);
    return () => blockSyncApply(storageKey, false);
  }, [storageKey, writable, speechBusy]);
  const compactFeedback = feedback && feedback.correct && feedback.outcome !== 'revealed';
  const feedbackTitle = feedback?.outcome === 'self' ? session?.draft.speech?.mode === 'read' ? '这组表达已完成跟读' : '已记录你的自查' : feedback?.outcome === 'revealed' ? '看看这句怎么表达' : feedback?.correct ? session?.draft.helped ? '借助提示完成了' : '回答正确' : '再看一下这里';

  function notifyProgress(next: DailyProgress) {
    try { onProgress.current?.(next); }
    catch (error) {
      setWritable(false);
      setWarning(`课程记录已保存，复习记录尚未同步。${error instanceof Error ? error.message : '请重新加载记录后重试。'} 当前进度仍保留。`);
    }
  }

  function commit(next: DailyProgress) {
    if (!writable) return;
    let result;
    try { result = persistDailyProgress(progressStorage, next, storedRaw.current, storageKey); }
    catch {
      current.current = next; setProgress(next);
      setWarning('浏览器无法访问存储。本页输入仍在，请导出记录，恢复存储权限后再继续。');
      setWritable(false); return;
    }
    current.current = result.progress;
    setProgress(result.progress);
    if (result.saved) { storedRaw.current = result.raw; notifyProgress(result.progress); }
    else { setWarning(result.warning); setWritable(false); }
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
    stopAudio();
    setNeedsInput(false);
    const frame = requestAnimationFrame(() => {
      if (session?.stage === 'study' || session?.stage === 'summary') studyRef.current?.focus();
      else if (session?.feedback) submitRef.current?.focus();
      else formRef.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, .daily-option, .daily-token, .daily-audio')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [showSession, session?.id, session?.stage, session?.index, !!session?.feedback, stopAudio]);

  function start(lessonToStart: DailyLesson, mode: DailyMode, replace = false) {
    if (!writable) return;
    if (mode !== 'lesson' && !dailyLessonReviewable(current.current, lessonToStart)) return;
    const previous = current.current.session;
    if (previous && previous.stage !== 'summary' && !replace) {
      if (previous.mode === mode && (mode === 'lesson' || previous.lessonId === lessonToStart.id)) { setSessionOpen(true); return; }
      setPendingStart({ lesson: lessonToStart, mode });
      return;
    }
    const sourceProgress = mode === 'lesson' ? curriculum?.prepareLearning?.(current.current) ?? current.current : current.current;
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

  function checkOrContinue() {
    const now = current.current;
    if (!now.session || !lesson || !exercise || composing.current || !writable || speechBusy) return;
    if (now.session.feedback) { commit(now.session.adaptive ? advanceAdaptiveSession(now, learningLessons) : advanceDailySession(now, lesson)); return; }
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
    commit(recordAdaptiveAnswer(submitDailyAnswer(now, lesson), learningLessons));
  }

  function showHelp(reveal = false) {
    if (!lesson) return;
    let next = markDailyHelp(current.current, lesson, reveal);
    if (reveal) next = submitDailyAnswer(next, lesson, { reveal: true });
    commit(recordAdaptiveAnswer(next, learningLessons));
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
    return <button type="button" className={`daily-audio${speaking === key ? ' playing' : ''}${iconOnly ? ' icon-only' : ''}`} aria-label={slow ? `慢速朗读 ${audioPhrase.en}` : iconOnly ? label ?? '播放语音' : undefined} title={iconOnly ? label : undefined} aria-pressed={speaking === key} onClick={() => play(audioPhrase, slow)}><Icon name="sound" />{!iconOnly && (label ?? '播放语音')}</button>;
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
  const customReview = view === 'review' && !!renderReview;
  const scenarios = <>
    <div className="daily-panel-heading">{!customReview && <h2>现在可以复习</h2>}<label className="daily-workbook-filter">练习内容<select aria-label="复习内容" value={reviewFocus} onChange={event => setReviewFocus(event.target.value as typeof reviewFocus)}><option value="auto">系统安排</option>{reviewOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    {reviewLessons.filter(hasFocus).length ? <ol className="daily-lessons">{reviewLessons.filter(hasFocus).map(item => <li className="daily-lesson-row" key={item.id}><div className="daily-lesson-copy"><h3>{item.title}</h3><p>{lessonDifficulties(item).length ? '有需要再练的内容' : '已到复习时间'}</p></div><button className="daily-button" disabled={!writable} onClick={() => start(item, 'review')}>开始复习<Icon name="arrow" /></button></li>)}</ol> : customReview ? <p className="daily-review-empty">{learnedLessons.length ? '暂时没有到期的场景练习。' : '课程中表现稳定的内容会出现在这里。'}</p> : <div className="daily-empty"><h2>{learnedLessons.length ? '暂时没有到期复习' : '先学习当前课程'}</h2><p>{learnedLessons.length ? '可以在下面选择已学内容提前练习。' : '在课程中反复练习，表现稳定的内容才会加入复习。'}</p></div>}
    {learnedLessons.filter(hasFocus).length > 0 && <details className="daily-early-review"><summary>主动练习已学内容</summary><ol className="daily-lessons">{learnedLessons.filter(hasFocus).map(item => <li className="daily-lesson-row" key={item.id}><div className="daily-lesson-copy"><h3>{item.title}</h3></div><button className="daily-button" disabled={!writable} onClick={() => start(item, 'review')}>开始练习</button></li>)}</ol></details>}
  </>;

  return <main ref={contentRef} id={storageKey === DAILY_KEY ? 'daily-content' : 'programming-content'} className={`content daily-content${customReview && !showSession ? ' programming-review-page' : ''}`} hidden={!active}>
    {warning && <div className="daily-notice" role="alert"><p>{warning.split('日常英语').join(label)}</p><button className="daily-button" onClick={exportRecord}>导出记录</button><button className="daily-button" onClick={reloadSaved}>重新加载记录</button></div>}
    {showSession && session && lesson ? <div className="daily-session">
      <div className="daily-session-top"><button className="daily-button text" onClick={() => { setSessionOpen(false); stopAudio(); }}>〈 返回{view === 'review' ? '复习' : '课程'}{writable ? ' · 已保存' : ''}</button>{speechControls}</div>
      <header ref={headingRef} className="daily-session-heading"><span className="daily-session-label">{dailyUnits.find(item => item.lessons.some(part => part.id === lesson.id))?.title} · {session.mode === 'lesson' ? '学习' : '复习'}</span><h1 ref={studyRef} tabIndex={-1}>{lesson.title}</h1><p>{lesson.goal}</p>
        {session.stage !== 'study' && <><span className="progress-track" role="progressbar" aria-label="本课练习进度" aria-valuemin={0} aria-valuemax={session.adaptive ? Math.max(session.answers.length, session.adaptive.budget) : session.queue.length} aria-valuenow={session.answers.length}><i style={{ width: `${session.answers.length / Math.max(1, session.adaptive?.budget ?? session.queue.length) * 100}%` }} /></span><span className="daily-session-label">{session.adaptive ? `已完成 ${session.answers.length} 项` : `${session.answers.length} / ${session.queue.length} 项`}{session.queue[session.index]?.retry ? ' · 换一道题复查' : ''}</span></>}
      </header>
      {session.stage === 'study' && <section className="daily-study-card daily-enter"><h2>{storageKey === DAILY_KEY ? '这一课怎么说' : '这一课怎么读'}</h2><p className="daily-study-explanation">{lesson.explanation}</p><div className="daily-phrases">{lesson.phrases.map(item => <div key={item.id} className={`daily-phrase${speaking.startsWith(`daily-${item.id}-`) ? ' playing' : ''}`}><div className="daily-inline-reading"><button type="button" className="daily-phrase-content" aria-label={`朗读 ${item.en}`} aria-pressed={speaking === `daily-${item.id}-normal`} onClick={() => play(item, false)}><strong>{item.en}<Icon name="sound" /></strong></button>{slowAudioButton(item)}</div><span>{item.zh}</span>{item.note && <small>{item.note}</small>}</div>)}</div><p className="daily-play-hint">点击表达听发音。理解后开始练习，离开时自动保存。</p><div className="daily-session-actions"><p>{storageKey === DAILY_KEY ? '通过听、读、写和表达练习巩固。' : '通过词义、阅读和书写练习巩固。'}</p><button className="daily-button primary" disabled={!writable} onClick={() => { stopAudio(); commit(session.adaptive ? beginAdaptiveLearning(current.current, learningLessons) : { ...learnDailyLesson(current.current, lesson), session: beginDailyExercises(session) }); }}>开始练习<Icon name="arrow" /></button></div></section>}
      {session.stage === 'exercise' && exercise && <>
        <form ref={formRef} className="daily-question daily-enter" key={`${session.id}-${session.index}`} data-exercise-id={exercise.id} data-kind={exercise.kind} onSubmit={event => { event.preventDefault(); checkOrContinue(); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || composing.current) return;
          if (event.key === 'Enter' && (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox' || event.target instanceof HTMLTextAreaElement && (exercise.kind !== 'speak' && !event.shiftKey || event.ctrlKey))) { event.preventDefault(); checkOrContinue(); }
        }}>
          <h2>{exercise.prompt}</h2>
          {exercise.kind === 'listen' && phrase && <div className="daily-audio-row">{audioButton(phrase, false, '听一听')}{audioButton(phrase, true, '慢速')}</div>}
          {(exercise.kind === 'choice' || exercise.kind === 'listen') && <div className="daily-options" role="group" aria-label="答案选项">{exercise.options?.map(option => <button key={option} type="button" disabled={!!feedback || !writable} className={`daily-option${feedback && exercise.answers?.includes(option) ? ' correct' : feedback && session.draft.choice === option && !feedback.correct ? ' incorrect' : ''}`} aria-pressed={session.draft.choice === option} onClick={() => { draft({ choice: option }); submitRef.current?.focus(); }}>{option}</button>)}</div>}
          {exercise.kind === 'order' && <><div className="daily-tokens daily-answer-tokens" aria-label="已排列的句子">{!session.draft.order.length && <p>按顺序选择词块；点已选词块可撤回。</p>}{session.draft.order.map((tokenIndex, index) => <button key={tokenIndex} type="button" className="daily-token" disabled={!!feedback || !writable} aria-label={`撤回 ${exercise.options?.[tokenIndex]}`} onClick={() => draft({ order: session.draft.order.filter((_, position) => position !== index) })}>{exercise.options?.[tokenIndex]}</button>)}</div><div className="daily-tokens" aria-label="可选词块">{exercise.options?.map((token, index) => <button key={index} type="button" className="daily-token" disabled={!!feedback || !writable || session.draft.order.includes(index)} onClick={() => draft({ order: [...session.draft.order, index] })}>{token}</button>)}</div></>}
          {exercise.kind === 'fill' && <div className="daily-fill">{exercise.parts?.map((part, index) => <Fragment key={index}><span>{part}</span>{index < (exercise.blanks?.length ?? 0) && <input aria-label={`第 ${index + 1} 个空`} data-blank={index} autoComplete="off" autoCorrect="off" spellCheck={false} value={session.draft.blanks[index] ?? ''} disabled={!!feedback || !writable}
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
          {session.draft.helped && !feedback && <div className="daily-help" role="status">{exercise.explanation}</div>}
          {needsInput && <p className="daily-help" role="alert">{exercise.kind === 'speak' ? dailySpeakingMode(session.draft) === 'read' ? '请先点击麦克风，逐句完成跟读核对；也可选择“自己表达”完成自查。' : '请说出或填写你的表达，并逐项完成自查。' : '先完成当前答案；填空题会定位到还没填写的空格。'}</p>}
          {!feedback && exercise.kind !== 'speak' && <p className="daily-key-hint">{exercise.kind === 'fill' ? 'Tab / 空格切换空格，方向键回看，Enter 检查。' : exercise.kind === 'write' ? 'Enter 检查，Shift + Enter 换行。' : '选好后点击检查，或按 Tab 移到检查按钮。'}</p>}
        </form>
        {feedback && !compactFeedback && <section className="daily-feedback" role="status"><h3>{feedbackTitle}</h3>{feedback.expected[0] && <p className="daily-expected" lang="en">{feedback.expected[0]}</p>}<p>{feedback.explanation}</p>{phrase && <div className="daily-feedback-audio">{audioButton(phrase, false, '听参考发音')}{slowAudioButton(phrase, '参考发音')}</div>}<p>这个难点已记录，后面会换题继续练习。</p></section>}
        <div className={`daily-controls${compactFeedback ? feedback.outcome === 'self' ? ' has-self-feedback' : ' has-correct-feedback' : ''}`}>
          {compactFeedback ? <section className={`daily-feedback compact ${feedback.outcome === 'self' ? 'self' : 'correct'}`} role="status">
            <h3><Icon name="check" />{feedbackTitle}</h3>
            {phrase && <span className="daily-feedback-audio">{audioButton(phrase, false, '听参考发音', true)}{slowAudioButton(phrase, '参考发音')}</span>}
            <details className="daily-feedback-details" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
              <summary>解析</summary><div className="daily-feedback-explanation">{feedback.expected.map((answer, index) => <p key={index} className="daily-expected" lang="en">{answer}</p>)}<p>{feedback.explanation}</p></div>
            </details>
          </section> : <div>{!feedback && exercise.kind !== 'speak' && <><button className="daily-button text" disabled={!writable || session.draft.helped} onClick={() => showHelp()}>提示</button><button className="daily-button text" disabled={!writable} onClick={() => showHelp(true)}>暂时不会</button></>}</div>}
          <button ref={submitRef} className="daily-button primary" disabled={!writable || speechBusy} onClick={checkOrContinue}>{feedback ? '继续' : exercise.kind === 'speak' ? dailySpeakingMode(session.draft) === 'read' ? '完成跟读' : '完成自查' : '检查'}<Icon name="arrow" /></button>
        </div>
      </>}
      {session.stage === 'summary' && (() => {
        const summary = summarizeDailySession(session);
        const difficulties = session.adaptive ? session.adaptive.focusIds.filter(id => {
          const target = progress.learning?.targets[id];
          return !target || target.confidence < 0.8 || !target.transfer;
        }) : lessonDifficulties(lesson);
        const next = canLearnMore ? nextLesson ?? dailyLessons[0] : undefined;
        return <section className="daily-summary daily-enter"><h2>{session.mode === 'lesson' ? '这一课已完成' : '本轮练习已完成'}</h2><p>本节表现已保存，下一节会据此调整新内容和需要巩固的内容。</p><div className="daily-summary-counts"><p><strong>{summary.independent}</strong>项独立作答</p><p><strong>{summary.assisted + summary.revealed}</strong>项需要帮助</p>{summary.self > 0 && <p><strong>{summary.self}</strong>项口语练习</p>}</div>{difficulties.length > 0 ? <><h3>后续继续巩固</h3><ul>{difficulties.map(id => { const task = findDailyExercise(lesson, id); return <li key={id}>{session.adaptive ? lesson.phrases.find(phrase => phrase.id === id)?.en ?? id : task?.explanation ?? lesson.goal}</li>; })}</ul><p>需要巩固的内容会继续穿插到后面的学习中。</p></> : <p>后续课程和复习会按实际答题表现调整。</p>}<div className="daily-session-actions"><button className="daily-button" onClick={() => { commit(finishDailySession(current.current)); setSessionOpen(false); }}>返回{view === 'review' ? '复习' : '课程'}</button>{next && session.mode === 'lesson' && <button className="daily-button primary" disabled={!writable} onClick={() => start(next, 'lesson', true)}>开始下一课<Icon name="arrow" /></button>}</div></section>;
      })()}
    </div> : <>
      <header ref={headingRef} className="page-heading"><div className="page-heading-copy"><h1>{view === 'course' ? label : view === 'review' ? customReview || storageKey === DAILY_KEY ? '复习' : '场景复习' : showingFavorites ? '收藏的表达' : '表达库'}</h1><p>{view === 'course' ? curriculum?.description ?? '先学一课，再通过练习理解和使用新的表达。' : view === 'review' ? customReview && reviewDescription !== undefined ? reviewDescription : '复习到期内容，也可以主动练习已经学过的内容。' : showingFavorites ? `已收藏 ${favoriteCount} 条表达，可在这里点读和取消收藏。` : '查询表达、听发音，收藏想再看的内容。'}</p></div>{speechControls}</header>
      {sessionVisible && session && <div className="daily-note daily-resume"><h2>{session.stage === 'summary' ? '查看上次结果' : '接着上次的位置'}</h2><p>{findDailyLesson(session.lessonId)?.title} · {session.stage === 'study' ? '正在学习' : `${session.answers.length} / ${session.queue.length} 项练习`}</p><button className="daily-button primary" onClick={() => { setSessionOpen(true); setPendingStart(null); }}>继续<Icon name="arrow" /></button></div>}
      {pendingStart && <div className="daily-notice" role="status"><p>还有一轮学习尚未结束。切换后保留已答记录，当前未提交的输入不再续接。</p>{sessionVisible && <button className="daily-button" onClick={() => { setSessionOpen(true); setPendingStart(null); }}>继续原来的练习</button>}<button className="daily-button" onClick={() => start(pendingStart.lesson, pendingStart.mode, true)}>开始“{pendingStart.lesson.title}”</button></div>}
      {view === 'library' || showingFavorites ? <section className="daily-panel daily-library" aria-label={showingFavorites ? '收藏的日常表达' : '表达查询'}>
        <div className="daily-library-tools"><label><span>查找表达</span><input type="search" value={listQuery} onChange={event => updateListQuery(event.target.value)} placeholder={showingFavorites ? '搜索收藏的英文或中文' : '输入英文或中文'} /></label>{!showingFavorites && <label><span>显示内容</span><select value={libraryFilter} onChange={event => setLibraryFilter(event.target.value as typeof libraryFilter)}><option value="all">全部表达</option><option value="learned">已学习</option><option value="favorites">收藏</option></select></label>}</div>
        {libraryPhrases.length ? <ul className="daily-expression-list">{libraryPhrases.map(item => {
          const favorite = !!progress.favorites?.includes(item.id);
          const learned = phraseLearned(item.id);
          return <li key={item.id} className="daily-expression"><div className="daily-expression-copy"><div className="daily-inline-reading"><button type="button" className={`daily-expression-content${speaking.startsWith(`daily-${item.id}-`) ? ' playing' : ''}`} aria-label={`朗读 ${item.en}`} aria-pressed={speaking === `daily-${item.id}-normal`} onClick={() => play(item, false)}><strong lang="en">{item.en}<Icon name="sound" /></strong></button>{slowAudioButton(item)}</div><span>{item.zh}</span>{item.note && <span>{item.note}</span>}</div><div className="daily-expression-state"><span>{dailyKnowledgeReviewable(progress, item.id) ? '已进入复习' : learned ? '正在学习' : '未学习'}</span><button type="button" className="daily-expression-star" aria-label={`${favorite ? '取消收藏' : '收藏'} ${item.en}`} aria-pressed={favorite} disabled={!writable} onClick={() => commit({ ...current.current, favorites: favorite ? (current.current.favorites ?? []).filter(id => id !== item.id) : [...(current.current.favorites ?? []), item.id] })}><Icon name="star" /></button></div></li>;
        })}</ul> : <div className="daily-empty">{showingFavorites ? <><h2>{favoriteCount ? '没有找到相符的表达' : '还没有收藏表达'}</h2><p>{favoriteCount ? '试试其他关键词。' : '在表达旁点亮星标，就能在这里找到。'}</p><button className="daily-button" onClick={() => favoriteCount ? setFavoritesQuery('') : openLibrary()}>{favoriteCount ? '查看全部收藏' : '去表达库收藏'}</button></> : <p>{query.trim() ? '没有找到相符的表达。' : libraryFilter === 'favorites' ? '还没有收藏表达。' : '完成教学后，学过的表达会显示在这里。'}</p>}</div>}
      </section> : customReview && renderReview ? renderReview(scenarios) : <div className="daily-layout"><section className="daily-panel daily-enter" aria-label={view === 'course' ? '当前课程' : '复习安排'}>
        {view === 'course' ? nextLesson && unit ? <><div className="daily-panel-heading"><h2>继续学习</h2><p>根据之前的表现，安排新内容和需要巩固的内容。</p></div><ol className="daily-lessons"><li className="daily-lesson-row"><span className="daily-lesson-state" aria-label="当前课程"><Icon name="book" /></span><div className="daily-lesson-copy"><h3>{session?.mode === 'lesson' && session.stage !== 'summary' ? '接着这一节学习' : `第 ${completed + 1} 节`}</h3><p>先学习讲解，再通过不同题目逐步巩固。</p></div><div className="daily-lesson-actions"><button className="daily-button primary" disabled={!writable} onClick={() => start(nextLesson, 'lesson')}>{session?.mode === 'lesson' && session.stage !== 'summary' ? '继续学习' : '开始学习'}<Icon name="arrow" /></button></div></li></ol></> : <div className="daily-empty"><h2>当前课程已全部完成</h2><p>到“复习”继续巩固学过的内容。后续课程会逐步增加。</p></div> : scenarios}
      </section><aside className="daily-rail" aria-label={`${label}课程进度`}><section className="daily-note"><h2>课程进度</h2><p className="daily-total">已完成 <strong>{completed}</strong> 节</p><p>{view === 'course' && nextLesson ? '下一节根据学习表现生成；正在学习的内容会继续巩固，表现稳定后进入复习。' : '学习记录先保存在本机。'}</p><button className="daily-button text" onClick={exportRecord}>导出学习记录</button></section></aside></div>}
    </>}
  </main>;
}
