'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, RefreshCcw } from 'lucide-react';

import TopBar from '@/components/TopBar';
import PageContainer from '@/components/PageContainer';
import FileDropzone from '@/components/FileDropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';
import { resolveObjectKey } from '@/lib/documents';

type IngestionRecord = {
  ingest_id: string;
  tenant_id: string;
  source?: string;
  status?: string | null;
  stage?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  finished_at?: string | null;
  uploader?: string | null;
  labels?: string[];
  size?: number | null;
  mime?: string | null;
  object_key?: string | null;
  object_suffix?: string | null;
  original_basename?: string | null;
  doc_type?: string | null;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
  dlq_reason?: string | null;
};

type ActionState = { id: string; type: 'upload' | 'reindex' | 'delete' | 'bulk' } | null;

type PipelineStep = {
  label: string;
  queued: number;
  inflight: number;
  completed: number;
  failed: number;
};

const PIPELINE_STAGES = ['Redact', 'Normalize', 'Chunk', 'Embed', 'Index'];

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Indexed',
  FAILED: 'Failed',
};

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
  return date.toLocaleString();
}

function resolveStageIndex(stage?: string | null): number {
  if (!stage) return -1;
  const lowered = stage.toLowerCase();
  if (lowered.includes('index')) return 4;
  if (lowered.includes('embed')) return 3;
  if (lowered.includes('chunk')) return 2;
  if (lowered.includes('norm')) return 1;
  if (lowered.includes('redact')) return 0;
  return -1;
}

function normalizeStageIndex(stage?: string | null, status?: string | null): number {
  if (status === 'COMPLETED') return PIPELINE_STAGES.length - 1;
  const idx = resolveStageIndex(stage);
  if (idx >= 0) return idx;
  return 0;
}

function summarizePipeline(records: IngestionRecord[]): PipelineStep[] {
  const template = PIPELINE_STAGES.map((label) => ({ label, queued: 0, inflight: 0, completed: 0, failed: 0 }));
  for (const record of records) {
    const stageIndex = resolveStageIndex(record.stage);
    if (record.status === 'FAILED' || record.dlq_reason) {
      const idx = stageIndex >= 0 ? stageIndex : 0;
      template[idx].failed += 1;
      continue;
    }
    if (record.status === 'COMPLETED') {
      template.forEach((step) => {
        step.completed += 1;
      });
      continue;
    }
    const activeIndex = stageIndex >= 0 ? stageIndex : 0;
    template.forEach((step, idx) => {
      if (idx < activeIndex) {
        step.completed += 1;
      } else if (idx === activeIndex) {
        step.inflight += 1;
      } else {
        step.queued += 1;
      }
    });
  }
  return template;
}

