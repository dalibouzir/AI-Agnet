import Panel from './Panel';

type HelpCalloutProps = {
  title: string;
  desc: string;
};

export default function HelpCallout({ title, desc }: HelpCalloutProps) {
  return (
    <Panel className="flex items-start gap-3">
      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-accent" />
      <div>
        <p className="font-display text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="text-sm text-muted">{desc}</p>
      </div>
    </Panel>
  );
}
