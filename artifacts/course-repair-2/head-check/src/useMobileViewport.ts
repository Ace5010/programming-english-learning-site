import { useEffect } from 'react';

/** Keep focused answers above the soft keyboard and fixed exercise controls. */
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
        if (!window.matchMedia('(max-width: 950px), (pointer: coarse)').matches) return;
        const input = document.activeElement;
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !input.closest('.daily-question, .lesson-exercise')) return;
        const overlay = input.closest('.lesson-overlay');
        const footer = (overlay ?? input.closest('.daily-session'))?.querySelector('.lesson-footer, .daily-controls');
        if (!footer) return;
        const header = overlay?.querySelector('.lesson-header') ?? document.querySelector('.site-header');
        const top = (header?.getBoundingClientRect().bottom ?? 0) + 12;
        const bottom = footer.getBoundingClientRect().top - 12;
        const box = input.getBoundingClientRect();
        const delta = box.bottom > bottom ? box.bottom - bottom : box.top < top ? box.top - top : 0;
        if (!delta) return;
        const scrollArea = overlay?.querySelector('.lesson-stage');
        if (scrollArea) scrollArea.scrollBy({ top: delta, behavior: 'instant' });
        else window.scrollBy({ top: delta, behavior: 'instant' });
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.documentElement.style.removeProperty('--keyboard-inset');
    };
  }, []);
}
