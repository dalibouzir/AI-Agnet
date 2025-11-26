import { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export default function PageHeader({ eyebrow, title, subtitle, right }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-3">
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.32em] text-muted">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold text-[var(--text)] md:text-4xl">{title}</h1>
        {subtitle && <p className="max-w-3xl text-sm text-muted xl:text-base">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
