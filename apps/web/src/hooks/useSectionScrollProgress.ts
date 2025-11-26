'use client';

import { useCallback, useEffect, useState } from 'react';

export function useSectionScrollProgress<T extends HTMLElement>() {
  const [target, setTarget] = useState<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!target || typeof window === 'undefined') return;

    let frame: number | null = null;
    let lastValue = -1;

    const clamp = (value: number) => Math.min(1, Math.max(0, value));

    const updateProgress = () => {
      frame = null;

      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const sectionHeight = rect.height + viewportHeight;
      const raw = (viewportHeight - rect.top) / sectionHeight;
      const next = clamp(raw);

      if (Math.abs(next - lastValue) > 0.01) {
        lastValue = next;
        setProgress(next);
      }
    };

    const handleScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [target]);

  const ref = useCallback((node: T | null) => {
    setTarget(node);
  }, []);

  return { ref, progress };
}
