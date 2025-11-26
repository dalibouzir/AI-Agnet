"use server";

import { readFile } from "fs/promises";

import { resolveChatTranscriptPath } from "@/lib/datasets";
import {
  CitationDoc,
  Kpi,
  ModelStats,
  ObservabilitySnapshot,
  RouteMode,
  RunDetail,
  RunRow,
  TimeBucket,
} from "@/types/observability";

type TranscriptEntry = {
  ts?: string;
  query?: string | null;
  route?: string | null;
  metrics?: {
    latency_ms?: number | null;
    tokens_in?: number | null;
    tokens_out?: number | null;
    cost_usd?: number | null;
    model?: string | null;
  } | null;
  telemetry?: {
    helpUsed?: {
      rag?: boolean;
      risk?: boolean;
    } | null;
    planner_conf?: number | null;
    rag_conf?: number | null;
    docIds?: string[] | null;
    risk_signature?: string | null;
    latency_ms?: number | null;
    tokens_in?: number | null;
    tokens_out?: number | null;
    cost_usd?: number | null;
    disclosure?: string | null;
  } | null;
  citations?: Array<{
    doc_id?: string;
    metadata?: Record<string, unknown> | null;
    source?: string | null;
    id?: string | null;
    title?: string | null;
  }> | null;
  used?: Record<string, unknown> | null;
  mode?: string | null;
  timings?: {
    total_s?: number | string | null;
  } | null;
  usage?: {
    total_tokens?: number | string | null;
    prompt_tokens?: number | string | null;
    completion_tokens?: number | string | null;
    model?: string | null;
  } | null;
  classification?: {
    confidence?: number | string | null;
    reason?: string | null;
  } | null;
  sources_used?: string[] | null;
};

type EventRecord = {
  id: string;
  ts: string;
  route: RouteMode;
  query: string;
  latency: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  model: string;
  citations: CitationHit[];
  helpUsed: {
    rag: boolean;
    risk: boolean;
  };
  docIds: string[];
  riskSignature: string | null;
  plannerConf: number | null;
  ragConf: number | null;
  disclosure: string | null;
};

type CitationHit = {
  id: string;
  title: string;
  type: CitationDoc["type"];
};

const DEFAULT_LIMIT = 500;
const DEFAULT_BUCKET_MINUTES = 5;

const ROUTES: RouteMode[] = ["LLM_ONLY", "LLM_DOCS", "LLM_RISK", "LLM_DOCS_RISK"];

function normalizeRoute(helpUsed: { rag: boolean; risk: boolean }): RouteMode {
  if (helpUsed.rag && helpUsed.risk) return "LLM_DOCS_RISK";
  if (helpUsed.rag) return "LLM_DOCS";
  if (helpUsed.risk) return "LLM_RISK";
  return "LLM_ONLY";
}

