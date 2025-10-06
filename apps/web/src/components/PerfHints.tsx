import Panel from './Panel';

const hints = [
  {
    title: 'Zero-glitch layout',
    detail: 'Layered panels lock to the grid, keeping experiences stable at every breakpoint.',
  },
  {
    title: 'Motion aware',
    detail: 'Micro-interactions ease out at 180ms and respect reduced-motion preferences.',
  },
  {
    title: 'Smart loading',
    detail: 'Routes prefetch on intent so chat and uploads feel instantaneous.',
  },
];

export default function PerfHints() {
  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-3">
        {hints.map((item) => (
          <div key={item.title} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm text-muted shadow-surface">
            <p className="font-display text-sm font-semibold text-[var(--text)]">{item.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
