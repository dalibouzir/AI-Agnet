import { useMemo, useState } from 'react';
import type { Citation, QueryMeta } from './ChatPane';

type SourcesPanelProps = {
  sources: Citation[];
  status?: 'idle' | 'loading';
  meta?: QueryMeta | null;
};

const PLACEHOLDER_ROWS = [0, 1, 2];

const formatLatencyMs = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${(value / 1000).toFixed(2)}s`;
};
const formatTokens = (metrics?: QueryMeta['metrics']) => {
  if (!metrics) return '—';
  const total = (metrics.tokens_in ?? 0) + (metrics.tokens_out ?? 0);
  if (total <= 0) return '—';
  return `${total} tokens`;
};

const snippet = (value: string, max = 260) => {
  if (!value) return '(empty chunk)';
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
};

export default function SourcesPanel({ sources, status = 'idle', meta }: SourcesPanelProps) {
  const isLoading = status === 'loading';
  const showEmpty = !isLoading && sources.length === 0;
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [presigningKey, setPresigningKey] = useState<string | null>(null);
  const [presignError, setPresignError] = useState<string | null>(null);

  const summary = useMemo(() => {
    return {
      latency: formatLatencyMs(meta?.metrics?.latency_ms),
      tokens: formatTokens(meta?.metrics),
      model: meta?.metrics?.model ?? '—',
    };
  }, [meta]);

  const handleCopy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      setCopiedValue(null);
    }
  };

  const resolveObjectKey = (metadata?: Record<string, unknown> | null): string | undefined => {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const candidates = [metadata['object'], metadata['object_key'], metadata['raw_key']];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return undefined;
  };

  const pickMetadataString = (metadata: Record<string, unknown> | null | undefined, key: string): string | undefined => {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const value = metadata[key as keyof typeof metadata];
    return typeof value === 'string' ? value : undefined;
  };

  const handleOpenSource = async (objectKey: string | undefined) => {
    if (!objectKey) return;
    setPresigningKey(objectKey);
    setPresignError(null);
    try {
      const params = new URLSearchParams({ objectKey });
      const response = await fetch(`/api/files?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail =
          typeof payload?.detail === 'string'
            ? payload.detail
            : typeof payload?.error === 'string'
              ? payload.error
              : 'Unable to fetch download URL';
        throw new Error(detail);
      }
      const payload = await response.json();
      const url = typeof payload?.url === 'string' ? payload.url : null;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Presign response did not include a URL');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPresignError(message);
    } finally {
      setPresigningKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-[var(--text)]">Routing Insights</h3>
        {isLoading && <span className="text-[11px] uppercase tracking-[0.32em] text-muted">Loading…</span>}
      </div>

      {presignError ? (
        <p className="rounded-md border border-[var(--danger)] bg-[var(--panel-2)] px-3 py-2 text-xs text-[var(--danger)]">
          {presignError}
        </p>
      ) : null}

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
      ) : (
        <>
          <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 shadow-surface">
            <div className="grid gap-3 text-xs text-muted sm:grid-cols-3">
              <div>
                <p className="uppercase tracking-[0.28em]">Latency</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">{summary.latency}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.28em]">Tokens</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">{summary.tokens}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.28em]">Model</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">{summary.model}</p>
              </div>
            </div>
          </section>

          {meta?.charts && meta.charts.length > 0 ? (
            <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 shadow-surface">
              <h4 className="font-display text-sm font-semibold text-[var(--text)]">Simulated Charts</h4>
              <ul className="space-y-3">
                {meta.charts.map((chart, index) => {
                  const chartKey = chart.title ?? chart.type ?? `Chart ${index + 1}`;
                  const preview = JSON.stringify(chart.data ?? {}, null, 2);
                  return (
                    <li key={`${chartKey}-${index}`} className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>{chartKey}</span>
                        <span className="rounded bg-[var(--panel-2)] px-2 py-0.5 text-[11px] uppercase tracking-[0.2em]">
                          {chart.type ?? 'chart'}
                        </span>
                      </div>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-muted">{preview}</pre>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {showEmpty ? (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-6 text-sm text-muted">
              No citations yet. Ask a question to populate this panel.
            </p>
          ) : (
            <ul className="space-y-3">
              {sources.map((item) => {
                const key = `${item.docId}-${item.chunkId}`;
                const copyValue = item.source ?? item.docId;
                const metaRecord = (item.metadata && typeof item.metadata === 'object'
                  ? (item.metadata as Record<string, unknown>)
                  : null);
                const objectKey = resolveObjectKey(metaRecord);
                const originalName = pickMetadataString(metaRecord, 'original_basename') || item.docId;
                return (
                  <li key={key} className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 shadow-surface">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-[var(--text)]" title={originalName}>
                          {originalName}
                        </p>
                        <p className="text-xs text-muted">
                          Chunk {item.chunkId}
                          {typeof item.score === 'number' ? ` • Score ${item.score.toFixed(2)}` : null}
                        </p>
                        {item.source ? (
                          <p className="break-all text-[11px] text-muted" title={item.source}>
                            Source: {item.source}
                          </p>
                        ) : null}
                        {objectKey ? (
                          <p className="break-all text-[11px] text-muted" title={objectKey}>
                            Key: {objectKey}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(copyValue)}
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
                        >
                          {copiedValue === copyValue ? 'Copied' : 'Copy'}
                        </button>
                        {objectKey ? (
                          <button
                            type="button"
                            onClick={() => handleOpenSource(objectKey)}
                            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs font-medium text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)] disabled:opacity-60"
                            disabled={presigningKey === objectKey}
                          >
                            {presigningKey === objectKey ? 'Opening…' : 'View file'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-muted leading-relaxed">{snippet(item.text)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