function describeValue(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function UploadPage() {
  const reduceMotion = usePrefersReducedMotion();
  const [tenantId, setTenantId] = useState('tenant-demo');
  const [source, setSource] = useState('#console-upload');
  const [uploader, setUploader] = useState('ops@tenant-demo');
  const [labelsInput, setLabelsInput] = useState('#policy, #finance');
  const [ingestions, setIngestions] = useState<IngestionRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);

  const fetchIngestions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', tenantId });
      const res = await fetch(`/api/ingest?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(describeValue(payload, 'Unable to load ingestions'));
      }
      const payload = await res.json();
      setIngestions(Array.isArray(payload?.items) ? payload.items : []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : describeValue(err, 'Unable to load ingestions');
      setError(message || 'Unable to load ingestions');
    }
  }, [tenantId]);

  useEffect(() => {
    fetchIngestions();
    const id = setInterval(fetchIngestions, 8000);
    return () => clearInterval(id);
  }, [fetchIngestions]);

const pipeline = useMemo(() => summarizePipeline(ingestions), [ingestions]);

const overallProgress = useMemo(() => {
  if (!ingestions.length) {
    return { percent: 0, label: 'No ingestions yet', active: 0 };
  }
  const maxIndex = PIPELINE_STAGES.length - 1;
  const totalScore = ingestions.reduce((sum, record) => {
    return sum + normalizeStageIndex(record.stage, record.status);
  }, 0);
  const percent = Math.round((totalScore / (ingestions.length * maxIndex)) * 100);
  const active = ingestions.filter((record) => record.status !== 'COMPLETED' && !record.dlq_reason).length;
  return {
    percent: Number.isNaN(percent) ? 0 : Math.min(100, Math.max(0, percent)),
    label: `${active} file${active === 1 ? '' : 's'} in flight of ${ingestions.length}`,
    active,
  };
}, [ingestions]);

  const runSummary = useMemo(() => {
    const inflight = ingestions.filter((record) => record.status === 'PROCESSING' || record.status === 'QUEUED').length;
    const completed = ingestions.filter((record) => record.status === 'COMPLETED').length;
    const failed = ingestions.filter((record) => record.status === 'FAILED' || record.dlq_reason).length;
    return { inflight, completed, failed };
  }, [ingestions]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const trimmedLabels = labelsInput
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean);

      setIsUploading(true);
      setMessage(null);
      setError(null);
      setActionState({ id: 'upload', type: 'upload' });
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append('tenant_id', tenantId);
          formData.append('source', source || '#console-upload');
          formData.append('doc_type', guessDocType(file));
          formData.append('uploader', uploader);
          formData.append('labels', JSON.stringify(trimmedLabels));
          formData.append('file', file);
          const response = await fetch('/api/ingest', { method: 'POST', body: formData });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(describeValue(payload, 'Upload failed'));
          }
        }
        setMessage(`${files.length} file${files.length === 1 ? '' : 's'} sent for processing.`);
        fetchIngestions();
      } catch (err) {
        const detail = err instanceof Error ? err.message : describeValue(err, 'Upload failed');
        setError(detail || 'Upload failed');
      } finally {
        setIsUploading(false);
        setActionState(null);
      }
    },
    [fetchIngestions, labelsInput, source, tenantId, uploader],
  );

  const handleReindex = useCallback(
    async (record: IngestionRecord) => {
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
          throw new Error(describeValue(payload, 'Reindex failed'));
        }
        setMessage(`Reindex queued for ${record.original_basename || record.ingest_id}.`);
        fetchIngestions();
      } catch (err) {
        const detail = err instanceof Error ? err.message : describeValue(err, 'Reindex failed');
        setError(detail || 'Reindex failed');
      } finally {
        setActionState(null);
      }
    },
    [fetchIngestions, tenantId],
  );

  const handleDelete = useCallback(
    async (record: IngestionRecord) => {
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
          throw new Error(describeValue(payload, 'Delete failed'));
        }
        setMessage(`Deleted ${record.original_basename || record.ingest_id}.`);
        await fetchIngestions();
      } catch (err) {
        const detail = err instanceof Error ? err.message : describeValue(err, 'Delete failed');
        setError(detail || 'Delete failed');
      } finally {
        setActionState(null);
      }
    },
    [fetchIngestions, tenantId],
  );

  const handleReindexAll = useCallback(async () => {
    if (!ingestions.length) return;
    setActionState({ id: 'bulk', type: 'bulk' });
    setMessage(null);
    setError(null);
    try {
      for (const record of ingestions) {
        await fetch(`/api/ingest/${encodeURIComponent(record.ingest_id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId }),
        });
      }
      setMessage('Reindex queued for all current files.');
    } catch (err) {
      const detail = err instanceof Error ? err.message : describeValue(err, 'Reindex failed');
      setError(detail || 'Reindex failed');
    } finally {
      setActionState(null);
    }
  }, [ingestions, tenantId]);

  const handleCopyPath = useCallback(async (path: string | null) => {
    if (!path || typeof navigator === 'undefined' || !navigator.clipboard) {
      setError('Clipboard API unavailable.');
      return;
    }
    try {
      await navigator.clipboard.writeText(path);
      setMessage('Path copied to clipboard.');
    } catch (err) {
      const detail = err instanceof Error ? err.message : describeValue(err, 'Copy failed');
      setError(detail);
    }
  }, []);

  const reveal = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.2 }, transition: { duration: 0.2, ease: 'easeOut' } };

  return (
    <>
      <TopBar />
      <PageContainer className="space-y-8 pb-24 pt-20">
        <motion.div {...reveal}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-muted">Ingestion control</p>
              <h1 className="mt-1 text-3xl font-semibold text-[color:var(--text-primary)]">Upload & pipeline</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">Drop files, watch each pipeline stage, and reindex on demand. Failed checks auto-requeue.</p>
            </div>
            <button
              type="button"
              onClick={handleReindexAll}
              disabled={actionState?.type === 'bulk'}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--text-primary)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Reindex All
            </button>
          </div>
        </motion.div>

        {message ? <p className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 px-4 py-3 text-sm text-[color:var(--success)]">{message}</p> : null}
        {error ? <p className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 px-4 py-3 text-sm text-[color:var(--danger)]">{error}</p> : null}

        <motion.div {...reveal} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline overview</CardTitle>
              <CardDescription>Aggregated progress across all active files.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-semibold text-[color:var(--text-primary)]">{overallProgress.percent}%</p>
                <span className="text-xs uppercase tracking-[0.32em] text-muted">{overallProgress.label}</span>
              </div>
              <div className="h-3 w-full rounded-full bg-[color:var(--surface-muted)]">
                <div
                  className="h-full rounded-full bg-[color:var(--color-primary)] transition-[width] duration-500"
                  style={{ width: `${overallProgress.percent}%` }}
                />
              </div>
              <div className="text-xs uppercase tracking-[0.28em] text-muted">
                {overallProgress.active} active · {runSummary.completed} completed · {runSummary.failed} failed / DLQ
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...reveal} className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Upload files</CardTitle>
              <CardDescription>Supports docs, slides, sheets, images, JSON, and text.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileDropzone onFiles={handleUpload} disabled={isUploading} />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs uppercase tracking-[0.28em] text-muted">
                  Tenant
                  <select
                    value={tenantId}
                    onChange={(event) => setTenantId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
                  >
                    <option value="tenant-demo">tenant-demo</option>
                    <option value="tenant-staging">tenant-staging</option>
                    <option value="tenant-production">tenant-production</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.28em] text-muted">
                  Source
                  <input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
                  />
                </label>
                <label className="text-xs uppercase tracking-[0.28em] text-muted">
                  Uploader
                  <input
                    value={uploader}
                    onChange={(event) => setUploader(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
                  />
                </label>
                <label className="text-xs uppercase tracking-[0.28em] text-muted">
                  Labels
                  <input
                    value={labelsInput}
                    onChange={(event) => setLabelsInput(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <AlertTriangle className="h-4 w-4 text-[color:var(--warning)]" />
                Failed checks auto-requeue after redaction and DQ policies run.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing pipeline</CardTitle>
              <CardDescription>Live roll-up from MinIO + OpenSearch ingest tasks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4">
                {pipeline.map((step, index) => (
                  <div key={step.label} className="flex flex-col gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--surface-muted)]">
                          <span className="text-sm font-semibold text-[color:var(--text-primary)]">{index + 1}</span>
                        </div>
                        <p className="text-base font-semibold text-[color:var(--text-primary)]">{step.label}</p>
                      </div>
                      <div className="text-xs text-muted">Queued {step.queued} · In-flight {step.inflight} · Done {step.completed}</div>
                    </div>
                    <div className="h-2 rounded-full bg-[color:var(--surface-muted)]">
                      <div
                        className="h-full rounded-full bg-[color:var(--color-primary)]"
                        style={{ width: `${Math.min(100, (step.completed / (ingestions.length || 1)) * 100)}%` }}
                      />
                    </div>
                    {step.failed ? <p className="text-xs text-[color:var(--danger)]">{step.failed} file(s) need attention.</p> : null}
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 p-4">
                  <p className="text-xs uppercase tracking-[0.32em] text-muted">In-flight</p>
                  <p className="text-2xl font-semibold text-[color:var(--text-primary)]">{runSummary.inflight}</p>
                </div>
                <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 p-4">
                  <p className="text-xs uppercase tracking-[0.32em] text-muted">Completed</p>
                  <p className="text-2xl font-semibold text-[color:var(--text-primary)]">{runSummary.completed}</p>
                </div>
                <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/60 p-4">
                  <p className="text-xs uppercase tracking-[0.32em] text-muted">Failed / DLQ</p>
                  <p className="text-2xl font-semibold text-[color:var(--text-primary)]">{runSummary.failed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...reveal}>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Recent files</CardTitle>
              <CardDescription>Track lineage, status, and run quick actions.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingestions.map((record) => {
                    const path = resolveObjectKey(record) ?? record.object_suffix ?? record.ingest_id;
                    return (
                      <TableRow key={record.ingest_id}>
                        <TableCell>
                          <p className="font-semibold text-[color:var(--text-primary)]">{record.original_basename || record.object_suffix || record.ingest_id}</p>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">{path}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.status === 'FAILED' ? 'danger' : record.status === 'COMPLETED' ? 'success' : 'accent'}>
                            {STATUS_LABEL[record.status ?? ''] ?? 'Queued'}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.stage ?? '—'}</TableCell>
                        <TableCell>{formatBytes(record.size)}</TableCell>
                        <TableCell>{relativeTime(record.updated_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleReindex(record)}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-primary)]"
                            >
                              <RefreshCcw className="h-3 w-3" /> Reindex
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyPath(path)}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-primary)]"
                            >
                              <Copy className="h-3 w-3" /> Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--danger)]/50 bg-[color:var(--danger)]/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--danger)]"
                            >
                              Delete
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!ingestions.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-muted">
                        No uploads yet. Drop files to start building the knowledge base.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      </PageContainer>
    </>
  );
}

function guessDocType(file: File): string {
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('/')) {
    const subtype = mime.split('/', 2)[1]?.split(';', 1)[0] ?? '';
    if (subtype) {
      const clean = subtype.split('+', 1)[0];
      if (clean === 'plain') return 'txt';
      if (clean === 'jpeg') return 'jpg';
      if (clean === 'msword') return 'doc';
      if (clean === 'vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
      if (clean === 'vnd.ms-powerpoint') return 'ppt';
      if (clean === 'vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
      if (clean === 'vnd.ms-excel') return 'xls';
      if (clean === 'vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
      return clean;
    }
  }
  const parts = file.name.split('.');
  const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'text') return 'txt';
  return ext || 'binary';
}
