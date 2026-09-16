'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { vocabulary, type VocabularyItem } from './vocabulary';
import learningFrequency from './learning-frequency.json';
import ReviewQuiz from './ReviewLesson';
import Icon from './Icon';

// Core concepts first; within each stage, prefer terms occurring in the sampled
// official Git/Node/Python/TypeScript documentation. IDs break ties stably.
const frequency: Record<string, number> = learningFrequency;
const learningOrder = [...vocabulary].sort((a, b) => {
  const stage = (item: VocabularyItem) => item.tier === '核心' ? 0 : (frequency[item.id] ?? 0) > 0 ? 1 : item.tier === '基础' ? 2 : 3;
  return stage(a) - stage(b) || (frequency[b.id] ?? 0) - (frequency[a.id] ?? 0) || a.id - b.id;
});

const categoryOrder = [
  'GitHub 与版本控制',
  '代码基础',
  '命令行与开发工具',
  '前端开发',
  '后端与数据库',
  '网络与云服务',
  '操作系统与文件',
  '测试与调试',
  '安全与权限',
  '数据、算法与 AI',
  'IT 通用术语',
  '文档基础英语',
];

function getStoredNumbers(key: string) {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return new Set<number>();
  }
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('今日学习');
  const [tier, setTier] = useState('全部');
  const [visibleCount, setVisibleCount] = useState(24);
  const [mastered, setMastered] = useState<Set<number>>(new Set());
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [quizSessions, setQuizSessions] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [speaking, setSpeaking] = useState('');
  const [voice, setVoice] = useState<'aria' | 'guy'>(() => {
    try { return localStorage.getItem('codewords-voice') === 'guy' ? 'guy' : 'aria'; }
    catch { return 'aria'; }
  });
  const [playbackSpeed, setPlaybackSpeed] = useState<'normal' | 'slow'>(() => {
    try { return localStorage.getItem('codewords-playback-speed') === 'slow' ? 'slow' : 'normal'; }
    catch { return 'normal'; }
  });
  const [hydrated, setHydrated] = useState(false);
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const voiceDialog = useRef<HTMLElement | null>(null);
  const audioKey = useRef('');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMastered(getStoredNumbers('codewords-mastered'));
      setFavorites(getStoredNumbers('codewords-favorites'));
      setQuizSessions(Number(localStorage.getItem('codewords-quiz-sessions') ?? 0));
      setHydrated(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      activeAudio.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('codewords-mastered', JSON.stringify([...mastered]));
  }, [mastered, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('codewords-favorites', JSON.stringify([...favorites]));
  }, [favorites, hydrated]);

  const todayItems = useMemo(() => learningOrder.filter((item) => !mastered.has(item.id)).slice(0, 10), [mastered]);
  const todayIds = useMemo(() => new Set(todayItems.map((item) => item.id)), [todayItems]);
  const navigationCounts: Record<string, number> = useMemo(() => {
    const masteredCount = vocabulary.filter(item => mastered.has(item.id)).length;
    return {
      '今日学习': todayItems.length,
      '全部词汇': vocabulary.length - masteredCount,
      '收藏夹': vocabulary.filter(item => favorites.has(item.id)).length,
      '已掌握': masteredCount,
    };
  }, [todayItems.length, mastered, favorites]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (selection === '今日学习' ? todayItems : vocabulary).filter((item) => {
      const sourceMatch =
        selection === '全部词汇' ||
        (selection === '今日学习' && todayIds.has(item.id)) ||
        (selection === '收藏夹' && favorites.has(item.id)) ||
        (selection === '已掌握' && mastered.has(item.id)) ||
        item.category === selection;
      const masteryMatch = selection === '收藏夹' || (selection === '已掌握' ? mastered.has(item.id) : !mastered.has(item.id));
      const tierMatch = selection === '今日学习' || tier === '全部' || item.tier === tier;
      const queryMatch = !normalized || (item.word + ' ' + item.meaning + ' ' + item.example).toLowerCase().includes(normalized);
      return sourceMatch && masteryMatch && tierMatch && queryMatch;
    });
  }, [selection, tier, query, favorites, mastered, todayIds, todayItems]);

  const playAudio = (fileName: string, slow = false, key = fileName) => {
    if (audioKey.current === key && activeAudio.current) {
      activeAudio.current.pause();
      activeAudio.current.currentTime = 0;
      activeAudio.current = null;
      setSpeaking('');
      return;
    }

    activeAudio.current?.pause();
    const audio = new Audio(new URL(`audio/${voice}/${fileName}`, document.baseURI).href);
    audio.playbackRate = slow ? 0.72 : 1;
    audio.preservesPitch = true;
    audio.onended = () => { if (activeAudio.current !== audio) return; activeAudio.current = null; setSpeaking(''); };
    audio.onerror = () => { if (activeAudio.current !== audio) return; activeAudio.current = null; setSpeaking(''); window.alert('语音文件加载失败，请检查网络后重试。'); };
    // Only actual media events drive the visible playback state.
    audio.onplaying = () => { if (activeAudio.current === audio) setSpeaking(key); };
    audio.onpause = audio.onwaiting = () => { if (activeAudio.current === audio) setSpeaking(''); };
    activeAudio.current = audio;
    audioKey.current = key;
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
  const playExample = (item: VocabularyItem) => playAudio(`example-${item.id}.mp3?v=${encodeURIComponent(item.example)}`, playbackSpeed === 'slow', `example-${item.id}`);

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const changeSelection = (value: string) => {
    setSelection(value);
    setVisibleCount(24);
    setQuery('');
    setTier('全部');
  };

  const startQuiz = () => {
    activeAudio.current?.pause();
    activeAudio.current = null;
    setSpeaking('');
    setShowQuiz(true);
  };
  const reviewPool = useMemo(() => vocabulary.filter((item) => mastered.has(item.id)), [mastered]);
  const finishReview = () => {
    const sessions = quizSessions + 1;
    setQuizSessions(sessions);
    try { localStorage.setItem('codewords-quiz-sessions', String(sessions)); }
    catch { window.alert('本轮练习已完成，但完成次数未能保存。'); }
  };
  const closeReview = () => {
    activeAudio.current?.pause();
    activeAudio.current = null;
    setSpeaking('');
    setShowQuiz(false);
    window.requestAnimationFrame(() => reviewButton.current?.focus());
  };

  const currentTitle = selection === '全部词汇' ? '词库' : selection;
  const isLibrary = selection === '全部词汇' || categoryOrder.includes(selection);
  const pageDescription = selection === '今日学习'
    ? '每次先学 10 个常用词，标记掌握后自动补充下一个。'
    : selection === '收藏夹' ? '收藏需要多看的词，已掌握后仍会留在这里。'
    : selection === '已掌握' ? '这里是你标记掌握的词；忘记了可点“重新学习”，移回待学列表。'
    : '按分类或级别查找未掌握的词，已学会的词可在“已掌握”中查看。';
  const masteredCount = navigationCounts['已掌握'];
  const progressPercent = Math.round((masteredCount / vocabulary.length) * 1000) / 10;
  const emptyCollection = !query && tier === '全部' && (selection === '收藏夹' || selection === '已掌握');

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

  const navigationIcons = ['today', 'library', 'star', 'check'] as const;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#vocabulary-content">跳到词汇列表</a>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => changeSelection('今日学习')}><Icon name="book" /><span>编程英语</span></button>
          <nav className="main-nav" aria-label="学习导航">
            {['今日学习', '全部词汇', '收藏夹', '已掌握'].map((value, index) => {
              const selected = selection === value || (value === '全部词汇' && isLibrary);
              return <button className={`nav-item${selected ? ' active' : ''}`} key={value}
                aria-label={value === '全部词汇' ? '词库' : value} aria-describedby={'nav-count-' + value}
                aria-current={selected ? 'page' : undefined} onClick={() => changeSelection(value)}>
                <Icon name={navigationIcons[index]} /><span>{value === '全部词汇' ? '词库' : value}</span>
                <span className="nav-count" id={'nav-count-' + value} title={value === '全部词汇' ? '尚未掌握的词汇数' : value + '的词汇数'}>{navigationCounts[value].toLocaleString()}</span>
              </button>;
            })}
          </nav>
          <button className="voice-button" aria-label="语音设置" onClick={() => setShowVoice(true)}>
            <Icon name="sound" /><span>语音设置<span className="voice-preference">{voice === 'aria' ? 'Aria' : 'Guy'} · {playbackSpeed === 'slow' ? '慢速' : '正常'}</span></span><Icon name="chevron" />
          </button>
        </div>
      </header>

      <main className="content" id="vocabulary-content">
        <header className="page-heading"><h1>{currentTitle}</h1><p>{pageDescription}</p></header>
        <div className="learning-layout">
          <section className="vocabulary-panel" aria-label={currentTitle + '词汇列表'}>
            <div className="library-tools">
              <label className="search"><Icon name="search" /><input aria-label="搜索当前列表" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(24); }} placeholder="搜索单词、中文或例句" />
                {query && <button aria-label="清除搜索" onClick={() => setQuery('')}><Icon name="close" /></button>}
              </label>
              {isLibrary && <label className="category-select"><span>分类</span><select aria-label="词汇分类" value={selection} onChange={event => changeSelection(event.target.value)}>
                <option value="全部词汇">全部分类</option>{categoryOrder.map(category => <option value={category} key={category}>{category}</option>)}
              </select></label>}
              {selection !== '今日学习' && <label className="category-select tier-select"><span>级别</span><select aria-label="词汇级别" value={tier} onChange={event => { setTier(event.target.value); setVisibleCount(24); }}>
                {['全部', '核心', '基础', '专业'].map(value => <option value={value} key={value}>{value}</option>)}
              </select></label>}
            </div>
            <div className="list-guide"><span>{query ? '找到' : '共'} <strong>{filtered.length.toLocaleString()}</strong> 个词</span><p><Icon name="sound" />点单词听发音，点例句听整句</p></div>
            {filtered.length > 0 ? <>
              <div className="list-columns" aria-hidden="true"><span>单词 / 发音</span><span>中文释义</span><span>学习状态</span></div>
              <section className="word-grid">
                {filtered.slice(0, visibleCount).map(item => <article key={item.id}
                  className={`word-card${mastered.has(item.id) ? ' mastered' : ''}${speaking === 'word-' + item.id ? ' word-playing' : ''}${speaking === 'example-' + item.id ? ' example-playing' : ''}`}
                  onClick={event => {
                    if ((event.target as HTMLElement).closest('button, a, input, select, summary, details')) return;
                    if (window.getSelection()?.isCollapsed === false) return;
                    playWord(item);
                  }}>
                  <div className="word-row">
                    <button className={`word-button${speaking === 'word-' + item.id ? ' playing' : ''}`} onClick={() => playWord(item)} aria-label={'朗读单词 ' + item.word} aria-pressed={speaking === 'word-' + item.id}>
                      <span className="word-title"><strong>{item.word}</strong><Icon name="sound" /></span>
                      {item.phonetic && <span className="phonetic">/{item.phonetic}/</span>}
                    </button>
                  </div>
                  <div className="word-definition"><p className="meaning">{item.meaning}</p><p className="word-meta">{item.category}<span>·</span>{item.tier}</p></div>
                  <div className="card-actions">
                    <button className={`favorite${favorites.has(item.id) ? ' active' : ''}`} onClick={() => toggleSet(setFavorites, item.id)} aria-label={favorites.has(item.id) ? '取消收藏' : '收藏'} title={favorites.has(item.id) ? '取消收藏' : '收藏'} aria-pressed={favorites.has(item.id)}><Icon name="star" /></button>
                    <button className={`known${mastered.has(item.id) ? ' active' : ''}`} onClick={() => toggleSet(setMastered, item.id)}><Icon name={mastered.has(item.id) ? 'review' : 'check'} />{mastered.has(item.id) ? '重新学习' : '标记掌握'}</button>
                  </div>
                  <div className="example"><button className={speaking === 'example-' + item.id ? 'playing' : ''} onClick={() => playExample(item)} aria-label={'朗读例句 ' + item.example} aria-pressed={speaking === 'example-' + item.id}>
                    <span className="example-en">{item.example}</span><span className="example-zh">{item.exampleZh}</span><Icon name="sound" />
                  </button></div>
                </article>)}
              </section>
              {visibleCount < filtered.length && <div className="load-more-area"><button className="load-more" onClick={() => setVisibleCount(count => count + 24)}>再显示 24 个<Icon name="chevron" /></button><span>已显示 {Math.min(visibleCount, filtered.length)} / {filtered.length.toLocaleString()}</span></div>}
            </> : selection === '今日学习' && !query && todayItems.length === 0 ? <section className="empty-state"><Icon name="check" /><h2>全部词汇已掌握</h2><p>继续复习已经学过的词义与拼写。</p><button onClick={startQuiz}>复习已掌握词汇<Icon name="arrow" /></button></section>
            : <section className="empty-state"><Icon name={emptyCollection ? selection === '收藏夹' ? 'star' : 'book' : 'search'} />
              <h2>{emptyCollection ? selection === '收藏夹' ? '还没有收藏的单词' : '还没有已掌握的单词' : '没有找到匹配词汇'}</h2>
              <p>{emptyCollection ? selection === '收藏夹' ? '点击单词旁的星标，把需要多看的词放在这里。' : '在单词旁点击“标记掌握”，就可以在这里查看并参加复习。' : '搜索只查找当前列表。试试更短的关键词，或清除筛选。'}</p>
              <button onClick={() => { if (emptyCollection) changeSelection('今日学习'); else { setQuery(''); setTier('全部'); } }}>{emptyCollection ? '去学习单词' : '清除筛选'}<Icon name="arrow" /></button>
            </section>}
          </section>

          <aside className="study-rail" aria-label="学习进度与复习">
            <section className="review-card">
              <div className="rail-heading"><Icon name="review" /><h2>把学过的词记牢</h2></div>
              <p id="review-description">通过配对、听音、拼写和填空，巩固已掌握的词汇。</p>
              <button ref={reviewButton} className="quiz-button" onClick={startQuiz} aria-describedby="review-description">复习练习<Icon name="arrow" /></button>
              <p className="review-note">{reviewPool.length ? '每轮最多 5 个词，难点会再次复查。' : '先标记掌握一个词，就能开始复习。'}</p>
            </section>
            <section className="progress-card">
              <h2>我的学习进度</h2>
              <p className="progress-number"><strong>{masteredCount.toLocaleString()}</strong><span>/ {vocabulary.length.toLocaleString()} 个词</span></p>
              <div className="progress-caption"><span>已标记掌握</span><strong>{progressPercent}%</strong></div>
              <span className="progress-track" role="progressbar" aria-label="词汇掌握进度" aria-valuemin={0} aria-valuemax={vocabulary.length} aria-valuenow={masteredCount}><i style={{ width: progressPercent + '%' }} /></span>
              <div className="progress-sessions"><span>已完成复习</span><strong>{quizSessions} 次</strong></div>
              <details className="progress-details"><summary>学习记录说明<Icon name="chevron" /></summary><p>记录自动保存在当前浏览器，不会自动同步到其他设备。“标记掌握”是你的学习标记，复习会分别记录词义和拼写表现。</p></details>
            </section>
          </aside>
        </div>
        <footer className="site-footer">专业术语参考香港数字政策办公室《英汉资讯科技词汇》2025 年 11 月版</footer>
      </main>

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
          <label className="voice-select"><span>点读语速</span><select aria-label="点读语速" value={playbackSpeed} onChange={event => {
            const next = event.target.value === 'slow' ? 'slow' : 'normal';
            activeAudio.current?.pause(); activeAudio.current = null; setSpeaking(''); setPlaybackSpeed(next);
            try { localStorage.setItem('codewords-playback-speed', next); }
            catch { window.alert('语速已切换，但浏览器未能保存偏好。'); }
          }}><option value="normal">正常</option><option value="slow">慢速</option></select></label>
          <div className="modal-actions"><button className={speaking === 'voice-test' ? 'playing' : ''} onClick={() => playAudio('voice-test.mp3', false, 'voice-test')}><Icon name="sound" />正常试听</button><button className={speaking === 'voice-test-slow' ? 'playing' : ''} onClick={() => playAudio('voice-test.mp3', true, 'voice-test-slow')}><Icon name="sound" />慢速试听</button></div>
          <p className="voice-scope">声音用于整个网站，语速用于词汇点读。复习中的“慢速”可单独使用，偏好自动保存。</p>
        </section>
      </div>}
      {showQuiz && <ReviewQuiz pool={reviewPool} onClose={closeReview} onFinished={finishReview} playWord={playWord} playExample={playExample} speaking={speaking} />}
    </div>
  );
}
