import { ReactNode } from 'react';

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string | ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function Section({ id, eyebrow, title, description, actions, children, className = '' }: SectionProps) {
  return (
    <section id={id} className={`space-y-8 ${className}`}>
      {(eyebrow || title || description || actions) && (
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-2">
            {eyebrow && <p className="text-[11px] uppercase tracking-[0.32em] text-muted">{eyebrow}</p>}
            {title && <h2 className="font-display text-3xl font-semibold text-[var(--text)]">{title}</h2>}
            {description && <div className="text-sm leading-relaxed text-muted">{description}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
