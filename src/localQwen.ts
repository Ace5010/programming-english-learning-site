/** Optional on-device transcription for the desktop course. No answer is sent to the model. */
const SERVICE = 'http://127.0.0.1:18768';

type ResultEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Session = { ready: boolean; engine: string; token: string };

export async function qwenSession(): Promise<string | undefined> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;
  if (window.location.origin === 'https://appassets.androidplatform.net') return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`${SERVICE}/api/course-session`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return;
    const session = await response.json() as Session;
    if (session.ready && session.engine === 'qwen3-asr-trial-v1' && typeof session.token === 'string') return session.token;
  } catch { /* The browser's existing speech service remains available. */ }
  finally { clearTimeout(timeout); }
}

export class LocalQwenRecognition {
  lang = 'en-US'; continuous = false; interimResults = false; maxAlternatives = 1;
  processLocally = true;
  readonly processingTimeoutMs = 30000;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onaudioend: (() => void) | null = null;
  onresult: ((event: ResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private request: AbortController | null = null;
  private cancelled = false;
  private stopped = false;

  constructor(private token: string) {}

  start() {
    this.cancelled = false;
    this.stopped = false;
    this.onstart?.();
    void this.capture();
  }

  private async capture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = event => { if (!this.cancelled && event.data.size) chunks.push(event.data); };
      recorder.onstop = () => { if (!this.cancelled) void this.finish(new Blob(chunks, { type: recorder.mimeType })); };
      recorder.start();
      this.onaudiostart?.();
      if (this.stopped) recorder.stop();
    } catch (error) {
      if (this.cancelled) return;
      this.onerror?.({ error: error instanceof DOMException && error.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture' });
      this.onend?.();
    }
  }

  stop() {
    if (this.cancelled || this.stopped) return;
    this.stopped = true;
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  abort() {
    this.cancelled = true;
    this.request?.abort();
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }

  private async finish(blob: Blob) {
    this.onaudioend?.();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (!blob.size) { this.onerror?.({ error: 'no-speech' }); this.onend?.(); return; }
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      if (this.cancelled) return;
      const request = new AbortController();
      this.request = request;
      const response = await fetch(`${SERVICE}/api/course-transcribe`, {
        method: 'POST', cache: 'no-store', signal: request.signal,
        headers: { 'Content-Type': 'application/json', 'X-Local-Token': this.token },
        body: JSON.stringify({ audio: btoa(binary) }),
      });
      if (this.cancelled) return;
      const result = await response.json() as { status?: string; transcript?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'service-error');
      if (result.status === 'no-speech' || !result.transcript) this.onerror?.({ error: 'no-speech' });
      else this.onresult?.({ results: [{ isFinal: true, 0: { transcript: result.transcript } }] });
    } catch {
      if (!this.cancelled) this.onerror?.({ error: 'network' });
    } finally {
      if (!this.cancelled) this.onend?.();
    }
  }
}
