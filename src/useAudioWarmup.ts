import { useEffect, useRef } from 'react';

/** Warm only visible/nearby recordings, including after scrolling or filtering. */
export function useAudioWarmup(files: string[], preload?: (files: string[]) => void) {
  const ref = useRef<HTMLElement>(null);
  const key = JSON.stringify(files);
  useEffect(() => {
    if (!ref.current || !preload) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        preload(JSON.parse(key) as string[]);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [key, preload]);
  return ref;
}
