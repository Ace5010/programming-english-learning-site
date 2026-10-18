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

  function animateNavigation(button: HTMLElement, _direction: number) {
    const previousRect = targetBox ? marker!.getBoundingClientRect() : null;
    const navRect = nav.getBoundingClientRect();
    cancel(navAnimations);
    const next = place(button);
    if (previousRect && next.width > 0 && next.height > 0) {
      const dx = previousRect.left - navRect.left - nav.clientLeft + nav.scrollLeft - next.x;
      const dy = previousRect.top - navRect.top - nav.clientTop + nav.scrollTop - next.y;
      animate(marker, [{ transform: `translate(${dx}px,${dy}px) scaleX(${previousRect.width / next.width})` }, { transform: 'none' }], navAnimations,
        { duration: 420, easing: 'cubic-bezier(.18,.86,.3,1.08)' });
    }
  }

  function animateContent(direction: number, sectionChanged: boolean) {
    const content = contentRef.current;
    if (!content) return;
    const distance = window.innerWidth <= 640 ? 18 : 48;
    animate(headingRef.current, [{ opacity: .3, transform: `translateX(${direction * 18}px)` }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 350 });
    const panels = [...content.querySelectorAll<HTMLElement>('.course-current,.course-details,.daily-rail,.vocabulary-panel,.review-sidebar,.expression-review,.phonemic-groups,.phonemic-detail,.tutorial-directory,.tutorial-reading,.daily-study-card,.daily-exercise')]
      .filter(node => node.getClientRects().length && !node.closest('[hidden]')).slice(0, 6);
    if (!panels.length) panels.push(content);
    panels.forEach((panel, index) => animate(panel, [
      { opacity: .2, transform: sectionChanged ? `perspective(1000px) translateX(${direction * distance}px) rotateY(${direction * -3}deg) scale(.98)` : 'translateY(18px) scale(.99)' },
      { opacity: 1, transform: 'none' },
    ], contentAnimations, { duration: sectionChanged ? 560 : 360, delay: index * 35, fill: 'backwards', easing: 'cubic-bezier(.18,.86,.3,1.08)' }));
    const rows = [...content.querySelectorAll<HTMLElement>('.word-card,.daily-expression')].slice(0, 5);
    rows.forEach((row, index) => animate(row, [{ opacity: .2, transform: `translateX(${direction * 16}px)` }, { opacity: 1, transform: 'none' }], contentAnimations,
      { duration: 330, delay: index * 30, fill: 'backwards' }));
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
      const order = ['programming', 'daily', 'foundation'];
      const oldSection = lastSelection?.split('-')[0];
      const newSection = selection.split('-')[0];
      const sectionChanged = !!oldSection && oldSection !== newSection;
      const direction = (sectionChanged ? Math.sign(order.indexOf(newSection) - order.indexOf(oldSection!)) : Math.sign(nextIndex - lastIndex)) || 1;
      theme = nextTheme;
      lastSelection = selection;
      lastIndex = nextIndex;
      if (firstUpdate) { settle(true); return; }
      if (!changed && !themeChanged) return;
      cancel(contentAnimations);
      if (button) animateNavigation(button, direction);
      else settle(true);
      if (changed) animateContent(direction, sectionChanged);
      else if (themeChanged) animate(contentRef.current, [{ opacity: .45, transform: 'scale(.99)' }, { opacity: 1, transform: 'none' }], contentAnimations, { duration: 320 });
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
