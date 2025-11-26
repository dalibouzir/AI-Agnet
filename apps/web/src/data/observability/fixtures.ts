import {
  CitationDoc,
  Kpi,
  ModelStats,
  ObservabilitySnapshot,
  PriceBook,
  RouteMode,
  RunDetail,
  RunRow,
  RouterMetrics,
  TimeBucket,
} from '@/types/observability';

type ModelConfig = {
  id: string;
  label: string;
  route: RouteMode;
  baseLatency: number;
  tokenMean: number;
  acceptance: number;
  hallucination: number;
  docsShare: number;
  simShare: number;
};

const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    route: 'LLM_ONLY',
    baseLatency: 1.2,
    tokenMean: 900,
    acceptance: 0.93,
    hallucination: 0.015,
    docsShare: 0.18,
    simShare: 0.04,
  },
  {
    id: 'qwen-2.5-1.8b',
    label: 'Qwen 2.5 1.8B',
    route: 'LLM_DOCS',
    baseLatency: 1.6,
    tokenMean: 720,
    acceptance: 0.9,
    hallucination: 0.022,
    docsShare: 0.62,
    simShare: 0.08,
  },
  {
    id: 'llama-3.1-8b',
    label: 'Llama 3.1 8B',
    route: 'LLM_DOCS_RISK',
    baseLatency: 2.05,
    tokenMean: 640,
    acceptance: 0.87,
    hallucination: 0.03,
    docsShare: 0.2,
    simShare: 0.21,
  },
];

const PRICE_BOOK: PriceBook = {
  'gpt-4o-mini': 0.35,
  'qwen-2.5-1.8b': 0.12,
  'llama-3.1-8b': 0.1,
};

const HOURS = 48;
const BUCKET_MINUTES = 5;
const TOTAL_POINTS = (HOURS * 60) / BUCKET_MINUTES;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTimeBuckets(): TimeBucket[] {
  const rng = mulberry32(42);
  const now = Date.now();
  const start = now - HOURS * 60 * 60 * 1000;
  const buckets: TimeBucket[] = [];

  for (let i = 0; i < TOTAL_POINTS; i += 1) {
    const ts = new Date(start + i * BUCKET_MINUTES * 60 * 1000).toISOString();
    MODEL_CONFIGS.forEach((config, idx) => {
      const seasonal = Math.sin((i / TOTAL_POINTS) * Math.PI * 4 + idx) * 0.2;
      const loadFactor = 0.75 + rng() * 0.5 + seasonal;
      const p50 = Math.max(0.6, config.baseLatency * loadFactor);
      const p95 = p50 * (1.35 + rng() * 0.15);
      const p99 = p95 * (1.2 + rng() * 0.05);
      const tokens = Math.max(
        320,
        config.tokenMean * (0.7 + rng() * 0.8 + seasonal * 0.5)
      );
      const cost = ((tokens / 1000) * (PRICE_BOOK[config.id] ?? 0.2)) * (0.9 + rng() * 0.2);
      const errorSpike =
        i % 144 === 0 && config.route.includes('DOCS') ? Math.round(6 + rng() * 4) : 0;
      const errors = errorSpike || (rng() > 0.92 ? 1 : 0);
      const retries = errors ? Math.max(1, Math.round(errors * (0.8 + rng()))) : rng() > 0.96 ? 1 : 0;

      buckets.push({
        t: ts,
        p50,
        p95,
        p99,
        tokens,
        cost,
        route: config.route,
        model: config.id,
        errors,
        retries,
      });
    });
  }
  return buckets;
}

