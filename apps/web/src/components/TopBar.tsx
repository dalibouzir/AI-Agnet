'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import { ButtonLink } from './Button';

const primaryActions = [
  { href: '/chat', label: 'Chat', key: 'chat', tone: 'primary' as const, shortcut: 'c' },
  { href: '/upload', label: 'Upload', key: 'upload', tone: 'secondary' as const, shortcut: 'u' },
  { href: '/pricing', label: 'Pricing', key: 'pricing', tone: 'secondary' as const, shortcut: 'p' },
  { href: '/docs', label: 'Docs', key: 'docs', tone: 'secondary' as const, shortcut: 'd' },
  { href: '/observability', label: 'Observability', key: 'observability', tone: 'secondary' as const, shortcut: 'o' },
];

type TopBarProps = {
  onToggleInfo?: () => void;
  infoOpen?: boolean;
  infoPanelId?: string;
};

const infoButtonClasses =
  'flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] text-sm text-muted transition-transform duration-200 ease-out hover:-translate-y-px hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]';

function InfoIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-current">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.75" />
      <rect x="7.25" y="6.25" width="1.5" height="5.5" rx="0.6" fill="currentColor" />
      <circle cx="8" cy="4.4" r="0.85" fill="currentColor" />
    </svg>
  );
}

export default function TopBar({ onToggleInfo, infoOpen = false, infoPanelId = 'model-info' }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const action = primaryActions.find((item) => item.shortcut === event.key.toLowerCase());
      if (!action) return;
      event.preventDefault();
      router.push(action.href);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-base)]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--topbar-height)] w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)] shadow-surface">
              <Image src="/logo.svg" alt="AI Business Agent" width={20} height={20} priority />
            </div>
          </div>
          <div className="flex flex-col">
            <Link href="/" className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">
              AI Business Agent
            </Link>
            <span className="text-[11px] uppercase tracking-[0.32em] text-muted">Neural operations</span>
          </div>
        </div>

        <div className="hidden items-center justify-center md:flex">
          <Link
            href="/"
            className={`rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.32em] transition-colors duration-200 ease-out ${
              pathname === '/'
                ? 'bg-[color:var(--surface-muted)] text-[color:var(--text-primary)] shadow-surface'
                : 'text-muted hover:text-[color:var(--text-primary)]'
            }`}
          >
            Overview
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            {primaryActions.map((action) => {
              const isActive = pathname === action.href;
              return (
                <ButtonLink
                  key={action.key}
                  href={action.href}
                  tone={action.tone}
                  className={`rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.28em] ${
                    isActive ? 'ring-2 ring-[color:var(--color-primary)] ring-offset-2 ring-offset-[color:var(--surface-muted)]' : ''
                  }`}
                >
                  {action.label}
                </ButtonLink>
              );
            })}
          </div>
          <ThemeToggle />
          <button
            type="button"
            aria-label={infoOpen ? 'Close model info panel' : 'Open model info panel'}
            aria-controls={onToggleInfo ? infoPanelId : undefined}
            aria-expanded={onToggleInfo ? infoOpen : undefined}
            onClick={onToggleInfo}
            disabled={!onToggleInfo}
            className={`${infoButtonClasses} ${infoOpen ? 'border-[color:var(--color-primary)] text-[color:var(--color-primary)]' : ''} ${
              onToggleInfo ? '' : 'cursor-default opacity-40'
            }`}
          >
            <InfoIcon />
          </button>
          <button
            type="button"
            aria-label="Open account menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] text-xs font-semibold uppercase tracking-[0.24em] text-muted transition-transform duration-200 ease-out hover:-translate-y-px hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]"
          >
            MA
          </button>
        </div>
      </div>
    </header>
  );
}
