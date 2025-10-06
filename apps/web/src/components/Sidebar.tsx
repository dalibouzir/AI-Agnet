'use client';
import Link from 'next/link';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';
import GlassCard from './GlassCard';

const items = [
  { href: '/chat', label: 'Conversational Agent', accentClass: 'bg-brand-500' },
  { href: '/upload', label: 'Knowledge Uploads', accentClass: 'bg-accent-cyan' },
  { href: '/reports', label: 'Insight Reports', accentClass: 'bg-accent-violet' },
];

export default function Sidebar() {
  const reduce = usePrefersReducedMotion();
  return (
    <GlassCard className="edge-glow hidden w-72 flex-none flex-col gap-3 p-5 lg:flex">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Explore</p>
      <div className="flex flex-1 flex-col gap-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`group relative overflow-hidden rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700/60 dark:text-slate-200 dark:hover:text-white ${
              reduce ? '' : 'motion-safe:hover:shadow-neon'
            }`}
            prefetch
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${item.accentClass} opacity-70 transition-opacity group-hover:opacity-100`} aria-hidden />
            <span className="pl-3">{item.label}</span>
          </Link>
        ))}
      </div>
    </GlassCard>
  );
}
