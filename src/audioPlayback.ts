export type AudioEvent = 'playing' | 'progress' | 'ended' | 'stopped' | 'error';
export type NativeAudioHandle = { stop: () => void; setRate: (rate: number) => void };
export type NativeAudioStart = (url: string, rate: number, notify: (event: AudioEvent, code?: string, positionMs?: number) => void) => NativeAudioHandle | undefined;
type Request = { url: string; key: string; rate: number; playing: boolean; transport: 'native' | 'web'; startedAt?: number; positionMs: number; audio?: HTMLAudioElement; native?: NativeAudioHandle; timer?: ReturnType<typeof setTimeout> };

/** Coalesce loading/double taps, but let a deliberate repeat retry even a broken player. */
export class AudioPlayback {
  private current?: Request;
  private cache = new Map<string, HTMLAudioElement>();
  private notify: (key: string) => void;
  private onError: () => void;
  private nativeStart?: NativeAudioStart;
  private createAudio: (url: string) => HTMLAudioElement;
  private busy: (value: boolean) => void;
  constructor(
    notify: (key: string) => void,
    onError: () => void,
    nativeStart?: NativeAudioStart,
    createAudio: (url: string) => HTMLAudioElement = url => new Audio(url),
    busy: (value: boolean) => void = () => {},
  ) { this.notify = notify; this.onError = onError; this.nativeStart = nativeStart; this.createAudio = createAudio; this.busy = busy; }

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
      if (this.current.startedAt === undefined || Date.now() - this.current.startedAt < 750) return;
    }
    this.stop();
    const request: Request = { url, rate, key, playing: false, transport: 'native', positionMs: 0 };
    this.current = request; this.busy(true);
    let native: NativeAudioHandle | undefined;
    try { native = this.nativeStart?.(url, rate, (event, code, positionMs) => {
      if (this.current !== request || request.transport !== 'native') return;
      if (event === 'playing') { this.playing(request); this.progress(request, positionMs); }
      else if (event === 'progress') this.progress(request, positionMs);
      else if (event === 'error' && code !== 'focus-denied') {
        // A device decoder/bridge failure may still be playable by WebView.
        this.fallback(request);
      } else if (event === 'error') this.fail(request);
      else this.stop();
    }); } catch { this.fallback(request); return; }
    if (native) {
      if (this.current !== request || request.transport !== 'native') { native.stop(); return; }
      request.native = native;
      if (!request.playing) this.watch(request, 4500);
    } else if (request.transport !== 'web') this.playWeb(request);
  }
  private playing(request: Request) {
    if (this.current !== request) return;
    if (!request.playing) this.watch(request, 2500);
    request.startedAt ??= Date.now(); request.playing = true; this.notify(request.key);
  }
  private progress(request: Request, positionMs?: number) {
    if (this.current !== request || typeof positionMs !== 'number' || !Number.isFinite(positionMs) || positionMs <= request.positionMs) return;
    request.positionMs = positionMs; this.watch(request, 2500);
  }
  private fallback(request: Request) {
    if (this.current !== request || request.transport !== 'native') return;
    request.transport = 'web'; // Invalidate even synchronous/late native replies before stopping.
    clearTimeout(request.timer); request.native?.stop(); request.native = undefined;
    request.playing = false; request.startedAt = undefined; request.positionMs = 0; this.notify('');
    this.playWeb(request);
  }
  private playWeb(request: Request) {
    if (this.current !== request) return;
    request.transport = 'web';
    try {
      const audio = this.element(request.url);
      request.audio = audio;
      if (audio.error) audio.load();
      audio.currentTime = 0; audio.playbackRate = request.rate; audio.preservesPitch = true;
      audio.onplaying = () => this.playing(request);
      audio.ontimeupdate = () => this.progress(request, audio.currentTime * 1000);
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
    } catch { this.fail(request); }
  }
  private watch(request: Request, timeout = 10000) {
    clearTimeout(request.timer);
    request.timer = setTimeout(() => {
      if (request.transport === 'native') this.fallback(request); else this.fail(request);
    }, timeout);
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
        request.audio.onplaying = request.audio.onended = request.audio.onerror = request.audio.onwaiting = request.audio.onpause = request.audio.ontimeupdate = null;
        request.audio.pause();
      }
    }
    this.busy(false); this.notify('');
  }
  dispose() {
    this.stop();
    for (const audio of this.cache.values()) { audio.removeAttribute('src'); audio.load(); }
    this.cache.clear();
  }
}
