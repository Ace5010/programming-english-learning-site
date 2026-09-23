import type { NativeAudioStart } from './audioPlayback.ts';

/** Narrow native bridge, injected only into the APK's bundled HTTPS origin. */
type NativeMessage = { id: string; event: string; text?: string; code?: string };
type Bridge = { postMessage: (message: string) => void; onmessage: ((event: { data: string }) => void) | null };
const listeners = new Map<string, (message: NativeMessage) => void>();
let attached: Bridge | undefined;
let sequence = 0;

function bridge(): Bridge | undefined {
  if (typeof window === 'undefined' || window.location.origin !== 'https://appassets.androidplatform.net') return;
  const native = (window as unknown as { CodeWordsNative?: Bridge }).CodeWordsNative;
  if (!native || typeof native.postMessage !== 'function') return;
  if (attached !== native) {
    attached = native;
    native.onmessage = event => {
      try {
        const message: NativeMessage = JSON.parse(event.data);
        if (typeof message.id === 'string' && typeof message.event === 'string') listeners.get(message.id)?.(message);
      } catch { /* Ignore malformed native messages without changing learning data. */ }
    };
  }
  return native;
}

export const isAndroidApp = () => !!bridge();

let audioBridge: Bridge | undefined;
const audioListeners = new Map<string, (message: NativeMessage) => void>();
export const hasNativeAudio = () => typeof window !== 'undefined'
  && window.location.origin === 'https://appassets.androidplatform.net'
  && typeof (window as unknown as { CodeWordsAudio?: Bridge }).CodeWordsAudio?.postMessage === 'function';

export const startNativeAudio: NativeAudioStart = (url, rate, notify) => {
  if (!hasNativeAudio()) return;
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/^\/assets\/web\//, '');
  if (parsed.origin !== window.location.origin || !/^audio\/(?:daily\/)?(?:aria|guy)\/[a-z0-9-]+\.mp3$/.test(path)) return;
  const native = (window as unknown as { CodeWordsAudio: Bridge }).CodeWordsAudio;
  if (native !== audioBridge) {
    audioBridge = native;
    native.onmessage = event => {
      try { const message: NativeMessage = JSON.parse(event.data); audioListeners.get(message.id)?.(message); } catch { /* Ignore malformed replies. */ }
    };
  }
  const id = `audio-${++sequence}`;
  const send = (action: string, values = {}) => native.postMessage(JSON.stringify({ action, id, ...values }));
  audioListeners.set(id, message => {
    if (!['playing', 'ended', 'stopped', 'error'].includes(message.event)) return;
    if (message.event !== 'playing') audioListeners.delete(id);
    notify(message.event as 'playing' | 'ended' | 'stopped' | 'error', message.code);
  });
  send('play', { path, rate });
  return {
    stop: () => { audioListeners.delete(id); send('stop'); },
    setRate: next => send('rate', { rate: next }),
  };
};

export function downloadRecord(filename: string, content: string) {
  const native = bridge();
  if (native) {
    native.postMessage(JSON.stringify({ action: 'export', filename, content }));
    return;
  }
  if (window.location.origin === 'https://appassets.androidplatform.net') {
    window.alert('记录尚未导出。请先更新手机的 Android System WebView，再重试。');
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class AndroidRecognition {
  lang = 'en-US'; continuous = true; interimResults = true; maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onaudioend: (() => void) | null = null;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  private id = '';

  start() {
    const native = bridge();
    if (!native || this.id) throw new Error('Recognition is unavailable or already active');
    this.id = `speech-${++sequence}`;
    listeners.set(this.id, message => {
      switch (message.event) {
        case 'start': this.onstart?.(); break;
        case 'audio-start': this.onaudiostart?.(); break;
        case 'audio-end': this.onaudioend?.(); break;
        case 'partial': case 'result':
          if (typeof message.text === 'string') this.onresult?.({ results: [{ isFinal: message.event === 'result', 0: { transcript: message.text.slice(0, 2000) } }] });
          break;
        case 'error': this.onerror?.({ error: message.code || 'unknown' }); break;
        case 'end': this.release(); this.onend?.(); break;
      }
    });
    native.postMessage(JSON.stringify({ action: 'speech-start', id: this.id }));
  }
  stop() { if (this.id) bridge()?.postMessage(JSON.stringify({ action: 'speech-stop', id: this.id })); }
  abort() {
    if (this.id) bridge()?.postMessage(JSON.stringify({ action: 'speech-abort', id: this.id }));
    this.release();
  }
  private release() { listeners.delete(this.id); this.id = ''; }
}

export function androidRecognitionConstructor() { return isAndroidApp() ? AndroidRecognition : undefined; }
