import { useEffect, useRef, useState } from 'react';
import { androidRecognitionConstructor, isAndroidApp } from './nativeAndroid';
import { LocalQwenRecognition, qwenSession } from './localQwen';

type ResultEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; processLocally?: boolean; processingTimeoutMs?: number;
  onstart: (() => void) | null; onaudiostart: (() => void) | null; onaudioend: (() => void) | null;
  onresult: ((event: ResultEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionConstructor = { new(): Recognition; available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string> };
type Phase = 'idle' | 'starting' | 'listening' | 'processing';

function constructor(): RecognitionConstructor | undefined {
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return androidRecognitionConstructor() ?? scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed': return isAndroidApp() ? '麦克风权限未开启。请到手机设置的 CodeWords 应用权限中允许麦克风后重试。' : '麦克风权限未开启。请点击地址栏的网站权限，允许麦克风后重试。';
    case 'service-not-allowed': return isAndroidApp() ? '手机没有可用的英语语音识别服务。可在系统设置中安装或启用语音服务，也可使用“自己表达”继续练习。' : '浏览器没有允许语音识别服务。请检查浏览器设置，或使用“自己表达”继续练习。';
    case 'audio-capture': return '没有找到可用的麦克风。请检查设备连接和系统麦克风权限。';
    case 'network': return '语音识别服务连接失败。请检查网络后重试；这次没有判为读错。也可以切换到“自己表达”。';
    case 'local-service': return '本机识别服务连接失败。请重新运行“启动英语学习”后重试；这次没有判为读错。';
    case 'no-speech': return '没有识别到声音。请靠近麦克风，点击麦克风再读一次。';
    case 'language-not-supported': return isAndroidApp() ? '手机语音服务尚不支持英语。请在系统语音设置中启用英语，也可使用“自己表达”继续练习。' : '当前浏览器的识别服务不支持英语。请换用支持英语识别的浏览器，或使用“自己表达”。';
    default: return '这次未能完成识别，请重试；没有判为读错。';
  }
}

/** Prefer the optional on-device desktop recognizer; keep native/browser fallback. */
export function useSpeechRecognition(onFinal: (text: string, target: string) => void, beforeStart: () => void, isComplete: (text: string, target: string) => boolean) {
  const [supported, setSupported] = useState(() => window.isSecureContext && !!constructor());
  const [sessionToken, setSessionToken] = useState<string | undefined>();
  const [local, setLocal] = useState(false);
  const [activeLocal, setActiveLocal] = useState(false);
  const [activeQwen, setActiveQwen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const stopping = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbacks = useRef({ onFinal, beforeStart, isComplete });
  callbacks.current = { onFinal, beforeStart, isComplete };

  function clearTimer() { clearTimeout(timer.current); timer.current = undefined; }
  function abort() {
    const previous = recognition.current;
    recognition.current = null;
    stopping.current = null;
    clearTimer(); clearTimeout(limit.current);
    if (previous) {
      previous.onstart = previous.onaudiostart = previous.onaudioend = previous.onresult = previous.onerror = previous.onend = null;
      try { previous.abort(); } catch { /* Already stopped by the browser. */ }
    }
    setPhase('idle'); setInterim('');
  }

  useEffect(() => {
    let disposed = false;
    const Recognition = constructor();
    // Prefer an already-installed local English recognizer. Never silently download a language pack.
    if (Recognition?.available && 'processLocally' in new Recognition()) {
      void Recognition.available({ langs: ['en-US'], processLocally: true })
        .then(state => { if (!disposed) setLocal(state === 'available'); })
        .catch(() => { /* The browser service remains available as the explicit fallback. */ });
    }
    const onHidden = () => { if (document.hidden) abort(); };
    const onLeave = () => abort();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onLeave);
    return () => {
      disposed = true; abort();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onLeave);
    };
  }, []);

  useEffect(() => {
    if (sessionToken) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 60000;
    // The launcher opens the page before loading the CPU model. Discover it
    // when ready, and discover a new launch token after a service restart.
    async function probe() {
      const token = await qwenSession();
      if (disposed) return;
      if (token) { setSessionToken(token); setSupported(true); }
      else if (Date.now() < deadline) retry = setTimeout(() => { void probe(); }, 2000);
    }
    void probe();
    return () => { disposed = true; clearTimeout(retry); };
  }, [sessionToken]);

  function stop() {
    const current = recognition.current;
    if (!current || stopping.current === current) return;
    stopping.current = current;
    setPhase('processing'); clearTimer(); clearTimeout(limit.current);
    try { current.stop(); }
    catch { abort(); setError(speechErrorMessage('unknown')); return; }
    timer.current = setTimeout(() => { if (recognition.current === current) { abort(); setError('识别服务没有及时返回结果，请重试。'); } }, current.processingTimeoutMs ?? 8000);
  }

  function start(targetId: string) {
    if (!supported) return;
    abort(); callbacks.current.beforeStart();
    const Recognition = constructor();
    if (!sessionToken && !Recognition) return;
    const current: Recognition = sessionToken ? new LocalQwenRecognition(sessionToken) : new Recognition!();
    recognition.current = current;
    current.lang = 'en-US'; current.continuous = true; current.interimResults = true; current.maxAlternatives = 1;
    if (!sessionToken && 'processLocally' in current) current.processLocally = local;
    setActiveLocal(!!sessionToken || local);
    setActiveQwen(!!sessionToken);
    setTarget(targetId); setError(''); setInterim(''); setPhase('starting');
    let finalText = '';
    let failed = false;
    const live = () => recognition.current === current;
    current.onstart = () => { if (live() && stopping.current !== current) setPhase('starting'); };
    current.onaudiostart = () => {
      if (!live() || stopping.current === current) return;
      setPhase('listening'); clearTimer();
      limit.current = setTimeout(() => { if (live()) stop(); }, sessionToken ? 18000 : 40000);
    };
    current.onaudioend = () => {
      if (!live()) return;
      stopping.current = current;
      setPhase('processing'); clearTimer(); clearTimeout(limit.current);
      timer.current = setTimeout(() => { if (live()) { abort(); setError('识别服务没有及时返回结果，请重试。'); } }, current.processingTimeoutMs ?? 8000);
    };
    current.onresult = event => {
      if (!live()) return;
      const finals: string[] = [], temporary: string[] = [];
      for (const result of Array.from(event.results)) (result.isFinal ? finals : temporary).push(result[0].transcript);
      finalText = finals.join(' ').trim();
      setInterim([...finals, ...temporary].join(' '));
      // A final result can arrive after the user pressed Stop. Keep the end watchdog;
      // never issue a second stop or discard that final result.
      if (stopping.current === current) return;
      clearTimer();
      if (finalText && !temporary.length && callbacks.current.isComplete(finalText, targetId)) stop();
      else timer.current = setTimeout(() => { if (live()) stop(); }, 4500);
    };
    current.onerror = event => {
      if (!live()) return;
      if (sessionToken && event.error === 'network') setSessionToken(undefined);
      failed = true; setError(speechErrorMessage(sessionToken && event.error === 'network' ? 'local-service' : event.error));
      abort();
    };
    current.onend = () => {
      if (!live()) return;
      recognition.current = null; stopping.current = null; clearTimer(); clearTimeout(limit.current); setPhase('idle'); setInterim('');
      if (!failed && finalText) callbacks.current.onFinal(finalText.slice(0, 2000), targetId);
      else if (!failed) setError(speechErrorMessage('no-speech'));
    };
    timer.current = setTimeout(() => { if (live()) { abort(); setError('麦克风或识别服务没有启动。请检查麦克风权限后重试。'); } }, 15000);
    try { current.start(); }
    catch { abort(); setError(speechErrorMessage('unknown')); }
  }

  return { supported, local: phase === 'idle' ? !!sessionToken || local : activeLocal,
    qwen: phase === 'idle' ? !!sessionToken : activeQwen,
    phase, target, interim, error, start, stop, abort, busy: phase !== 'idle' };
}
