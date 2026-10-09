import { AudioPlayback } from './audioPlayback.ts';

export type FeedbackSound = 'correct' | 'complete' | 'pair';
export const FEEDBACK_SOUND_KEY = 'codewords-feedback-sound';
export const feedbackFiles: Record<FeedbackSound, string> = {
  correct: 'audio/feedback/correct.mp3',
  complete: 'audio/feedback/complete.mp3',
  pair: 'audio/feedback/pair.mp3',
};

type FeedbackCue = { sound: FeedbackSound; key: string; expires: number; retries: number };

/** Only explicit answer/completion actions call this; restoring state never does. */
export class FeedbackAudio {
  private played = new Set<string>();
  private player: AudioPlayback;
  private beforePlay: () => void;
  private url: (path: string) => string;
  private active = true;
  private pending?: FeedbackCue;
  private currentCue?: FeedbackCue;
  private timer?: ReturnType<typeof setTimeout>;
  private speechBusy: () => boolean;
  private busy: (value: boolean) => void;
  get enabled() { return this.active; }
  set enabled(value: boolean) { this.active = value; if (!value) this.stop(); }
  constructor(beforePlay: () => void, url: (path: string) => string, createAudio?: (url: string) => HTMLAudioElement, speechBusy = () => false, busy: (value: boolean) => void = () => {}) {
    this.beforePlay = beforePlay; this.url = url;
    this.speechBusy = speechBusy;
    this.busy = busy;
    this.player = new AudioPlayback(() => {}, key => this.retryCompletion(key), undefined, createAudio ?? (source => {
      const audio = new Audio(source); audio.volume = 0.8; return audio;
    }), value => this.busy(value || !!this.pending));
  }
  preload() { this.player.preload(Object.values(feedbackFiles).map(this.url)); }
  play(sound: FeedbackSound, eventId: string) {
    const key = `${sound}:${eventId}`;
    if (this.played.has(key)) return false;
    this.played.add(key);
    if (this.played.size > 256) this.played.delete(this.played.values().next().value!);
    if (!this.enabled) return false;
    clearTimeout(this.timer);
    this.currentCue = undefined;
    this.pending = { sound, key, expires: Date.now() + 10000, retries: 0 };
    this.busy(true);
    this.flush();
    return true;
  }
  private flush() {
    clearTimeout(this.timer);
    const pending = this.pending;
    if (!pending || !this.enabled) return;
    if (Date.now() >= pending.expires) { this.pending = undefined; this.busy(this.player.isBusy); return; }
    if (this.speechBusy()) { this.timer = setTimeout(() => this.flush(), 40); return; }
    this.pending = undefined;
    this.currentCue = pending;
    this.beforePlay();
    this.player.play(this.url(feedbackFiles[pending.sound]), 1, pending.key);
  }
  private retryCompletion(key?: string) {
    const cue = this.currentCue;
    if (!cue || cue.key !== key) return;
    this.currentCue = undefined;
    // Completion has no second user action to retry a transient media failure.
    // Retry once, but navigation, muting or a newer action still cancels it.
    if (!this.enabled || cue.sound !== 'complete' || cue.retries || this.pending || Date.now() >= cue.expires) return;
    this.pending = { ...cue, retries: 1 };
    this.busy(true);
    this.timer = setTimeout(() => this.flush(), 120);
  }
  stop() { clearTimeout(this.timer); this.pending = undefined; this.currentCue = undefined; this.player.stop(); }
  dispose() { this.stop(); this.player.dispose(); }
}
