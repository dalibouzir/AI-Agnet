'use client';

import { useEffect, useRef, useState } from 'react';

type UseScrollRevealOptions = {
  threshold?: number;
  disabled?: boolean;
};

export function useScrollReveal<T extends HTMLElement>({
  threshold = 0.2,
  disabled = false,
}: UseScrollRevealOptions = {}) {
  const ref = useRef<T | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (disabled) {
      setIsVisible(true);
      setHasMounted(true);
      return;
    }

    setHasMounted(true);
    const target = ref.current;

    if (!target || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [threshold, disabled]);

  return { ref, visible: isVisible || !hasMounted };
}
