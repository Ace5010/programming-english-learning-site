import Icon from './Icon';
import { createPairState, pairOrder, type PairItem, type PairState } from './pairPractice';
import type { DailyPhrase } from './dailyCourse';

export default function CoursePairs({ id, items, mode, state = createPairState(), disabled, speaking, play, onSelect, onMatch }: {
  id: string; items: PairItem[]; mode: 'text' | 'audio'; state?: PairState; disabled: boolean; speaking: string;
  play: (phrase: DailyPhrase, slow?: boolean) => void; onSelect: (id: string) => void; onMatch: (id: string) => void;
}) {
  const left = pairOrder(items, `${id}:left`), right = pairOrder(items, `${id}:right`);
  return <div className="course-pairs" aria-label={mode === 'audio' ? '听音配对' : '词义配对'}>
    <p className="pair-instruction">{mode === 'audio' ? '先点左侧听声音，再选右侧的中文。' : '先选左侧英文，再选右侧中文。'}</p>
    <div className="course-pair-grid">
      <div className="course-pair-column" role="group" aria-label={mode === 'audio' ? '录音' : '英文'}>{left.map((item, index) => {
        const matched = state.matches[item.id];
        const phrase = { id: item.audioId, en: item.en, zh: item.zh };
        const label = mode === 'audio' && !matched ? `第 ${index + 1} 段录音` : item.en;
        return <div key={item.id} className={`course-pair-row${matched ? ' matched' : ''}`}>
          <button type="button" className={`course-pair-card${state.selected === item.id ? ' selected' : ''}${speaking === `daily-${item.audioId}-normal` ? ' playing' : ''}`} aria-pressed={state.selected === item.id}
            aria-label={label} onClick={() => { if (!disabled && !matched) onSelect(item.id); play(phrase, false); }}>
            <Icon name={matched ? 'check' : 'sound'} />{mode === 'audio' && !matched ? <span className="pair-audio-bars" aria-hidden="true">▂▅▃▆▃▅▂</span> : <span lang="en">{item.en}</span>}
          </button><button type="button" className="daily-inline-slow" aria-label={`慢速 ${label}`} aria-pressed={speaking === `daily-${item.audioId}-slow`} onClick={() => { if (!disabled && !matched) onSelect(item.id); play(phrase, true); }}>慢速</button>
          {matched && <span className="pair-result">{matched === 'unmeasured' || matched === 'revealed' ? '已展示' : matched === 'assisted' ? '修改正确' : '已配对'}</span>}
        </div>;
      })}</div>
      <div className="course-pair-column" role="group" aria-label="中文含义">{right.map(item => <button type="button" key={item.id}
        className={`course-pair-card${state.matches[item.id] ? ' matched' : ''}${state.wrong === item.id ? ' needs-correction' : ''}`}
        disabled={disabled || !!state.matches[item.id] || !state.selected || state.wrong === item.id} onClick={() => onMatch(item.id)}>{item.zh}{state.matches[item.id] && <Icon name="check" />}</button>)}</div>
    </div>
    {state.message && <p className={`pair-note${state.wrong ? ' needs-correction' : ''}`} role="status">{state.message}</p>}
  </div>;
}
