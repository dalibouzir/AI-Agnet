import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';

import { resolveChatTranscriptPath } from '@/lib/datasets';

type TranscriptEntry = {
  ts?: string;
  query?: string | null;
  mode?: string | null;
  timings?: {
    total_s?: number | null;
    llm_s?: number | null;
    retrieve_s?: number | null;
    classify_s?: number | null;
    simulate_s?: number | null;
  } | null;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    model?: string | null;
  } | null;
  classification?: {
    confidence?: number | null;
    reason?: string | null;
  } | null;
  citations?: Array<{
    doc_id?: string;
    docId?: string;
    chunk_id?: string;
    chunkId?: string;
    metadata?: Record<string, unknown> | null;
    source?: string | null;
  }> | null;
};

type MetricSummary = {
  id: string;
  label: string;
  value: number;
  unit?: string;
};

type TimeseriesPoint = {
  ts: string;
  value: number;
};

type EventSummary = {
  ts: string;
  query: string;
  mode: string;
  latency: number | null;
  tokens: number | null;
  confidence: number | null;
  model: string | null;
  citations: number;
};

type DocumentSummary = {
  id: string;
  label: string;
  count: number;
};

type TranscriptCitation = NonNullable<TranscriptEntry['citations']>[number];

type ModelMetricGroup = {
  id: string;
  label: string;
  metrics: MetricSummary[];
  totalRuns: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

type ObservabilitySummary = {
  generatedAt: string;
  totalInteractions: number;
  metrics: MetricSummary[];
  modelMetrics: ModelMetricGroup[];
  timeseries: {
    latency: TimeseriesPoint[];
    tokens: TimeseriesPoint[];
    confidence: TimeseriesPoint[];
  };
  events: EventSummary[];
  documents: DocumentSummary[];
};

const DEFAULT_LIMIT = 200;
const MODEL_LABEL_OVERRIDES: Record<string, string> = {
  'ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1:CaIy8Jh2': 'AI Business Agent v1 (ft GPT-4o mini)',
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-4o-mini-2024-07-18': 'GPT-4o mini',
  'qwen2.5:1.5b-instruct': 'Qwen 2.5 1.5B',
};

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const base = Math.floor(position);
  const rest = position - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function safeMode(mode: string | null | undefined): string {
  if (!mode) return 'LLM';
  const normalized = mode.toString().trim().toUpperCase();
  if (['LLM', 'RAG', 'RISK'].includes(normalized)) {
    return normalized;
  }
  return 'LLM';
}

function resolveDocumentLabel(entry: TranscriptCitation | null | undefined): string | null {
  if (!entry) return null;
  const metadata = entry.metadata ?? undefined;
  if (metadata && typeof metadata === 'object') {
    const record = metadata as Record<string, unknown>;
    const title = record.title;
    if (typeof title === 'string' && title.trim()) {
      return title.trim();
    }
    const filename = record.file_name ?? record.filename;
    if (typeof filename === 'string' && filename.trim()) {
      return filename.trim();
    }
  }
  const source = entry.source;
  if (typeof source === 'string' && source.trim()) {
    return source.trim();
  }
  const docId = entry.doc_id ?? entry.docId;
  if (typeof docId === 'string' && docId.trim()) {
    return docId.trim();
  }
  return null;
}

function normalizeModel(model: string | null | undefined): string {
  if (!model) return 'unknown';
  const normalized = model.trim();
  return normalized ? normalized : 'unknown';
}

function friendlyModelLabel(modelId: string): string {
  const key = modelId.toLowerCase();
  for (const [needle, label] of Object.entries(MODEL_LABEL_OVERRIDES)) {
    if (key.includes(needle.toLowerCase())) {
      return label;
    }
  }
  if (modelId === 'unknown') return 'Unknown model';
  return modelId;
}

async function loadTranscripts(limit = DEFAULT_LIMIT): Promise<TranscriptEntry[]> {
  const datasetPath = resolveChatTranscriptPath();
  try {
    const raw = await readFile(datasetPath, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const recentLines = lines.slice(-limit);
    const entries: TranscriptEntry[] = [];
    for (const line of recentLines) {
      try {
        const parsed = JSON.parse(line) as TranscriptEntry;
        entries.push(parsed);
      } catch {
        // ignore malformed entries
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function buildSummary(entries: TranscriptEntry[]): ObservabilitySummary {
  const totalInteractions = entries.length;
  const latencyValues: number[] = [];
  const tokenValues: number[] = [];
  const confidenceValues: number[] = [];
  const timeseriesLatency: TimeseriesPoint[] = [];
  const timeseriesTokens: TimeseriesPoint[] = [];
  const timeseriesConfidence: TimeseriesPoint[] = [];
  const documentsCounter = new Map<string, number>();
  const modelBuckets = new Map<
    string,
    {
      latency: number[];
      tokens: number[];
      confidence: number[];
      modes: Record<string, number>;
      total: number;
      firstSeen: string | null;
      lastSeen: string | null;
    }
  >();

  const recordModelSample = (
    modelId: string,
    sample: { latency: number | null; tokens: number | null; confidence: number | null; mode: string; ts: string | null }
  ) => {
    if (!modelBuckets.has(modelId)) {
      modelBuckets.set(modelId, {
        latency: [],
        tokens: [],
        confidence: [],
        modes: { LLM: 0, RAG: 0, RISK: 0 },
        total: 0,
        firstSeen: null,
        lastSeen: null,
      });
    }
    const bucket = modelBuckets.get(modelId)!;
    bucket.total += 1;
    if (sample.latency !== null) {
      bucket.latency.push(sample.latency);
    }
    if (sample.tokens !== null) {
      bucket.tokens.push(sample.tokens);
    }
    if (sample.confidence !== null) {
      bucket.confidence.push(sample.confidence);
    }
    bucket.modes[sample.mode] = (bucket.modes[sample.mode] ?? 0) + 1;
    if (sample.ts) {
      if (!bucket.firstSeen || new Date(sample.ts).getTime() < new Date(bucket.firstSeen).getTime()) {
        bucket.firstSeen = sample.ts;
      }
      if (!bucket.lastSeen || new Date(sample.ts).getTime() > new Date(bucket.lastSeen).getTime()) {
        bucket.lastSeen = sample.ts;
      }
    }
  };

  const events: EventSummary[] = entries
    .map((entry) => {
      const ts = entry.ts ?? null;
      const mode = safeMode(entry.mode ?? null);
      const latency = toNumber(entry.timings?.total_s);
      const tokens = toNumber(entry.usage?.total_tokens);
      const confidence = toNumber(entry.classification?.confidence);
      const model = normalizeModel(entry.usage?.model ?? null);
      const citationsCount = Array.isArray(entry.citations) ? entry.citations.length : 0;

      if (latency !== null) {
        latencyValues.push(latency);
      }
      if (tokens !== null) {
        tokenValues.push(tokens);
      }
      if (confidence !== null) {
        confidenceValues.push(confidence);
      }
      recordModelSample(model, { latency, tokens, confidence, mode, ts });
      if (ts && latency !== null) {
        timeseriesLatency.push({ ts, value: latency });
      }
      if (ts && tokens !== null) {
        timeseriesTokens.push({ ts, value: tokens });
      }
      if (ts && confidence !== null) {
        timeseriesConfidence.push({ ts, value: confidence * 100 });
      }

      if (Array.isArray(entry.citations)) {
        for (const citation of entry.citations) {
          const label = resolveDocumentLabel(citation);
          if (!label) continue;
          documentsCounter.set(label, (documentsCounter.get(label) ?? 0) + 1);
        }
      }

      return {
        ts: ts ?? new Date().toISOString(),
        query: entry.query ? entry.query.toString() : 'Unknown prompt',
        mode,
        latency,
        tokens,
        confidence,
        model,
        citations: citationsCount,
      };
    })
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 30);

  const latencyP95 = percentile(latencyValues, 0.95);
  const latencyAvg = average(latencyValues);
  const tokensAvg = average(tokenValues);
  const confidenceAvg = average(confidenceValues);

  const modeCounts = entries.reduce(
    (acc, entry) => {
      const mode = safeMode(entry.mode ?? null);
      acc[mode] = (acc[mode] ?? 0) + 1;
      return acc;
    },
    { LLM: 0, RAG: 0, RISK: 0 } as Record<string, number>
  );

  const documents: DocumentSummary[] = Array.from(documentsCounter.entries())
    .map(([label, count]) => ({ id: label, label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const deriveMetrics = (
    latencySample: number[],
    tokenSample: number[],
    confidenceSample: number[],
    modeSample: Record<string, number>,
    totalSample: number
  ): MetricSummary[] => {
    const p95 = percentile(latencySample, 0.95);
    const avgLatency = average(latencySample);
    const avgTokens = average(tokenSample);
    const avgConfidence = average(confidenceSample);
    return [
      p95 !== null ? { id: 'latency_p95', label: 'Latency p95', value: p95, unit: 's' } : null,
      avgLatency !== null ? { id: 'latency_avg', label: 'Latency avg', value: avgLatency, unit: 's' } : null,
      avgTokens !== null ? { id: 'tokens_avg', label: 'Avg tokens', value: avgTokens } : null,
      avgConfidence !== null ? { id: 'confidence_avg', label: 'Avg confidence', value: avgConfidence * 100, unit: '%' } : null,
      totalSample > 0 ? { id: 'rag_share', label: 'RAG share', value: (modeSample.RAG / totalSample) * 100, unit: '%' } : null,
      totalSample > 0 ? { id: 'risk_share', label: 'Risk share', value: (modeSample.RISK / totalSample) * 100, unit: '%' } : null,
    ].filter((metric): metric is MetricSummary => metric !== null);
  };

  const metrics = deriveMetrics(latencyValues, tokenValues, confidenceValues, modeCounts, totalInteractions);

  const modelMetrics: ModelMetricGroup[] = Array.from(modelBuckets.entries())
    .map(([id, bucket]) => ({
      id,
      label: friendlyModelLabel(id),
      metrics: deriveMetrics(bucket.latency, bucket.tokens, bucket.confidence, bucket.modes, bucket.total),
      totalRuns: bucket.total,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns);

  const sortByTimestamp = (series: TimeseriesPoint[]) =>
    [...series].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return {
    generatedAt: new Date().toISOString(),
    totalInteractions,
    metrics,
    modelMetrics,
    timeseries: {
      latency: sortByTimestamp(timeseriesLatency).slice(-60),
      tokens: sortByTimestamp(timeseriesTokens).slice(-60),
      confidence: sortByTimestamp(timeseriesConfidence).slice(-60),
    },
    events,
    documents,
  };
}

export async function GET() {
  const entries = await loadTranscripts();
  const summary = buildSummary(entries);
  return NextResponse.json(summary);
}
