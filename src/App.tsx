'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { vocabulary, type VocabularyItem } from './vocabulary';

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

const categoryMarks: Record<string, string> = {
  'GitHub 与版本控制': 'GH',
  '代码基础': '{ }',
  '命令行与开发工具': '>_',
  '前端开发': 'FE',
  '后端与数据库': 'DB',
  '网络与云服务': 'NW',
  '操作系统与文件': 'OS',
  '测试与调试': 'QA',
  '安全与权限': 'SE',
  '数据、算法与 AI': 'AI',
  'IT 通用术语': 'IT',
  '文档基础英语': 'EN',
};

type QuizState = {
  items: VocabularyItem[];
  index: number;
  score: number;
  selected: number | null;
  finished: boolean;
};

function getStoredNumbers(key: string) {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return new Set<number>();
  }
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('今日学习');
  const [tier, setTier] = useState('全部');
  const [visibleCount, setVisibleCount] = useState(24);
  const [mastered, setMastered] = useState<Set<number>>(new Set());
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [quizSessions, setQuizSessions] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [speaking, setSpeaking] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const activeAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMastered(getStoredNumbers('codewords-mastered'));
      setFavorites(getStoredNumbers('codewords-favorites'));
      setQuizSessions(Number(localStorage.getItem('codewords-quiz-sessions') ?? 0));
      setBestScore(Number(localStorage.getItem('codewords-best-score') ?? 0));
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

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    vocabulary.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return counts;
  }, []);

  const todayIds = useMemo(() => new Set(vocabulary.filter((item) => item.tier === '核心').slice(0, 12).map((item) => item.id)), []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return vocabulary.filter((item) => {
      const sourceMatch =
        selection === '全部词汇' ||
        (selection === '今日学习' && todayIds.has(item.id)) ||
        (selection === '收藏夹' && favorites.has(item.id)) ||
        item.category === selection;
      const tierMatch = tier === '全部' || item.tier === tier;
      const queryMatch = !normalized || (item.word + ' ' + item.meaning + ' ' + item.example).toLowerCase().includes(normalized);
      return sourceMatch && tierMatch && queryMatch;
    });
  }, [selection, tier, query, favorites, todayIds]);

  const playAudio = (fileName: string, slow = false, key = fileName) => {
    if (speaking === key && activeAudio.current) {
      activeAudio.current.pause();
      activeAudio.current.currentTime = 0;
      activeAudio.current = null;
      setSpeaking('');
      return;
    }

    activeAudio.current?.pause();
    const audio = new Audio(new URL(`audio/piper-lessac/${fileName}`, document.baseURI).href);
    audio.playbackRate = slow ? 0.72 : 1;
    audio.preservesPitch = true;
    audio.onended = () => { activeAudio.current = null; setSpeaking(''); };
    audio.onerror = () => { activeAudio.current = null; setSpeaking(''); window.alert('语音文件加载失败，请检查网络后重试。'); };
    activeAudio.current = audio;
    setSpeaking(key);
    void audio.play().catch(() => {
      activeAudio.current = null;
      setSpeaking('');
      window.alert('浏览器暂时无法播放语音，请再次点击播放。');
    });
  };

  const playWord = (item: VocabularyItem, slow = false, key = `word-${item.id}`) => playAudio(`word-${item.id}.mp3`, slow, key);
  const playExample = (item: VocabularyItem) => playAudio(`example-${item.id}.mp3`, false, `example-${item.id}`);

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
    setMobileNav(false);
  };

  const startQuiz = () => {
    const pool = filtered.length >= 10 ? filtered : vocabulary.filter((item) => item.tier === '核心');
    setQuiz({ items: shuffled(pool).slice(0, 10), index: 0, score: 0, selected: null, finished: false });
  };

  const answerQuiz = (id: number) => {
    if (!quiz || quiz.selected !== null) return;
    const correct = quiz.items[quiz.index].id === id;
    setQuiz({ ...quiz, selected: id, score: quiz.score + (correct ? 1 : 0) });
  };

  const nextQuestion = () => {
    if (!quiz) return;
    if (quiz.index === quiz.items.length - 1) {
      const sessions = quizSessions + 1;
      const best = Math.max(bestScore, quiz.score);
      setQuizSessions(sessions);
      setBestScore(best);
      localStorage.setItem('codewords-quiz-sessions', String(sessions));
      localStorage.setItem('codewords-best-score', String(best));
      setQuiz({ ...quiz, finished: true });
      return;
    }
    setQuiz({ ...quiz, index: quiz.index + 1, selected: null });
  };

  const quizItems = quiz?.items;
  const quizIndex = quiz?.index ?? 0;
  const quizFinished = quiz?.finished;
  const quizOptions = useMemo(() => {
    if (!quizItems || quizFinished) return [];
    const current = quizItems[quizIndex];
    const alternatives = shuffled(vocabulary.filter((item) => item.id !== current.id && item.meaning !== current.meaning)).slice(0, 3);
    return shuffled([current, ...alternatives]);
  }, [quizItems, quizIndex, quizFinished]);

  const currentTitle = selection === '今日学习' ? '今天学 12 个词' : selection;
  const progressPercent = Math.round((mastered.size / vocabulary.length) * 100);

  return (
    <main className="app-shell">
      <aside className={mobileNav ? 'sidebar mobile-open' : 'sidebar'}>
        <div className="brand-row">
          <button className="brand" onClick={() => changeSelection('今日学习')}>
            <span className="brand-mark">IT</span><span>CodeWords<small>计算机英语点读</small></span>
          </button>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="关闭菜单">×</button>
        </div>

        <nav aria-label="学习导航">
          <p className="eyebrow">学习</p>
          <button className={selection === '今日学习' ? 'nav-item active' : 'nav-item'} onClick={() => changeSelection('今日学习')}><span className="nav-mark">◎</span><span>今日学习</span><em>12</em></button>
          <button className={selection === '收藏夹' ? 'nav-item active' : 'nav-item'} onClick={() => changeSelection('收藏夹')}><span className="nav-mark">☆</span><span>收藏夹</span><em>{favorites.size}</em></button>
          <button className={selection === '全部词汇' ? 'nav-item active' : 'nav-item'} onClick={() => changeSelection('全部词汇')}><span className="nav-mark">AZ</span><span>全部词汇</span><em>{vocabulary.length}</em></button>

          <p className="eyebrow category-label">词汇分类</p>
          <div className="category-list">
            {categoryOrder.map((category) => (
              <button className={selection === category ? 'nav-item active' : 'nav-item'} onClick={() => changeSelection(category)} key={category}>
                <span className="nav-mark code">{categoryMarks[category]}</span><span>{category}</span><em>{categoryCounts.get(category)}</em>
              </button>
            ))}
          </div>
        </nav>

        <button className="sidebar-progress" onClick={() => setShowProgress(true)}>
          <div><span>总学习进度</span><strong>{progressPercent}%</strong></div>
          <span className="progress-track"><i style={{ width: Math.max(progressPercent, 1) + '%' }} /></span>
          <small>已掌握 {mastered.size.toLocaleString()} / {vocabulary.length.toLocaleString()} 个词</small>
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="title-group">
            <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="打开菜单">☰</button>
            <div><p className="eyebrow">从零开始读懂 GitHub 和代码</p><h1>{currentTitle}</h1></div>
          </div>
          <div className="top-actions">
            <label className="search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(24); }} placeholder="搜索单词、中文或例句…" /><kbd>Ctrl K</kbd></label>
            <button className="icon-button" onClick={() => setShowVoice(true)} title="美式语音设置">♪</button>
            <button className="quiz-button" onClick={startQuiz}>开始测验 <span>→</span></button>
          </div>
        </header>

        {selection === '今日学习' && !query ? (
          <section className="hero-card">
            <div>
              <span className="lesson-pill">学习路径 · 第 1 课</span>
              <h2>先看懂 GitHub 仓库</h2>
              <p>点击单词听美式发音，再用一句真实开发场景理解它。</p>
              <div className="hero-actions"><button onClick={() => playAudio('hero.mp3', true, 'hero')}>▶ 连续慢速听</button><button onClick={() => setShowProgress(true)}>查看学习进度</button></div>
            </div>
            <div className="hero-stat"><strong>{[...todayIds].filter((id) => mastered.has(id)).length}<span>/12</span></strong><small>今日已掌握</small></div>
          </section>
        ) : (
          <section className="library-strip">
            <div><span>{categoryMarks[selection] ?? 'AZ'}</span><div><strong>{filtered.length.toLocaleString()}</strong><small>当前词汇</small></div></div>
            <p>点击发音、阅读双语例句，再将熟悉的词标记为“已掌握”。</p>
          </section>
        )}

        <div className="section-heading">
          <div><h2>{query ? '搜索结果' : selection === '今日学习' ? '今日核心词汇' : '词汇列表'}</h2><p>单词、例句均可点读；慢速为 0.72 倍语速</p></div>
          <div className="filters" aria-label="词汇级别">
            {['全部', '核心', '专业', '基础'].map((value) => <button className={tier === value ? 'selected' : ''} onClick={() => { setTier(value); setVisibleCount(24); }} key={value}>{value}</button>)}
          </div>
        </div>

        {filtered.length > 0 ? (
          <>
            <section className="word-grid">
              {filtered.slice(0, visibleCount).map((item, index) => (
                <article className={mastered.has(item.id) ? 'word-card mastered' : 'word-card'} key={item.id}>
                  <div className="card-top">
                    <span className="number">{String(index + 1).padStart(2, '0')}</span>
                    <div><span className={'tier ' + item.tier}>{item.tier}</span><button className={favorites.has(item.id) ? 'favorite active' : 'favorite'} onClick={() => toggleSet(setFavorites, item.id)} aria-label={favorites.has(item.id) ? '取消收藏' : '收藏'}>{favorites.has(item.id) ? '★' : '☆'}</button></div>
                  </div>
                  <div className="word-row">
                    <button className={speaking === 'word-' + item.id ? 'word-button playing' : 'word-button'} onClick={() => playWord(item)}>
                      <span className="speaker">♪</span><span><strong>{item.word}</strong><small>{item.phonetic ? '/' + item.phonetic + '/' : 'en-US · 美式发音'}</small></span>
                    </button>
                    <button className="slow-button" onClick={() => playWord(item, true, 'slow-' + item.id)}><span>{speaking === 'slow-' + item.id ? '◼' : '▶'}</span> 慢速</button>
                  </div>
                  <p className="meaning">{item.meaning}</p>
                  <div className="example">
                    <button className={speaking === 'example-' + item.id ? 'playing' : ''} onClick={() => playExample(item)} aria-label={'朗读例句 ' + item.example}>▶</button>
                    <div><p>{item.example}</p><span>{item.exampleZh}</span></div>
                  </div>
                  <div className="spelling"><span>拼写</span><code>{item.word.split('').map((letter) => letter === ' ' ? ' / ' : letter).join(' · ')}</code></div>
                  <div className="card-footer"><span>{item.category}</span><button className={mastered.has(item.id) ? 'known active' : 'known'} onClick={() => toggleSet(setMastered, item.id)}><i>✓</i>{mastered.has(item.id) ? '已掌握' : '标记掌握'}</button></div>
                </article>
              ))}
            </section>
            {visibleCount < filtered.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 24)}>再显示 24 个 <span>当前 {Math.min(visibleCount, filtered.length)} / {filtered.length.toLocaleString()}</span></button>}
          </>
        ) : (
          <section className="empty-state"><span>⌕</span><h2>没有找到匹配词汇</h2><p>试试更短的英文、中文关键词，或切换到“全部”级别。</p><button onClick={() => { setQuery(''); setTier('全部'); }}>清除筛选</button></section>
        )}

        <footer><span>CodeWords · 共 {vocabulary.length.toLocaleString()} 个词汇</span><span>专业术语参考香港数字政策办公室《英汉资讯科技词汇》2025 年 11 月版</span></footer>
      </section>

      {mobileNav && <button className="backdrop mobile" onClick={() => setMobileNav(false)} aria-label="关闭菜单背景" />}

      {showVoice && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="美式语音设置">
          <button className="backdrop" onClick={() => setShowVoice(false)} aria-label="关闭" />
          <section className="modal voice-modal">
            <button className="modal-close" onClick={() => setShowVoice(false)}>×</button>
            <span className="modal-icon">♪</span><p className="eyebrow">固定发音</p><h2>Piper Lessac 美式英语</h2>
            <p className="modal-copy">全站使用预先生成的同一套清晰美式语音，不再调用手机或电脑的系统朗读，因此不同设备听到的音色一致。</p>
            <div className="voice-status"><span className="dot good" />固定音源已启用 · 无需安装语音包</div>
            <div className="modal-actions"><button onClick={() => playAudio('voice-test.mp3', false, 'voice-test')}>▶ 正常试听</button><button onClick={() => playAudio('voice-test.mp3', true, 'voice-test-slow')}>▶ 慢速试听</button></div>
          </section>
        </div>
      )}

      {showProgress && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="学习进度">
          <button className="backdrop" onClick={() => setShowProgress(false)} aria-label="关闭" />
          <section className="modal progress-modal">
            <button className="modal-close" onClick={() => setShowProgress(false)}>×</button>
            <p className="eyebrow">你的学习记录</p><h2>每掌握一个词，都更接近读懂代码</h2>
            <div className="progress-ring" style={{ '--progress': progressPercent + '%' } as React.CSSProperties}><div><strong>{progressPercent}%</strong><span>总进度</span></div></div>
            <div className="progress-stats"><div><strong>{mastered.size}</strong><span>已掌握</span></div><div><strong>{favorites.size}</strong><span>已收藏</span></div><div><strong>{quizSessions}</strong><span>完成测验</span></div><div><strong>{bestScore}/10</strong><span>最佳成绩</span></div></div>
            <p className="save-note"><span>✓</span> 学习记录自动保存在当前浏览器中</p>
          </section>
        </div>
      )}

      {quiz && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="词汇测验">
          <div className="backdrop solid" />
          <section className="modal quiz-modal">
            <button className="modal-close" onClick={() => setQuiz(null)}>×</button>
            {!quiz.finished ? (
              <>
                <div className="quiz-head"><div><p className="eyebrow">词义选择</p><span>第 {quiz.index + 1} / {quiz.items.length} 题</span></div><strong>{quiz.score} 分</strong></div>
                <span className="quiz-track"><i style={{ width: ((quiz.index + 1) / quiz.items.length) * 100 + '%' }} /></span>
                <div className="quiz-word"><button onClick={() => playWord(quiz.items[quiz.index])}>♪</button><h2>{quiz.items[quiz.index].word}</h2><p>{quiz.items[quiz.index].phonetic ? '/' + quiz.items[quiz.index].phonetic + '/' : '点击扬声器听发音'}</p></div>
                <p className="quiz-prompt">请选择最合适的中文意思</p>
                <div className="quiz-options">
                  {quizOptions.map((option, index) => {
                    const answered = quiz.selected !== null;
                    const isCorrect = option.id === quiz.items[quiz.index].id;
                    const isWrong = answered && option.id === quiz.selected && !isCorrect;
                    return <button className={answered && isCorrect ? 'correct' : isWrong ? 'wrong' : ''} disabled={answered} onClick={() => answerQuiz(option.id)} key={option.id}><span>{String.fromCharCode(65 + index)}</span>{option.meaning}{answered && isCorrect && <i>✓</i>}{isWrong && <i>×</i>}</button>;
                  })}
                </div>
                {quiz.selected !== null && <div className="quiz-feedback"><p>{quiz.selected === quiz.items[quiz.index].id ? '回答正确！' : '记住这个词，下次一定可以。'}</p><span>{quiz.items[quiz.index].example}<br />{quiz.items[quiz.index].exampleZh}</span><button onClick={nextQuestion}>{quiz.index === quiz.items.length - 1 ? '查看成绩' : '下一题'} →</button></div>}
              </>
            ) : (
              <div className="quiz-result"><span className="result-mark">{quiz.score >= 8 ? '✓' : '↗'}</span><p className="eyebrow">测验完成</p><h2>{quiz.score >= 8 ? '太棒了，继续保持！' : '已经迈出了很好的一步'}</h2><strong>{quiz.score}<small>/10</small></strong><p>本次答对 {quiz.score} 个词，最佳成绩 {Math.max(bestScore, quiz.score)} 分。</p><div><button onClick={startQuiz}>再测一次</button><button onClick={() => setQuiz(null)}>返回学习</button></div></div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
