import { ReactNode } from 'react';
export default function EmptyState({ title, desc, cta }: { title: string; desc: string; cta?: ReactNode }) {
  return (
    <div className="glass edge-glow p-8 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{desc}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
