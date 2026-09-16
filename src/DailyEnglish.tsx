import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';
import Icon from './Icon';
import DailySpeaking, { dailySpeakingMode } from './DailySpeaking';
import { dailyUnits, dailyLessons, dailyPhrases, findDailyLesson, type DailyPhrase, type DailyLesson } from './dailyCourse';
import {
  DAILY_KEY, createDailyProgress, parseDailyProgress, persistDailyProgress,
  createDailySession, beginDailyExercises, updateDailyDraft, submitDailyAnswer,
  advanceDailySession, finishDailySession, markDailyHelp, checkDailyAnswer,
  findDailyExercise, summarizeDailySession, dailyUnresolvedErrors, dueDailyLessons,
  type DailyProgress, type DailyDraft, type DailyMode,
} from './dailyProgress';
import './daily.css';

type View = 'course' | 'workbook' | 'review';
interface Props {
  active: boolean;
  view: View;
  navigation: number;
  voice: 'aria' | 'guy';
  speed: 'normal' | 'slow';
  speaking: string;
  play: (phrase: DailyPhrase, slow?: boolean) => void;
  stopAudio: () => void;
  openVoice: () => void;
  contentRef?: RefObject<HTMLElement | null>;
  headingRef?: RefObject<HTMLElement | null>;
}

function loadProgress() {
  try { return parseDailyProgress(localStorage.getItem(DAILY_KEY), dailyLessons); }
  catch { return { progress: createDailyProgress(), writable: false, warning: '浏览器暂时无法读取日常英语记录。请恢复存储权限后重新加载；编程英语记录不受影响。', raw: null }; }
}

