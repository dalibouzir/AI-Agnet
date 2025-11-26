'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ThemePalette, ThemePaletteId, useTheme } from '@/app/(theme)/ThemeProvider';
import useFocusTrap from '@/hooks/useFocusTrap';

export default function ThemeToggle() {
  const { palette, palettes, setPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = `${useId()}-theme-popover`;

  useFocusTrap(open, popoverRef, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointer);
    return () => window.removeEventListener('pointerdown', handlePointer);
  }, [open]);

  const activePalette = useMemo(
    () => palettes.find((item) => item.id === palette) ?? palettes[0],
    [palette, palettes],
  );

  const handleSelect = (id: ThemePaletteId) => {
    setPalette(id);
    setOpen(false);
  };

  const renderPalette = (option: ThemePalette) => {
    const isActive = option.id === palette;
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => handleSelect(option.id)}
        className={`flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] p-2 transition-transform duration-200 ease-out focus-visible:[box-shadow:var(--focus-ring)] ${
          isActive ? 'border-[color:var(--color-primary)] shadow-surface' : 'hover:-translate-y-[1px]'
        }`}
        aria-pressed={isActive}
        aria-label={option.label}
      >
        <span className="sr-only">{option.label}</span>
        <span className="flex items-center gap-1.5" aria-hidden>
          {option.swatches.map((swatch, index) => (
            <span
              key={`${option.id}-swatch-${index}`}
              className="h-4 w-4 rounded-full border border-[color:var(--border-subtle)] shadow-surface"
              style={{ backgroundColor: swatch }}
            />
          ))}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="relative inline-flex">
        <button
          type="button"
          ref={buttonRef}
          onClick={() => setOpen((state) => !state)}
          className="inline-flex items-center gap-3 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.32em] text-muted transition-all duration-200 ease-out hover:-translate-y-px hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={popoverId}
        >
          Theme
          <span className="flex items-center gap-1" aria-hidden>
            {activePalette.swatches.map((swatch, index) => (
              <span
                key={`${activePalette.id}-badge-${index}`}
                className="h-3 w-3 rounded-full border border-[color:var(--border-subtle)] shadow-surface"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </span>
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              className="absolute right-0 top-[calc(100%+0.5rem)] z-[80] min-w-[176px] px-1 pb-1"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <motion.div
                ref={popoverRef}
                role="dialog"
                id={popoverId}
                aria-modal="true"
                tabIndex={-1}
                aria-label="Choose theme palette"
                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 py-3 shadow-[var(--shadow-elev)]"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <span className="sr-only" id={`${popoverId}-helper`}>
                  Select a theme palette. Use arrow keys or tab to navigate, enter to confirm.
                </span>
                <div className="grid grid-cols-3 gap-2" aria-describedby={`${popoverId}-helper`}>
                  {palettes.map(renderPalette)}
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
