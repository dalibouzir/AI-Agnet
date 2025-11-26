'use client';

import { ArrowRightCircle } from 'lucide-react';
import Panel from './Panel';
import ScrollReveal from './ScrollReveal';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';
import { useSectionScrollProgress } from '@/hooks/useSectionScrollProgress';

export type UseCaseCard = {
  title: string;
  description: string;
};

type StackedUseCaseCardsProps = {
  items: UseCaseCard[];
  isDesktop: boolean;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export default function StackedUseCaseCards({ items, isDesktop }: StackedUseCaseCardsProps) {
  const { ref, progress } = useSectionScrollProgress<HTMLDivElement>();
  const reduceMotion = usePrefersReducedMotion();
  const animated = !isDesktop || reduceMotion ? 1 : progress;

  return (
    <div ref={ref} className="relative">
      <div className="hidden lg:block lg:min-h-[520px] xl:min-h-[620px]">
        <div className="relative h-full w-full">
          {items.map((item, index) => {
            const cardProgress = clamp(animated * 1.1 - index * 0.12);
            const translateX = 80 * (1 - cardProgress);
            const translateY = -index * 12;
            const scale = 1 - index * 0.03 + cardProgress * 0.02;
            const opacity = 0.35 + cardProgress * 0.65;

            const style =
              isDesktop && !reduceMotion
                ? {
                    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
                    opacity,
                  }
                : undefined;

            return (
              <div
                key={item.title}
                className="absolute inset-x-0 w-full max-w-xl lg:ml-auto"
                style={{
                  top: `${index * 70}px`,
                  zIndex: items.length - index,
                  ...style,
                }}
              >
                <Panel
                  padding="none"
                  className="border border-[var(--border)] bg-[var(--panel-2)] p-6 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-primary)]">
                    <ArrowRightCircle className="h-4 w-4" aria-hidden />
                    <span>{item.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{item.description}</p>
                </Panel>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {items.map((item, index) => (
          <ScrollReveal key={item.title} direction="up" delay={index * 80}>
            <Panel
              padding="none"
              className="border border-[var(--border)] bg-[var(--panel-2)] p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-primary)]">
                <ArrowRightCircle className="h-4 w-4" aria-hidden />
                <span>{item.title}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
            </Panel>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
