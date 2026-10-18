import { useState } from 'react';
import { phonemes, phonemeGroups, phonemeAudioKey, phonemicSource, type PhonemeAudioKind } from './phonemeInventory';

export type PhonemicAudioProps = {
  playPhoneme: (id: string, kind: PhonemeAudioKind, slow?: boolean) => void;
  phonemeError: string;
};
type Props = PhonemicAudioProps & { speaking: string; openTutorial: (id: string) => void };

export default function PhonemicChart({ playPhoneme, phonemeError, speaking, openTutorial }: Props) {
  const [selected, setSelected] = useState('ee');
  const item = phonemes.find(sound => sound.id === selected)!;
  const comparison = phonemes.find(sound => sound.id === item.compare);
  const audible = phonemes.find(sound => speaking.startsWith(`phonetic-${sound.id}-`));
  const play = (id: string, kind: PhonemeAudioKind = 'sound', slow = false) => {
    setSelected(id); playPhoneme(id, kind, slow);
    if (window.matchMedia('(max-width: 1150px)').matches) requestAnimationFrame(() => {
      const detail = document.getElementById('phonemic-detail');
      detail?.scrollIntoView({ block: 'start' }); detail?.focus({ preventScroll: true });
    });
  };
  const playing = (id: string, kind: PhonemeAudioKind, slow = false) => speaking === phonemeAudioKey(id, kind, slow);
  return <section className="phonemic-chart" aria-label="英式英语音标表">
    <div className="phonemic-intro"><h2>英式英语音标表</h2><p>点音标听单音，点例词听完整单词。录音已保存在本地。</p></div>
    <div className="phonemic-workspace">
      <div className="phonemic-groups">{phonemeGroups.map(group => <section className={`phonemic-group phonemic-${group.id}`} key={group.id} aria-label={group.title}>
        <header><h3>{group.title}</h3><p>{group.description}</p></header>
        <div className="phonemic-grid">{phonemes.filter(sound => sound.group === group.id).map(sound => <div key={sound.id} className={`phonemic-cell${selected === sound.id ? ' selected' : ''}`} data-phoneme={sound.id} data-playing={playing(sound.id, 'sound') || playing(sound.id, 'sound', true)}>
          <button type="button" className="phonemic-symbol" aria-label={`听 /${sound.ipa}/ 单音`} aria-pressed={selected === sound.id} aria-controls="phonemic-detail" onClick={() => play(sound.id)}><span>/{sound.ipa}/</span></button>
          <button type="button" className="phonemic-slow" aria-label={`慢速听 /${sound.ipa}/ 单音`} aria-pressed={playing(sound.id, 'sound', true)} onClick={() => play(sound.id, 'sound', true)}>慢速</button>
        </div>)}</div>
      </section>)}</div>
      <aside className="phonemic-detail" id="phonemic-detail" tabIndex={-1} aria-label="所选音标的发音说明">
        <button type="button" className="phonemic-back" onClick={() => document.querySelector<HTMLButtonElement>(`[data-phoneme="${item.id}"] .phonemic-symbol`)?.focus()}>返回音标表</button>
        <div className="phonemic-detail-title"><h3>/{item.ipa}/</h3><span aria-live="polite">{audible ? `正在播放 /${audible.ipa}/` : '发音说明'}</span></div>
        <div className="phonemic-actions"><button type="button" onClick={() => play(item.id)} aria-pressed={playing(item.id, 'sound')}>听单音</button><button type="button" onClick={() => play(item.id, 'sound', true)} aria-pressed={playing(item.id, 'sound', true)}>慢速听</button></div>
        <p className="phonemic-instruction">{item.instruction}</p>
        <div className="phonemic-example"><h4>放进单词里听</h4><strong className="foundation-meaning">{item.meaning}</strong><div className="foundation-reading">
          <button type="button" className="foundation-english" lang="en" aria-label={`英式朗读 ${item.word}`} aria-pressed={playing(item.id, 'word')} onClick={() => play(item.id, 'word')}>{item.word}</button>
          <button type="button" className="daily-inline-slow" aria-label={`英式慢速朗读 ${item.word}`} aria-pressed={playing(item.id, 'word', true)} onClick={() => play(item.id, 'word', true)}>慢速</button>
        </div></div>
        {comparison && <div className="phonemic-compare"><h4>交替听，比较一下</h4>{[item, comparison].map(sound => <div className="phonemic-actions phonemic-pair" key={sound.id}>
          <button type="button" aria-label={`对比听 /${sound.ipa}/`} aria-pressed={playing(sound.id, 'sound')} onClick={() => playPhoneme(sound.id, 'sound')}>/{sound.ipa}/</button>
          <button type="button" aria-label={`慢速对比听 /${sound.ipa}/`} aria-pressed={playing(sound.id, 'sound', true)} onClick={() => playPhoneme(sound.id, 'sound', true)}>慢速</button>
          {sound.id !== item.id && <button type="button" onClick={() => play(sound.id)}>查看 /{sound.ipa}/</button>}
        </div>)}</div>}
        {(item.id === 'f' || item.id === 'v') && <button type="button" className="phonemic-tutorial-link" onClick={() => openTutorial('foundation-sound-friction')}>看 /f/ 与 /v/ 的详细讲解</button>}
        {phonemeError && <div className="phonemic-error" role="alert"><p>{phonemeError}</p><button type="button" onClick={() => play(item.id)}>重试单音</button><a href={phonemicSource} target="_blank" rel="noreferrer">到 Cambridge 原站听</a></div>}
      </aside>
    </div>
    <details className="phonemic-reference"><summary>这张表的范围与来源</summary>
      <p>采用传统英式教学的 44 音分组：12 个单元音、8 个双元音、24 个辅音。这是英语入门音素表，不是涵盖所有语言的国际音标总表。不同口音和词典的分组、符号可能不同，不用先背完整张表。</p>
      <p>符号、单音和例词对应 <a href={phonemicSource} target="_blank" rel="noreferrer">Cambridge 音标指南的 UK 录音</a>；单音与完整例词分开播放。中文发音提示由本站编写。按组点读的使用方式参考 <a href="https://learnenglish.britishcouncil.org/apps/learnenglish-sounds-right" target="_blank" rel="noreferrer">British Council Sounds Right</a>。</p>
      <p>部分辅音示范会带有短暂的过渡元音，跟读时不要刻意在词尾补“呃”。/e/ 在一些词典写作 /ɛ/；/r/ 在这里代表英语近音。/ɪə eə ʊə/ 的实际发音有口音差异。/tr dr ts dz/ 属于辅音组合，不作为四个额外单音加入。</p>
      <p>表内声音固定为英式，不受 Aria／Guy 选择影响。下方旧教程的例词仍是本站美式录音，并有相应标注。44 段单音和 44 段例词录音已随应用保存，播放时无需访问 Cambridge。外部参考链接和视频仍需联网。</p>
    </details>
  </section>;
}
