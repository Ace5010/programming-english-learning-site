export type AudioEvent = 'playing' | 'progress' | 'gap' | 'ended' | 'stopped' | 'error';
export type AudioClip = { url: string; startMs: number; endMs: number; pauseMs: number };
export type NativeAudioHandle = { stop: () => void; setRate: (rate: number) => void };
export type NativeAudioStart = (url: string, rate: number, notify: (event: AudioEvent, code?: string, positionMs?: number) => void) => NativeAudioHandle | undefined;
export type NativeQueueStart = (clips: AudioClip[], rate: number, notify: Parameters<NativeAudioStart>[2]) => NativeAudioHandle | undefined;
type Request = { url: string; key: string; rate: number; playing: boolean; transport: 'native' | 'web'; startedAt?: number; positionMs: number; audio?: HTMLAudioElement; native?: NativeAudioHandle; timer?: ReturnType<typeof setTimeout>; queue?: AudioClip[]; index?: number; step?: number; gap?: ReturnType<typeof setTimeout>; boundary?: ReturnType<typeof setTimeout> };

/** Coalesce loading/double taps, but let a deliberate repeat retry even a broken player. */
export class AudioPlayback {
  private current?: Request;
  private cache = new Map<string, HTMLAudioElement>();
  private notify: (key: string) => void;
  private onError: (key?: string) => void;
  private nativeStart?: NativeAudioStart;
  private createAudio: (url: string) => HTMLAudioElement;
  private busy: (value: boolean) => void;
  private nativeQueue?: NativeQueueStart;
  get isBusy() { return this.current !== undefined; }
  constructor(
    notify: (key: string) => void,
    onError: (key?: string) => void,
    nativeStart?: NativeAudioStart,
    createAudio: (url: string) => HTMLAudioElement = url => new Audio(url),
    busy: (value: boolean) => void = () => {},
    nativeQueue?: NativeQueueStart,
  ) { this.notify = notify; this.onError = onError; this.nativeStart = nativeStart; this.createAudio = createAudio; this.busy = busy; this.nativeQueue = nativeQueue; }

  preload(urls: string[]) { for (const url of urls.slice(0, 16)) this.element(url); }
  preloadQueue(clips: AudioClip[]) { for (const url of [...new Set(clips.map(clip => clip.url))].slice(0, 32)) this.element(url); }
  playQueue(clips: AudioClip[], rate: number, key: string) {
    if (!clips.length || clips.some(c => !Number.isFinite(c.startMs) || !Number.isFinite(c.endMs) || c.startMs < 0 || c.endMs <= c.startMs || !Number.isFinite(c.pauseMs) || c.pauseMs < 0 || c.pauseMs > 550)) {
      this.stop(); this.onError(key); return;
    }
    const identity = JSON.stringify(clips);
    if (this.current?.url === identity && this.current.key === key && (this.current.startedAt === undefined || Date.now() - this.current.startedAt < 750)) return;
    this.stop();
    const request: Request = { url: identity, key, rate, playing: false, transport: 'native', positionMs: 0, queue: clips, index: 0, step: 0 };
    this.current = request; this.busy(true);
    try {
      const handle = this.nativeQueue?.(clips, rate, (event, _code, position) => {
        if (this.current !== request) return;
        if (event === 'playing') { this.playing(request); this.watch(request, 2500); }
        else if (event === 'progress') this.progress(request, position);
        else if (event === 'gap') this.watch(request, 4500);
        else if (event === 'error') this.fail(request);
        else this.stop();
      });
      if (handle) {
        if (this.current !== request) { handle.stop(); return; }
        request.native = handle; this.watch(request, 4500); return;
      }
      request.transport = 'web';
      this.preloadQueue(clips);
      // Reuse this same media element for every segment in the user-initiated task.
      request.audio = this.createAudio(clips[0].url);
      request.audio.preload = 'auto';
      this.playSegment(request);
    } catch { this.fail(request); }
  }
  private playSegment(request: Request) {
    if (this.current !== request || !request.queue || !request.audio) return;
    const clip = request.queue[request.index!], audio = request.audio, step = ++request.step!;
    const valid = () => this.current === request && request.step === step;
    const advance = () => {
      if (!valid()) return;
      request.step!++; clearTimeout(request.timer); clearTimeout(request.boundary);
      audio.onpause = audio.onended = audio.onplaying = audio.ontimeupdate = audio.onerror = audio.onwaiting = audio.onloadedmetadata = null;
      audio.pause();
      if (request.index! + 1 === request.queue!.length) { this.stop(); return; }
      request.index!++;
      request.gap = setTimeout(() => this.playSegment(request), clip.pauseMs);
    };
    const poll = () => {
      if (!valid()) return;
      if (audio.currentTime * 1000 >= clip.endMs) { advance(); return; }
      this.progress(request, audio.currentTime * 1000 - clip.startMs);
      request.boundary = setTimeout(poll, 15);
    };
    try {
      request.positionMs = 0;
      if (audio.src !== clip.url) { audio.src = clip.url; audio.load(); }
      audio.currentTime = clip.startMs / 1000;
      audio.playbackRate = request.rate; audio.preservesPitch = true;
      audio.onloadedmetadata = () => { if (valid()) audio.currentTime = clip.startMs / 1000; };
      audio.onplaying = () => { if (valid()) { this.playing(request); clearTimeout(request.boundary); poll(); } };
      audio.onended = () => { if (valid()) { if (audio.currentTime * 1000 + 80 < clip.endMs) this.fail(request); else advance(); } };
      audio.onpause = () => { if (valid() && !audio.ended && audio.currentTime * 1000 < clip.endMs) this.stop(); };
      audio.onerror = () => { if (valid()) this.fail(request); };
      audio.onwaiting = () => { if (valid()) this.watch(request); };
      this.watch(request);
      void audio.play().catch(() => { if (valid()) this.fail(request); });
    } catch { if (valid()) this.fail(request); }
  }
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
      if (request.transport === 'native' && !request.queue) this.fallback(request); else this.fail(request);
    }, timeout);
  }
  private fail(request: Request) {
    if (this.current !== request) return;
    this.cache.delete(request.url); this.stop(); this.onError(request.key);
  }
  setRate(rate: number, suffix: string) {
    const request = this.current;
    if (!request) return;
    if (request.queue) { if (rate !== request.rate) this.stop(); return; }
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
      clearTimeout(request.timer); clearTimeout(request.gap); clearTimeout(request.boundary); request.native?.stop();
      if (request.audio) {
        request.audio.onplaying = request.audio.onended = request.audio.onerror = request.audio.onwaiting = request.audio.onpause = request.audio.ontimeupdate = null;
        request.audio.onloadedmetadata = null;
        request.audio.pause();
        if (request.queue) { request.audio.removeAttribute('src'); request.audio.load(); }
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
