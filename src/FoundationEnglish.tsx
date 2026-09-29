import { useEffect, useState, type RefObject } from 'react';
import ReadAloudText, { useReading } from './ReadAloud';
import { foundationTopics, foundationSources, type FoundationTopic } from './foundationCourse';
import { grammarSampleId, grammarSampleTitle, grammarContrastPhrases } from './foundationSamples';
import type { DailyPhrase } from './dailyCourse';
import './foundation.css';
import { sentenceGuide } from './sentenceGuide';
import { readingPlaybackKey } from './readingAudio';
import PhonemicChart, { type PhonemicAudioProps } from './PhonemicChart.tsx';

type AudioProps = { play: (phrase: DailyPhrase, slow?: boolean) => void; speaking: string };
export const foundationTopicLabel = (id: string) => id === grammarSampleId ? grammarSampleTitle : foundationTopics.find(item => item.id === id)?.title ?? '基础知识';
const glossary: Record<string, string> = {
  名词: '给人、东西、地点或概念命名的一类词。', 动词: '表示动作、状态或关系的一类词。', 形容词: '描述人或事物的性质、样子或状态的一类词。',
  代词: '用来指代人或东西的词，例如 I（我）。', 主语: '这句话主要说的是谁或什么，是句中的角色。', 谓语: '句子里说明主语的动作、状态等的部分，这里先从动词理解。',
  宾语: '动作涉及的人或东西等，在句中承担的一种角色。', 冠词: '放在名词前帮助说明所指对象的小词，例如 a、an、the。',
  介词: '把人或东西与位置、时间等关系连接起来的词，例如 in、on。', 单数: '说的是一个。', 复数: '说的是不止一个。',
  原形: '动词在词典中列出的基本形式，例如 read。', 音节: '读词时的一个声音单位，通常围绕一个元音声音组成。',
  元音: '气流通过口腔时比较通畅的声音。', 辅音: '气流在嘴或喉部受到阻碍而形成的声音。',
  音标: '记录读音的符号，不是英语字母表。', 重音: '单词或句子中读得更突出的部分。', 弱读: '一些词或音节在语流中读得较轻的现象。',
  词组: '几个词合起来表达一个部分的意思。', 齿龈: '上门齿后面、舌尖能碰到的凸起位置。', 声带: '喉咙里能随发声振动的组织。轻触喉部有时能感到振动。',
};
function Text({ value }: { value: string }) {
  // IPA is a notation to inspect; reading its Latin-looking characters as letter
  // names would teach the wrong sound.
  return <>{value.split(/(\/[^/\n]+\/)/g).map((part, i) => /^\/[^/]+\/$/.test(part)
    ? <span className="foundation-ipa" key={i}>{part}</span> : <ReadAloudText text={part} key={i} />)}</>;
}
function Reading({ phrase, play, speaking }: { phrase: DailyPhrase } & AudioProps) {
  const { preload } = useReading();
  useEffect(() => { preload?.(phrase.en); }, [preload, phrase.en]);
  return <div className="foundation-reading"><button type="button" className="foundation-english" lang="en" aria-label={`朗读 ${phrase.en}`} aria-pressed={speaking === `daily-${phrase.id}-normal`} onClick={() => play(phrase, false)}>{phrase.en}</button>
    <button type="button" className="daily-inline-slow" aria-label={`慢速朗读 ${phrase.en}`} aria-pressed={speaking === `daily-${phrase.id}-slow`} onClick={() => play(phrase, true)}>慢速</button></div>;
}
function MouthGuide({ topic }: { topic: FoundationTopic }) {
  const mode = topic.id.endsWith('sound-th') ? 'tongue' : topic.id.endsWith('sound-friction') ? 'teeth' : topic.id.endsWith('sound-stops') ? 'lips' : null;
  if (!mode) return null;
  const label = mode === 'tongue' ? '/θ ð/：舌尖轻靠门齿，气流从缝隙通过' : mode === 'teeth' ? '/f v/：上门齿轻触下唇，气流摩擦通过' : '/p b/：双唇先合拢，再放开';
  return <figure className="foundation-mouth"><svg viewBox="0 0 240 115" role="img" aria-label={label}>
    <path d="M30 48 Q120 5 210 48 Q120 110 30 48Z" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="3" />
    {mode === 'lips' ? <path d="M35 48 Q120 58 205 48" fill="none" stroke="currentColor" strokeWidth="5" /> : <>
      <path d="M74 35 L74 55 L165 55 L165 35" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
      {[96, 119, 142].map(x => <path key={x} d={`M${x} 34V55`} stroke="currentColor" />)}
      {mode === 'tongue' ? <path d="M89 82 Q82 50 119 52 Q156 50 150 82" fill="#d97f7f" stroke="currentColor" strokeWidth="2" /> : <path d="M64 71 Q120 44 181 71" fill="none" stroke="var(--accent)" strokeWidth="7" />}
    </>}
  </svg><figcaption><Text value={label} />。这是位置示意；保持轻松，不用力咬。</figcaption></figure>;
}
export function FoundationCard({ topic, ...audio }: { topic: FoundationTopic } & AudioProps) {
  if (topic.hidden) return null;
  const terms = Object.entries(glossary).filter(([term]) => topic.explanation.some(line => line.includes(term)));
  const examples = <div className="foundation-examples">{topic.examples.map(phrase => <div className="foundation-example" key={phrase.id}>
    <strong className="foundation-meaning" lang="zh-CN">{phrase.zh}</strong><Reading phrase={phrase} {...audio} />
    {phrase.note && <p><Text value={phrase.note} /></p>}
    {topic.source === 'connected' && <details className="foundation-separate"><summary>逐词听，再听整句</summary><div className="foundation-word-list">{phrase.en.replace(/[.,!?]/g, '').split(/\s+/).map((word, index) => <Reading key={index} phrase={{ id: `${phrase.id}-word-${index}`, en: word, zh: word }} {...audio} />)}</div><p>逐词播放用于比较；整句播放保留自然的连接和轻重。</p></details>}
  </div>)}</div>;
  return <article className="foundation-card" data-topic={topic.id}>
    <h2>{topic.title}</h2>
    {topic.explanation.map((paragraph, index) => <p key={index}><Text value={paragraph} /></p>)}
    <MouthGuide topic={topic} />
    {examples}
    {terms.length > 0 && <details className="foundation-terms"><summary>这些名称是什么意思</summary><dl>{terms.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd><Text value={definition} /></dd></div>)}</dl></details>}
    <details className="foundation-source"><summary>参考资料</summary><p>中文讲解和练习为本站编写；知识范围参考 <a href={foundationSources[topic.source].url} target="_blank" rel="noreferrer">{foundationSources[topic.source].name}</a>。</p></details>
  </article>;
}
export const foundationTrack = (id: string) => foundationTopics.find(topic => topic.id === id)?.sound ? 'library' : 'course';
const sampleTitles: Record<string, string> = { [grammarSampleId]: grammarSampleTitle, 'foundation-sound-friction': '/f/ 和 /v/：嘴形相同，声音哪里不同' };
const titleOf = (topic: FoundationTopic) => sampleTitles[topic.id] ?? topic.title;

