import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { vocabulary, type VocabularyItem } from './vocabulary';
import ReviewQuiz from './ReviewLesson';
import Icon from './Icon';
import ThemePicker, { readTheme, THEME_KEY, type Theme } from './ThemePicker';
import { useThemeMotion } from './useThemeMotion';
import { useMobileViewport } from './useMobileViewport';
import { downloadRecord } from './nativeAndroid';
import DailyEnglish from './DailyEnglish';
import ReviewVocabulary from './ReviewVocabulary';
import VocabularyRow from './VocabularyRow';
import SpeechControls, { playbackRates, type PlaybackSpeed } from './SpeechControls';
import type { DailyPhrase } from './dailyCourse';
import type { DailyProgress } from './dailyProgress';
import { programmingPhrases } from './programmingCourse';
import { adaptiveProgrammingUnits as programmingUnits, adaptiveProgrammingLessons as programmingLessons } from './programmingPractice';
import { initializeProgrammingReview, persistProgrammingCourseEvidence, PROGRAMMING_COURSE_KEY } from './programmingProgress';
import { programmingReview, applyProgrammingReviewToLearning } from './programmingReview';
import { REVIEW_KEY, getSkill, isWordDue, isReviewEligible, parseReviewProgress, reviewAbilities, type ReviewProgress } from './review';

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
  const [section, setSection] = useState<'programming' | 'daily'>(() => { try { return localStorage.getItem('codewords-section') === 'daily' ? 'daily' : 'programming'; } catch { return 'programming'; } });
  const [dailyView, setDailyView] = useState<View>('course');
  const [programmingView, setProgrammingView] = useState<View>('course');
  const [navigation, setNavigation] = useState(0);
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
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizPool, setQuizPool] = useState<VocabularyItem[]>([]);
  const [showVoice, setShowVoice] = useState(false);
  const [speaking, setSpeaking] = useState('');
  const [voice, setVoice] = useState<'aria' | 'guy'>(() => { try { return localStorage.getItem('codewords-voice') === 'guy' ? 'guy' : 'aria'; } catch { return 'aria'; } });
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(() => { try { return localStorage.getItem('codewords-playback-speed') === 'slow' ? 'slow' : 'normal'; } catch { return 'normal'; } });
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const audioKey = useRef('');
  const audioSpeedChanged = useRef(false);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const quizTrigger = useRef<HTMLElement | null>(null);
  const voiceDialog = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const view = section === 'daily' ? dailyView : programmingView;
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const { replay } = useThemeMotion({ theme, selection: `${section}-${view}`, navRef, contentRef, headingRef });
  const stopAudio = useCallback(() => { activeAudio.current?.pause(); activeAudio.current = null; audioSpeedChanged.current = false; setSpeaking(''); }, []);
  const changeSpeed = useCallback((next: PlaybackSpeed) => {
    setPlaybackSpeed(next);
    const audio = activeAudio.current;
    if (audio) {
      audioSpeedChanged.current ||= audio.playbackRate !== playbackRates[next];
      audio.playbackRate = playbackRates[next];
      audio.preservesPitch = true;
      // Keep the playing indicator attached to the same phrase when changing speed live.
      if (audioKey.current.startsWith('daily-')) audioKey.current = audioKey.current.replace(/-(normal|slow)$/, `-${next}`);
      setSpeaking(current => current ? audioKey.current : current);
    }
    try { localStorage.setItem('codewords-playback-speed', next); }
    catch { window.alert('语速已切换，但浏览器未能保存偏好。'); }
  }, []);
  const refreshReview = useCallback(() => {
    try { setReviewProgress(initializeProgrammingReview(localStorage)); setReviewWarning(''); }
    catch (error) { setReviewWarning(error instanceof Error ? error.message : '复习记录无法保存，原记录已保留。'); }
  }, []);
  useEffect(() => {
    refreshReview();
    const update = (event: StorageEvent) => {
      if (event.key === REVIEW_KEY || event.key === 'codewords-mastered' || event.key === null) refreshReview();
      if (event.key === 'codewords-favorites' || event.key === null) setFavoriteState(readFavorites());
    };
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('storage', update); activeAudio.current?.pause(); };
  }, [refreshReview]);
  const syncProgramming = useCallback((progress: DailyProgress) => {
    try {
      const result = persistProgrammingCourseEvidence(localStorage, progress, programmingLessons);
      setReviewProgress(result); setReviewWarning('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '词汇复习记录未能同步。课程已保存，请刷新重试。';
      setReviewWarning(message); throw new Error(message);
    }
  }, []);
  const curriculum = useMemo(() => ({ key: PROGRAMMING_COURSE_KEY, label: '编程英语', units: programmingUnits, phrases: programmingPhrases,
    description: '根据学习表现安排新内容，并穿插需要巩固的词。', onProgress: syncProgramming, review: programmingReview(reviewProgress),
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
  const changeSection = (next: 'programming' | 'daily') => {
    if (next === section) return;
    stopAudio(); if (next === 'daily') setDailyVisited(true); else setProgrammingVisited(true);
    setSection(next); try { localStorage.setItem('codewords-section', next); } catch { /* Navigation remains usable. */ }
  };
  const changeTheme = (value: Theme) => { setTheme(value); try { localStorage.setItem(THEME_KEY, value); } catch { /* Keep session. */ } };
  const changeView = (next: View) => {
    if (view === next) replay(); stopAudio();
    if (section === 'daily') setDailyView(next); else setProgrammingView(next);
    setNavigation(value => value + 1); refreshReview();
  };
  function toggleFavorite(id: number) {
    const latest = readFavorites();
    if (latest.warning) { setFavoriteState(latest); return; }
    const ids = new Set(latest.ids); if (ids.has(id)) ids.delete(id); else ids.add(id);
    try { localStorage.setItem('codewords-favorites', JSON.stringify([...ids])); setFavoriteState({ ids, warning: '' }); }
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
  const finishReview = () => { const count = quizSessions + 1; setQuizSessions(count); try { localStorage.setItem('codewords-quiz-sessions', String(count)); } catch { setReviewWarning('本轮练习次数未能保存。'); } refreshReview(); };
  const closeReview = () => { stopAudio(); setShowQuiz(false); refreshReview(); requestAnimationFrame(() => {
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
  const playAudio = (fileName: string, slow = false, key = fileName, daily = false) => {
    const requestedSpeed: PlaybackSpeed = slow ? 'slow' : 'normal';
    if (requestedSpeed !== playbackSpeed) changeSpeed(requestedSpeed);
    const rate = playbackRates[requestedSpeed];
    if (audioKey.current === key && activeAudio.current && !audioSpeedChanged.current && activeAudio.current.playbackRate === rate) {
      activeAudio.current.pause();
      activeAudio.current.currentTime = 0;
      activeAudio.current = null;
      setSpeaking('');
      return;
    }

    activeAudio.current?.pause();
    const audio = new Audio(new URL(`audio/${daily ? 'daily/' : ''}${voice}/${fileName}`, document.baseURI).href);
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    audio.onended = () => { if (activeAudio.current !== audio) return; activeAudio.current = null; setSpeaking(''); };
    audio.onerror = () => { if (activeAudio.current !== audio) return; activeAudio.current = null; setSpeaking(''); window.alert('语音文件加载失败，请检查网络后重试。'); };
    // Only actual media events drive the visible playback state.
    audio.onplaying = () => { if (activeAudio.current === audio) setSpeaking(audioKey.current); };
    audio.onpause = audio.onwaiting = () => { if (activeAudio.current === audio) setSpeaking(''); };
    activeAudio.current = audio;
    audioKey.current = key;
    audioSpeedChanged.current = false;
    setSpeaking('');
    void audio.play().catch(() => {
      if (activeAudio.current !== audio) return;
      activeAudio.current = null;
      setSpeaking('');
      window.alert('浏览器暂时无法播放语音，请再次点击播放。');
    });
  };

  const playWord = (item: VocabularyItem, slow = playbackSpeed === 'slow', key = `word-${item.id}`) => playAudio(`word-${item.id}.mp3`, slow, key);
  // A text revision must not replay an older MP3 cached under the same word ID.
  const playExample = (item: VocabularyItem, slow = playbackSpeed === 'slow', key = `example-${item.id}`) => playAudio(`example-${item.id}.mp3?v=${encodeURIComponent(item.example)}`, slow, key);
  const playDaily = (phrase: DailyPhrase, slow = playbackSpeed === 'slow') => playAudio(`${phrase.id}.mp3?v=${encodeURIComponent(phrase.en)}`, slow, `daily-${phrase.id}-${slow ? 'slow' : 'normal'}`, true);

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


  const playProgramming = (phrase: DailyPhrase, slow = playbackSpeed === 'slow') => playAudio(`${phrase.id}.mp3?v=${encodeURIComponent(phrase.en)}`, slow, `daily-${phrase.id}-${slow ? 'slow' : 'normal'}`);
  const libraryActive = section === 'programming' && (view === 'library' || view === 'favorites');
  const voicePreviewPlaying = speaking === 'voice-test' || speaking === 'voice-test-slow';
  return <div className="app-shell">
    <a className="skip-link" href={section === 'daily' ? '#daily-content' : libraryActive ? '#vocabulary-content' : '#programming-content'}>跳到学习内容</a>
    <header className="site-header"><div className="header-inner">
      <div className="section-switch" role="group" aria-label="学习分区"><button aria-pressed={section === 'programming'} onClick={() => changeSection('programming')}><Icon name="book" />编程英语</button><button aria-pressed={section === 'daily'} onClick={() => changeSection('daily')}>日常英语</button></div>
      <nav ref={navRef} className="main-nav" aria-label="学习导航">{(['course', 'review', 'library', 'favorites'] as const).map((value, index) => <button key={value} className={`nav-item${view === value ? ' active' : ''}`} aria-current={view === value ? 'page' : undefined} onClick={() => changeView(value)}><Icon name={(['book', 'review', 'library', 'star'] as const)[index]} /><span>{value === 'course' ? '课程' : value === 'review' ? '复习' : value === 'favorites' ? '收藏' : section === 'daily' ? '表达库' : '词汇库'}</span></button>)}<span className="nav-marker" aria-hidden="true"><span className="nav-marker-ink" /><span className="nav-marker-spray" /></span></nav>
      <ThemePicker value={theme} onChange={changeTheme} />
    </div></header>
    {section === 'programming' && reviewWarning && <div className="content"><div className="daily-notice" role="alert"><p>{reviewWarning}</p><button className="daily-button" onClick={exportProgramming}>导出原始记录</button><button className="daily-button" onClick={refreshReview}>重新读取</button></div></div>}
    {programmingVisited && <DailyEnglish active={section === 'programming' && !libraryActive} curriculum={curriculum} view={programmingView === 'library' || programmingView === 'favorites' ? 'course' : programmingView} navigation={navigation} voice={voice} speed={playbackSpeed} onSpeedChange={changeSpeed} speaking={speaking} play={playProgramming} stopAudio={stopAudio} openVoice={() => setShowVoice(true)} openLibrary={() => changeView('library')} contentRef={section === 'programming' && !libraryActive ? contentRef : undefined} headingRef={section === 'programming' && !libraryActive ? headingRef : undefined}
      reviewDescription={`已学 ${reviewPool.length} 个词，${duePool.length} 个待复习。`}
      renderReview={scenarios => <ReviewVocabulary words={reviewPool} progress={reviewProgress} favorites={favorites} favoriteWarning={favoriteState.warning} disabled={!!reviewWarning} speaking={speaking} speed={playbackSpeed} reviewButtonRef={reviewButton} scenarios={scenarios} startDue={() => startQuiz()} startWords={ids => startQuiz(true, ids)} toggleFavorite={toggleFavorite} playWord={playWord} playExample={playExample} openCourse={() => changeView('course')} exportRecord={exportProgramming} />} />}
    <main ref={libraryActive ? contentRef : undefined} className="content" id="vocabulary-content" hidden={!libraryActive}>
      <header ref={libraryActive ? headingRef : undefined} className="page-heading"><div className="page-heading-copy"><h1>{showingFavorites ? '收藏的单词' : '编程英语词汇库'}</h1><p>{showingFavorites ? `已收藏 ${favoriteCount} 个单词，可在这里点读和取消收藏。` : '查询、点读和收藏；课程中反复练习后，表现稳定的词会自动安排复习。'}</p></div><SpeechControls speed={playbackSpeed} onSpeedChange={changeSpeed} voice={voice} openVoice={() => setShowVoice(true)} /></header>
      {favoriteState.warning && <p role="alert">{favoriteState.warning}</p>}
      <section className="vocabulary-panel" aria-label={showingFavorites ? '收藏的编程词汇' : '编程词汇列表'}><div className="library-tools">
        <label className="search"><Icon name="search" /><input aria-label="搜索当前列表" value={listQuery} onChange={event => updateListQuery(event.target.value)} placeholder={showingFavorites ? '搜索收藏的单词、中文或例句' : '搜索单词、中文或例句'} />{listQuery && <button aria-label="清除搜索" onClick={() => updateListQuery('')}><Icon name="close" /></button>}</label>
        {!showingFavorites && <><label className="category-select"><span>分类</span><select aria-label="词汇分类" value={selection} onChange={event => { setSelection(event.target.value); setVisibleCount(24); }}><option value="全部词汇">全部分类</option>{categoryOrder.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="category-select"><span>级别</span><select aria-label="词汇级别" value={tier} onChange={event => { setTier(event.target.value); setVisibleCount(24); }}>{['全部', '核心', '基础', '专业'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="category-select"><span>范围</span><select aria-label="词汇范围" value={scope} onChange={event => { setScope(event.target.value); setVisibleCount(24); }}><option value="all">全部词汇</option><option value="favorites">收藏</option><option value="learning">正在学习</option><option value="learned">已进入复习</option><option value="due">待复习</option></select></label></>}
      </div><div className="list-guide"><span>共 <strong>{filtered.length.toLocaleString()}</strong> 个词</span><p><Icon name="sound" />点单词听发音，点例句听整句</p></div>
        {filtered.length ? <><div className="list-columns" aria-hidden="true"><span>单词 / 发音</span><span>中文释义</span><span>学习状态</span></div><section className="word-grid">{filtered.slice(0, listVisibleCount).map(item => {
          const learned = !!reviewProgress[item.id];
          const nextDue = learned ? Math.min(...reviewAbilities.map(ability => getSkill(reviewProgress, item.id, ability).dueAt)) : 0;
          return <VocabularyRow key={item.id} item={item} favorite={favorites.has(item.id)} favoriteDisabled={!!favoriteState.warning} speaking={speaking} speed={playbackSpeed} toggleFavorite={toggleFavorite} playWord={playWord} playExample={playExample} status={!learned ? '尚未学习' : reviewProgress[item.id].reviewReadyAt === 0 ? '正在学习' : nextDue <= Date.now() ? '待复习' : `下次复习 ${new Date(nextDue).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`} />;
        })}</section>{listVisibleCount < filtered.length && <div className="load-more-area"><button className="load-more" onClick={() => showingFavorites ? setFavoritesVisibleCount(count => count + 24) : setVisibleCount(count => count + 24)}>再显示 24 个<Icon name="chevron" /></button><span>已显示 {Math.min(listVisibleCount, filtered.length)} / {filtered.length.toLocaleString()}</span></div>}</> : <section className="empty-state"><Icon name={showingFavorites && !favoriteCount ? 'star' : 'search'} /><h2>{showingFavorites && !favoriteCount ? '还没有收藏单词' : '没有匹配的词汇'}</h2><p>{showingFavorites && !favoriteCount ? '在词条旁点亮星标，就能在这里找到。' : showingFavorites ? '试试其他关键词。' : '试试其他关键词，或调整筛选范围。'}</p><button onClick={() => showingFavorites && !favoriteCount ? changeView('library') : resetListFilters()}>{showingFavorites ? favoriteCount ? '查看全部收藏' : '去词汇库收藏' : '查看全部词汇'}</button></section>}
      </section><footer className="site-footer"><button className="daily-button text" onClick={exportProgramming}>导出编程英语记录</button><p>学习记录保存在当前浏览器。</p></footer>
    </main>
    {dailyVisited && <DailyEnglish active={section === 'daily'} view={dailyView} navigation={navigation} voice={voice} speed={playbackSpeed} onSpeedChange={changeSpeed} speaking={speaking} play={playDaily} stopAudio={stopAudio} openVoice={() => setShowVoice(true)} openLibrary={() => changeView('library')} contentRef={section === 'daily' ? contentRef : undefined} headingRef={section === 'daily' ? headingRef : undefined} />}
      {showVoice && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="voice-heading">
        <button className="backdrop" onClick={() => setShowVoice(false)} aria-label="关闭" tabIndex={-1} />
        <section ref={voiceDialog} className="modal voice-modal">
          <button className="modal-close" aria-label="关闭语音设置" onClick={() => setShowVoice(false)}><Icon name="close" /></button>
          <div className="modal-heading-icon"><Icon name="sound" /></div><h2 id="voice-heading">语音设置</h2>
          <p className="modal-copy">选一个听着舒服的声音，按自己的节奏学习。</p>
          <label className="voice-select"><span>点读声音</span><select aria-label="点读声音" value={voice} onChange={event => {
            const next = event.target.value === 'guy' ? 'guy' : 'aria';
            activeAudio.current?.pause(); activeAudio.current = null; setSpeaking(''); setVoice(next);
            try { localStorage.setItem('codewords-voice', next); }
            catch { window.alert('声音已切换，但浏览器未能保存偏好，下次打开可能恢复默认声音。'); }
          }}><option value="aria">Aria · 美式女声</option><option value="guy">Guy · 美式男声</option></select></label>
          <label className="voice-select"><span>播放语速</span><select aria-label="点读语速" value={playbackSpeed} onChange={event => changeSpeed(event.target.value === 'slow' ? 'slow' : 'normal')}><option value="normal">正常</option><option value="slow">慢速</option></select></label>
          <div className="modal-actions"><button className={voicePreviewPlaying && playbackSpeed === 'normal' ? 'playing' : ''} onClick={() => playAudio('voice-test.mp3', false, 'voice-test')}><Icon name="sound" />正常试听</button><button className={voicePreviewPlaying && playbackSpeed === 'slow' ? 'playing' : ''} onClick={() => playAudio('voice-test.mp3', true, 'voice-test-slow')}><Icon name="sound" />慢速试听</button></div>
          <p className="voice-scope">每条内容旁可直接选择正常或慢速。这里的语速用于自动播放和试听。</p>
        </section>
      </div>}
    {showQuiz && <ReviewQuiz pool={quizPool} onClose={closeReview} onFinished={finishReview} playWord={playWord} playExample={playExample} speaking={speaking} speed={playbackSpeed} onSpeedChange={changeSpeed} theme={theme} onThemeChange={changeTheme} />}
  </div>;
}
