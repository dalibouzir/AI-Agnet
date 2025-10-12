'use client';

import { motion } from 'framer-motion';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/TopBar';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import FeatureRow from '@/components/FeatureRow';
import FileDropzone from '@/components/FileDropzone';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Embedding',
  COMPLETED: 'Indexed',
  FAILED: 'Failed',
};

const STATUS_CHIP: Record<string, string> = {
  Queued: 'border-[var(--border)] text-muted',
  Embedding: 'border-[var(--accent)] text-[var(--accent)]',
  Indexed: 'border-[var(--success)] text-[var(--success)]',
  Failed: 'border-[var(--danger)] text-[var(--danger)]',
};

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

function describeValue(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Upload failed';
  const data = payload as Record<string, unknown>;
  const detail = data.detail ?? data.message ?? data.error ?? data.reason;
  return describeValue(detail, 'Upload failed');
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

export default function UploadPage() {
  const reduceMotion = usePrefersReducedMotion();
  const [tenantId, setTenantId] = useState('tenant-demo');
  const [source, setSource] = useState('#console-upload');
  const [uploader, setUploader] = useState('ops@tenant-demo');
  const [labelsInput, setLabelsInput] = useState('#policy, #finance');
  const [ingestions, setIngestions] = useState<IngestionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.2, ease: 'easeOut' },
      };

  const fetchIngestions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (tenantId) params.set('tenantId', tenantId);
      const res = await fetch(`/api/ingest?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(extractApiError(payload) || 'Unable to load ingestions');
      }
      const payload = await res.json();
      setIngestions(Array.isArray(payload?.items) ? payload.items : []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : describeValue(err, 'Unable to load ingestions');
      setError(message || 'Unable to load ingestions');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchIngestions();
    const id = setInterval(fetchIngestions, 8000);
    return () => clearInterval(id);
  }, [fetchIngestions]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const trimmedLabels = labelsInput
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean);

      setIsUploading(true);
      setMessage(null);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append('tenant_id', tenantId);
          formData.append('source', source || '#console-upload');
          formData.append('doc_type', guessDocType(file));
          const sanitizedName = file.name ? file.name.replace(/^\.+/, '').trim() : '';
          const requestedObject = sanitizedName || `upload-${Date.now()}`;
          formData.append('object', requestedObject);
          formData.append('file', file);
          if (uploader) formData.append('uploader', uploader);
          trimmedLabels.forEach((label) => formData.append('labels', label));
          const metadataPayload = {
            original_filename: file.name,
            size: file.size,
            source,
            uploader,
            labels: trimmedLabels,
          };
          formData.append('metadata', JSON.stringify(metadataPayload));

          console.log('[upload] sending', {
            name: file.name,
            size: file.size,
            tenant: tenantId,
            docType: guessDocType(file),
            labels: trimmedLabels,
          });
          const res = await fetch('/api/ingest', { method: 'POST', body: formData });
          console.log('[upload] response status', res.status);
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            console.error('[upload] upstream error', payload);
            throw new Error(extractApiError(payload));
          }
          console.log('[upload] success payload', payload);
        }
        setMessage(`${files.length} file${files.length === 1 ? '' : 's'} queued for ingestion.`);
        setError(null);
        await fetchIngestions();
      } catch (err) {
        console.error('[upload] request failed', err);
        const message = err instanceof Error ? err.message : describeValue(err, 'Upload failed');
        setError(message || 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [fetchIngestions, labelsInput, source, tenantId, uploader],
  );

  const summary = useMemo(() => {
    const totals = { queued: 0, processing: 0, completed: 0, failed: 0 };
    ingestions.forEach((item) => {
      switch (item.status) {
        case 'COMPLETED':
          totals.completed += 1;
          break;
        case 'FAILED':
          totals.failed += 1;
          break;
        case 'PROCESSING':
          totals.processing += 1;
          break;
        case 'QUEUED':
        default:
          totals.queued += 1;
      }
    });
    return totals;
  }, [ingestions]);

  return (
    <>
      <TopBar />
      <PageContainer className="space-y-12 pb-24 pt-20">
        <PageHeader
          eyebrow="Knowledge operations"
          title="Upload knowledge safely"
          subtitle="Drop PDFs, slides, spreadsheets, or images. We’ll redact, validate, embed, and index for retrieval within minutes."
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div {...reveal}>
            <Panel className="space-y-8">
              <div className="space-y-3">
                <h2 className="font-display text-2xl font-semibold text-[var(--text)]">Queue your knowledge base</h2>
                <p className="text-sm text-muted">
                  Send files into the neural pipeline. We scope every asset to your tenancy, enforce policy-aware routing, and
                  version each revision for replay.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tenant" id="tenant">
                  <select
                    id="tenant"
                    value={tenantId}
                    onChange={(event) => setTenantId(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] focus-visible:[box-shadow:var(--focus)] focus-visible:outline-none"
                  >
                    <option value="tenant-demo">tenant-demo</option>
                    <option value="tenant-staging">tenant-staging</option>
                    <option value="tenant-production">tenant-production</option>
                  </select>
                </Field>
                <Field label="Source tag" id="source">
                  <input
                    id="source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] focus-visible:[box-shadow:var(--focus)] focus-visible:outline-none"
                    placeholder="#console-upload"
                  />
                </Field>
                <Field label="Uploader" id="uploader">
                  <input
                    id="uploader"
                    value={uploader}
                    onChange={(event) => setUploader(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] focus-visible:[box-shadow:var(--focus)] focus-visible:outline-none"
                    placeholder="ops@tenant"
                  />
                </Field>
                <Field label="Labels" id="labels" hint="Use # to autocomplete taxonomy tags">
                  <input
                    id="labels"
                    value={labelsInput}
                    onChange={(event) => setLabelsInput(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] focus-visible:[box-shadow:var(--focus)] focus-visible:outline-none"
                    placeholder="#policy, #finance"
                  />
                </Field>
              </div>

              <FileDropzone onFiles={handleUpload} disabled={isUploading} />
              {message && <p className="text-xs text-[var(--success)]">{message}</p>}
              {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-muted">Queue</p>
                  <span className="text-xs text-muted">
                    {isLoading ? 'Loading…' : `${ingestions.length} item${ingestions.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <Panel className="overflow-hidden" padding="none" variant="secondary">
                  <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
                    <thead className="bg-[var(--panel)] text-[11px] uppercase tracking-[0.32em] text-muted">
                      <tr>
                        <th className="px-5 py-3">Document</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Stage</th>
                        <th className="px-5 py-3">Size</th>
                        <th className="px-5 py-3">Uploaded</th>
                        <th className="px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-sm text-muted">
                      {ingestions.length === 0 && !isLoading ? (
                        <tr>
                          <td className="px-5 py-8 text-center text-sm" colSpan={6}>
                            No files yet. Try dropping your Q4 board brief or connect a data source.
                          </td>
                        </tr>
                      ) : (
                        ingestions.map((item) => {
                          const displayStatus = STATUS_LABEL[item.status ?? ''] ?? 'Queued';
                          const metadata =
                            item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {};
                          const originalName =
                            typeof metadata.original_filename === 'string' ? (metadata.original_filename as string) : undefined;
                          const displayName =
                            item.original_basename ||
                            originalName ||
                            item.object_suffix ||
                            item.object_key ||
                            item.ingest_id;
                          const rawError = item.error ?? item.dlq_reason;
                          const errorText = rawError ? describeValue(rawError, '') : null;
                          return (
                            <tr key={item.ingest_id} className="align-top">
                              <td className="px-5 py-4 text-sm text-[var(--text)]">
                                <div className="font-medium">{displayName}</div>
                                <p className="mt-1 text-[11px] uppercase tracking-[0.32em] text-muted">
                                  {item.tenant_id} • {item.source || '#console-upload'}
                                  {item.doc_type ? ` • ${item.doc_type}` : ''}
                                </p>
                                {item.labels?.length ? (
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                                    {item.labels.map((label) => (
                                      <span key={label} className="rounded-full border border-[var(--border)] px-2 py-0.5">
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {errorText ? (
                                  <pre className="mt-2 whitespace-pre-wrap text-xs text-[var(--danger)]">{errorText}</pre>
                                ) : null}
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                                    STATUS_CHIP[displayStatus] ?? STATUS_CHIP.Queued
                                  }`}
                                >
                                  {displayStatus}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-sm text-muted">{item.stage ?? '—'}</td>
                              <td className="px-5 py-4 text-sm text-muted">{formatBytes(item.size)}</td>
                              <td className="px-5 py-4 text-sm text-muted">{relativeTime(item.created_at)}</td>
                              <td className="px-5 py-4">
                                <button
                                  type="button"
                                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-sm text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
                                >
                                  ⋯
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </Panel>
              </div>
            </Panel>
          </motion.div>

          <div className="space-y-4">
            <motion.div {...reveal}>
              <Panel className="space-y-4" variant="secondary">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-[var(--text)]">Processing pipeline</h3>
                  <span className="text-xs text-muted">Redact → normalize → chunk → embed → index</span>
                </div>
                <div className="space-y-2">
                  {[{ label: 'Redaction', value: 0.4 }, { label: 'Embedding', value: 0.6 }, { label: 'Indexing', value: 0.8 }].map((step) => (
                    <div key={step.label} className="space-y-1">
                      <p className="text-xs text-muted">{step.label}</p>
                      <div className="h-2 rounded-full bg-[var(--border)]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'var(--grad-1)' }}
                          initial={{ width: 0 }}
                          animate={reduceMotion ? { width: `${step.value * 100}%` } : { width: `${step.value * 100}%` }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>

            <motion.div {...reveal}>
              <Panel variant="secondary">
                <h3 className="font-display text-sm font-semibold text-[var(--text)]">Automated guardrails</h3>
                <p className="mt-2 text-sm text-muted">Failed checks auto-requeue.</p>
              </Panel>
            </motion.div>

            <motion.div {...reveal}>
              <Panel variant="secondary" className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-[var(--text)]">Run status</h3>
                <ul className="space-y-1 text-sm text-muted">
                  <li>In-flight: {summary.processing + summary.queued}</li>
                  <li>Completed: {summary.completed}</li>
                  <li>Failed / DLQ: {summary.failed}</li>
                </ul>
              </Panel>
            </motion.div>

            <motion.div {...reveal}>
              <FeatureRow
                icon="↻"
                title="Reindex on demand"
                description="Button per row or CLI to trigger a fresh enrichment run when policies change."
              />
            </motion.div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-[11px] uppercase tracking-[0.32em] text-muted">
      {label}
      {children}
      {hint && <span className="text-[10px] uppercase tracking-[0.28em] text-muted">{hint}</span>}
    </label>
  );
}