function TryIt({ prompt, options, explanation }: { prompt: string; options: string[]; explanation: string[] }) {
  const [choice, setChoice] = useState<number>();
  return <section className="tutorial-try" aria-label="试着理解"><h3>试着理解</h3><p>{prompt}</p>
    <div className="tutorial-options">{options.map((option, index) => <button type="button" key={option} aria-pressed={choice === index} onClick={() => setChoice(index)}>{option}</button>)}</div>
    {choice !== undefined && <p role="status">{explanation[choice]}</p>}
    <details><summary>直接看解释</summary><p>{explanation[0]}</p></details>
  </section>;
}
function GrammarSample(audio: AudioProps) {
  const examples = foundationTopics.find(topic => topic.id === 'foundation-word-order')!.examples;
  return <article className="foundation-card tutorial-article" data-topic={grammarSampleId}>
    <h2>名词和主语有什么区别</h2>
    <p className="tutorial-lead">“名词”是在给词分类，“主语”是在说它在这句话里做什么。先分清这两个问题。</p>
    <section><h3>先看一句话</h3><div className="foundation-example"><strong className="foundation-meaning">我喝水。</strong><Reading phrase={examples[0]} {...audio} /></div>
      <p>“水”是东西的名称，所以它是名词。但这句话讲的是“我”做什么，“我”才是主语。名词并不一定是主语。</p>
    </section>
    <section><h3>把句子拆开看</h3><div className="tutorial-breakdown">
      {[['谁', 'I', '主语 · 代词'], ['做什么', 'drink', '这里的谓语动词 · 动词'], ['喝什么', 'water', '宾语 · 名词']].map(([zh, en, role]) => <div key={en}><strong>{zh}</strong><Reading phrase={{ id: `tutorial-${en}`, en, zh }} {...audio} /><p>{role}</p></div>)}
    </div><p>词性回答“这是哪一类词”，句中角色回答“它在这句话里起什么作用”。主语也可以由代词或整个词组承担，不是只能放一个名词。</p></section>
    <section><h3>换一个例子，还是这样看</h3><div className="foundation-example"><strong className="foundation-meaning">我们读书。</strong><Reading phrase={examples[1]} {...audio} /></div>
      <p><Text value="We 是代词，在这里作主语；books 是名词，在这里作宾语。先问谁在读，再问读什么，就能看出两个角色。" /></p>
    </section>
    <section><h3>同一个名词，换一个句中角色</h3><div className="foundation-examples">{grammarContrastPhrases.map(phrase => <div className="foundation-example" key={phrase.id}><strong className="foundation-meaning">{phrase.zh}</strong><Reading phrase={phrase} {...audio} /><p>{phrase.note}</p></div>)}</div>
      <p>两句话里，“狗”都是名词。第一句是狗看见我，第二句是我看见狗；词的类别没变，包含它的词组在句中的角色变了。严格说，作主语或宾语的是整个词组，名词是这个词组的核心。</p>
      <details><summary>为什么一个句子用 sees，另一个用 see？</summary><p>一般现在时中，主语是单数的“那只狗”，这里的动词要加 s；主语是“我”，用动词原形。这是主语影响动词形式，与 dog 的名词身份无关。后面的时间表达教程会展开讲。</p></details>
    </section>
    <TryIt prompt="这句“我们读书”里，表示书的词是名词，它也一定是主语吗？" options={['不一定，这里是宾语', '是，名词就是主语']} explanation={['这里的主语是“我们”，书是读这个动作涉及的东西，作宾语。词的类别和句中的角色要分开判断。', '再看谁在读：是“我们”。“书”虽然是名词，在这句话里却作宾语。名词和主语不是同一个概念。']} />
    <section><h3>读下一章时，记住这两问</h3><p>它属于哪一类词？它在这句话里起什么作用？先会拆简单句，再逐步认识其他句型；不是每句话都需要宾语。</p></section>
    <details className="foundation-source"><summary>这篇怎样参考教程</summary><p>参考 <a href={foundationSources.grammar.url} target="_blank" rel="noreferrer">British Council 的专题语法教程</a>组织讲解与理解活动。这里补上入门概念，先讲后试；中文解释、拆解和互动为本站编写。</p></details>
  </article>;
}
function SoundSample({ active, stopAudio, ...audio }: AudioProps & { active: boolean; stopAudio: () => void }) {
  const [videoLoaded, setVideoLoaded] = useState(false);
  useEffect(() => { if (!active || audio.speaking) setVideoLoaded(false); }, [active, audio.speaking]);
  const [sound, setSound] = useState<'f' | 'v'>('f');
  const topic = foundationTopics.find(topic => topic.id === 'foundation-sound-friction')!;
  return <article className="foundation-card tutorial-article" data-topic={topic.id}>
    <h2>/f/ 和 /v/：嘴形相同，声音哪里不同</h2>
    <p className="tutorial-lead">两个音都用上门齿轻触下唇。先保持这个位置，再比较喉咙有没有振动。</p>
    <section><h3>嘴和舌头怎样放</h3><div className="tutorial-options" role="group" aria-label="观察发音动作">{(['f', 'v'] as const).map(value => <button type="button" key={value} aria-pressed={sound === value} onClick={() => setSound(value)}>查看 /{value}/ 发音说明</button>)}</div>
      <MouthGuide topic={topic} /><p className="tutorial-action" aria-live="polite">{sound === 'f' ? '/f/：轻轻送气，让气流擦过上齿与下唇的缝隙，声带不振动。' : '/v/：保持相同位置，一边送气一边发声，声带振动。可轻触喉咙帮助感受。'}</p>
      <p>舌头自然放松，不伸到牙齿之间；不要咬紧下唇，也不要在后面添“呃”。图只表示接触位置。</p></section>
    <section><h3>看示范，听单独的声音</h3><p>加载下方 BBC 官方视频，先看上齿与下唇怎样接触，再听老师单独发音和对比两个音，暂停后自己试一次。</p>
      {!videoLoaded ? <button className="tutorial-reference" type="button" onClick={() => { stopAudio(); setVideoLoaded(true); }}>加载页内示范</button> : <div className="tutorial-video"><iframe title="BBC /f/ 与 /v/ 官方发音示范" src="https://www.youtube.com/embed/vE12RFyH-hY?playsinline=1&rel=0" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen /><button className="tutorial-reference" type="button" onClick={() => setVideoLoaded(false)}>关闭视频</button></div>}
      <p>视频由 YouTube 提供；如果无法加载或提示不可播放，可尝试原站链接。切换主题、离开本区或点读例词时会关闭视频。</p>
      <a className="tutorial-reference" href="https://www.youtube.com/watch?v=vE12RFyH-hY" target="_blank" rel="noreferrer">观看 BBC /f/ 与 /v/ 发音示范 ↗</a>
      <p>外部视频需要联网。BBC 示范为英式；下方例词沿用本站美式录音，本章只比较两种口音共有的 /f/、/v/ 动作。</p></section>
    <section><h3>放进词里，比较开头</h3><div className="foundation-examples">{topic.examples.slice(0, 2).map(phrase => <div className="foundation-example" key={phrase.id}><strong className="foundation-meaning">{phrase.zh}</strong><Reading phrase={phrase} {...audio} /><p><Text value={phrase.note!} /></p></div>)}</div>
      <p>分别点读两个词，再用慢速听一次。注意开头的摩擦声和振动，后面的声音尽量保持一致。</p></section>
    <section><h3>听一遍，跟一遍</h3><p>先听“风扇”的英文，停下来跟读；再听“厢式车”的英文，保持齿唇位置，加入振动。可以反复听，也可以直接继续。</p>
      <details><summary>感觉两个音还是一样，怎么办</summary><p>先不读完整单词，只摆好齿唇位置：轻轻送气，再在相同位置加入声音。若听不清差异，回到老师示范，不要靠大声喊或用力咬。</p></details></section>
    <TryIt prompt="从 /f/ 换成 /v/，这次主要尝试改变什么？" options={['保持齿唇位置，加入声带振动', '改成双唇紧闭再放开']} explanation={['对比时保持上门齿轻触下唇，在气流中加入声带振动。这里的选择只帮助理解，不能证明实际发音已经正确。', '双唇闭合会改变发音位置。先保持上齿轻触下唇，再尝试加入声带振动。']} />
    <details className="foundation-source"><summary>这篇怎样参考教程</summary><p>示范顺序参考 <a href="https://feeds.bbci.co.uk/learningenglish/english/features/pronunciation/" target="_blank" rel="noreferrer">BBC The Sounds of English</a>，声音与例词的就地操作参考 <a href="https://learnenglish.britishcouncil.org/apps/learnenglish-sounds-right" target="_blank" rel="noreferrer">Sounds Right</a>。本站提供原创中文说明与位置示意，使用官方嵌入播放器，也保留原站链接。</p></details>
  </article>;
}

