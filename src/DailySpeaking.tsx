import { Fragment, useEffect } from 'react';
import Icon from './Icon';
import { compareSpeech } from './speechComparison';
import { useSpeechRecognition } from './useSpeechRecognition';
import type { DailyExercise, DailyPhrase } from './dailyCourse';
import type { DailyDraft } from './dailyProgress';

interface Props {
  exercise: DailyExercise;
  draft: DailyDraft;
  disabled: boolean;
  speaking: string;
  speed: 'normal' | 'slow';
  play: (phrase: DailyPhrase, slow?: boolean) => void;
  stopAudio: () => void;
  onChange: (draft: Partial<DailyDraft>) => void;
  onBusyChange: (busy: boolean) => void;
}

export function dailySpeakingMode(draft: DailyDraft) {
  return draft.speech?.mode ?? (draft.text || draft.checks.some(Boolean) ? 'self' : 'read');
}

export default function DailySpeaking({ exercise, draft, disabled, speaking, speed, play, stopAudio, onChange, onBusyChange }: Props) {
  const mode = dailySpeakingMode(draft);
  const transcripts = draft.speech?.transcripts ?? {};
  const speech = useSpeechRecognition((text, id) => {
    if (disabled) return;
    if (id === 'self') onChange({ text, speech: { mode: 'self', transcripts } });
    else onChange({ speech: { mode: 'read', transcripts: { ...transcripts, [id]: text } } });
  }, stopAudio, (text, id) => {
    const target = exercise.readAloud?.find(phrase => phrase.id === id);
    return !!target && compareSpeech(target.en, text).allMatched;
  });
  useEffect(() => { if (disabled || speaking) speech.abort(); }, [disabled, speaking]);
  useEffect(() => { onBusyChange(speech.busy); return () => onBusyChange(false); }, [speech.busy, onBusyChange]);

  function switchMode(next: 'read' | 'self') {
    speech.abort(); stopAudio(); onChange({ speech: { mode: next, transcripts } });
  }
  function listen(phrase: DailyPhrase, slow?: boolean) { speech.abort(); play(phrase, slow); }
  function mic(id: string, label: string) {
    const isCurrent = speech.target === id;
    const busy = speech.busy && isCurrent;
    return <button type="button" className={`daily-button speech-mic${busy && speech.phase === 'listening' ? ' listening' : ''}`}
      data-speech-target={id} aria-label={busy ? `停止识别 ${label}` : `开始跟读 ${label}`}
      disabled={disabled || !speech.supported || speech.busy && !isCurrent || busy && speech.phase === 'processing'}
      onClick={() => busy ? speech.phase === 'starting' ? speech.abort() : speech.stop() : speech.start(id)}>
      <Icon name={busy ? 'stop' : 'mic'} />
      {busy ? speech.phase === 'starting' ? '取消等待' : speech.phase === 'processing' ? '正在识别…' : '读完了' : transcripts[id] || id === 'self' && draft.text ? '再读一次' : '点击开始说'}
    </button>;
  }
  const notice = <div className="speech-service-note">
    <p>{speech.supported ? speech.local ? '使用设备上的英语识别。识别文字随进度保存，本站不保存录音。' : '使用浏览器语音服务，声音可能发送至该服务。识别文字随进度保存，本站不保存录音。' : window.isSecureContext ? '当前浏览器不支持语音识别。可换用支持此功能的 Chrome，或选择“自己表达”继续。' : '麦克风需要安全连接。请使用 HTTPS 或本机 localhost 地址打开，或选择“自己表达”继续。'}</p>
  </div>;
  return <section className="daily-speaking" aria-label="口语练习">
    <div className="speech-mode" role="group" aria-label="口语练习方式">
      <button type="button" disabled={disabled} aria-pressed={mode === 'read'} onClick={() => switchMode('read')}>跟读示例</button>
      <button type="button" disabled={disabled} aria-pressed={mode === 'self'} onClick={() => switchMode('self')}>自己表达</button>
    </div>
    {notice}
    {mode === 'read' ? <>
      <p className="speech-instruction">听示范，点击麦克风，逐句读出下面的表达。说自己的姓名或内容时，选择“自己表达”。</p>
      <div className="speech-targets">{exercise.readAloud?.map(phrase => {
        const transcript = transcripts[phrase.id] ?? '';
        const comparison = transcript ? compareSpeech(phrase.en, transcript) : undefined;
        const current = speech.target === phrase.id && speech.busy;
        const playing = speaking === `daily-${phrase.id}-${speed}`;
        return <article className={`speech-target${comparison?.allMatched ? ' matched' : ''}`} key={phrase.id} data-phrase-id={phrase.id}>
          <div className="speech-reference" lang="en">{comparison ? comparison.targetWords.map((word, index, words) => <Fragment key={index}>
            {phrase.en.slice(index ? words[index - 1].end : 0, word.start)}<span className={`speech-word ${word.status}`} aria-label={`${word.text}：${word.status === 'matched' ? '已识别' : word.status === 'missing' ? '未识别到' : `识别为 ${word.heard.join(' ')}`}`}>{phrase.en.slice(word.start, word.end)}</span>{index === words.length - 1 ? phrase.en.slice(word.end) : ''}
          </Fragment>) : phrase.en}{comparison?.allMatched && <Icon name="check" />}</div>
          <p className="speech-translation">{phrase.zh}</p>
          <div className="speech-actions"><button type="button" className={`daily-audio${playing ? ' playing' : ''}`} aria-label={`听示范 ${phrase.en}`} aria-pressed={playing} disabled={speech.busy} onClick={() => listen(phrase)}><Icon name="sound" />听示范</button><button type="button" className={`daily-button text${speaking === `daily-${phrase.id}-slow` ? ' playing' : ''}`} aria-pressed={speaking === `daily-${phrase.id}-slow`} aria-label={`慢速示范 ${phrase.en}`} disabled={speech.busy} onClick={() => listen(phrase, true)}>慢速</button>{mic(phrase.id, phrase.en)}</div>
          {current && <p className="speech-live" role="status">{speech.phase === 'listening' ? '正在听，请开口读…' : speech.phase === 'starting' ? '正在启动麦克风，请允许浏览器使用麦克风…' : '正在核对识别结果…'}{speech.interim && <span lang="en">{speech.interim}</span>}</p>}
          {comparison && <div className="speech-result" aria-live="polite"><p>{comparison.allMatched ? '这句已识别完整。' : '再试一次：下面是识别结果与参考句的差异。'}</p><p className="speech-transcript">识别到：<span lang="en">{transcript}</span></p>
            {!comparison.allMatched && <ul>{comparison.targetWords.filter(word => word.status !== 'matched').map((word, index) => <li key={index}>{word.status === 'missing' ? <>未识别到 <strong lang="en">{word.text}</strong></> : <><strong lang="en">{word.text}</strong> 被识别为 <span lang="en">{word.heard.join(' ')}</span></>}</li>)}{comparison.extras.map((word, index) => <li key={`extra-${index}`}>多识别到 <span lang="en">{word.text}</span></li>)}</ul>}
          </div>}
        </article>;
      })}</div>
      <p className="daily-key-hint">核对的是识别文字，不是发音分数。若识别不准确，可以重读；持续不可用时可选择“自己表达”自查完成。</p>
    </> : <>
      <p className="speech-instruction">按题目说出自己的表达。点击麦克风转成文字，也可直接填写；自己的姓名和内容不必与示例相同。</p>
      <div className="speech-actions">{mic('self', '自己的表达')}</div>
      {speech.busy && <p className="speech-live" role="status">{speech.phase === 'listening' ? '正在听，请说出你的表达…' : '正在等待识别结果…'}<span lang="en">{speech.interim}</span></p>}
      <label className="daily-input-label" htmlFor="daily-written-answer">我说的内容（识别有误可修改）</label>
      <textarea id="daily-written-answer" className="daily-write" rows={3} value={draft.text} disabled={disabled || speech.busy} autoComplete="off" spellCheck={false} onChange={event => onChange({ text: event.target.value, speech: { mode: 'self', transcripts } })} />
      <details className="daily-sample"><summary>参考表达</summary><p lang="en">{exercise.sample}</p>{exercise.readAloud?.map(phrase => <button key={phrase.id} type="button" className="daily-button" onClick={() => listen(phrase)} disabled={speech.busy}><Icon name="sound" />{phrase.en}</button>)}</details>
      <div className="daily-checks">{exercise.checks?.map((check, index) => <label key={check}><input type="checkbox" checked={draft.checks[index] ?? false} disabled={disabled || speech.busy} onChange={event => { const checks = [...draft.checks]; checks[index] = event.target.checked; onChange({ checks }); }} /><span>{check}</span></label>)}</div>
      <p className="daily-key-hint">自由表达由你核对意思，不自动评分。Ctrl + Enter 完成自查。</p>
    </>}
    {speech.error && <p className="daily-help speech-error" role="alert">{speech.error}</p>}
  </section>;
}
