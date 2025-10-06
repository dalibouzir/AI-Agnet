import { ReactNode } from 'react';
import Panel from './Panel';

type FeatureRowProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export default function FeatureRow({ icon, title, description, action, className = '' }: FeatureRowProps) {
  return (
    <Panel className={`flex flex-col gap-5 md:flex-row md:items-center md:justify-between ${className}`}>
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-lg text-[var(--accent)]">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">{title}</h3>
          <p className="mt-2 text-sm text-muted">{description}</p>
        </div>
      </div>
      {action && <div className="flex items-center gap-3 text-sm text-muted">{action}</div>}
    </Panel>
  );
}
