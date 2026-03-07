/**
 * useThermalMonitor.ts — ZERØ ORDER BOOK v54
 *
 * FPS monitoring via RAF timestamps.
 * Kalau FPS drop < 20 → throttle factor 0.5 (reduce levels 50%)
 * Kalau FPS drop < 40 → throttle factor 0.8
 * Kalau FPS normal → throttle factor 1.0
 *
 * Dipakai di Index.tsx untuk pass ke useMultiExchangeWs levels.
 * rgba() only ✓ · cleanup on unmount ✓ · zero side effects ✓
 */
import { useEffect, useRef, useCallback } from 'react';

export type ThrottleFactor = 1.0 | 0.8 | 0.5;

export function useThermalMonitor(
  onThrottle: (factor: ThrottleFactor) => void,
  enabled = true,
): void {
  const rafRef       = useRef(0);
  const frameCount   = useRef(0);
  const lastTime     = useRef(performance.now());
  const factorRef    = useRef<ThrottleFactor>(1.0);
  const callbackRef  = useRef(onThrottle);
  callbackRef.current = onThrottle;

  const measure = useCallback(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;

    if (elapsed >= 2000) {
      const fps = (frameCount.current * 1000) / elapsed;
      frameCount.current = 0;
      lastTime.current   = now;

      let factor: ThrottleFactor = 1.0;
      if (fps < 20) factor = 0.5;
      else if (fps < 40) factor = 0.8;

      if (factor !== factorRef.current) {
        factorRef.current = factor;
        callbackRef.current(factor);
      }
    }

    rafRef.current = requestAnimationFrame(measure);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    rafRef.current = requestAnimationFrame(measure);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, measure]);
}
