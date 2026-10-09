import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { vocabulary, type VocabularyItem } from './vocabulary';
import ReviewQuiz from './ReviewLesson';
import Icon from './Icon';
import ThemePicker, { readTheme, THEME_KEY, type Theme } from './ThemePicker';
import { useThemeMotion } from './useThemeMotion';
import { useMobileViewport } from './useMobileViewport';
import SyncPanel from './SyncPanel';
import { progressStorage, REMOTE_APPLIED, blockSyncApply } from './progressStorage';
import { downloadRecord, hasNativeAudio, startNativeAudio, startNativeQueue } from './nativeAndroid';
import { AudioPlayback } from './audioPlayback';
import { FeedbackAudio, FEEDBACK_SOUND_KEY, type FeedbackSound } from './feedbackAudio';
import { ReadAloudProvider } from './ReadAloud';
import { findReadingAudio, readingPlaybackKey } from './readingAudio';
import { slowReadingQueue } from './slowReading';
import DailyEnglish from './DailyEnglish';
import FoundationEnglish, { FoundationHelp, foundationTrack } from './FoundationEnglish';
import { foundationAudioPath } from './foundationAudio';
import { foundationDemoPath, foundationDemoKey } from './foundationDemos';
import { phonemeAudioPath, phonemeAudioKey, type PhonemeAudioKind } from './phonemeInventory';
import ReviewVocabulary from './ReviewVocabulary';
import VocabularyRow from './VocabularyRow';
import SpeechControls, { playbackRates, type PlaybackSpeed } from './SpeechControls';
import { dailyPhrases, type DailyPhrase } from './dailyCourse';
import type { DailyProgress } from './dailyProgress';
import { programmingPhrases } from './programmingCourse';
import { adaptiveProgrammingUnits as programmingUnits, adaptiveProgrammingLessons as programmingLessons, programmingTargetMeaning } from './programmingPractice';
import { programmingStudyInfo } from './programmingStudy';
import { initializeProgrammingReview, persistProgrammingCourseEvidence, PROGRAMMING_COURSE_KEY } from './programmingProgress';
import { programmingReview, applyProgrammingReviewToLearning } from './programmingReview';
import { REVIEW_KEY, getSkill, isWordDue, isReviewEligible, parseReviewProgress, reviewAbilities, type ReviewProgress } from './review';
import { readReviewSession, closeReviewSession } from './reviewSession';

