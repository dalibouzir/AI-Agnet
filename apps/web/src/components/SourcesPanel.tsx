import { useState } from 'react';
import { SourceInfo } from './ChatPane';

type SourcesPanelProps = {
  sources: SourceInfo[];
  status?: 'idle' | 'loading';
};

const PLACEHOLDER_ROWS = [0, 1, 2];

export default function SourcesPanel({ sources, status = 'idle' }: SourcesPanelProps) {
  const isLoading = status === 'loading';
  const showEmpty = !isLoading && sources.length === 0;
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {
      setCopiedPath(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-[var(--text)]">Sources & Signals</h3>
        {isLoading && <span className="text-[11px] uppercase tracking-[0.32em] text-muted">Loading…</span>}
      </div>
      {isLoading ? (
        <ul className="space-y-3">
          {PLACEHOLDER_ROWS.map((item) => (
            <li key={item} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 shadow-surface">
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-40 rounded bg-[var(--border)]" />
                <div className="h-2.5 w-28 rounded bg-[var(--border)]" />
              </div>
            </li>
          ))}
        </ul>
      ) : showEmpty ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-6 text-sm text-muted">
          No citations yet. Ask a question to populate this panel.
        </p>
      ) : (
        <ul className="space-y-3">
          {sources.map((item) => (
            <li key={`${item.path}-${item.title}`} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 shadow-surface space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">Relevance: {item.score.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted break-all">Path: {item.path}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(item.path)}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
                >
                  {copiedPath === item.path ? 'Copied' : 'Copy Path'}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-xs text-muted leading-relaxed">{item.preview}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
