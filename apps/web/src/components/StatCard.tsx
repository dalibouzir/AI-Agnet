import Panel from './Panel';

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export default function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Panel className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-[0.32em] text-muted">{label}</p>
      <p className="font-display text-2xl font-semibold text-[var(--text)]">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Panel>
  );
}
