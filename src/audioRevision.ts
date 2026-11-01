// Text can stay the same when its recording is corrected; invalidate both caches.
export const audioRevision = 'clear-20261101-v1';
export function revisedAudioURL(source: string) {
  const url = new URL(source);
  url.searchParams.set('audio', audioRevision);
  return url.href;
}
