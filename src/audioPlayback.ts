export type AudioEvent = 'playing' | 'ended' | 'stopped' | 'error';
export type NativeAudioHandle = { stop: () => void; setRate: (rate: number) => void };
export type NativeAudioStart = (url: string, rate: number, notify: (event: AudioEvent, code?: string) => void) => NativeAudioHandle | undefined;
type Request = { url: string; key: string; rate: number; playing: boolean; audio?: HTMLAudioElement; native?: NativeAudioHandle; timer?: ReturnType<typeof setTimeout> };

/** One current request. Loading taps are idempotent; stale callbacks never control a later clip. */
export class AudioPlayback {
  private current?: Request;
  private cache = new Map<string, HTMLAudioElement>();
  private notify: (key: string) => void;
  private onError: () => void;
  private nativeStart?: NativeAudioStart;
  private createAudio: (url: string) => HTMLAudioElement;
  constructor(
    notify: (key: string) => void,
    onError: () => void,
    nativeStart?: NativeAudioStart,
    createAudio: (url: string) => HTMLAudioElement = url => new Audio(url),
  ) { this.notify = notify; this.onError = onError; this.nativeStart = nativeStart; this.createAudio = createAudio; }

  preload(urls: string[]) { for (const url of urls.slice(0, 16)) this.element(url); }
  private element(url: string) {
    let audio = this.cache.get(url);
    if (!audio) {
      audio = this.createAudio(url);
      audio.preload = 'auto';
      this.cache.set(url, audio);
      audio.load();
    }
    this.cache.delete(url); this.cache.set(url, audio);
    for (const [key, item] of this.cache) {
      if (this.cache.size <= 32) break;
      if (item === this.current?.audio) continue;
      this.cache.delete(key); item.pause(); item.removeAttribute('src'); item.load();
    }
    return audio;
  }
  play(url: string, rate: number, key: string) {
    if (this.current?.url === url && this.current.rate === rate && this.current.key === key) {
      this.current.key = key;
      if (this.current.playing) this.notify(key);
      return;
    }
    this.stop();
    const request: Request = { url, rate, key, playing: false };
    this.current = request;
    const native = this.nativeStart?.(url, rate, (event, code) => {
      if (this.current !== request) return;
      if (event === 'playing') this.playing(request);
      else if (event === 'error' && code !== 'focus-denied') {
        // A device decoder/bridge failure may still be playable by WebView.
        clearTimeout(request.timer); request.native?.stop(); request.native = undefined;
        this.playWeb(request);
      } else if (event === 'error') this.fail(request);
      else this.stop();
    });
    if (native) {
      request.native = native;
      request.timer = setTimeout(() => {
        if (this.current !== request || request.playing) return;
        native.stop(); request.native = undefined; this.playWeb(request);
      }, 4500);
    } else this.playWeb(request);
  }
  private playing(request: Request) {
    if (this.current !== request) return;
    clearTimeout(request.timer); request.playing = true; this.notify(request.key);
  }
  private playWeb(request: Request) {
    if (this.current !== request) return;
    const audio = this.element(request.url);
    request.audio = audio;
    if (audio.error) audio.load();
    audio.currentTime = 0; audio.playbackRate = request.rate; audio.preservesPitch = true;
    audio.onplaying = () => this.playing(request);
    audio.onended = () => { if (this.current === request) this.stop(); };
    audio.onpause = () => { if (this.current === request && audio.paused) this.stop(); };
    audio.onerror = () => this.fail(request);
    audio.onwaiting = () => {
      if (this.current !== request) return;
      request.playing = false; this.notify(''); this.watch(request);
    };
    this.watch(request);
    // Keep play() in the click handler so browsers retain the user's activation.
    void audio.play().catch(() => this.fail(request));
  }
  private watch(request: Request) {
    clearTimeout(request.timer);
    request.timer = setTimeout(() => this.fail(request), 10000);
  }
  private fail(request: Request) {
    if (this.current !== request) return;
    this.cache.delete(request.url); this.stop(); this.onError();
  }
  setRate(rate: number, suffix: string) {
    const request = this.current;
    if (!request) return;
    request.rate = rate;
    if (request.key.startsWith('daily-')) request.key = request.key.replace(/-(normal|slow)$/, `-${suffix}`);
    if (request.audio) request.audio.playbackRate = rate;
    request.native?.setRate(rate);
    if (request.playing) this.notify(request.key);
  }
  stop() {
    const request = this.current;
    this.current = undefined;
    if (request) {
      clearTimeout(request.timer); request.native?.stop();
      if (request.audio) {
        request.audio.onplaying = request.audio.onended = request.audio.onerror = request.audio.onwaiting = request.audio.onpause = null;
        request.audio.pause();
      }
    }
    this.notify('');
  }
  dispose() {
    this.stop();
    for (const audio of this.cache.values()) { audio.removeAttribute('src'); audio.load(); }
    this.cache.clear();
  }
}