function buildKpis(latencyBuckets: TimeBucket[]): Kpi[] {
  if (!latencyBuckets.length) return [];
  const latest = latencyBuckets.slice(-MODEL_CONFIGS.length);
  const baseWindow = latencyBuckets.slice(-MODEL_CONFIGS.length * 12);

  const interactions = latest.length;
  const latencyValues = latest.map((b) => b.p95);
  const avgLatency = latencyValues.reduce((acc, value) => acc + value, 0) / latencyValues.length;
  const tokens = latest.reduce((acc, bucket) => acc + bucket.tokens, 0) / latest.length;
  const plannerConfidence = 0.88;
  const docsShare =
    latest.filter((bucket) => bucket.route.includes('DOCS')).length / latest.length;
  const simShare =
    latest.filter((bucket) => bucket.route.includes('RISK')).length / latest.length;
  const cost = latest.reduce((acc, bucket) => acc + (bucket.cost ?? 0), 0);

  const delta = (value: number, accessor: (bucket: TimeBucket) => number) => {
    const prev = baseWindow.reduce((acc, bucket) => acc + accessor(bucket), 0) / baseWindow.length || value;
    return ((value - prev) / prev) * 100;
  };

  const sparkFor = (accessor: (bucket: TimeBucket) => number) =>
    baseWindow.slice(-12).map(accessor);

  return [
    { label: 'Interactions', value: interactions.toLocaleString(), deltaPct: delta(interactions, () => 1), spark: sparkFor(() => 1) },
    { label: 'Latency p95', value: Number(avgLatency.toFixed(2)), deltaPct: delta(avgLatency, (b) => b.p95), spark: sparkFor((b) => b.p95), helper: 'seconds' },
    { label: 'Avg Tokens', value: Math.round(tokens), deltaPct: delta(tokens, (b) => b.tokens), spark: sparkFor((b) => b.tokens), helper: 'per response' },
    { label: 'Planner Confidence', value: Number((plannerConfidence * 100).toFixed(1)), deltaPct: 0.8, spark: sparkFor(() => plannerConfidence * 100), helper: 'avg score %' },
    { label: 'Docs Helper %', value: Number((docsShare * 100).toFixed(1)), deltaPct: 2.1, spark: sparkFor((b) => (b.route.includes('DOCS') ? 100 : 0)) },
    { label: 'Simulation Helper %', value: Number((simShare * 100).toFixed(1)), deltaPct: -1.7, spark: sparkFor((b) => (b.route.includes('RISK') ? 100 : 0)) },
    { label: 'Est. Cost ($)', value: Number(cost.toFixed(2)), deltaPct: delta(cost, (b) => b.cost ?? 0), spark: sparkFor((b) => b.cost ?? 0) },
  ];
}

