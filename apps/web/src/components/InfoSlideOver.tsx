'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import useFocusTrap from '@/hooks/useFocusTrap';

export type InfoMetric = {
  label: string;
  value: string;
};

type InfoSlideOverProps = {
  id: string;
  open: boolean;
  onClose: () => void;
  status: 'idle' | 'loading';
  metrics: InfoMetric[];
  knowledgeSources: string[];
  lastPrompt?: string | null;
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0 },
};

export default function InfoSlideOver({
  id,
  open,
  onClose,
  status,
  metrics,
  knowledgeSources,
  lastPrompt,
}: InfoSlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const statusTone = useMemo(() => {
    if (status === 'loading') return 'bg-[color:var(--color-primary)]/16 text-[color:var(--color-primary)]';
    return 'bg-[color:var(--surface-muted)] text-muted';
  }, [status]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex justify-end"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.button
            type="button"
            aria-hidden
            className="absolute inset-0 bg-[color:var(--bg-overlay)] transition-opacity"
            variants={overlayVariants}
            onClick={onClose}
            tabIndex={-1}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            id={id}
            ref={panelRef}
            tabIndex={-1}
            className="relative flex h-full w-full max-w-md flex-col border-l border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] px-6 pb-10 pt-8 shadow-[var(--shadow-elev)]"
            variants={panelVariants}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-muted">Model context</p>
                <h2 id={`${id}-title`} className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
                  Active run insights
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] text-sm text-muted transition-colors duration-200 ease-out hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]"
                aria-label="Close model context panel"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex flex-1 flex-col gap-6 overflow-y-auto pr-1">
              <section>
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Session status</p>
                <div className="mt-3 flex flex-col gap-3">
                  <span
                    className={`inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] transition-colors duration-200 ease-out ${statusTone}`}
                  >
                    <span className="flex h-2 w-2 items-center justify-center" aria-hidden>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          status === 'loading'
                            ? 'animate-ping bg-[color:var(--color-primary)]'
                            : 'bg-[color:var(--color-primary)]/35'
                        }`}
                      />
                    </span>
                    {metrics.find((metric) => metric.label === 'Status')?.value ?? 'Unknown'}
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {metrics.map((metric) =>
                      metric.label === 'Status' ? null : (
                        <div
                          key={metric.label}
                          className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-3 shadow-surface"
                        >
                          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">{metric.label}</p>
                          <p className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">{metric.value}</p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </section>

              <section>
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Knowledge sources</p>
                {knowledgeSources.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-3 text-sm text-muted">
                    No knowledge references in the latest response.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-[color:var(--text-primary)]">
                    {knowledgeSources.map((source) => (
                      <li
                        key={source}
                        className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)] px-3 py-2 shadow-surface"
                      >
                        {source}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Last prompt</p>
                <p className="mt-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-3 text-sm text-[color:var(--text-primary)]">
                  {lastPrompt && lastPrompt.trim().length > 0 ? lastPrompt : 'Send a prompt to begin.'}
                </p>
              </section>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
