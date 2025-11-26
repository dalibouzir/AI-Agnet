'use client';

import { useCallback, useMemo, useState } from 'react';
import TopBar from '@/components/TopBar';
import ChatPane, { Citation, QueryMeta } from '@/components/ChatPane';
import InfoSlideOver, { InfoMetric } from '@/components/InfoSlideOver';

type Status = 'idle' | 'loading';

const formatLatencyMs = (value?: number, fallback?: string) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return fallback ?? '—';
};

const formatTokens = (metrics?: QueryMeta['metrics']) => {
  if (!metrics) return '—';
  const total = (metrics.tokens_in ?? 0) + (metrics.tokens_out ?? 0);
  if (total <= 0) return '—';
  return `${total.toLocaleString()} tokens`;
};


export default function ChatPage() {
  const [sources, setSources] = useState<Citation[]>([]);
  const [meta, setMeta] = useState<QueryMeta | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const statusLabel = status === 'loading' ? 'Synthesizing' : 'Ready';
  const latencyLabel = formatLatencyMs(meta?.metrics?.latency_ms, status === 'loading' ? '—' : 'Awaiting run');
  const modelLabel = meta?.metrics?.model || (status === 'loading' ? 'Loading model…' : 'Awaiting first answer');
  const tokensLabel = formatTokens(meta?.metrics);

  const metrics: InfoMetric[] = useMemo(
    () => [
      { label: 'Status', value: statusLabel },
      { label: 'Latency', value: latencyLabel },
      { label: 'Tokens', value: tokensLabel },
      { label: 'Model', value: modelLabel },
    ],
    [latencyLabel, modelLabel, statusLabel, tokensLabel],
  );

  const knowledgeSources = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const citation of sources) {
      const label = resolveCitationLabel(citation);
      if (label && !seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    return labels.slice(0, 12);
  }, [sources]);

  const knowledgeSummary = useMemo(() => summarizeSources(sources, status), [sources, status]);

  const lastPromptPreview =
    lastPrompt && lastPrompt.trim().length > 0
      ? truncate(lastPrompt.trim(), 160)
      : status === 'loading'
        ? 'Sending prompt…'
        : 'Ask a question about your business to get started.';

  const handlePromptSent = useCallback((prompt: string) => {
    setLastPrompt(prompt);
  }, []);

  return (
    <>
      <TopBar
        onToggleInfo={() => setInfoOpen((current) => !current)}
        infoOpen={infoOpen}
        infoPanelId="chat-info-panel"
      />
      <section className="relative flex h-[calc(100vh-var(--topbar-height))] flex-col overflow-hidden">
        <div className="flex flex-col gap-3 px-4 pt-6 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-muted">Realtime intelligence</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--text-primary)] sm:text-3xl">
                Conversational command center
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Inspect model health, review cited knowledge, and collaborate with your AI copilot in one workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-muted transition-all duration-200 ease-out hover:-translate-y-px hover:border-[color:var(--color-primary)] hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]"
              aria-expanded={detailsOpen}
              aria-controls="chat-run-insights"
            >
              {detailsOpen ? 'Hide run details' : 'Show run details'}
            </button>
          </div>
          {detailsOpen ? (
            <div
              id="chat-run-insights"
              className="grid gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 px-4 py-4 sm:grid-cols-2"
            >
              <div className="flex flex-col gap-2">
                <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)] px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-muted">
                  Knowledge sources
                </span>
                <p className="text-sm text-[color:var(--text-primary)]/85">{knowledgeSummary}</p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)] px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-muted">
                  Last prompt
                </span>
                <p className="text-sm text-[color:var(--text-primary)]/85">{lastPromptPreview}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0.75rem))] pt-4 sm:px-8 lg:px-12">
          <div className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)] shadow-[var(--shadow-elev)] backdrop-blur-lg">
            <ChatPane
              onSourcesUpdate={setSources}
              onStatusChange={setStatus}
              onMetaUpdate={setMeta}
              onPromptSent={handlePromptSent}
            />
          </div>
        </div>
      </section>
      <InfoSlideOver
        id="chat-info-panel"
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        status={status}
        metrics={metrics}
        knowledgeSources={knowledgeSources}
        lastPrompt={lastPrompt}
      />
    </>
  );
}

function summarizeSources(sources: Citation[], status: Status): string {
  if (sources.length === 0) {
    return status === 'loading' ? 'Scanning knowledge base…' : 'No referenced knowledge files for the latest response.';
  }

  const seen = new Set<string>();
  const labels: string[] = [];

  for (const citation of sources) {
    const label = resolveCitationLabel(citation);
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
  }

  if (!labels.length) {
    return 'Sources captured but missing metadata.';
  }

  if (labels.length <= 3) {
    return labels.join(' • ');
  }

  const extras = labels.length - 3;
  return `${labels.slice(0, 3).join(' • ')} +${extras} more`;
}

function resolveCitationLabel(source: Citation): string | null {
  if (source.metadata && typeof source.metadata === 'object') {
    const record = source.metadata as Record<string, unknown>;
    const title = record.title;
    if (typeof title === 'string' && title.trim()) {
      return title.trim();
    }
    const filename = record.file_name ?? record.filename;
    if (typeof filename === 'string' && filename.trim()) {
      return filename.trim();
    }
  }
  if (typeof source.source === 'string' && source.source.trim()) {
    return source.source.trim();
  }
  if (typeof source.docId === 'string' && source.docId.trim()) {
    return source.docId.trim();
  }
  const legacyId = (source as { doc_id?: string }).doc_id;
  if (typeof legacyId === 'string' && legacyId.trim()) {
    return legacyId.trim();
  }
  return null;
}

function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length - 1).trimEnd()}…`;
}
