'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Copy, ExternalLink, RefreshCcw, Search } from 'lucide-react';

import TopBar from '@/components/TopBar';
import PageContainer from '@/components/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';
import { cleanDisplayPath, resolveMetadataPath, resolveMetadataTitle, resolveObjectKey, type DocumentMetadata } from '@/lib/documents';
import { cn } from '@/lib/utils';

type ManagedDocument = {
  ingest_id: string;
  tenant_id: string;
  source?: string | null;
  status?: string | null;
  stage?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  finished_at?: string | null;
  uploader?: string | null;
  labels?: string[] | null;
  size?: number | null;
  mime?: string | null;
  object_key?: string | null;
  object_suffix?: string | null;
  original_basename?: string | null;
  doc_type?: string | null;
  metadata?: DocumentMetadata | null;
  error?: string | null;
  dlq_reason?: string | null;
};

type ActionState = { id: string; type: 'download' | 'reindex' | 'delete' | 'bulk' } | null;

type PreviewState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  text: string;
  error?: string;
};

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Embedding',
  COMPLETED: 'Indexed',
  FAILED: 'Failed',
};

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'danger'> = {
  QUEUED: 'default',
  PROCESSING: 'accent',
  COMPLETED: 'success',
  FAILED: 'danger',
};

const FETCH_INTERVAL_MS = 12_000;
const PREVIEW_CHAR_LIMIT = 20_000;
const PIPELINE_STEPS = ['queued', 'pii_dq', 'enrich_stage', 'chunk_embed', 'index_publish'];
const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  pii_dq: 'PII Scan',
  enrich_stage: 'Enriching',
  chunk_embed: 'Embedding',
  index_publish: 'Indexed',
};

function resolveStageInfo(stage?: string | null, status?: string | null) {
  const fallback = {
    label: status === 'COMPLETED' ? 'Indexed' : status === 'FAILED' ? 'Failed' : 'Queued',
    index: status === 'COMPLETED' ? PIPELINE_STEPS.length - 1 : 0,
    percent: status === 'COMPLETED' ? 100 : 5,
  };
  if (!stage) {
    return fallback;
  }
  const normalized = stage.toLowerCase();
  const idx = PIPELINE_STEPS.findIndex((step) => step === normalized);
  if (idx === -1) {
    return fallback;
  }
  const percent = Math.round(((idx + 1) / PIPELINE_STEPS.length) * 100);
  return {
    label: STAGE_LABELS[normalized] || stage,
    index: idx,
    percent,
  };
}

