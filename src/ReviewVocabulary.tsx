import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import Icon from './Icon';
import VocabularyRow from './VocabularyRow';
import { getSkill, isWordDue, reviewAbilities, type ReviewProgress } from './review';
import type { VocabularyItem } from './vocabulary';
import type { PlaybackSpeed } from './SpeechControls';
import './programmingReview.css';

interface Props {
  words: VocabularyItem[];
  progress: ReviewProgress;
  favorites: Set<number>;
  favoriteWarning: string;
  disabled: boolean;
  speaking: string;
  speed: PlaybackSpeed;
  reviewButtonRef: RefObject<HTMLButtonElement | null>;
  scenarios: ReactNode;
  startDue: () => void;
  startWords: (ids: number[]) => void;
  toggleFavorite: (id: number) => void;
  playWord: (item: VocabularyItem, slow?: boolean, key?: string) => void;
  playExample: (item: VocabularyItem, slow?: boolean, key?: string) => void;
  openCourse: () => void;
  exportRecord: () => void;
}

const abilityLabels = { meaning: '词义', context: '语境', spelling: '拼写', listening: '听力' };
type Filter = 'all' | 'due' | 'weak' | 'scheduled';

export default function ReviewVocabulary({ words, progress, favorites, favoriteWarning, disabled, speaking, speed, reviewButtonRef, scenarios, startDue, startWords, toggleFavorite, playWord, playExample, openCourse, exportRecord }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [visibleCount, setVisibleCount] = useState(24);
  const entries = useMemo(() => words.map(item => {
    const weak = reviewAbilities.filter(ability => getSkill(progress, item.id, ability).needsPractice);
    return { item, weak, due: isWordDue(progress, item.id), nextDue: Math.min(...reviewAbilities.map(ability => getSkill(progress, item.id, ability).dueAt)) };
  }).sort((a, b) => Number(b.due) - Number(a.due) || Number(!!b.weak.length) - Number(!!a.weak.length) || a.nextDue - b.nextDue || a.item.id - b.item.id), [words, progress]);
  const counts = { all: entries.length, due: entries.filter(entry => entry.due).length, weak: entries.filter(entry => entry.weak.length).length, scheduled: entries.filter(entry => !entry.due).length };
  const search = query.trim().toLowerCase();
  const filtered = entries.filter(({ item, weak, due }) => (filter === 'all' || filter === 'due' && due || filter === 'weak' && weak.length || filter === 'scheduled' && !due)
    && (!search || `${item.word} ${item.meaning} ${item.example} ${item.exampleZh}`.toLowerCase().includes(search)));
  const resetFilters = () => { setQuery(''); setFilter('all'); setVisibleCount(24); };

  return <div className="programming-review-layout">
    <section className="vocabulary-panel review-vocabulary" aria-label="已学词汇">
      <div className="review-list-heading"><h2>已学词汇</h2><div className="review-list-actions">
        <button className="daily-button primary" disabled={disabled || !counts.due} onClick={startDue}>开始到期复习<Icon name="arrow" /></button>
        <button ref={reviewButtonRef} className="daily-button" disabled={disabled || !filtered.length} onClick={() => startWords(filtered.map(entry => entry.item.id))}>{filter === 'all' && !search ? '练习已学词' : '练习筛选结果'}</button>
      </div></div>
      {favoriteWarning && <p className="review-list-notice" role="alert">{favoriteWarning}</p>}
      {words.length ? <>
        <div className="review-list-tools"><label className="search"><Icon name="search" /><input aria-label="搜索已学词汇" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(24); }} placeholder="搜索单词、中文或例句" />{query && <button aria-label="清除已学词搜索" onClick={() => { setQuery(''); setVisibleCount(24); }}><Icon name="close" /></button>}</label>
          <label className="category-select"><span>显示</span><select aria-label="复习词汇范围" value={filter} onChange={event => { setFilter(event.target.value as Filter); setVisibleCount(24); }}><option value="all">全部已学 · {counts.all}</option><option value="due">待复习 · {counts.due}</option><option value="weak">需要巩固 · {counts.weak}</option><option value="scheduled">未到期 · {counts.scheduled}</option></select></label>
        </div>
        <div className="list-guide"><span role="status">{filtered.length} 个词</span><p><Icon name="sound" />点单词或例句听发音</p></div>
        {filtered.length ? <>
          <div className="list-columns" aria-hidden="true"><span>单词 / 发音</span><span>中文释义</span><span>复习状态</span></div>
          <div className="word-grid">{filtered.slice(0, visibleCount).map(({ item, weak, due, nextDue }) => <VocabularyRow key={item.id} item={item} favorite={favorites.has(item.id)} favoriteDisabled={!!favoriteWarning} speaking={speaking} speed={speed} toggleFavorite={toggleFavorite} playWord={playWord} playExample={playExample}
            status={<><span className={due ? 'review-due' : ''}>{due ? '待复习' : `下次复习 ${new Date(nextDue).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`}</span>{weak.length > 0 && <span className="review-weak">需巩固：{weak.map(ability => abilityLabels[ability]).join('、')}</span>}</>}
            action={<button className="daily-button review-word-action" disabled={disabled} onClick={() => startWords([item.id])} aria-label={`练习 ${item.word}`}>练习</button>} />)}</div>
          {visibleCount < filtered.length && <div className="load-more-area"><button className="load-more" onClick={() => setVisibleCount(count => count + 24)}>再显示 24 个<Icon name="chevron" /></button><span>已显示 {Math.min(visibleCount, filtered.length)} / {filtered.length}</span></div>}
        </> : <div className="review-list-empty"><p>{search ? '没有找到相符的已学词汇。' : filter === 'due' ? '暂时没有到期的词，可以提前练习已学词。' : filter === 'weak' ? '目前没有需要额外巩固的词。' : '目前的已学词都已到复习时间。'}</p><button className="daily-button" onClick={resetFilters}>查看全部已学词</button></div>}
      </> : <div className="review-list-empty"><p>已确认掌握的词和课程中巩固好的词会显示在这里，可以查看释义、听发音或直接练习。</p><button className="daily-button" onClick={openCourse}>去学习当前课程<Icon name="arrow" /></button></div>}
    </section>
    <aside className="review-sidebar" aria-label="其他复习方式"><details className="review-scenarios"><summary><span>场景复习</span><Icon name="chevron" /></summary><div className="review-scenario-content">{scenarios}</div></details><button className="daily-button text" onClick={exportRecord}>导出学习记录</button></aside>
  </div>;
}
