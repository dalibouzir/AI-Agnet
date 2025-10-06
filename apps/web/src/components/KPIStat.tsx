import Panel from './Panel';

type KPIStatProps = {
  label: string;
  value: string;
  trend?: string;
  caption?: string;
  className?: string;
};

export default function KPIStat({ label, value, trend, caption, className = '' }: KPIStatProps) {
  return (
    <Panel className={`flex flex-col gap-2 ${className}`}>
      <span className="text-[11px] uppercase tracking-[0.32em] text-muted">{label}</span>
      <span className="font-display text-3xl font-extrabold text-[var(--text)]">{value}</span>
      {trend && <span className="text-xs text-[var(--success)]">{trend}</span>}
      {caption && <p className="text-sm text-muted">{caption}</p>}
    </Panel>
  );
}
