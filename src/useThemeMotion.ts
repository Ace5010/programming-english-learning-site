import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

type ThemeMotionOptions = {
  theme: string;
  selection: string;
  navRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  headingRef: RefObject<HTMLElement | null>;
};

type MarkerBox = { x: number; y: number; width: number; height: number };
type MotionController = {
  update: (theme: string, selection: string) => void;
  replay: () => void;
  destroy: () => void;
};

function createMotionController(
  nav: HTMLElement,
  contentRef: RefObject<HTMLElement | null>,
  headingRef: RefObject<HTMLElement | null>,
): MotionController | null {
  const marker = nav.querySelector<HTMLElement>('.nav-marker');
  if (!marker) return null;
  const ink = marker.querySelector<HTMLElement>('.nav-marker-ink');
  const spray = marker.querySelector<HTMLElement>('.nav-marker-spray');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navAnimations = new Set<Animation>();
  const contentAnimations = new Set<Animation>();
  let theme = 'minimal';
  let lastSelection: string | undefined;
  let lastIndex = -1;
  let targetBox: MarkerBox | null = null;
  let resizeFrame = 0;
  let destroyed = false;

  const buttons = () => [...nav.querySelectorAll<HTMLElement>('.nav-item')];
  const activeButton = () => nav.querySelector<HTMLElement>('.nav-item[aria-current="page"]');
  const buttonBox = (button: HTMLElement): MarkerBox => ({
    x: button.offsetLeft, y: button.offsetTop,
    width: button.offsetWidth, height: button.offsetHeight,
  });

  function cancel(group: Set<Animation>) {
    group.forEach(animation => animation.cancel());
    group.clear();
  }

  function animate(
    element: HTMLElement | null,
    frames: Keyframe[],
    group: Set<Animation>,
    options: KeyframeAnimationOptions = {},
  ) {
    if (destroyed || preference.matches || !element?.isConnected
      || !element.getClientRects().length || typeof element.animate !== 'function') return;
    const animation = element.animate(frames, {
      duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)', ...options,
    });
    group.add(animation);
    animation.oncancel = () => group.delete(animation);
    animation.onfinish = () => {
      group.delete(animation);
      animation.cancel();
    };
  }

  function place(button: HTMLElement) {
    const box = buttonBox(button);
    Object.assign(marker!.style, {
      left: `${box.x}px`, top: `${box.y}px`,
      width: `${box.width}px`, height: `${box.height}px`, visibility: 'visible',
    });
    marker!.hidden = box.width === 0 || box.height === 0;
    targetBox = box;
    return box;
  }

  function settle(force = false) {
    if (destroyed) return;
    const button = activeButton();
    if (!button) {
      cancel(navAnimations);
      marker!.hidden = true;
      targetBox = null;
      return;
    }
    const next = buttonBox(button);
    // ResizeObserver also reports the initial box. Do not cancel a fresh
    // selection animation when its destination is already up to date.
    if (!force && targetBox && Object.keys(next).every(key =>
      next[key as keyof MarkerBox] === targetBox![key as keyof MarkerBox])) return;
    cancel(navAnimations);
    place(button);
  }

  function scheduleMeasure() {
    if (destroyed || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      settle();
    });
  }

  function animateNavigation(button: HTMLElement, direction: number) {
    const previousRect = targetBox ? marker!.getBoundingClientRect() : null;
    const navRect = nav.getBoundingClientRect();
    cancel(navAnimations);
    const next = place(button);
    if (preference.matches) return;

    if (previousRect && next.width > 0 && next.height > 0) {
      const dx = previousRect.left - navRect.left - nav.clientLeft + nav.scrollLeft - next.x;
      const dy = previousRect.top - navRect.top - nav.clientTop + nav.scrollTop - next.y;
      animate(marker, [
        { transform: `translate(${dx}px,${dy}px) scale(${previousRect.width / next.width},${previousRect.height / next.height})` },
        { transform: 'none' },
      ], navAnimations, { duration: theme === 'graffiti' ? 220 : 280 });
    }

    if (theme === 'sketch') {
      if (ink) ink.style.transformOrigin = direction > 0 ? 'left center' : 'right center';
      animate(ink, [
        { transform: 'rotate(-2deg) scaleX(.25)', opacity: .45 },
        { transform: 'rotate(-3deg) scaleX(1.04)', opacity: 1, offset: .76 },
        { transform: 'rotate(-2deg) scaleX(1)', opacity: 1 },
      ], navAnimations, { duration: 310 });
      animate(spray, [
        { opacity: 0, transform: 'rotate(-2deg) scaleX(.05)' },
        { opacity: .85, transform: 'rotate(-2deg) scaleX(1)', offset: .65 },
        { opacity: 0, transform: 'rotate(-2deg) scaleX(1)' },
      ], navAnimations, { duration: 340 });
      animate(button, [
        { transform: 'translateY(-2px) rotate(-1deg)' },
        { transform: 'translateY(1px) rotate(.3deg)', offset: .65 },
        { transform: 'none' },
      ], navAnimations);
    } else if (theme === 'print') {
      animate(ink, [
        { transform: 'translate(-2px,-4px) scale(1.06)', boxShadow: '5px 6px 0 #302338' },
        { transform: 'translate(2px,2px) scale(.97)', boxShadow: '0 0 0 #302338', offset: .5 },
        { transform: 'translate(-.5px,-1px) scale(1.02)', boxShadow: '4px 4px 0 #302338', offset: .78 },
        { transform: 'none', boxShadow: '3px 3px 0 #302338' },
      ], navAnimations, { duration: 300 });
      animate(button, [
        { transform: 'translateY(-2px)' },
        { transform: 'translateY(2px)', offset: .5 },
        { transform: 'none' },
      ], navAnimations, { duration: 300 });
    } else if (theme === 'graffiti') {
      if (ink) ink.style.transformOrigin = direction > 0 ? 'left center' : 'right center';
      animate(ink, [
        { transform: 'rotate(-7deg) scaleX(.1) scaleY(.65)', opacity: .65 },
        { transform: 'rotate(-3deg) scaleX(1.08) scaleY(1.08)', opacity: 1, offset: .67 },
        { transform: 'rotate(-3deg) scale(1)', opacity: 1 },
      ], navAnimations, { duration: 260 });
      animate(spray, [
        { opacity: 0, transform: 'scale(.65)' },
        { opacity: 1, transform: 'scale(1)', offset: .28 },
        { opacity: 0, transform: 'scale(1.18)' },
      ], navAnimations, { duration: 340 });
      animate(button, [
        { transform: `translateX(${direction * 3}px) rotate(-1deg)` },
        { transform: 'rotate(.4deg)', offset: .65 },
        { transform: 'none' },
      ], navAnimations, { duration: 270 });
    } else {
      animate(ink, [
        { transform: 'scale(.96)', opacity: .7 },
        { transform: 'scale(1)', opacity: 1 },
      ], navAnimations, { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
      animate(button, [{ opacity: .65 }, { opacity: 1 }], navAnimations, { duration: 200 });
    }
  }

  function animateContent(direction: number) {
    const panel = contentRef.current?.querySelector<HTMLElement>('.vocabulary-panel, .daily-panel') ?? null;
    const heading = headingRef.current;
    const sideways = (distance: number) => direction * Math.min(distance, window.innerWidth <= 640 ? 8 : distance);
    const cards = panel?.querySelectorAll<HTMLElement>('.word-card, .daily-lesson-row');
    const rows: HTMLElement[] = [];
    // The number of animated elements stays bounded even after "load more".
    for (let index = 0; cards && index < Math.min(cards.length, 6); index++) {
      const card = cards.item(index);
      if (card instanceof HTMLElement) rows.push(card);
    }
    if (!rows.length) {
      const empty = panel?.querySelector<HTMLElement>('.empty-state');
      if (empty) rows.push(empty);
    }
    if (theme === 'sketch') {
      animate(heading, [{ opacity: .55, transform: `translateX(${sideways(10)}px)` }, { opacity: 1, transform: 'none' }], contentAnimations);
      animate(panel, [{ opacity: .65, transform: `translateX(${sideways(14)}px)` }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 320 });
      rows.forEach((row, index) => animate(row, [{ opacity: .4, transform: `translateX(${direction * 10}px)` }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 210, delay: index * 22, fill: 'backwards' }));
    } else if (theme === 'print') {
      animate(heading, [{ opacity: .65, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(1px)', offset: .8 }, { opacity: 1, transform: 'none' }], contentAnimations);
      animate(panel, [{ opacity: .7, transform: 'translateY(12px) scale(.995)' }, { opacity: 1, transform: 'translateY(-2px) scale(1)', offset: .8 }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 300 });
      rows.forEach((row, index) => animate(row, [{ opacity: .5, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 210, delay: index * 20, fill: 'backwards' }));
    } else if (theme === 'graffiti') {
      animate(heading, [{ opacity: .6, transform: `translateX(${sideways(14)}px)` }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 240 });
      animate(panel, [{ opacity: .7, transform: `translateX(${sideways(18)}px) translateY(3px)` }, { opacity: 1, transform: 'none' }], contentAnimations);
      rows.forEach((row, index) => animate(row, [{ opacity: .4, transform: `translateX(${direction * 16}px)` }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 210, delay: index * 20, fill: 'backwards' }));
    } else {
      animate(heading, [{ opacity: .6, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 240 });
      animate(panel, [{ opacity: .65, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], contentAnimations, { easing: 'cubic-bezier(.22,1,.36,1)' });
      rows.forEach((row, index) => animate(row, [{ opacity: .5, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 210, delay: index * 18, fill: 'backwards' }));
    }
  }

  function onPreferenceChange() {
    cancel(contentAnimations);
    settle(true);
  }

  const observer = new ResizeObserver(scheduleMeasure);
  observer.observe(nav);
  buttons().forEach(button => observer.observe(button));
  window.addEventListener('resize', scheduleMeasure);
  preference.addEventListener('change', onPreferenceChange);
  document.fonts.ready.then(scheduleMeasure);
  document.fonts.addEventListener('loadingdone', scheduleMeasure);

  return {
    update(nextTheme, selection) {
      const firstUpdate = lastSelection === undefined;
      const changed = !firstUpdate && selection !== lastSelection;
      const themeChanged = theme !== nextTheme;
      const button = activeButton();
      const nextIndex = button ? buttons().indexOf(button) : -1;
      const direction = Math.sign(nextIndex - lastIndex) || 1;
      theme = nextTheme;
      lastSelection = selection;
      lastIndex = nextIndex;
      if (firstUpdate) { settle(true); return; }
      if (!changed && !themeChanged) return;
      cancel(contentAnimations);
      if (button) animateNavigation(button, direction);
      else settle(true);
      if (changed) animateContent(direction);
    },
    replay() {
      const button = activeButton();
      if (button && !destroyed) animateNavigation(button, 1);
    },
    destroy() {
      destroyed = true;
      cancel(navAnimations);
      cancel(contentAnimations);
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', scheduleMeasure);
      preference.removeEventListener('change', onPreferenceChange);
      document.fonts.removeEventListener('loadingdone', scheduleMeasure);
    },
  };
}

export function useThemeMotion({ theme, selection, navRef, contentRef, headingRef }: ThemeMotionOptions) {
  const controllerRef = useRef<MotionController | null>(null);

  useLayoutEffect(() => {
    if (!navRef.current) return;
    const controller = createMotionController(navRef.current, contentRef, headingRef);
    controllerRef.current = controller;
    return () => {
      controller?.destroy();
      controllerRef.current = null;
    };
  }, [navRef, contentRef, headingRef]);

  useLayoutEffect(() => {
    controllerRef.current?.update(theme, selection);
  }, [theme, selection, navRef, contentRef, headingRef]);

  const replay = useCallback(() => controllerRef.current?.replay(), []);
  return { replay };
}