function normalizeModel(model: string | null | undefined): string {
  if (!model) return "unknown";
  return model.trim() || "unknown";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadEntries(limit = DEFAULT_LIMIT): Promise<TranscriptEntry[]> {
  const datasetPath = resolveChatTranscriptPath();
  const raw = await readFile(datasetPath, "utf8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const slice = lines.slice(-limit);
  const entries: TranscriptEntry[] = [];
  slice.forEach((line) => {
    try {
      entries.push(JSON.parse(line) as TranscriptEntry);
    } catch {
      // skip malformed entry
    }
  });
  return entries;
}

function detectDocTitle(hit: NonNullable<TranscriptEntry["citations"]>[number]): string {
  const metadata = hit.metadata ?? {};
  const record = metadata as Record<string, unknown>;
  const title = record.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = record.file_name ?? record.filename ?? record.basename;
  if (typeof name === "string" && name.trim()) return name.trim();
  if (typeof hit.source === "string" && hit.source.trim()) return hit.source.trim();
  if (typeof hit.doc_id === "string" && hit.doc_id.trim()) return hit.doc_id.trim();
  return "Unknown document";
}

function detectDocType(title: string): CitationDoc["type"] {
  const lower = title.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "doc";
  return "txt";
}

function toEvents(entries: TranscriptEntry[]): EventRecord[] {
  return entries
    .map((entry, index) => {
      const ts = entry.ts ?? new Date().toISOString();
      const help = {
        rag: Boolean(entry.telemetry?.helpUsed?.rag),
        risk: Boolean(entry.telemetry?.helpUsed?.risk),
      };
      const usedRecord = (entry.used ?? {}) as Record<string, unknown>;
      const usedRag = usedRecord["rag"];
      const usedRisk = usedRecord["risk"];
      if (!help.rag && usedRag) help.rag = true;
      if (!help.risk && usedRisk) help.risk = true;
      if (!help.rag && !help.risk) {
        const legacyRoute =
          typeof entry.route === "string"
            ? entry.route.toUpperCase()
            : typeof entry.mode === "string"
              ? entry.mode.toUpperCase()
              : null;
        if (legacyRoute === "RAG") help.rag = true;
        if (legacyRoute === "RISK") help.risk = true;
      }
      const route = normalizeRoute(help);
      const latencyMs =
        toNumber(entry.metrics?.latency_ms) ??
        toNumber(entry.telemetry?.latency_ms);
      const latencySeconds =
        latencyMs !== null ? latencyMs / 1000 : toNumber(entry.timings?.total_s);
      let tokensIn =
        toNumber(entry.metrics?.tokens_in) ??
        toNumber(entry.telemetry?.tokens_in);
      let tokensOut =
        toNumber(entry.metrics?.tokens_out) ??
        toNumber(entry.telemetry?.tokens_out);
      const legacyPrompt = toNumber(entry.usage?.prompt_tokens);
      const legacyCompletion = toNumber(entry.usage?.completion_tokens);
      if (tokensIn === null && legacyPrompt !== null) tokensIn = legacyPrompt;
      if (tokensOut === null && legacyCompletion !== null) tokensOut = legacyCompletion;
      if ((tokensIn ?? 0) === 0 && (tokensOut ?? 0) === 0) {
        const legacyTotal = toNumber(entry.usage?.total_tokens);
        if (legacyTotal !== null) tokensIn = legacyTotal;
      }
      const costUsd =
        toNumber(entry.metrics?.cost_usd) ??
        toNumber(entry.telemetry?.cost_usd);
      const telemetryModel =
        (entry.telemetry as Record<string, unknown> | null | undefined)?.model;
      const model = normalizeModel(
        (typeof telemetryModel === "string" ? telemetryModel : null) ??
          entry.metrics?.model ??
          entry.usage?.model,
      );
      const citations = Array.isArray(entry.citations)
        ? entry.citations.map((citation) => {
            const title = detectDocTitle(citation);
            const id =
              citation.doc_id ??
              citation.id ??
              title;
            return {
              id,
              title,
              type: detectDocType(title),
            };
          })
        : [];
      const docIds = Array.isArray(entry.telemetry?.docIds)
        ? entry.telemetry?.docIds?.filter((id): id is string => typeof id === "string")
        : Array.isArray(
              (usedRag as { docIds?: unknown[] } | undefined)?.docIds,
          )
          ? ((usedRag as { docIds?: unknown[] }).docIds ?? []).filter(
              (id): id is string => typeof id === "string",
            )
          : [];
      const riskSignature =
        typeof entry.telemetry?.risk_signature === "string"
          ? entry.telemetry?.risk_signature
          : typeof (usedRisk as { signature?: string } | undefined)?.signature === "string"
            ? (usedRisk as { signature?: string }).signature!
            : null;
      const plannerConf =
        toNumber(entry.telemetry?.planner_conf) ??
        toNumber(entry.classification?.confidence);
      const ragConf = toNumber(entry.telemetry?.rag_conf);
      const disclosure =
        typeof entry.telemetry?.disclosure === "string"
          ? entry.telemetry?.disclosure
          : null;
      return {
        id: `run_${index}`,
        ts,
        route,
        query: entry.query ? String(entry.query) : "Unknown prompt",
        latency: latencySeconds,
        tokensIn,
        tokensOut,
        costUsd,
        model,
        citations,
        helpUsed: help,
        docIds,
        riskSignature,
        plannerConf,
        ragConf,
        disclosure,
      };
    })
    .filter((event): event is EventRecord => Boolean(event.ts));
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * ratio;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] + weight * (sorted[upper] - sorted[lower]);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function bucketEvents(events: EventRecord[], bucketMinutes: number): TimeBucket[] {
  const bucketMs = bucketMinutes * 60 * 1000;
  const buckets = new Map<string, Map<string, { latencies: number[]; tokens: number[] }>>();

  events.forEach((event) => {
    const tsValue = Date.parse(event.ts);
    if (Number.isNaN(tsValue)) return;
    const bucketTs = new Date(Math.floor(tsValue / bucketMs) * bucketMs).toISOString();
    const key = `${event.route}|${event.model}`;
    const bucket = buckets.get(bucketTs) ?? new Map<string, { latencies: number[]; tokens: number[] }>();
    const stats = bucket.get(key) ?? { latencies: [], tokens: [] };
    if (typeof event.latency === "number") stats.latencies.push(event.latency);
    const tokenSum =
      (typeof event.tokensIn === "number" ? event.tokensIn : 0) +
      (typeof event.tokensOut === "number" ? event.tokensOut : 0);
    if (tokenSum > 0) stats.tokens.push(tokenSum);
    bucket.set(key, stats);
    buckets.set(bucketTs, bucket);
  });

  const series: TimeBucket[] = [];
  buckets.forEach((bucket, timestamp) => {
    bucket.forEach((stats, key) => {
      const [route, model] = key.split("|");
      const p50 = percentile(stats.latencies, 0.5);
      const p95 = percentile(stats.latencies, 0.95);
      const p99 = percentile(stats.latencies, 0.99);
      const avgTokens = average(stats.tokens);
      series.push({
        t: timestamp,
        route: (route as RouteMode) ?? "LLM_ONLY",
        model,
        p50: p50 ?? 0,
        p95: p95 ?? p50 ?? 0,
        p99: p99 ?? undefined,
        tokens: avgTokens ?? 0,
        errors: 0,
        retries: 0,
      });
    });
  });
  return series.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

function buildKpis(events: EventRecord[]): Kpi[] {
  const latencies = events.flatMap((event) => (typeof event.latency === "number" ? [event.latency] : []));
  const tokens = events.flatMap((event) => {
    const total =
      (typeof event.tokensIn === "number" ? event.tokensIn : 0) +
      (typeof event.tokensOut === "number" ? event.tokensOut : 0);
    return total > 0 ? [total] : [];
  });
  const plannerScores = events.flatMap((event) =>
    typeof event.plannerConf === "number" ? [event.plannerConf * 100] : []
  );
  const docsShare = events.filter((event) => event.helpUsed.rag).length;
  const simShare = events.filter((event) => event.helpUsed.risk).length;
  const total = events.length || 1;
  const spark = (values: number[]) => values.slice(-12);

  return [
    {
      label: "Interactions",
      value: events.length.toLocaleString(),
      deltaPct: 0,
      spark: spark(Array(events.length).fill(1)),
    },
    {
      label: "Latency p95",
      value: Number((percentile(latencies, 0.95) ?? 0).toFixed(2)),
      deltaPct: 0,
      spark: spark(latencies),
      helper: "seconds",
    },
    {
      label: "Avg tokens",
      value: Math.round(average(tokens) ?? 0),
      deltaPct: 0,
      spark: spark(tokens),
      helper: "per response",
    },
    {
      label: "Planner confidence",
      value: Number((average(plannerScores) ?? 0).toFixed(1)),
      deltaPct: 0,
      spark: spark(plannerScores),
      helper: "score %",
    },
    {
      label: "Docs helper %",
      value: Number(((docsShare / total) * 100).toFixed(1)),
      deltaPct: 0,
      spark: spark(Array(docsShare).fill(100)),
    },
    {
      label: "Simulation helper %",
      value: Number(((simShare / total) * 100).toFixed(1)),
      deltaPct: 0,
      spark: spark(Array(simShare).fill(100)),
    },
  ];
}

function buildModelStats(events: EventRecord[]): ModelStats[] {
  const grouped = new Map<
    string,
    {
      latencies: number[];
      tokens: number[];
      total: number;
      lastSeen: string;
      docsHelp: number;
      simHelp: number;
    }
  >();

  events.forEach((event) => {
    const bucket = grouped.get(event.model) ?? {
      latencies: [],
      tokens: [],
      total: 0,
      lastSeen: event.ts,
      docsHelp: 0,
      simHelp: 0,
    };
    if (typeof event.latency === "number") bucket.latencies.push(event.latency);
    const tokenSum =
      (typeof event.tokensIn === "number" ? event.tokensIn : 0) +
      (typeof event.tokensOut === "number" ? event.tokensOut : 0);
    if (tokenSum > 0) bucket.tokens.push(tokenSum);
    bucket.total += 1;
    bucket.lastSeen = event.ts;
    if (event.helpUsed.rag) bucket.docsHelp += 1;
    if (event.helpUsed.risk) bucket.simHelp += 1;
    grouped.set(event.model, bucket);
  });

  return Array.from(grouped.entries())
    .map(([model, bucket]) => ({
      model,
      runs: bucket.total,
      p50: Number((percentile(bucket.latencies, 0.5) ?? 0).toFixed(2)),
      p95: Number((percentile(bucket.latencies, 0.95) ?? 0).toFixed(2)),
      avgTokens: Math.round(average(bucket.tokens) ?? 0),
      docsShare: Number(((bucket.docsHelp / bucket.total) * 100 || 0).toFixed(1)),
      simShare: Number(((bucket.simHelp / bucket.total) * 100 || 0).toFixed(1)),
      lastSeen: bucket.lastSeen,
    }))
    .sort((a, b) => b.runs - a.runs);
}

function buildDocs(events: EventRecord[]): CitationDoc[] {
  const docs = new Map<string, CitationDoc>();
  events.forEach((event) => {
    event.citations.forEach((hit) => {
      const doc =
        docs.get(hit.id) ?? { id: hit.id, title: hit.title, type: hit.type, cites: 0, lastUsed: event.ts };
      doc.cites += 1;
      doc.lastUsed = event.ts;
      docs.set(hit.id, doc);
    });
  });
  return Array.from(docs.values()).sort((a, b) => b.cites - a.cites);
}

function buildRuns(events: EventRecord[], limit: number): RunDetail[] {
  return [...events]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      ts: event.ts,
      route: event.route,
      model: event.model,
      latency: Number((event.latency ?? 0).toFixed(2)),
      tokIn: event.tokensIn ?? 0,
      tokOut: event.tokensOut ?? 0,
      citations: event.citations.length,
      query: event.query,
      status: "ok",
      confidence: null,
      plannerConf: event.plannerConf ?? null,
      ragConf: event.ragConf ?? null,
      helpUsed: event.helpUsed,
      docIds: event.docIds,
      riskSignature: event.riskSignature,
      disclosure: event.disclosure,
      prompt: event.query,
      response: "Response body unavailable in transcript export.",
    }));
}