type Section = 'programming' | 'daily' | 'foundation';
type View = 'course' | 'review' | 'library' | 'favorites';
const categoryOrder = [...new Set(vocabulary.map(item => item.category))];
function readFavorites() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('codewords-favorites') ?? '[]');
    if (!Array.isArray(value) || value.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error();
    return { ids: new Set<number>(value), warning: '' };
  } catch { return { ids: new Set<number>(), warning: '收藏记录无法读取，原记录已保留，暂不修改收藏。' }; }
}
export default function Home() {
  useMobileViewport();
  const [section, setSection] = useState<Section>(() => { try { const saved = localStorage.getItem('codewords-section'); return saved === 'daily' || saved === 'foundation' ? saved : 'programming'; } catch { return 'programming'; } });
  const [foundationView, setFoundationView] = useState<View>('course');
  const [foundationVisited, setFoundationVisited] = useState(section === 'foundation');
  const [foundationRequest, setFoundationRequest] = useState<{ id: string; revision: number }>();
  const [foundationReturn, setFoundationReturn] = useState<Section | null>(null);
  const [dailyView, setDailyView] = useState<View>('course');
  const [programmingView, setProgrammingView] = useState<View>('course');
  const [navigation, setNavigation] = useState(0);
  const [syncRevision, setSyncRevision] = useState(0);
  const [dailyVisited, setDailyVisited] = useState(section === 'daily');
  const [programmingVisited, setProgrammingVisited] = useState(section === 'programming');
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('全部词汇');
  const [tier, setTier] = useState('全部');
  const [scope, setScope] = useState('all');
  const [visibleCount, setVisibleCount] = useState(24);
  const [favoritesQuery, setFavoritesQuery] = useState('');
  const [favoritesVisibleCount, setFavoritesVisibleCount] = useState(24);
  const [favoriteState, setFavoriteState] = useState(readFavorites);
  const favorites = favoriteState.ids;
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress>({});
  const [reviewWarning, setReviewWarning] = useState('');
  const [quizSessions, setQuizSessions] = useState(() => { try { return Number(localStorage.getItem('codewords-quiz-sessions') ?? 0) || 0; } catch { return 0; } });
  const [showQuiz, setShowQuiz] = useState(() => { const saved = readReviewSession(); return !!saved?.active && !saved.lesson.finished; });
  const [quizPool, setQuizPool] = useState<VocabularyItem[]>(() => readReviewSession()?.lesson.items ?? []);
  const [showVoice, setShowVoice] = useState(false);
  const [speaking, setSpeaking] = useState('');
  const [phonemeError, setPhonemeError] = useState('');
  const [foundationError, setFoundationError] = useState('');
  const [voice, setVoice] = useState<'aria' | 'guy'>(() => { try { return localStorage.getItem('codewords-voice') === 'guy' ? 'guy' : 'aria'; } catch { return 'aria'; } });
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(() => { try { return localStorage.getItem('codewords-playback-speed') === 'slow' ? 'slow' : 'normal'; } catch { return 'normal'; } });
  const [player] = useState(() => new AudioPlayback(setSpeaking, key => {
    if (key?.startsWith('phonetic-')) setPhonemeError('这次本地录音未能播放，请重试。');
    else if (key?.startsWith('foundation-demo-') || key?.startsWith('daily-foundation-tutorial-')) setFoundationError('这次本地录音未能播放。');
    else window.alert('这次读音未能播放，请再点一次。');
  }, startNativeAudio, undefined, busy => blockSyncApply('audio-playback', busy), startNativeQueue));
  const [feedbackEnabled, setFeedbackEnabled] = useState(() => { try { return localStorage.getItem(FEEDBACK_SOUND_KEY) !== 'off'; } catch { return true; } });
  const [feedbackPlayer] = useState(() => new FeedbackAudio(
    () => { if (!hasNativeAudio()) player.stop(); },
    path => new URL(path, document.baseURI).href,
    undefined,
    () => player.isBusy,
    busy => blockSyncApply('feedback-playback', busy),
  ));
  feedbackPlayer.enabled = feedbackEnabled;
  const playFeedback = useCallback((sound: FeedbackSound, eventId: string) => { feedbackPlayer.play(sound, eventId); }, [feedbackPlayer]);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const quizTrigger = useRef<HTMLElement | null>(null);
  const voiceDialog = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const view = section === 'foundation' ? foundationView : section === 'daily' ? dailyView : programmingView;
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const { replay } = useThemeMotion({ theme, selection: `${section}-${view}`, navRef, contentRef, headingRef });
  const stopAudio = useCallback(() => { player.stop(); feedbackPlayer.stop(); setFoundationError(''); }, [player, feedbackPlayer]);
  const rememberSpeed = useCallback((next: PlaybackSpeed) => {
    setPlaybackSpeed(next);
    try { localStorage.setItem('codewords-playback-speed', next); }
    catch { window.alert('语速已切换，但浏览器未能保存偏好。'); }
  }, []);
  const changeSpeed = useCallback((next: PlaybackSpeed) => {
    rememberSpeed(next); player.setRate(playbackRates[next], next);
  }, [player, rememberSpeed]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { player.stop(); feedbackPlayer.stop(); } };
    const leave = () => { player.stop(); feedbackPlayer.stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    feedbackPlayer.preload();
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave); player.dispose(); feedbackPlayer.dispose(); };
  }, [player, feedbackPlayer]);
  useEffect(() => { feedbackPlayer.stop(); }, [section, view, navigation, showQuiz, feedbackPlayer]);
  const preloadReading = useCallback((text: string) => {
    if (hasNativeAudio()) return;
    try { const queue = slowReadingQueue(text, voice, document.baseURI); if (queue) player.preloadQueue(queue); }
    catch { /* The actual click reports missing data; build validation prevents shipping it. */ }
  }, [player, voice]);
  const preloadProgramming = useCallback((files: string[]) => {
    if (hasNativeAudio()) return;
    player.preload(files.map(file => new URL(`audio/${voice}/${file}`, document.baseURI).href));
    for (const file of files.slice(0, 4)) {
      const match = /^(word|example)-(\d+)\.mp3/.exec(file);
      const item = match && vocabulary.find(item => item.id === Number(match[2]));
      if (item && match) preloadReading(match[1] === 'word' ? item.word : item.example);
    }
  }, [player, voice, preloadReading]);
  const preloadDaily = useCallback((files: string[]) => {
    if (hasNativeAudio()) return;
    player.preload(files.map(file => new URL(`audio/daily/${voice}/${file}`, document.baseURI).href));
    for (const file of files.slice(0, 4)) { const item = dailyPhrases.find(item => file.startsWith(`${item.id}.mp3`)); if (item) preloadReading(item.en); }
  }, [player, voice, preloadReading]);
  const refreshReview = useCallback(() => {
    try { setReviewProgress(initializeProgrammingReview(progressStorage)); setReviewWarning(''); }
    catch (error) { setReviewWarning(error instanceof Error ? error.message : '复习记录无法保存，原记录已保留。'); }
  }, []);
  useEffect(() => {
    refreshReview();
    const update = (event: StorageEvent) => {
      if (event.key === REVIEW_KEY || event.key === 'codewords-mastered' || event.key === null) refreshReview();
      if (event.key === 'codewords-favorites' || event.key === null) setFavoriteState(readFavorites());
    };
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('storage', update); };
  }, [refreshReview]);
  useEffect(() => {
    const apply = () => { stopAudio(); refreshReview(); setFavoriteState(readFavorites()); setQuizSessions(Number(localStorage.getItem('codewords-quiz-sessions') ?? 0)); setSyncRevision(value => value + 1); };
    window.addEventListener(REMOTE_APPLIED, apply);
    return () => window.removeEventListener(REMOTE_APPLIED, apply);
  }, [refreshReview, stopAudio]);
  const syncProgramming = useCallback((progress: DailyProgress) => {
    try {
      const result = persistProgrammingCourseEvidence(progressStorage, progress, programmingLessons);
      setReviewProgress(result); setReviewWarning('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '词汇复习记录未能同步。课程已保存，请刷新重试。';
      setReviewWarning(message); throw new Error(message);
    }
  }, []);
  const curriculum = useMemo(() => ({ key: PROGRAMMING_COURSE_KEY, label: '编程英语', units: programmingUnits, phrases: programmingPhrases,
    description: '先点读学习 6 个新词，准备好后完成 10 题检验。', targetMeaning: programmingTargetMeaning, studyInfo: programmingStudyInfo,
    onProgress: syncProgramming, review: programmingReview(reviewProgress),
    prepareLearning: (progress: DailyProgress) => applyProgrammingReviewToLearning(progress, reviewProgress) }), [syncProgramming, reviewProgress]);
  const reviewPool = useMemo(() => vocabulary.filter(item => isReviewEligible(reviewProgress, item.id)), [reviewProgress]);
  const duePool = reviewPool.filter(item => isWordDue(reviewProgress, item.id));
  const showingFavorites = programmingView === 'favorites';
  const listQuery = showingFavorites ? favoritesQuery : query;
  const listVisibleCount = showingFavorites ? favoritesVisibleCount : visibleCount;
  const favoriteCount = useMemo(() => vocabulary.filter(item => favorites.has(item.id)).length, [favorites]);
  const updateListQuery = (value: string) => {
    if (showingFavorites) { setFavoritesQuery(value); setFavoritesVisibleCount(24); }
    else { setQuery(value); setVisibleCount(24); }
  };
  const resetListFilters = () => {
    updateListQuery('');
    if (!showingFavorites) { setTier('全部'); setSelection('全部词汇'); setScope('all'); }
  };
  const filtered = useMemo(() => vocabulary.filter(item => (showingFavorites ? favorites.has(item.id) : (selection === '全部词汇' || item.category === selection)
    && (tier === '全部' || item.tier === tier)
    && (scope === 'all' || scope === 'favorites' && favorites.has(item.id) || scope === 'learned' && isReviewEligible(reviewProgress, item.id) || scope === 'learning' && reviewProgress[item.id]?.reviewReadyAt === 0 || scope === 'due' && isWordDue(reviewProgress, item.id)))
    && (!listQuery.trim() || `${item.word} ${item.meaning} ${item.example}`.toLowerCase().includes(listQuery.trim().toLowerCase()))), [showingFavorites, selection, tier, scope, listQuery, favorites, reviewProgress]);
  const changeSection = (next: Section) => {
    if (next === section) return;
    stopAudio(); if (next === 'foundation') setFoundationVisited(true); else if (next === 'daily') setDailyVisited(true); else setProgrammingVisited(true);
    setSection(next); try { localStorage.setItem('codewords-section', next); } catch { /* Navigation remains usable. */ }
  };
  const openFoundation = (id: string) => {
    if (section !== 'foundation') setFoundationReturn(section);
    setFoundationRequest(previous => ({ id, revision: (previous?.revision ?? 0) + 1 }));
    setFoundationView(foundationTrack(id)); changeSection('foundation');
  };
  const foundationHelp = (phrase: DailyPhrase) => <FoundationHelp phrase={phrase} open={openFoundation} />;
  const changeTheme = (value: Theme) => { setTheme(value); try { localStorage.setItem(THEME_KEY, value); } catch { /* Keep session. */ } };
  const changeView = (next: View) => {
    if (view === next) replay(); stopAudio();
    if (section === 'foundation') setFoundationView(next); else if (section === 'daily') setDailyView(next); else setProgrammingView(next);
    setNavigation(value => value + 1); refreshReview();
  };
  function toggleFavorite(id: number) {
    const latest = readFavorites();
    if (latest.warning) { setFavoriteState(latest); return; }
    const ids = new Set(latest.ids); if (ids.has(id)) ids.delete(id); else ids.add(id);
    try { progressStorage.setItem('codewords-favorites', JSON.stringify([...ids])); setFavoriteState({ ids, warning: '' }); }
    catch { setFavoriteState({ ids: latest.ids, warning: '收藏暂时无法保存，请检查浏览器存储。' }); }
  }
  function startQuiz(early = false, wordIds?: number[]) {
    stopAudio();
    try {
      const progress = parseReviewProgress(localStorage.getItem(REVIEW_KEY));
      const selected = wordIds ? new Set(wordIds) : null;
      const pool = vocabulary.filter(item => isReviewEligible(progress, item.id) && (early || isWordDue(progress, item.id)) && (!selected || selected.has(item.id)));
      setReviewProgress(progress);
      if (!pool.length) return;
      quizTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuizPool(pool);
      setShowQuiz(true);
    } catch { setReviewWarning('复习记录无法读取，原记录已保留，请先导出记录。'); }
  }
  const finishReview = () => { const count = quizSessions + 1; setQuizSessions(count); try { progressStorage.setItem('codewords-quiz-sessions', String(count)); } catch { setReviewWarning('本轮练习次数未能保存。'); } refreshReview(); };
  const closeReview = () => { stopAudio(); closeReviewSession(); setShowQuiz(false); refreshReview(); requestAnimationFrame(() => {
    const trigger = quizTrigger.current;
    if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus();
    else if (reviewButton.current && !reviewButton.current.disabled) reviewButton.current.focus();
    else contentRef.current?.querySelector<HTMLElement>('.review-list-tools input, .review-list-empty button:not(:disabled)')?.focus();
  }); };
  function exportProgramming() {
    const keys = ['codewords-mastered', 'codewords-favorites', 'codewords-quiz-last-tested', 'codewords-quiz-sessions', REVIEW_KEY, PROGRAMMING_COURSE_KEY];
    const raw = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
    downloadRecord('programming-english-record.json', JSON.stringify(raw, null, 2));
  }
  const playTextAudio = (text: string, url: string, slow: boolean, key: string) => {
    try {
      const queue = slow ? slowReadingQueue(text, voice, document.baseURI) : undefined;
      if (queue) player.playQueue(queue, .72, key);
      else player.play(url, slow ? .72 : 1, key);
    } catch { player.stop(); window.alert('逐词读音资源不完整，本次朗读已停止。请更新资源后重试。'); }
  };
  const playAudio = (fileName: string, slow = false, key = fileName, daily = false, text = '') => {
    feedbackPlayer.stop();
    const requestedSpeed: PlaybackSpeed = slow ? 'slow' : 'normal';
    if (requestedSpeed !== playbackSpeed) rememberSpeed(requestedSpeed);
    playTextAudio(text, new URL(`audio/${daily ? 'daily/' : ''}${voice}/${fileName}`, document.baseURI).href, slow, key);
  };

  const playWord = (item: VocabularyItem, slow = playbackSpeed === 'slow', key = `word-${item.id}`) => playAudio(`word-${item.id}.mp3`, slow, key, false, item.word);
  // A text revision must not replay an older MP3 cached under the same word ID.
  const playExample = (item: VocabularyItem, slow = playbackSpeed === 'slow', key = `example-${item.id}`) => playAudio(`example-${item.id}.mp3?v=${encodeURIComponent(item.example)}`, slow, key, false, item.example);
  const playDaily = (phrase: DailyPhrase, slow = playbackSpeed === 'slow') => playAudio(`${phrase.id}.mp3?v=${encodeURIComponent(phrase.en)}`, slow, `daily-${phrase.id}-${slow ? 'slow' : 'normal'}`, true, phrase.en);
  const playFoundation = (phrase: DailyPhrase, slow = false) => {
    const path = foundationAudioPath(phrase.en, voice, phrase.id.startsWith('foundation-tutorial-'));
    if (!path) return;
    feedbackPlayer.stop(); setFoundationError(''); rememberSpeed(slow ? 'slow' : 'normal');
    const url = new URL(path, document.baseURI).href;
    const key = `daily-${phrase.id}-${slow ? 'slow' : 'normal'}`;
    // The new listening tutorials need a continuous slow sentence as well as
    // separate word buttons. Keep the existing samples' word-by-word behavior.
    if (phrase.id.startsWith('foundation-tutorial-')) player.play(url, slow ? .72 : 1, key);
    else playTextAudio(phrase.en, url, slow, key);
  };
  const playFoundationDemo = (id: string, slow = false) => {
    feedbackPlayer.stop(); setFoundationError('');
    player.play(new URL(foundationDemoPath(id), document.baseURI).href, slow ? .72 : 1, foundationDemoKey(id, slow));
  };
  const playPhoneme = (id: string, kind: PhonemeAudioKind, slow = false) => {
    feedbackPlayer.stop(); setPhonemeError('');
    player.play(new URL(phonemeAudioPath(id, kind), document.baseURI).href, slow ? playbackRates.slow : 1, phonemeAudioKey(id, kind, slow));
  };
  const playReading = (text: string, slow: boolean) => {
    const recording = findReadingAudio(text);
    if (!recording) return;
    feedbackPlayer.stop();
    rememberSpeed(slow ? 'slow' : 'normal');
    playTextAudio(text, new URL(`audio/${recording.path.replace('{voice}', voice)}`, document.baseURI).href, slow, readingPlaybackKey(text, slow));
  };

  useEffect(() => {
    if (!showVoice) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    voiceDialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowVoice(false);
      if (event.key !== 'Tab') return;
      const controls = [...(voiceDialog.current?.querySelectorAll<HTMLElement>('button, select') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [showVoice]);


  const playProgramming = (phrase: DailyPhrase, slow = playbackSpeed === 'slow') => playAudio(`${phrase.id}.mp3?v=${encodeURIComponent(phrase.en)}`, slow, `daily-${phrase.id}-${slow ? 'slow' : 'normal'}`, false, phrase.en);
  const libraryActive = section === 'programming' && (view === 'library' || view === 'favorites');
  const voicePreviewPlaying = speaking === 'voice-test' || speaking === 'voice-test-slow';
  useEffect(() => {
    if (!libraryActive && !(section === 'programming' && view === 'review')) return;
    const words = (libraryActive ? filtered : showQuiz ? quizPool : reviewPool).slice(0, 6);
    preloadProgramming(words.flatMap(item => [`word-${item.id}.mp3`, `example-${item.id}.mp3?v=${encodeURIComponent(item.example)}`]));
  }, [libraryActive, section, view, filtered, showQuiz, quizPool, reviewPool, preloadProgramming]);
  return <ReadAloudProvider speaking={speaking} play={playReading} preload={preloadReading} pageKey={`${section}:${view}:${navigation}:${showQuiz}`}><div className="app-shell" data-section={section}>
    <a className="skip-link" href={section === 'foundation' ? '#foundation-content' : section === 'daily' ? '#daily-content' : libraryActive ? '#vocabulary-content' : '#programming-content'}>跳到学习内容</a>
    <header className="site-header"><div className="header-inner">
      <div className="section-switch" role="group" aria-label="学习分区"><button aria-pressed={section === 'programming'} onClick={() => changeSection('programming')}><Icon name="book" />编程英语</button><button aria-pressed={section === 'daily'} onClick={() => changeSection('daily')}>日常英语</button><button aria-pressed={section === 'foundation'} onClick={() => changeSection('foundation')}>英语基础</button></div>
      <nav ref={navRef} className="main-nav" aria-label="学习导航">{(section === 'foundation' ? ['course', 'library'] as const : ['course', 'review', 'library', 'favorites'] as const).map((value, index) => <button key={value} className={`nav-item${view === value ? ' active' : ''}`} aria-current={view === value ? 'page' : undefined} onClick={() => changeView(value)}><Icon name={section === 'foundation' && value === 'library' ? 'sound' : (['book', 'review', 'library', 'star'] as const)[index]} /><span>{section === 'foundation' ? (value === 'course' ? '基础概念与语法' : '音标与发音') : value === 'course' ? '课程' : value === 'review' ? '复习' : value === 'favorites' ? '收藏' : '词汇库'}</span></button>)}<span className="nav-marker" aria-hidden="true"><span className="nav-marker-ink" /><span className="nav-marker-spray" /></span></nav>
      <div className="header-tools"><SyncPanel /><ThemePicker value={theme} onChange={changeTheme} /></div>
    </div></header>
    {section === 'programming' && reviewWarning && <div className="content"><div className="daily-notice" role="alert"><p>{reviewWarning}</p><button className="daily-button" onClick={exportProgramming}>导出原始记录</button><button className="daily-button" onClick={refreshReview}>重新读取</button></div></div>}
    {programmingVisited && <DailyEnglish foundationHelp={foundationHelp} key={`programming-${syncRevision}`} active={section === 'programming' && !libraryActive} curriculum={curriculum} view={programmingView === 'library' || programmingView === 'favorites' ? 'course' : programmingView} navigation={navigation} voice={voice} speed={playbackSpeed} onSpeedChange={changeSpeed} speaking={speaking} play={playProgramming} preload={preloadProgramming} stopAudio={stopAudio} openVoice={() => setShowVoice(true)} openLibrary={() => changeView('library')} contentRef={section === 'programming' && !libraryActive ? contentRef : undefined} headingRef={section === 'programming' && !libraryActive ? headingRef : undefined}
      playFeedback={playFeedback} reviewDescription={`已学 ${reviewPool.length} 个词，${duePool.length} 个待复习。`}
      renderReview={scenarios => <ReviewVocabulary words={reviewPool} progress={reviewProgress} favorites={favorites} favoriteWarning={favoriteState.warning} disabled={!!reviewWarning} speaking={speaking} speed={playbackSpeed} reviewButtonRef={reviewButton} scenarios={scenarios} startDue={() => startQuiz()} startWords={ids => startQuiz(true, ids)} toggleFavorite={toggleFavorite} playWord={playWord} playExample={playExample} openCourse={() => changeView('course')} exportRecord={exportProgramming} />} />}
    <main ref={libraryActive ? contentRef : undefined} className="content" id="vocabulary-content" hidden={!libraryActive}>
      <header ref={libraryActive ? headingRef : undefined} className="page-heading"><div className="page-heading-copy"><h1>{showingFavorites ? '收藏的单词' : '编程英语词汇库'}</h1></div><SpeechControls speed={playbackSpeed} onSpeedChange={changeSpeed} voice={voice} openVoice={() => setShowVoice(true)} /></header>
      {favoriteState.warning && <p role="alert">{favoriteState.warning}</p>}
      <section className="vocabulary-panel" aria-label={showingFavorites ? '收藏的编程词汇' : '编程词汇列表'}><div className="library-tools">
        <label className="search"><Icon name="search" /><input aria-label="搜索当前列表" value={listQuery} onChange={event => updateListQuery(event.target.value)} placeholder={showingFavorites ? '搜索收藏的单词、中文或例句' : '搜索单词、中文或例句'} />{listQuery && <button aria-label="清除搜索" onClick={() => updateListQuery('')}><Icon name="close" /></button>}</label>
        {!showingFavorites && <><label className="category-select"><span>分类</span><select aria-label="词汇分类" value={selection} onChange={event => { setSelection(event.target.value); setVisibleCount(24); }}><option value="全部词汇">全部分类</option>{categoryOrder.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="category-select"><span>级别</span><select aria-label="词汇级别" value={tier} onChange={event => { setTier(event.target.value); setVisibleCount(24); }}>{['全部', '核心', '基础', '专业'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="category-select"><span>范围</span><select aria-label="词汇范围" value={scope} onChange={event => { setScope(event.target.value); setVisibleCount(24); }}><option value="all">全部词汇</option><option value="favorites">收藏</option><option value="learning">正在学习</option><option value="learned">已进入复习</option><option value="due">待复习</option></select></label></>}
      </div><div className="list-guide"><span>共 <strong>{filtered.length.toLocaleString()}</strong> 个词</span></div>
        {filtered.length ? <><section className="word-grid">{filtered.slice(0, listVisibleCount).map(item => {
          const learned = !!reviewProgress[item.id];
          const nextDue = learned ? Math.min(...reviewAbilities.map(ability => getSkill(reviewProgress, item.id, ability).dueAt)) : 0;
          return <VocabularyRow key={item.id} item={item} favorite={favorites.has(item.id)} favoriteDisabled={!!favoriteState.warning} speaking={speaking} speed={playbackSpeed} toggleFavorite={toggleFavorite} playWord={playWord} playExample={playExample} status={!learned ? '尚未学习' : reviewProgress[item.id].reviewReadyAt === 0 ? '正在学习' : nextDue <= Date.now() ? '待复习' : `下次复习 ${new Date(nextDue).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`} />;
        })}</section>{listVisibleCount < filtered.length && <div className="load-more-area"><button className="load-more" onClick={() => showingFavorites ? setFavoritesVisibleCount(count => count + 24) : setVisibleCount(count => count + 24)}>再显示 24 个<Icon name="chevron" /></button><span>已显示 {Math.min(listVisibleCount, filtered.length)} / {filtered.length.toLocaleString()}</span></div>}</> : <section className="empty-state"><Icon name={showingFavorites && !favoriteCount ? 'star' : 'search'} /><h2>{showingFavorites && !favoriteCount ? '还没有收藏单词' : '没有匹配的词汇'}</h2><p>{showingFavorites && !favoriteCount ? '在词条旁点亮星标，就能在这里找到。' : showingFavorites ? '试试其他关键词。' : '试试其他关键词，或调整筛选范围。'}</p><button onClick={() => showingFavorites && !favoriteCount ? changeView('library') : resetListFilters()}>{showingFavorites ? favoriteCount ? '查看全部收藏' : '去词汇库收藏' : '查看全部词汇'}</button></section>}
      </section><footer className="site-footer"><button className="daily-button text" onClick={exportProgramming}>导出编程英语记录</button></footer>
    </main>
    {dailyVisited && <DailyEnglish foundationHelp={foundationHelp} key={`daily-${syncRevision}`} active={section === 'daily'} view={dailyView} navigation={navigation} voice={voice} speed={playbackSpeed} onSpeedChange={changeSpeed} speaking={speaking} play={playDaily} playFeedback={playFeedback} preload={preloadDaily} stopAudio={stopAudio} openVoice={() => setShowVoice(true)} openLibrary={() => changeView('library')} contentRef={section === 'daily' ? contentRef : undefined} headingRef={section === 'daily' ? headingRef : undefined} />}
    {section === 'foundation' && foundationReturn && <div className="content foundation-return"><button className="daily-button" onClick={() => { changeSection(foundationReturn); setFoundationReturn(null); }}>返回{foundationReturn === 'daily' ? '日常英语' : '编程英语'}</button></div>}
    {foundationVisited && <FoundationEnglish openTopic={openFoundation} request={foundationRequest} active={section === 'foundation'} view={foundationView} speaking={speaking} play={playFoundation} playDemo={playFoundationDemo} foundationError={foundationError} playPhoneme={playPhoneme} phonemeError={phonemeError} stopAudio={stopAudio} openVoice={() => setShowVoice(true)} contentRef={section === 'foundation' ? contentRef : undefined} headingRef={section === 'foundation' ? headingRef : undefined} />}
      {showVoice && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="voice-heading">
        <button className="backdrop" onClick={() => setShowVoice(false)} aria-label="关闭" tabIndex={-1} />
        <section ref={voiceDialog} className="modal voice-modal">
          <button className="modal-close" aria-label="关闭语音设置" onClick={() => setShowVoice(false)}><Icon name="close" /></button>
          <div className="modal-heading-icon"><Icon name="sound" /></div><h2 id="voice-heading">语音设置</h2>

          <label className="voice-select"><span>点读声音</span><select aria-label="点读声音" value={voice} onChange={event => {
            const next = event.target.value === 'guy' ? 'guy' : 'aria';
            stopAudio(); setVoice(next);
            try { localStorage.setItem('codewords-voice', next); }
            catch { window.alert('声音已切换，但浏览器未能保存偏好，下次打开可能恢复默认声音。'); }
          }}><option value="aria">Aria · 美式女声</option><option value="guy">Guy · 美式男声</option></select></label>
          <label className="voice-select"><span>播放语速</span><select aria-label="点读语速" value={playbackSpeed} onChange={event => changeSpeed(event.target.value === 'slow' ? 'slow' : 'normal')}><option value="normal">正常</option><option value="slow">慢速</option></select></label>
          <div className="modal-actions"><button className={voicePreviewPlaying && playbackSpeed === 'normal' ? 'playing' : ''} onClick={() => playAudio('voice-test.mp3', false, 'voice-test')}><Icon name="sound" />正常试听</button><button className={voicePreviewPlaying && playbackSpeed === 'slow' ? 'playing' : ''} onClick={() => playAudio('voice-test.mp3', true, 'voice-test-slow')}><Icon name="sound" />慢速试听</button></div>
          <p className="voice-scope">每条内容旁可直接选择正常或慢速。这里的语速用于自动播放和试听。</p>
          <label className="voice-feedback-setting"><input type="checkbox" checked={feedbackEnabled} onChange={event => {
            const enabled = event.target.checked;
            setFeedbackEnabled(enabled); feedbackPlayer.enabled = enabled;
            if (!enabled) feedbackPlayer.stop();
            try { localStorage.setItem(FEEDBACK_SOUND_KEY, enabled ? 'on' : 'off'); }
            catch { window.alert('提示音已切换，但浏览器未能保存偏好。'); }
          }} />练习提示音</label>
        </section>
      </div>}
    {showQuiz && <ReviewQuiz pool={quizPool} onClose={closeReview} onFinished={finishReview} playWord={playWord} playExample={playExample} playFeedback={playFeedback} stopAudio={stopAudio} speaking={speaking} speed={playbackSpeed} onSpeedChange={changeSpeed} theme={theme} onThemeChange={changeTheme} />}
  </div></ReadAloudProvider>;
}
