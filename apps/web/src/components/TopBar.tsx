'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ButtonLink } from './Button';
import ThemeToggle from './ThemeToggle';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const navItems = [
  { href: '/#how-it-works', label: 'How it works', key: 'how' },
  { href: '/#value', label: 'What you get', key: 'value' },
  { href: '/#metrics', label: 'Metrics', key: 'metrics' },
  { href: '/#integrations', label: 'Integrations', key: 'integrations' },
];

const shortcutMap: Record<string, string> = {
  c: '/chat',
  u: '/upload',
  g: '/documents',
};

export default function TopBar() {
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const [compressed, setCompressed] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setCompressed(window.scrollY > 24);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (['INPUT', 'TEXTAREA'].includes(tag) || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const destination = shortcutMap[event.key.toLowerCase()];
      if (!destination) return;
      event.preventDefault();
      router.push(destination);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  const indicatorStyle = useMemo(() => {
    if (reduceMotion) return undefined;
    return {
      animation: 'pulse-lane 3s ease-out infinite',
      backgroundImage: 'var(--grad-1)',
      backgroundSize: '200% 200%',
    } as const;
  }, [reduceMotion]);

  return (
    <header className="sticky top-4 z-50 flex justify-center px-4">
      <div
        className={`flex w-[min(1180px,100%)] items-center justify-between gap-6 rounded-2xl border border-[var(--border)] bg-[color:var(--panel)] px-5 transition-[height,background,transform,box-shadow] duration-base ease-standard ${
          compressed ? 'h-14 shadow-surface' : 'h-[72px] shadow-surface'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--panel-2)]">
            <span className="absolute inset-0 rounded-xl opacity-90" style={indicatorStyle} aria-hidden />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[color:var(--panel)]">
              <Image src="/logo.svg" alt="AI Business Agent" width={22} height={22} priority />
            </div>
          </div>
          <div className="flex flex-col">
            <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--text)]">
              AI Business Agent
            </Link>
            <span className="text-[11px] uppercase tracking-[0.32em] text-muted">Neural operations</span>
          </div>
        </div>

        <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
          {navItems.map((item) => (
            <Link key={item.key} href={item.href} className="group relative px-1 py-1">
              <span className="transition-colors duration-fast ease-out group-hover:text-[var(--text)]">{item.label}</span>
              <span
                className="absolute bottom-0 left-0 h-[2px] w-0 bg-[var(--accent)] transition-all duration-base ease-out group-hover:w-full"
                aria-hidden
              />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ButtonLink href="/chat" tone="primary" className="lg:hidden">
            Open Chat
          </ButtonLink>
          <div className="hidden items-center gap-3 lg:flex">
            <ButtonLink href="/chat" tone="primary">
              Open Chat
            </ButtonLink>
            <ButtonLink href="/upload" tone="secondary">
              Upload KB
            </ButtonLink>
            <ButtonLink href="/documents" tone="secondary">
              Docs
            </ButtonLink>
          </div>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Open account menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-2)] text-sm font-medium text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
          >
            MA
          </button>
        </div>
      </div>
    </header>
  );
}
