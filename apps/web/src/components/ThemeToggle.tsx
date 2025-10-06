'use client';
import { useEffect, useMemo, useState } from 'react';
import { ThemeId, useTheme } from '@/app/(theme)/ThemeProvider';

export default function ThemeToggle() {
  const { theme, setTheme, options } = useTheme();
  const [open, setOpen] = useState(false);

  const activeTheme = useMemo(() => options.find((item) => item.id === theme), [options, theme]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleSelect = (id: ThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm font-semibold text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Theme
        <span
          className="h-6 w-10 rounded-md border border-[var(--border)] shadow-surface"
          style={{ background: activeTheme?.preview }}
          aria-hidden
        />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose theme"
            className="relative z-10 w-[min(420px,92%)] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-surface"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg text-[var(--text)]">Choose theme</h2>
                <p className="text-sm text-muted">5 dark • 4 light palettes</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full border border-[var(--border)] bg-[var(--panel-2)] text-lg text-muted transition hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {options.map((option) => {
                const isActive = option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option.id)}
                    className={`group relative flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all duration-fast ease-out focus-visible:[box-shadow:var(--focus)] ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--panel)] text-[var(--text)] shadow-surface'
                        : 'border-[var(--border)] bg-[var(--panel-2)] hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)]'
                    }`}
                    aria-pressed={isActive}
                  >
                    <span
                      className="block h-14 w-full rounded-lg"
                      style={{ background: option.preview }}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-[var(--text)]">{option.label}</span>
                    <span className="text-xs text-muted/75">{option.isDark ? 'Dark' : 'Light'}</span>
                    {isActive && (
                      <span className="absolute right-2 top-2 text-sm text-[var(--accent)]">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