function buildModelStats(buckets: TimeBucket[]): ModelStats[] {
  const grouped = new Map<string, TimeBucket[]>();
  buckets.forEach((bucket) => {
    grouped.set(bucket.model, [...(grouped.get(bucket.model) ?? []), bucket]);
  });

  return Array.from(grouped.entries()).map(([model, series]) => {
    const runs = series.length;
    const p50 = series.reduce((acc, bucket) => acc + bucket.p50, 0) / runs;
    const p95 = series.reduce((acc, bucket) => acc + bucket.p95, 0) / runs;
    const avgTokens = series.reduce((acc, bucket) => acc + bucket.tokens, 0) / runs;
    const costPerK = PRICE_BOOK[model] ?? 0.18;
    const docsShare =
      series.filter((bucket) => bucket.route.includes('DOCS')).length / runs;
    const simShare =
      series.filter((bucket) => bucket.route.includes('RISK')).length / runs;
    const acceptRate =
      (MODEL_CONFIGS.find((config) => config.id === model)?.acceptance ?? 0.9) * 100;
    const hallucPct =
      (MODEL_CONFIGS.find((config) => config.id === model)?.hallucination ?? 0.02) * 100;
    const lastSeen = series[series.length - 1]?.t ?? new Date().toISOString();

    return {
      model,
      runs,
      p50: Number(p50.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      avgTokens: Number(avgTokens.toFixed(0)),
      costPerK: Number(costPerK.toFixed(2)),
      docsShare: Number((docsShare * 100).toFixed(1)),
      simShare: Number((simShare * 100).toFixed(1)),
      acceptRate: Number(acceptRate.toFixed(1)),
      hallucPct: Number(hallucPct.toFixed(2)),
      lastSeen,
    };
  });
}

function buildRouterMetrics(): RouterMetrics {
  const labels: RouteMode[] = ['LLM_ONLY', 'LLM_DOCS', 'LLM_RISK'];
  const confusion = [
    [1890, 46, 12],
    [33, 2054, 41],
    [9, 58, 1712],
  ];
  const totals = confusion.map((row) => row.reduce((acc, value) => acc + value, 0));

  const precision: Record<string, number> = {};
  const recall: Record<string, number> = {};
  const f1: Record<string, number> = {};

  labels.forEach((label, idx) => {
    const tp = confusion[idx][idx];
    const colTotal = confusion.reduce((acc, row) => acc + row[idx], 0);
    const prec = tp / colTotal;
    const rec = tp / totals[idx];
    const fScore = (2 * prec * rec) / (prec + rec);
    precision[label] = Number((prec * 100).toFixed(2));
    recall[label] = Number((rec * 100).toFixed(2));
    f1[label] = Number((fScore * 100).toFixed(2));
  });

  return {
    confusion,
    labels,
    precision,
    recall,
    f1,
    misroutes: [
      {
        id: 'run_mr_1',
        expected: 'LLM_DOCS',
        got: 'LLM_ONLY',
        prompt: 'Summarize the uploaded PDF for the board.',
        ts: new Date().toISOString(),
      },
      {
        id: 'run_mr_2',
        expected: 'LLM_RISK',
        got: 'LLM_ONLY',
        prompt: 'Run the Monte Carlo for France launch at EUR 200k.',
        ts: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      },
      {
        id: 'run_mr_3',
        expected: 'LLM_ONLY',
        got: 'LLM_DOCS',
        prompt: 'Draft a leadership blurb for Q3 memo.',
        ts: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      },
    ],
  };
}

function buildDocs(): CitationDoc[] {
  return [
    {
      id: 'doc_1',
      title: 'Go-to-market Playbook v2',
      type: 'pdf',
      cites: 128,
      lastUsed: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 'doc_2',
      title: 'Pipeline Metrics.csv',
      type: 'csv',
      cites: 84,
      lastUsed: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    },
    {
      id: 'doc_3',
      title: 'Risk guidelines.txt',
      type: 'txt',
      cites: 62,
      lastUsed: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    },
    {
      id: 'doc_4',
      title: 'AI Council Notes.doc',
      type: 'doc',
      cites: 47,
      lastUsed: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
      id: 'doc_5',
      title: 'Monte Carlo recap',
      type: 'pdf',
      cites: 39,
      lastUsed: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
    },
  ];
}

const SAMPLE_QUERIES = [
  'How did revenue trend vs. plan?',
  'Summarize retention in LATAM.',
  'Draft a note for CS leadership.',
  'Create a Monte Carlo narrative for France.',
  'What is the router confidence trend?',
  'Compare GPT-4o mini vs Llama 3.1.',
];

function redact(text: string): string {
  const PII_REGEX = /\b[\w.-]+@[\w.-]+\.\w{2,}\b|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  return text.replace(PII_REGEX, '[redacted]');
}

function buildRuns(buckets: TimeBucket[]): { rows: RunRow[]; details: Record<string, RunDetail> } {
  const rows: RunRow[] = [];
  const details: Record<string, RunDetail> = {};
  buckets.forEach((bucket, idx) => {
    const id = `run_${idx}`;
    const status = (bucket.errors ?? 0) > 0 ? 'error' : (bucket.retries ?? 0) > 2 ? 'timeout' : 'ok';
    const tokIn = Math.round(bucket.tokens * 0.6);
    const tokOut = Math.round(bucket.tokens * 0.4);
    const query = SAMPLE_QUERIES[idx % SAMPLE_QUERIES.length];
    const helpUsed = {
      rag: bucket.route.includes('DOCS'),
      risk: bucket.route.includes('RISK'),
    };
    const docIds = helpUsed.rag ? [`doc_${(idx % 5) + 1}`] : [];
    const row: RunRow = {
      id,
      ts: bucket.t,
      route: bucket.route,
      model: bucket.model,
      latency: Number(bucket.p95.toFixed(2)),
      tokIn,
      tokOut,
      citations: Math.round(bucket.route.includes('DOCS') ? 2 + (idx % 3) : bucket.route.includes('RISK') ? 1 : 0),
      query,
      status,
      plannerConf: 0.75 + ((idx % 5) * 0.02),
      ragConf: helpUsed.rag ? 0.62 + ((idx % 4) * 0.03) : null,
      helpUsed,
      docIds,
      riskSignature: helpUsed.risk ? `sig_${idx}` : null,
      disclosure: helpUsed.rag || helpUsed.risk ? `Answered by LLM with help from: Documents (${docIds.length}) • Simulation v1.3` : 'Answered by LLM with help from: Documents (0) • Simulation (not used)',
    };
    rows.push(row);
    details[id] = {
      ...row,
      prompt: redact(`User prompt:\n${query}\nInclude latest KPI snapshot for tenant ${idx % 3 === 0 ? 'Northwind' : 'Acme'}.\nContact: finance-${idx}@example.com`),
      response: redact('Detailed response with KPIs, routing context, and anonymized contact guidance. Phone +1-415-555-0199 inside the note.'),
    };
  });
  return { rows, details };
}

const TIME_BUCKETS = buildTimeBuckets();
const KPIS = buildKpis(TIME_BUCKETS);
const MODEL_STATS = buildModelStats(TIME_BUCKETS);
const ROUTER = buildRouterMetrics();
const DOCS = buildDocs();
const RUN_DATA = buildRuns(TIME_BUCKETS);

export const observabilityFixture: ObservabilitySnapshot = {
  generatedAt: new Date().toISOString(),
  tenant: 'Acme Retail',
  from: new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString(),
  to: new Date().toISOString(),
  kpis: KPIS,
  latency: TIME_BUCKETS,
  tokensCost: TIME_BUCKETS,
  routingMix: TIME_BUCKETS,
  errors: TIME_BUCKETS,
  modelStats: MODEL_STATS,
  router: ROUTER,
  docs: DOCS,
  runs: RUN_DATA.rows,
};

export const runDetailsFixture = RUN_DATA.details;
export const priceBookFixture = PRICE_BOOK;

export function getRunDetailFixture(runId: string): RunDetail | undefined {
  return runDetailsFixture[runId];
}

export function filterBucketsByRange(buckets: TimeBucket[], from?: string | null, to?: string | null): TimeBucket[] {
  if (!from && !to) return buckets;
  const fromTs = from ? Date.parse(from) : null;
  const toTs = to ? Date.parse(to) : null;
  return buckets.filter((bucket) => {
    const ts = Date.parse(bucket.t);
    if (Number.isNaN(ts)) return true;
    if (fromTs && ts < fromTs) return false;
    if (toTs && ts > toTs) return false;
    return true;
  });
}

export function filterRunsByRange(runs: RunRow[], from?: string | null, to?: string | null): RunRow[] {
  if (!from && !to) return runs;
  const fromTs = from ? Date.parse(from) : null;
  const toTs = to ? Date.parse(to) : null;
  return runs.filter((run) => {
    const ts = Date.parse(run.ts);
    if (Number.isNaN(ts)) return true;
    if (fromTs && ts < fromTs) return false;
    if (toTs && ts > toTs) return false;
    return true;
  });
}

export function computeKpisFromBuckets(buckets: TimeBucket[]): Kpi[] {
  if (!buckets.length) return KPIS;
  return buildKpis(buckets);
}

export function computeModelStatsFromBuckets(buckets: TimeBucket[]): ModelStats[] {
  if (!buckets.length) return MODEL_STATS;
  return buildModelStats(buckets);
}
