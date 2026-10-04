import { Fragment, useEffect } from 'react';
import Icon from './Icon';
import ReadAloudText from './ReadAloud';
import { assessSpeech, MAX_SPEECH_ATTEMPTS } from './speechComparison';
import { useSpeechRecognition } from './useSpeechRecognition';
import { isAndroidApp } from './nativeAndroid';
import type { DailyExercise, DailyPhrase } from './dailyCourse';
import { recordSpeechTranscript, type DailyDraft } from './dailyProgress';

interface Props {
  exercise: DailyExercise;
  draft: DailyDraft;
  disabled: boolean;
  skipped: boolean;
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

export default function DailySpeaking({ exercise, draft, disabled, skipped, speaking, play, stopAudio, onChange, onBusyChange }: Props) {
  const mode = dailySpeakingMode(draft);
  const transcripts = draft.speech?.transcripts ?? {};
  const revealed = draft.speech?.revealed ?? [];
  const sources = draft.speech?.sources ?? {};
  const heard = draft.speech?.heard ?? [];
  const attempts = draft.speech?.attempts;
  const speech = useSpeechRecognition((text, id) => {
    if (disabled) return;
    onChange(recordSpeechTranscript(draft, id, text));
  }, stopAudio, (text, id) => {
    const target = exercise.readAloud?.find(phrase => phrase.id === id);
    return !!target && assessSpeech(target.en, text).accepted;
  });
  useEffect(() => { if (disabled || speaking) speech.abort(); }, [disabled, speaking]);
  useEffect(() => { onBusyChange(speech.busy); return () => onBusyChange(false); }, [speech.busy, onBusyChange]);

  function switchMode(next: 'read' | 'self') {
    const supportedSelf = next === 'self' && exercise.speechActivity !== 'answer' && !!exercise.speechActivity;
    speech.abort(); stopAudio(); onChange({ helped: draft.helped || exercise.speechActivity === 'answer' && next === 'read' || supportedSelf,
      speech: { mode: next, transcripts, revealed: supportedSelf ? [...new Set([...revealed, 'self'])] : revealed, heard, sources, attempts } });
  }
  function listen(phrase: DailyPhrase, slow = false) {
    speech.abort();
    onChange({ speech: { mode, transcripts, revealed, sources, attempts, heard: [...new Set([...heard, phrase.id])] } });
    play(phrase, slow);
  }
  function mic(id: string, label: string) {
    const isCurrent = speech.target === id;
    const busy = speech.busy && isCurrent;
    return <button type="button" className={`daily-button speech-mic${busy && speech.phase === 'listening' ? ' listening' : ''}`}
      data-speech-target={id} aria-label={busy ? `停止识别 ${exercise.speechSupport && exercise.speechSupport !== 'full' && !revealed.includes(id) ? '当前句子' : label}` : `开始跟读 ${exercise.speechSupport && exercise.speechSupport !== 'full' && !revealed.includes(id) ? '当前句子' : label}`}
      disabled={disabled || !speech.supported || speech.busy && !isCurrent || busy && speech.phase === 'processing'}
      onClick={() => busy ? speech.phase === 'starting' ? speech.abort() : speech.stop() : speech.start(id)}>
      <Icon name={busy ? 'stop' : 'mic'} />
      {busy ? speech.phase === 'starting' ? '取消等待' : speech.phase === 'processing' ? '正在识别…' : '读完了' : transcripts[id] || id === 'self' && draft.text ? '再读一次' : '点击开始说'}
    </button>;
  }
  const notice = <div className="speech-service-note">
    <p>{speech.supported ? speech.qwen ? '使用本机 Qwen3-ASR 识别，录音只在这台电脑处理且不保存；识别文字随进度保存。' : speech.local ? '使用设备上的英语识别。识别文字随进度保存，本站不保存录音。' : `使用${isAndroidApp() ? '手机系统' : '浏览器'}语音服务，声音可能发送至该服务。识别文字随进度保存，不保存录音。` : window.isSecureContext ? '当前浏览器不支持语音识别。可换用支持此功能的 Chrome，或选择“自己表达”继续。' : '麦克风需要安全连接。请使用 HTTPS 或本机 localhost 地址打开，或选择“自己表达”继续。'}</p>
  </div>;
  return <section className="daily-speaking" aria-label="口语练习">
    <div className="speech-mode" role="group" aria-label="口语练习方式">
      <button type="button" disabled={disabled} aria-pressed={mode === 'read'} onClick={() => switchMode('read')}>跟读示例</button>
      <button type="button" disabled={disabled} aria-pressed={mode === 'self'} onClick={() => switchMode('self')}>自己表达</button>
    </div>
    {notice}
    {exercise.speechQuestion && <div className="speech-actions" aria-label="听问题">
      <button type="button" className="daily-audio" onClick={() => listen(exercise.speechQuestion!)}><Icon name="sound" />听问题</button>
      <button type="button" className="daily-inline-slow" aria-label="慢速听问题" onClick={() => listen(exercise.speechQuestion!, true)}>慢速</button>
    </div>}
    {mode === 'read' ? <>
      <p className="speech-instruction">听示范，点击麦克风，逐句读出下面的表达。会结合整句语境容忍近音识别差异，只差一个词也可通过；仍不通过时最多尝试 3 次，再提示跳过。</p>
      <div className="speech-targets">{exercise.readAloud?.map(phrase => {
        const transcript = transcripts[phrase.id] ?? '';
        const result = transcript ? assessSpeech(phrase.en, transcript) : undefined;
        const comparison = result?.comparison;
        const accepted = result?.accepted;
        const current = speech.target === phrase.id && speech.busy;
        const playing = speaking === `daily-${phrase.id}-normal`;
        const concealed = exercise.speechSupport && exercise.speechSupport !== 'full' && !revealed.includes(phrase.id) && !accepted;
        const reference = exercise.speechSupport === 'hidden' ? '先听示范，再说出整句。' : phrase.en.split(/(\s+)/).map((word, index) => index % 4 === 0 && /[a-z]/i.test(word) ? '＿＿' : word).join('');
        return <article className={`speech-target${accepted ? ' matched' : ''}`} key={phrase.id} data-phrase-id={phrase.id}>
          <p className="speech-translation" lang="zh-CN"><ReadAloudText text={phrase.zh} beforeRead={speech.abort} /></p>
          <div className="speech-reference" lang="en">{concealed ? <span className="speech-concealed">{reference}</span> : comparison ? comparison.targetWords.map((word, index, words) => <Fragment key={index}>
            {phrase.en.slice(index ? words[index - 1].end : 0, word.start)}<span className={`speech-word ${word.status === 'matched' ? 'matched' : accepted ? 'accepted' : word.status}`} aria-label={`${word.text}：${word.status === 'matched' ? '已识别' : word.status === 'missing' ? '未识别到' : `识别为 ${word.heard.join(' ')}`}`}>{<ReadAloudText text={phrase.en.slice(word.start, word.end)} beforeRead={speech.abort} />}</span>{index === words.length - 1 ? phrase.en.slice(word.end) : ''}
          </Fragment>) : <ReadAloudText text={phrase.en} beforeRead={speech.abort} />}{accepted && <Icon name="check" />}</div>
          <div className="speech-actions"><button type="button" className={`daily-audio${playing ? ' playing' : ''}`} aria-label={`听示范 ${concealed ? '当前句子' : phrase.en}`} aria-pressed={playing} disabled={speech.busy} onClick={() => listen(phrase, false)}><Icon name="sound" />听示范</button><button type="button" className={`daily-inline-slow${speaking === `daily-${phrase.id}-slow` ? ' playing' : ''}`} aria-pressed={speaking === `daily-${phrase.id}-slow`} aria-label={`慢速朗读 ${concealed ? '当前句子' : phrase.en}`} disabled={speech.busy} onClick={() => listen(phrase, true)}>慢速</button>{mic(phrase.id, phrase.en)}{concealed && <button type="button" className="daily-button text" disabled={disabled || speech.busy} onClick={() => onChange({ helped: true, speech: { mode, transcripts, revealed: [...revealed, phrase.id], sources, heard, attempts } })}>显示文本</button>}</div>
          {!concealed && !!exercise.supportWords?.length && <details className="course-support-words"><summary>句中词语的含义</summary><ul>{exercise.supportWords.map(word => <li key={word.en}><ReadAloudText text={word.en} beforeRead={speech.abort} />：{word.zh}</li>)}</ul></details>}
          {current && <p className="speech-live" role="status">{speech.phase === 'listening' ? '正在听，请开口读…' : speech.phase === 'starting' ? '正在启动麦克风，请允许使用麦克风…' : '正在核对识别结果…'}{speech.interim && <span lang="en">{speech.interim}</span>}</p>}
          {comparison && <div className="speech-result" aria-live="polite"><p>{accepted ? result?.assessment === 'context' ? '这句通过了。已结合上下文容忍近音词的识别差异。' : result?.assessment === 'tolerated' ? '这句通过了。只差一个词，可以继续。' : sources[phrase.id] === 'recognition' ? '这句已识别完整。' : sources[phrase.id] === 'edited' ? '修正后的文字与参考句一致。' : '文字与参考句一致。' : skipped ? '这题先跳过，不必再读。' : `再试一次：还有内容未识别到（已尝试 ${attempts?.[phrase.id] ?? 0}/${MAX_SPEECH_ATTEMPTS} 次）。`}</p><p className="speech-transcript">{sources[phrase.id] === 'edited' ? '修正文字' : sources[phrase.id] === 'recognition' ? '识别到' : '保存文字'}：<span lang="en">{transcript}</span></p>
            <details><summary>修正识别文字</summary><textarea className="daily-write" rows={2} aria-label="修正识别文字" value={transcript} disabled={disabled || speech.busy} onChange={event => onChange({ speech: { mode, transcripts: { ...transcripts, [phrase.id]: event.target.value }, revealed, heard, sources: { ...sources, [phrase.id]: 'edited' }, attempts } })} /></details>
            {!accepted && (concealed ? <p>有些内容没有识别到，可以重听重录，或显示文本核对。</p> : <ul>{comparison.targetWords.filter(word => word.status !== 'matched').map((word, index) => <li key={index}>{word.status === 'missing' ? <>未识别到 <strong lang="en"><ReadAloudText text={word.text} beforeRead={speech.abort} /></strong></> : <><strong lang="en"><ReadAloudText text={word.text} beforeRead={speech.abort} /></strong> 被识别为 <span lang="en">{word.heard.join(' ')}</span></>}</li>)}{comparison.extras.map((word, index) => <li key={`extra-${index}`}>多识别到 <span lang="en">{word.text}</span></li>)}</ul>)}
          </div>}
        </article>;
      })}</div>
      <p className="daily-key-hint">第三次仍不通过会提示先跳过，由你点“继续”换题。权限、网络失败和空结果不占次数。</p>
    </> : <>
      <p className="speech-instruction">按题目说出自己的表达。点击麦克风转成文字，也可直接填写；自己的姓名和内容不必与示例相同。</p>
      <div className="speech-actions">{mic('self', '自己的表达')}</div>
      {speech.busy && <p className="speech-live" role="status">{speech.phase === 'listening' ? '正在听，请说出你的表达…' : '正在等待识别结果…'}<span lang="en">{speech.interim}</span></p>}
      <details open={!!draft.text} className="speech-edit"><summary>识别文字／改用文字输入</summary><label className="daily-input-label" htmlFor="daily-written-answer">我说的内容（识别有误可修改）</label>
      <textarea id="daily-written-answer" className="daily-write" rows={3} value={draft.text} disabled={disabled || speech.busy} autoComplete="off" spellCheck={false} onChange={event => onChange({ text: event.target.value, speech: { mode: 'self', transcripts, revealed, heard, sources: { ...sources, self: sources.self === 'recognition' || sources.self === 'edited' ? 'edited' : 'typed' }, attempts } })} /></details>
      <details open={revealed.includes('self')} className="daily-sample" onToggle={event => { if (event.currentTarget.open && !revealed.includes('self')) onChange({ helped: true, speech: { mode, transcripts, sources, heard, attempts, revealed: [...revealed, 'self'] } }); }}><summary>参考表达</summary><p lang="en"><ReadAloudText text={exercise.sample ?? ''} beforeRead={speech.abort} /></p>{exercise.readAloud?.map(phrase => <div key={phrase.id} className="daily-sample-audio"><button type="button" className={`daily-button${speaking === `daily-${phrase.id}-normal` ? ' playing' : ''}`} aria-label={`听参考表达 ${phrase.en}`} aria-pressed={speaking === `daily-${phrase.id}-normal`} onClick={() => listen(phrase, false)} disabled={speech.busy}><Icon name="sound" />{phrase.en}</button><button type="button" className={`daily-inline-slow${speaking === `daily-${phrase.id}-slow` ? ' playing' : ''}`} aria-label={`慢速参考表达 ${phrase.en}`} aria-pressed={speaking === `daily-${phrase.id}-slow`} onClick={() => listen(phrase, true)} disabled={speech.busy}>慢速</button></div>)}</details>
      <div className="daily-checks">{exercise.checks?.map((check, index) => <label key={check}><input type="checkbox" checked={draft.checks[index] ?? false} disabled={disabled || speech.busy} onChange={event => { const checks = [...draft.checks]; checks[index] = event.target.checked; onChange({ checks }); }} /><span>{check}</span></label>)}</div>
      <p className="daily-key-hint">自由表达由你核对意思，不自动评分。Ctrl + Enter 完成自查。</p>
    </>}
    {speech.error && <p className="daily-help speech-error" role="alert">{speech.error}</p>}
  </section>;
}
