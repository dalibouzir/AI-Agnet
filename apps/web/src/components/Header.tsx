'use client';
import Image from 'next/image';
import Link from 'next/link';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';
import GlassCard from './GlassCard';
import ThemeToggle from './ThemeToggle';

const links = [
  { href: '/chat', label: 'Chat' },
  { href: '/upload', label: 'Upload' },
];

export default function Header() {
  const reduce = usePrefersReducedMotion();
  return (
    <GlassCard
      className={`sticky top-0 z-20 mx-auto flex max-w-6xl items-center justify-between gap-6 rounded-2xl px-5 py-3 backdrop-blur ${
        reduce ? '' : 'transition-shadow duration-500 hover:shadow-neon'
      }`}
    >
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        <Image src="/logo.svg" alt="AI Business Agent" width={28} height={28} priority />
        <span>AI Business Agent</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full px-3 py-1 text-slate-600 transition-colors hover:bg-brand-500/15 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            prefetch
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <ThemeToggle />
    </GlassCard>
  );
}