type Props = AudioProps & PhonemicAudioProps & { active: boolean; view: 'course' | 'review' | 'library' | 'favorites'; request?: { id: string; revision: number }; openTopic: (id: string) => void; stopAudio: () => void; openVoice: () => void; contentRef?: RefObject<HTMLElement | null>; headingRef?: RefObject<HTMLElement | null> };
export default function FoundationEnglish({ request, openTopic, active, view, stopAudio, openVoice, contentRef, headingRef, playPhoneme, phonemeError, ...audio }: Props) {
  const sounds = view === 'library';
  const catalog = [...foundationTopics];
  const grammarIndex = catalog.findIndex(topic => topic.id === 'foundation-word-order');
  catalog.splice(grammarIndex, 0, { ...catalog[grammarIndex], id: grammarSampleId, title: grammarSampleTitle, examples: grammarContrastPhrases });
  const topics = catalog.filter(topic => !topic.hidden && topic.sound === sounds).sort((a, b) => {
    const rank = (topic: FoundationTopic) => topic.id === 'foundation-letter-sound' ? 0 : topic.id.startsWith('foundation-sound-') ? 1 : 2;
    return sounds ? rank(a) - rank(b) : 0;
  });
  const [selected, setSelected] = useState(request?.id ?? grammarSampleId);
  const [query, setQuery] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => { if (request) { setSelected(request.id); setQuery(''); if (foundationTrack(request.id) === 'library') setTutorialOpen(true); } }, [request]);
  const current = topics.find(topic => topic.id === selected) ?? topics.find(topic => topic.id === (sounds ? 'foundation-sound-friction' : grammarSampleId))!;
  const index = topics.indexOf(current);
  const choose = (id: string) => { stopAudio(); setSelected(id); if (sounds) setTutorialOpen(true); openTopic(id); requestAnimationFrame(() => document.getElementById('tutorial-reading')?.focus()); };
  const filtered = topics.filter(topic => `${titleOf(topic)} ${topic.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tutorial = <div className="tutorial-layout"><aside className="tutorial-directory" aria-label="教程目录"><h2>推荐阅读顺序</h2>
      <p>{sounds ? '音标入门 → 单个声音与对比 → 重音 → 连读与语调' : '单词与词组 → 词性与句中角色 → 基本句型 → 小词与词形 → 提问、否定与时间表达'}</p>
      <label>查找主题<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <ol>{filtered.map(topic => <li key={topic.id}><button type="button" aria-current={current.id === topic.id ? 'page' : undefined} onClick={() => choose(topic.id)}>{titleOf(topic)}{sampleTitles[topic.id] && <span>样章</span>}</button></li>)}</ol>
      {!filtered.length && <p>没有找到这个主题，试试其他关键词。</p>}
    </aside><div className="tutorial-reading" id="tutorial-reading" tabIndex={-1}>
      <div key={current.id}>{current.id === grammarSampleId ? <GrammarSample {...audio} /> : current.id === 'foundation-sound-friction' ? <SoundSample {...audio} active={active && sounds && tutorialOpen} stopAudio={stopAudio} /> : <FoundationCard topic={current} {...audio} />}</div>
      <nav className="tutorial-next" aria-label="章节翻页">{index > 0 && <button type="button" onClick={() => choose(topics[index - 1].id)}>上一篇：{titleOf(topics[index - 1])}</button>}{index < topics.length - 1 && <button type="button" onClick={() => choose(topics[index + 1].id)}>接下来：{titleOf(topics[index + 1])}</button>}</nav>
    </div></div>;
  return <main hidden={!active} ref={contentRef} className="content foundation-tutorial" id="foundation-content">
    <header className="page-heading" ref={headingRef}><div><h1>{sounds ? '音标与发音' : '基础概念与语法'}</h1><p>{sounds ? '先听一个声音，再看怎样发音。全部音标都可以直接点读。' : '可以按推荐顺序阅读，也可以直接选一个想弄懂的主题。'}</p></div>{!sounds && <button className="daily-button" onClick={openVoice}>选择声音</button>}</header>
    {sounds ? <>
      <PhonemicChart speaking={audio.speaking} phonemeError={phonemeError} playPhoneme={(id, kind, slow) => { setTutorialOpen(false); playPhoneme(id, kind, slow); }} openTutorial={choose} />
      <details className="phonemic-tutorials" open={tutorialOpen} onToggle={event => { const next = event.currentTarget.open; if (next !== tutorialOpen) { stopAudio(); setTutorialOpen(next); } }}><summary>进一步学习：发音动作、重音与连读</summary>
        <div className="phonemic-tutorial-note"><p>以下教程例词沿用本站美式录音；上方音标表统一使用英式示范。</p><button className="daily-button" onClick={openVoice}>选择声音</button></div>
        {tutorial}
      </details>
    </> : tutorial}
  </main>;
}

export function FoundationHelp({ phrase, open }: { phrase: DailyPhrase; open: (id: string) => void }) {
  const reading = useReading();
  const guide = sentenceGuide(phrase);
  if (!guide) return null;
  return <section className="foundation-help" aria-label="例句讲解" data-guide-phrase={phrase.id}>
    <h2>{guide.parts.length === 1 ? '这句话怎么用' : '读懂这句'}</h2>
    <div className="foundation-guide-reading">
      <button type="button" className="foundation-english" aria-label={`朗读讲解例句 ${phrase.en}`} aria-pressed={reading.speaking === readingPlaybackKey(phrase.en)} onClick={() => reading.play(phrase.en, false)} lang="en">{phrase.en}</button>
      <button type="button" className="daily-inline-slow" aria-label={`慢速朗读讲解例句 ${phrase.en}`} aria-pressed={reading.speaking === readingPlaybackKey(phrase.en, true)} onClick={() => reading.play(phrase.en, true)}>慢速</button>
    </div>
    <dl className="foundation-guide-parts">{guide.parts.map((part, index) => <div key={index}><dt lang="en">{part.text}</dt><dd>{part.meaning}</dd></div>)}</dl>
    <p className="foundation-guide-tip">{guide.tip}</p>
    <button type="button" className="foundation-guide-link" onClick={() => open(`foundation-${guide.topic}`)}>进一步了解：{guide.link}<span aria-hidden="true"> →</span></button>
  </section>;
}
