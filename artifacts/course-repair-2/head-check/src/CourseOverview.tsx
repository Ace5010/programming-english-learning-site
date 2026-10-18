import type { ReactNode } from 'react';
import type { DailyPhrase } from './dailyCourse';
import type { courseOverview } from './courseOverviewData';
import Icon from './Icon';
import './courseOverview.css';

type Overview = NonNullable<ReturnType<typeof courseOverview>>;

// Reusable static vector scenes: no network images or runtime generation.
function CourseIllustration({ overview }: { overview: Overview }) {
  const objects = overview.source.id.startsWith('A1-04');
  const terminal = /^P1-0[34]/.test(overview.source.id);
  return <div className="course-illustration" aria-hidden="true"><svg viewBox="0 0 280 300" fill="none">
    <ellipse cx="142" cy="255" rx="105" ry="13" fill="currentColor" opacity=".07" />
    {overview.reading ? <>
      <rect x="32" y="64" width="216" height="155" rx="12" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="M33 94h214M46 230h188l20 14H26z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="48" cy="80" r="3" fill="currentColor" /><circle cx="60" cy="80" r="3" fill="currentColor" opacity=".4" />
      {terminal ? <><path d="m64 124 16 13-16 13m30 0h30M64 174h102m-102 14h146" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></> : <>
        <path d="M59 116h56v72H59z" fill="var(--surface-2)" stroke="currentColor" strokeWidth="2" />
        <path d="M71 133h30m-30 13h30m-30 13h21M136 124h82m-82 17h62m-62 17h74m-74 17h47" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </>}
    </> : objects ? <>
      <path d="M38 231h207M53 228V119l94-14v123z" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="m53 119 77 9v100M66 146l48 5m-48 12 48 5" stroke="currentColor" strokeWidth="3" />
      <path d="M164 177h51v40a12 12 0 0 1-12 12h-27a12 12 0 0 1-12-12zM215 184h11a12 12 0 0 1 0 24h-11" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="m188 151 8-48 9 2-8 48" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </> : <>
      <path d="M52 99a18 18 0 0 1 18-18h83a18 18 0 0 1 18 18v33a18 18 0 0 1-18 18h-47l-24 19v-19H70a18 18 0 0 1-18-18z" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="M177 119h28a18 18 0 0 1 18 18v24a18 18 0 0 1-18 18h-8v16l-24-16h-27" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M77 108h68m-68 16h44" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="82" cy="197" r="18" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <circle cx="189" cy="218" r="15" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="M45 247c0-40 73-40 73 0m42 3c0-30 58-30 58 0" fill="var(--surface)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </>}
  </svg></div>;
}

export default function CourseOverview({ overview, disabled, start, renderPhrase }: {
  overview: Overview; disabled: boolean; start: () => void; renderPhrase: (phrase: DailyPhrase) => ReactNode;
}) {
  const reading = overview.reading;
  const examples = overview.source.phrases.filter(phrase => !overview.targets.some(target => target.id === phrase.id)
    && overview.targets.some(target => phrase.en.toLowerCase().includes(target.en.toLowerCase()))).slice(0, 2);
  return <div className="course-home-main">
    <section className={`daily-panel course-current${reading ? ' course-reading' : ''}`} aria-label="当前课程">
      <div className="course-current-body">
        {!reading && <CourseIllustration overview={overview} />}
        <div className="course-current-copy">
          <h3>第 {overview.round} 节 · {overview.title}</h3>
          {reading && <div className="course-reading-preview">{(examples.length ? examples : overview.targets.slice(0, 2)).map(phrase => <div key={phrase.id}>{renderPhrase(phrase)}</div>)}</div>}
          <div className="course-facts">
            {!!overview.newCount && <div><span>新内容</span><strong>{overview.newCount} 条{overview.reading ? '词语' : '表达'}</strong></div>}
            {!!overview.oldCount && <div><span>继续巩固</span><strong>{overview.oldCount} 条{overview.reading ? '词语' : '表达'}</strong></div>}
          </div>
          <div className="course-start"><button className="daily-button primary" disabled={disabled} onClick={start}>{overview.resume ? '继续学习' : '开始学习'}<Icon name="arrow" /></button></div>
        </div>
      </div>
    </section>
    <section className="daily-panel course-details" aria-label="这轮会学到什么">
      <h2>{reading ? '核心词语' : '重点词汇'}</h2>
      <div className="course-examples">{overview.targets.slice(0, 4).map(phrase => <div key={phrase.id} data-target-id={phrase.id}>{renderPhrase(phrase)}</div>)}</div>
    </section>
  </div>;
}