function filterEvents(events: EventRecord[], from?: string | null, to?: string | null): EventRecord[] {
  const fromTs = from ? Date.parse(from) : null;
  const toTs = to ? Date.parse(to) : null;
  return events.filter((event) => {
    const ts = Date.parse(event.ts);
    if (Number.isNaN(ts)) return false;
    if (fromTs && ts < fromTs) return false;
    if (toTs && ts > toTs) return false;
    return true;
  });
}

function parseRange(searchParams: URLSearchParams): { from: string; to: string } {
  const toParam = searchParams.get("to");
  const fromParam = searchParams.get("from");
  const now = new Date();
  const to = toParam && !Number.isNaN(Date.parse(toParam)) ? new Date(toParam) : now;
  const from =
    fromParam && !Number.isNaN(Date.parse(fromParam))
      ? new Date(fromParam)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function buildSnapshot(searchParams: URLSearchParams): Promise<{ source: "live"; data: ObservabilitySnapshot }> {
  const bucketMinutes = Number(searchParams.get("bucket") ?? DEFAULT_BUCKET_MINUTES);
  const limit = Number(searchParams.get("limit") ?? 1000);
  const { from, to } = parseRange(searchParams);
  const entries = await loadEntries();
  const events = filterEvents(toEvents(entries), from, to);
  const kpis = buildKpis(events);
  const latencySeries = bucketEvents(events, bucketMinutes);
  const docs = buildDocs(events);
  const runs = buildRuns(events, limit);
  const modelStats = buildModelStats(events);

  const snapshot: ObservabilitySnapshot = {
    generatedAt: new Date().toISOString(),
    tenant: searchParams.get("tenant") ?? "default",
    from,
    to,
    kpis,
    latency: latencySeries,
    tokensCost: latencySeries,
    routingMix: latencySeries,
    errors: latencySeries,
    modelStats,
    router: null,
    docs,
    runs,
  };
  return { source: "live", data: snapshot };
}
