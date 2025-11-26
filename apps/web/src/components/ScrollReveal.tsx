'use client';

import { PropsWithChildren } from 'react';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';

type Direction = 'up' | 'down' | 'left' | 'right';

type ScrollRevealProps = PropsWithChildren<{
  direction?: Direction;
  delay?: number;
  className?: string;
}>;

export default function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  className,
}: ScrollRevealProps) {
  const reduceMotion = usePrefersReducedMotion();
  const { ref, visible } = useScrollReveal<HTMLDivElement>({ disabled: reduceMotion });

  const offsets: Record<Direction, string> = {
    up: 'translate-y-6',
    down: '-translate-y-6',
    left: '-translate-x-6',
    right: 'translate-x-6',
  };

  const hiddenClass = offsets[direction];

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out will-change-transform',
        visible ? 'opacity-100 translate-y-0 translate-x-0' : cn('opacity-0', hiddenClass),
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
