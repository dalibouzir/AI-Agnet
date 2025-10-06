'use client';
import { useEffect, useState } from 'react';
export default function usePrefersReducedMotion() {
  const [reduce, set] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    set(m.matches);
    const h = () => set(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return reduce;
}