export default function DailyEnglish({ active, view, navigation, voice, speed, speaking, play, stopAudio, openVoice, contentRef, headingRef }: Props) {
  const [initial] = useState(loadProgress);
  const [progress, setProgress] = useState(initial.progress);
  const current = useRef(progress);
  const storedRaw = useRef(initial.raw);
  const [writable, setWritable] = useState(initial.writable);
  const [warning, setWarning] = useState(initial.warning);
  const [sessionOpen, setSessionOpen] = useState(!!initial.progress.session);
  const nextLesson = dailyLessons.find(lesson => !progress.lessons[lesson.id]?.completedAt) ?? dailyLessons[0];
  const [unitId, setUnitId] = useState(() => (initial.progress.session?.lessonId ?? nextLesson.id).slice(0, 5));
  const [pendingStart, setPendingStart] = useState<{ lesson: DailyLesson; mode: DailyMode } | null>(null);
  const [filter, setFilter] = useState('all');
  const [needsInput, setNeedsInput] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const studyRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const session = progress.session;
  const lesson = session ? findDailyLesson(session.lessonId) : undefined;
  const exercise = session && lesson ? findDailyExercise(lesson, session.queue[session.index]?.exerciseId ?? '') : undefined;
  const phrase = exercise?.audioId ? dailyPhrases.find(item => item.id === exercise.audioId) : undefined;
  const unit = dailyUnits.find(item => item.id === unitId) ?? dailyUnits[0];
  const completed = dailyLessons.filter(item => progress.lessons[item.id]?.completedAt).length;
  const dueLessons = dueDailyLessons(progress, dailyLessons);
  const difficultLessons = dailyLessons.filter(item => dailyUnresolvedErrors(progress, item.id).length > 0);
  const reviewLessons = dailyLessons.filter(item => dueLessons.includes(item) || difficultLessons.includes(item));
  const showSession = active && sessionOpen && !!session && !!lesson;
  const feedback = session?.feedback;
  const compactFeedback = feedback && feedback.correct && feedback.outcome !== 'revealed';
  const feedbackTitle = feedback?.outcome === 'self' ? session?.draft.speech?.mode === 'read' ? '这组表达已完成跟读' : '已记录你的自查' : feedback?.outcome === 'revealed' ? '看看这句怎么表达' : feedback?.correct ? session?.draft.helped ? '借助提示完成了' : '回答正确' : '再看一下这里';

  function commit(next: DailyProgress) {
    if (!writable) return;
    let result;
    try { result = persistDailyProgress(localStorage, next, storedRaw.current); }
    catch {
      current.current = next; setProgress(next);
      setWarning('浏览器无法访问存储。本页输入仍在，请导出记录，恢复存储权限后再继续。');
      setWritable(false); return;
    }
    current.current = result.progress;
    setProgress(result.progress);
    if (result.saved) storedRaw.current = result.raw;
    else { setWarning(result.warning); setWritable(false); }
  }

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DAILY_KEY && event.key !== null) return;
      if (event.newValue === storedRaw.current) return;
      setWarning('另一个页面更新了日常英语记录。当前输入仍保留在此页面，请重新加载最新记录后继续，以免覆盖。');
      setWritable(false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
    const previous = current.current.session;
    if (previous && previous.stage !== 'summary' && !replace) {
      if (previous.lessonId === lessonToStart.id && previous.mode === mode) { setSessionOpen(true); return; }
      setPendingStart({ lesson: lessonToStart, mode });
      return;
    }
    let target = lessonToStart;
    if (mode === 'workbook' && filter !== 'all') {
      const kinds = filter === 'listen' ? ['listen'] : filter === 'write' ? ['fill', 'write', 'order'] : filter === 'speak' ? ['speak'] : ['choice'];
      target = { ...lessonToStart, exercises: lessonToStart.exercises.filter(item => kinds.includes(item.kind)) };
    }
    if (!target.exercises.length) return;
    commit({ ...current.current, session: createDailySession(target, mode) });
    setUnitId(lessonToStart.id.slice(0, 5));
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
    if (now.session.feedback) { commit(advanceDailySession(now, lesson)); return; }
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
    commit(submitDailyAnswer(now, lesson));
  }

  function showHelp(reveal = false) {
    if (!lesson) return;
    let next = markDailyHelp(current.current, lesson, reveal);
    if (reveal) next = submitDailyAnswer(next, lesson, { reveal: true });
    commit(next);
  }

  function reloadSaved() {
    const next = loadProgress();
    storedRaw.current = next.raw;
    current.current = next.progress;
    setProgress(next.progress);
    setWarning(next.warning);
    setWritable(next.writable);
    setSessionOpen(!!next.progress.session);
    setPendingStart(null);
  }

  function exportRecord() {
    // A failed save can leave a newer draft in memory. Export both versions,
    // including the exact original text when the stored record is damaged.
    const content = JSON.stringify(warning ? { savedRaw: storedRaw.current, currentProgress: current.current, warning } : current.current, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'daily-english-record.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const voiceButton = <button className="voice-button" aria-label="语音设置" onClick={openVoice}><Icon name="sound" /><span>语音设置<span className="voice-preference">{voice === 'aria' ? 'Aria' : 'Guy'} · {speed === 'slow' ? '慢速' : '正常'}</span></span><Icon name="chevron" /></button>;
  const audioButton = (audioPhrase: DailyPhrase, slow?: boolean, label?: string, iconOnly = false) => {
    const key = `daily-${audioPhrase.id}-${(slow ?? speed === 'slow') ? 'slow' : 'normal'}`;
    return <button type="button" className={`daily-audio${speaking === key ? ' playing' : ''}${iconOnly ? ' icon-only' : ''}`} aria-label={iconOnly ? label ?? '播放语音' : undefined} title={iconOnly ? label : undefined} aria-pressed={speaking === key} onClick={() => play(audioPhrase, slow)}><Icon name="sound" />{!iconOnly && (label ?? '播放语音')}</button>;
  };
  const workbookHasItems = (item: DailyLesson) => filter === 'all' || item.exercises.some(task => filter === 'listen' ? task.kind === 'listen' : filter === 'write' ? ['fill', 'write', 'order'].includes(task.kind) : filter === 'speak' ? task.kind === 'speak' : task.kind === 'choice');

  return <main ref={contentRef} id="daily-content" className="content daily-content" hidden={!active}>
    {warning && <div className="daily-notice" role="alert"><p>{warning}</p><button className="daily-button" onClick={exportRecord}>导出记录</button><button className="daily-button" onClick={reloadSaved}>重新加载记录</button></div>}
    {showSession && session && lesson ? <div className="daily-session">
      <div className="daily-session-top"><button className="daily-button text" onClick={() => { setSessionOpen(false); stopAudio(); }}>〈 返回课程{writable ? ' · 已保存' : ''}</button>{voiceButton}</div>
      <header ref={headingRef} className="daily-session-heading"><span className="daily-session-label">{dailyUnits.find(item => item.lessons.some(part => part.id === lesson.id))?.title} · {session.mode === 'lesson' ? '学习' : session.mode === 'review' ? '复习' : '练习册'}</span><h1 ref={studyRef} tabIndex={-1}>{lesson.title}</h1><p>{lesson.goal}</p>
        {session.stage !== 'study' && <><span className="progress-track" role="progressbar" aria-label="本课练习进度" aria-valuemin={0} aria-valuemax={session.queue.length} aria-valuenow={session.answers.length}><i style={{ width: `${session.answers.length / Math.max(1, session.queue.length) * 100}%` }} /></span><span className="daily-session-label">{session.answers.length} / {session.queue.length} 项{session.queue[session.index]?.retry ? ' · 换一道题复查' : ''}</span></>}
      </header>
      {session.stage === 'study' && <section className="daily-study-card daily-enter"><h2>这一课怎么说</h2><p className="daily-study-explanation">{lesson.explanation}</p><div className="daily-phrases">{lesson.phrases.map(item => <button key={item.id} className={`daily-phrase${speaking.startsWith(`daily-${item.id}-`) ? ' playing' : ''}`} aria-label={`朗读 ${item.en}`} aria-pressed={speaking.startsWith(`daily-${item.id}-`)} onClick={() => play(item)}><strong>{item.en}<Icon name="sound" /></strong><span>{item.zh}</span>{item.note && <small>{item.note}</small>}</button>)}</div><p className="daily-play-hint">点句子听发音，再跟着读。可以随时暂停，回来继续。</p><div className="daily-session-actions"><p>接下来用选择、听音和表达来练习。</p><button className="daily-button primary" disabled={!writable} onClick={() => { stopAudio(); commit({ ...current.current, session: beginDailyExercises(session) }); }}>开始练习<Icon name="arrow" /></button></div></section>}
      {session.stage === 'exercise' && exercise && <>
        <form ref={formRef} className="daily-question daily-enter" key={`${session.id}-${session.index}`} data-exercise-id={exercise.id} data-kind={exercise.kind} onSubmit={event => { event.preventDefault(); checkOrContinue(); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || composing.current) return;
          if (event.key === 'Enter' && (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox' || event.target instanceof HTMLTextAreaElement && (exercise.kind !== 'speak' && !event.shiftKey || event.ctrlKey))) { event.preventDefault(); checkOrContinue(); }
        }}>
          <h2>{exercise.prompt}</h2>
          {exercise.kind === 'listen' && phrase && <div className="daily-audio-row">{audioButton(phrase, undefined, '听一听')}{audioButton(phrase, true, '慢速')}</div>}
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
        {feedback && !compactFeedback && <section className="daily-feedback" role="status"><h3>{feedbackTitle}</h3>{feedback.expected[0] && <p className="daily-expected" lang="en">{feedback.expected[0]}</p>}<p>{feedback.explanation}</p>{phrase && audioButton(phrase, undefined, '听参考发音')}<p>这个难点会保留，后续换题或隔后复习时再检查。</p></section>}
        <div className={`daily-controls${compactFeedback ? feedback.outcome === 'self' ? ' has-self-feedback' : ' has-correct-feedback' : ''}`}>
          {compactFeedback ? <section className={`daily-feedback compact ${feedback.outcome === 'self' ? 'self' : 'correct'}`} role="status">
            <h3><Icon name="check" />{feedbackTitle}</h3>
            {phrase && audioButton(phrase, undefined, '听参考发音', true)}
            <details className="daily-feedback-details" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
              <summary>解析</summary><div className="daily-feedback-explanation">{feedback.expected.map((answer, index) => <p key={index} className="daily-expected" lang="en">{answer}</p>)}<p>{feedback.explanation}</p></div>
            </details>
          </section> : <div>{!feedback && exercise.kind !== 'speak' && <><button className="daily-button text" disabled={!writable || session.draft.helped} onClick={() => showHelp()}>提示</button><button className="daily-button text" disabled={!writable} onClick={() => showHelp(true)}>暂时不会</button></>}</div>}
          <button ref={submitRef} className="daily-button primary" disabled={!writable || speechBusy} onClick={checkOrContinue}>{feedback ? '继续' : exercise.kind === 'speak' ? dailySpeakingMode(session.draft) === 'read' ? '完成跟读' : '完成自查' : '检查'}<Icon name="arrow" /></button>
        </div>
      </>}
      {session.stage === 'summary' && (() => {
        const summary = summarizeDailySession(session);
        const difficulties = dailyUnresolvedErrors(progress, lesson.id);
        const next = dailyLessons[dailyLessons.indexOf(lesson) + 1];
        return <section className="daily-summary daily-enter"><h2>{session.mode === 'lesson' ? '这一课已完成' : '本轮练习已完成'}</h2><p>完成记录和需要再练的内容已经分别保存。</p><div className="daily-summary-counts"><p><strong>{summary.independent}</strong>项独立作答</p><p><strong>{summary.assisted + summary.revealed}</strong>项需要帮助</p><p><strong>{summary.self}</strong>项口语练习</p></div>{difficulties.length > 0 ? <><h3>下次重点复习</h3><ul>{difficulties.map(id => { const task = findDailyExercise(lesson, id); return <li key={id}>{task?.explanation ?? lesson.goal}</li>; })}</ul><p>本轮纠正不会清除难点；之后独立完成再检查。</p></> : <p>下次复习会再次检查记忆。完成一课不等于已经长期掌握。</p>}<div className="daily-session-actions"><button className="daily-button" onClick={() => { commit(finishDailySession(current.current)); setSessionOpen(false); }}>返回课程</button>{next && session.mode === 'lesson' && <button className="daily-button primary" disabled={!writable} onClick={() => start(next, 'lesson', true)}>下一课<Icon name="arrow" /></button>}</div></section>;
      })()}
    </div> : <>
      <header ref={headingRef} className="page-heading"><div className="page-heading-copy"><h1>{view === 'course' ? '日常英语' : view === 'workbook' ? '练习册' : '复习学过的内容'}</h1><p>{view === 'course' ? '从问候开始，把词汇和句子用在真实交流里。' : view === 'workbook' ? '按课程和题型练习，巩固已经学过的表达。' : '到期内容和仍需练习的难点，分别保留真实记录。'}</p></div>{voiceButton}</header>
      {session && <div className="daily-note daily-resume"><h2>{session.stage === 'summary' ? '查看上次练习结果' : '接着上次的位置'}</h2><p>{findDailyLesson(session.lessonId)?.title} · {session.stage === 'study' ? '正在学习表达' : `${session.answers.length} / ${session.queue.length} 项练习`}</p><button className="daily-button primary" onClick={() => { setSessionOpen(true); setPendingStart(null); }}>继续上次学习<Icon name="arrow" /></button></div>}
      {pendingStart && <div className="daily-notice" role="status"><p>当前“{findDailyLesson(session?.lessonId ?? '')?.title}”还没结束。切换后保留已答记录，当前未提交的输入不再续接。</p><button className="daily-button" onClick={() => { setSessionOpen(true); setPendingStart(null); }}>继续原课程</button><button className="daily-button" onClick={() => start(pendingStart.lesson, pendingStart.mode, true)}>开始“{pendingStart.lesson.title}”</button></div>}
      {view !== 'review' && <div className="daily-unit-tabs" role="tablist" aria-label="日常英语单元">{dailyUnits.map(item => <button role="tab" key={item.id} className="daily-unit-tab" aria-selected={item.id === unit.id} aria-controls="daily-unit-panel" onClick={() => setUnitId(item.id)}><strong>{item.title}</strong><span>{item.lessons.filter(part => progress.lessons[part.id]?.completedAt).length} / {item.lessons.length} 课已完成</span></button>)}</div>}
      <div className="daily-layout"><section id="daily-unit-panel" className="daily-panel daily-enter" key={`${unit.id}-${view}`} aria-label={view === 'review' ? '待复习课程' : unit.title}>
        <div className="daily-panel-heading"><h2>{view === 'review' ? '现在可以复习' : unit.title}</h2><p>{view === 'review' ? '优先处理难点；也可以提前巩固已经完成的课程。' : unit.description}</p>{view === 'workbook' && <label className="daily-workbook-filter">练习内容<select aria-label="练习题型" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">综合练习</option><option value="meaning">词句理解</option><option value="listen">听音理解</option><option value="write">排句与书写</option><option value="speak">表达自查</option></select></label>}</div>
        {view === 'review' && !reviewLessons.length ? <div className="daily-empty"><h2>{completed ? '暂时没有到期复习' : '先学会第一句'}</h2><p>{completed ? '可以休息一下，或提前巩固已完成的课程。' : '完成学习后，这里会安排复习；出现的难点也会留在这里。'}</p></div> : <ol className="daily-lessons">{(view === 'review' ? reviewLessons : unit.lessons).filter(item => view !== 'workbook' || workbookHasItems(item)).map((item, index) => {
          const complete = !!progress.lessons[item.id]?.completedAt;
          const errors = dailyUnresolvedErrors(progress, item.id).length;
          const mode = view === 'course' ? 'lesson' : view === 'review' ? 'review' : 'workbook';
          return <li className="daily-lesson-row" key={item.id}><span className={`daily-lesson-state${complete ? ' complete' : ''}`} aria-label={complete ? '已完成' : '未完成'}>{complete ? <Icon name="check" /> : index + 1}</span><div className="daily-lesson-copy"><h3>{item.title}</h3><p>{view === 'review' ? errors ? `${errors} 处难点需要再练` : '已到复习时间' : item.goal}</p></div><div className="daily-lesson-actions"><button className="daily-button" disabled={!writable || view === 'workbook' && !complete} onClick={() => start(item, mode)}>{view === 'workbook' ? complete ? '开始练习' : '先学这一课' : view === 'review' ? '复习' : complete ? '再学一次' : '学习'}<Icon name="arrow" /></button></div></li>;
        })}</ol>}
        {view === 'review' && completed > 0 && <details className="daily-panel-heading"><summary>提前巩固已完成课程</summary><ol className="daily-lessons">{dailyLessons.filter(item => progress.lessons[item.id]?.completedAt).map(item => <li className="daily-lesson-row" key={item.id}><div className="daily-lesson-copy"><h3>{item.title}</h3></div><button className="daily-button" disabled={!writable} onClick={() => start(item, 'review')}>巩固</button></li>)}</ol></details>}
      </section><aside className="daily-rail" aria-label="日常英语进度与继续学习"><section className="daily-note"><h2>继续学习</h2><p>{nextLesson.title}</p><button className="daily-button primary" disabled={!writable} onClick={() => session ? setSessionOpen(true) : start(nextLesson, 'lesson')}>{session ? '接着上次学' : completed === dailyLessons.length ? '再学一课' : '开始这一课'}<Icon name="arrow" /></button><p className="daily-small">每次一小课，随时离开也能继续。</p></section><section className="daily-note"><h2>我的课程进度</h2><p className="daily-total"><strong>{completed}</strong>/ {dailyLessons.length} 课</p><span className="progress-track" role="progressbar" aria-label="日常英语课程完成进度" aria-valuemin={0} aria-valuemax={dailyLessons.length} aria-valuenow={completed}><i style={{ width: `${completed / dailyLessons.length * 100}%` }} /></span><p>{difficultLessons.length ? `${difficultLessons.length} 课有需要再练的内容。` : '完成记录与复习表现分别保存。'}</p><p className="daily-small">日常英语和编程英语各自记录进度，保存在当前浏览器。</p><button className="daily-button text" onClick={exportRecord}>导出日常英语记录</button></section></aside></div>
      <p className="daily-course-footer">目前可学习基础交流的前四个单元。后续课程将逐步增加；课程完成不等于等级认证。</p>
    </>}
  </main>;
}
