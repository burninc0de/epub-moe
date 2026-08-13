import { useCallback, useEffect, useState, type RefObject } from 'react';

const MIN_FONT_SCALE = 0.5;
const MAX_FONT_SCALE = 2.5;

export { MIN_FONT_SCALE, MAX_FONT_SCALE };

type SetFontScale = (scale: number | ((prev: number) => number)) => void;

export const useZoomWheel = (
  ref: RefObject<HTMLElement | null>,
  storageKey: string,
  enabled = true,
): { fontScale: number; setFontScale: SetFontScale } => {
  const [fontScale, setFontScaleState] = useState(() => {
    const stored = parseFloat(localStorage.getItem(storageKey) ?? '');
    if (!Number.isFinite(stored)) return 1;
    return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, stored));
  });

  const setFontScale = useCallback<SetFontScale>((scale) => {
    setFontScaleState((prev) => {
      const resolved = typeof scale === 'function' ? scale(prev) : scale;
      const next = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, resolved));
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      setFontScale((prev) => prev + step);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [ref, enabled, setFontScale]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        setFontScale(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, setFontScale]);

  return { fontScale, setFontScale };
};