function formatElapsedDuration(startIso?: string | null, nowTs?: number) {
  if (!startIso) return '—';
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return '—';
  const elapsedMs = Math.max(0, (nowTs ?? Date.now()) - start);
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}h ${remMin}m`;
  }
  if (minutes >= 1) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function formatBytes(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let num = value;
  while (num >= 1024 && idx < units.length - 1) {
    num /= 1024;
    idx += 1;
  }
  const formatted = idx === 0 ? Math.round(num).toString() : num.toFixed(1);
  return `${formatted} ${units[idx]}`;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const absSeconds = Math.round(Math.abs(diffMs) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (absSeconds < 60) return formatter.format(Math.round(diffMs / 1000), 'second');
  const minutes = Math.round(diffMs / (1000 * 60));
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return formatter.format(days, 'day');
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveDisplayName(doc: ManagedDocument): string {
  const title = resolveMetadataTitle(doc.metadata ?? null);
  if (title) return title;
  if (doc.original_basename && doc.original_basename.trim()) return doc.original_basename.trim();
  if (doc.object_suffix && doc.object_suffix.trim()) return doc.object_suffix.trim();
  if (doc.object_key && doc.object_key.trim()) return doc.object_key.trim();
  return doc.ingest_id;
}

function extractApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Request failed';
  const data = payload as Record<string, unknown>;
  const detail = data.detail ?? data.message ?? data.error ?? data.reason;
  return describeValue(detail);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSegments(text: string, snippet: string | null) {
  if (!text) return [];
  if (!snippet) return [{ id: 'segment-0', content: text, highlight: false }];
  const trimmed = snippet.trim();
  if (!trimmed) return [{ id: 'segment-0', content: text, highlight: false }];
  const pattern = escapeRegExp(trimmed).replace(/\s+/g, '\\s+');
  let match: RegExpExecArray | null = null;
  try {
    const regex = new RegExp(pattern, 'i');
    match = regex.exec(text);
  } catch {
    match = null;
  }
  if (!match) {
    return [{ id: 'segment-0', content: text, highlight: false }];
  }
  const start = match.index;
  const end = start + match[0].length;
  return [
    { id: 'segment-0', content: text.slice(0, start), highlight: false },
    { id: 'segment-1', content: text.slice(start, end), highlight: true },
    { id: 'segment-2', content: text.slice(end), highlight: false },
  ];
}

export default function DocsPage() {
  const reduceMotion = usePrefersReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tenantId, setTenantId] = useState('tenant-demo');
  const [documents, setDocuments] = useState<ManagedDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle', text: '' });
  const [deepLink, setDeepLink] = useState<{ path: string | null; chunk: string | null; snippet: string | null }>({ path: null, chunk: null, snippet: null });
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    setDeepLink({
      path: searchParams.get('path'),
      chunk: searchParams.get('chunk'),
      snippet: searchParams.get('snippet'),
    });
  }, [searchParams]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const fetchDocuments = useCallback(async () => {
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({ tenantId, limit: '200' });
      const res = await fetch(`/api/ingest?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(extractApiError(payload));
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? (payload.items as ManagedDocument[]) : [];
      setDocuments(items);
      if (items.length === 0) {
        setSelectedId(null);
        return;
      }
      if (deepLink.path) {
        const match = items.find((doc) => {
          const path = resolveMetadataPath(doc.metadata ?? null, doc.object_key ?? doc.source ?? null);
          return path === deepLink.path;
        });
        if (match) {
          setSelectedId(match.ingest_id);
          return;
        }
      }
      if (!items.find((doc) => doc.ingest_id === selectedId)) {
        setSelectedId(items[0].ingest_id);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail || 'Unable to load documents');
    }
  }, [deepLink.path, selectedId, tenantId]);

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDocuments]);

  useEffect(() => {
    if (!deepLink.path || !documents.length) return;
    const match = documents.find((doc) => {
      const path = resolveMetadataPath(doc.metadata ?? null, doc.object_key ?? doc.source ?? null);
      return path === deepLink.path;
    });
    if (match) {
      setSelectedId(match.ingest_id);
    }
  }, [deepLink.path, documents]);

  const filteredDocs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) => {
      const name = resolveDisplayName(doc).toLowerCase();
      const labels = Array.isArray(doc.labels) ? doc.labels.join(' ').toLowerCase() : '';
      const source = doc.source?.toLowerCase() ?? '';
      const docType = doc.doc_type?.toLowerCase() ?? '';
      return [name, labels, source, docType].some((value) => value.includes(needle));
    });
  }, [documents, search]);

  const selected = useMemo(() => {
    if (!filteredDocs.length) return null;
    if (selectedId) {
      const match = filteredDocs.find((doc) => doc.ingest_id === selectedId);
      if (match) return match;
    }
    return filteredDocs[0];
  }, [filteredDocs, selectedId]);

  useEffect(() => {
    if (!filteredDocs.length) {
      setSelectedId(null);
      return;
    }
    if (selected && selected.ingest_id !== selectedId) {
      setSelectedId(selected.ingest_id);
    }
  }, [filteredDocs, selected, selectedId]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setPreview({ status: 'idle', text: '' });
      return () => {
        cancelled = true;
      };
    }
    const objectKey = resolveObjectKey(selected);
    if (!objectKey) {
      setPreview({ status: 'error', text: '', error: 'Object key missing for this document.' });
      return () => {
        cancelled = true;
      };
    }
    setPreview((current) => ({ ...current, status: 'loading', error: undefined }));

    const load = async () => {
      try {
        const params = new URLSearchParams({ objectKey, tenantId, mode: 'proxy' });
        const res = await fetch(`/api/files?${params.toString()}`, { cache: 'no-store' });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || 'Unable to fetch preview');
        }
        if (cancelled) return;
        setPreview({ status: 'ready', text: text.slice(0, PREVIEW_CHAR_LIMIT) });
      } catch (err) {
        if (cancelled) return;
        const detail = err instanceof Error ? err.message : String(err);
        setPreview({ status: 'error', text: '', error: detail || 'Unable to load preview.' });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selected, tenantId]);

  useEffect(() => {
    if (!deepLink.snippet || preview.status !== 'ready') return;
    const timer = window.setTimeout(() => {
      const anchor = document.getElementById('docs-highlight');
      if (anchor) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [preview.status, preview.text, deepLink.snippet]);

  const selectedMetadataEntries = useMemo(() => {
    if (!selected || !selected.metadata) return [];
    return Object.entries(selected.metadata);
  }, [selected]);

  const handleDownload = useCallback(
    async (record: ManagedDocument) => {
      const objectKey = resolveObjectKey(record);
      if (!objectKey) {
        setError('Object key missing for this document.');
        return;
      }
      setActionState({ id: record.ingest_id, type: 'download' });
      setError(null);
      try {
        const params = new URLSearchParams({ objectKey, tenantId });
        const res = await fetch(`/api/files?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(extractApiError(payload));
        }
        const payload = await res.json();
        const url = typeof payload?.url === 'string' ? payload.url : null;
        if (!url) throw new Error('Presign response missing URL');
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionState(null);
      }
    },
    [tenantId],
  );

  const handleReindex = useCallback(
    async (record: ManagedDocument) => {
      setActionState({ id: record.ingest_id, type: 'reindex' });
      setMessage(null);
      setError(null);
      try {
        const res = await fetch(`/api/ingest/${encodeURIComponent(record.ingest_id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(extractApiError(payload));
        }
        setMessage(`Reindex queued for ${resolveDisplayName(record)}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionState(null);
      }
    },
    [tenantId],
  );

  const handleDelete = useCallback(
    async (record: ManagedDocument) => {
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(
          `Delete ${record.original_basename || record.object_suffix || record.ingest_id}? This cannot be undone.`,
        );
        if (!confirmed) {
          return;
        }
      }
      setActionState({ id: record.ingest_id, type: 'delete' });
      setMessage(null);
      setError(null);
      try {
        const params = new URLSearchParams({ tenantId });
        const res = await fetch(`/api/ingest/${encodeURIComponent(record.ingest_id)}?${params.toString()}`, {
          method: 'DELETE',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(extractApiError(payload));
        }
        setMessage(`Deleted ${record.original_basename || record.ingest_id}.`);
        await fetchDocuments();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setError(detail || 'Delete failed');
      } finally {
        setActionState(null);
      }
    },
    [fetchDocuments, tenantId],
  );

  const handleReindexAll = useCallback(async () => {
    if (!filteredDocs.length) return;
    setActionState({ id: 'bulk', type: 'bulk' });
    setMessage(null);
    setError(null);
    let success = 0;
    for (const doc of filteredDocs) {
      try {
        const res = await fetch(`/api/ingest/${encodeURIComponent(doc.ingest_id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId }),
        });
        if (res.ok) {
          success += 1;
        }
      } catch (err) {
        console.warn('Reindex all failed for', doc.ingest_id, err);
      }
    }
    setMessage(`Queued ${success} document${success === 1 ? '' : 's'} for reindexing.`);
    setActionState(null);
  }, [filteredDocs, tenantId]);

  const handleCopyPath = useCallback(async (path: string | null) => {
    if (!path || typeof navigator === 'undefined' || !navigator.clipboard) {
      setError('Clipboard API unavailable.');
      return;
    }
    try {
      await navigator.clipboard.writeText(path);
      setMessage('Path copied to clipboard.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleSelect = useCallback(
    (doc: ManagedDocument) => {
      setSelectedId(doc.ingest_id);
      const params = new URLSearchParams(searchParams.toString());
      const path = resolveMetadataPath(doc.metadata ?? null, doc.object_key ?? doc.source ?? null);
      if (path) {
        params.set('path', path);
      } else {
        params.delete('path');
      }
      params.delete('chunk');
      params.delete('snippet');
      router.replace(`/docs?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const segments = useMemo(() => highlightSegments(preview.text, deepLink.snippet), [preview.text, deepLink.snippet]);

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.2, ease: 'easeOut' },
      };

  return (
    <>
      <TopBar />
      <PageContainer className="space-y-8 pb-20 pt-20">
        <motion.div {...reveal}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-muted">Library</p>
              <h1 className="mt-1 text-3xl font-semibold text-[color:var(--text-primary)]">Documents</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Monitor ingest status, preview redacted text, and deep-link directly from chat citations. Responsive controls keep large libraries manageable.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleReindexAll}
                disabled={!filteredDocs.length || (actionState?.type === 'bulk')}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--text-primary)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Reindex All
              </button>
              <select
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
              >
                <option value="tenant-demo">tenant-demo</option>
                <option value="tenant-staging">tenant-staging</option>
                <option value="tenant-production">tenant-production</option>
              </select>
            </div>
          </div>
        </motion.div>

        {message ? <p className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 px-4 py-3 text-sm text-[color:var(--success)]">{message}</p> : null}
        {error ? <p className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 px-4 py-3 text-sm text-[color:var(--danger)]">{error}</p> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Repository</CardTitle>
                  <CardDescription>{filteredDocs.length ? `${filteredDocs.length} files` : 'No files found with current filters.'}</CardDescription>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, label, path..."
                    className="w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] pl-10 pr-4 py-2 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => {
                    const path = resolveMetadataPath(doc.metadata ?? null, doc.object_key ?? doc.source ?? null);
                    const isSelected = doc.ingest_id === selected?.ingest_id;
                    const stageInfo = resolveStageInfo(doc.stage, doc.status);
                    return (
                      <TableRow key={doc.ingest_id} data-state={isSelected ? 'selected' : undefined} className={cn('cursor-pointer', isSelected && 'bg-[color:var(--surface-muted)]/60') } onClick={() => handleSelect(doc)}>
                        <TableCell className="max-w-[240px]">
                          <p className="truncate font-medium text-[color:var(--text-primary)]">{resolveDisplayName(doc)}</p>
                          <p className="truncate text-[11px] uppercase tracking-[0.24em] text-muted">{cleanDisplayPath(path)}</p>
                        </TableCell>
                        <TableCell>
                          {Array.isArray(doc.labels) && doc.labels.length ? (
                            <div className="flex flex-wrap gap-1">
                              {doc.labels.slice(0, 3).map((label) => (
                                <Badge key={`${doc.ingest_id}-${label}`} variant="outline" className="text-[10px] tracking-[0.2em]">
                                  {label}
                                </Badge>
                              ))}
                              {doc.labels.length > 3 ? <span className="text-[10px] text-muted">+{doc.labels.length - 3}</span> : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell>{formatBytes(doc.size)}</TableCell>
                        <TableCell>{relativeTime(doc.created_at)}</TableCell>
                        <TableCell className="min-w-[168px]">
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex flex-wrap items-center gap-2 text-muted">
                              <span className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--text-primary)]">
                                {stageInfo.label}
                              </span>
                              <span className="font-mono text-[color:var(--text-primary)]">
                                {stageInfo.index + 1}/{PIPELINE_STEPS.length}
                              </span>
                              <span className="ml-auto text-[10px] uppercase tracking-[0.2em]">
                                Elapsed {formatElapsedDuration(doc.created_at, nowTs)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-[color:var(--surface-muted)]">
                                <div
                                  className="h-full rounded-full bg-[color:var(--color-primary)] transition-[width] duration-500"
                                  style={{ width: `${stageInfo.percent}%` }}
                                />
                              </div>
                              <span className="text-[10px] uppercase tracking-[0.24em] text-muted">
                                {STATUS_LABEL[doc.status ?? ''] ?? 'Queued'}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDownload(doc);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-primary)]"
                            >
                              <ExternalLink className="h-3 w-3" /> Open
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleReindex(doc);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-primary)]"
                            >
                              <RefreshCcw className="h-3 w-3" /> Reindex
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCopyPath(path);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-primary)]"
                            >
                              <Copy className="h-3 w-3" /> Copy Path
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(doc);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--danger)]/50 bg-[color:var(--danger)]/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--danger)]"
                            >
                              Delete
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!filteredDocs.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-muted">
                        No documents match your filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {selected ? `Path ${cleanDisplayPath(resolveMetadataPath(selected.metadata ?? null, selected.object_key ?? selected.source ?? null))}` : 'Select a document to preview extracted text and metadata.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{resolveDisplayName(selected)}</Badge>
                    {deepLink.chunk ? (
                      <Badge variant="accent">Chunk {deepLink.chunk}</Badge>
                    ) : null}
                    {selected.stage ? (
                      <Badge variant="outline">{selected.stage}</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span>Tenant: {selected.tenant_id}</span>
                    <span>•</span>
                    <span>Uploader: {selected.uploader ?? '—'}</span>
                    <span>•</span>
                    <span>Last updated: {relativeTime(selected.updated_at)}</span>
                  </div>
                  <Tabs defaultValue="preview">
                    <TabsList>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                      <TabsTrigger value="metadata">Metadata</TabsTrigger>
                    </TabsList>
                    <TabsContent value="preview">
                      <div className="h-[420px] overflow-y-auto rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 p-4 text-sm font-mono leading-relaxed">
                        {preview.status === 'loading' ? (
                          <p className="text-muted">Loading preview…</p>
                        ) : preview.status === 'error' ? (
                          <p className="text-[color:var(--danger)]">{preview.error}</p>
                        ) : segments.length ? (
                          segments.map((segment, index) => (
                            segment.highlight ? (
                              <mark key={`segment-${index}`} id="docs-highlight" className="rounded bg-[color:var(--color-primary)]/30 px-0.5 text-[color:var(--text-primary)]">
                                {segment.content}
                              </mark>
                            ) : (
                              <span key={`segment-${index}`}>{segment.content}</span>
                            )
                          ))
                        ) : (
                          <p className="text-muted">Preview not available for this document.</p>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="metadata">
                      <div className="h-[420px] overflow-y-auto rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/40 p-4 text-sm">
                        {selectedMetadataEntries.length ? (
                          <dl className="space-y-3">
                            {selectedMetadataEntries.map(([key, value]) => (
                              <div key={key}>
                                <dt className="text-[11px] uppercase tracking-[0.28em] text-muted">{key}</dt>
                                <dd className="text-[color:var(--text-primary)]">{describeValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-muted">Metadata not available.</p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(selected)}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--text-primary)]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open original
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReindex(selected)}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--text-primary)]"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Reindex
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyPath(resolveMetadataPath(selected.metadata ?? null, selected.object_key ?? selected.source ?? null))}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--text-primary)]"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy path
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Select a document to load preview and metadata.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
