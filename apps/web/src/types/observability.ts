export type RouteMode = 'LLM_ONLY' | 'LLM_DOCS' | 'LLM_RISK' | 'LLM_DOCS_RISK';

export type TimeBucket = {
  t: string;
  p50: number;
  p95: number;
  p99?: number;
  tokens: number;
  cost?: number;
  route: RouteMode;
  model: string;
  errors?: number;
  retries?: number;
};

export type Kpi = {
  label: string;
  value: number | string;
  deltaPct?: number;
  spark: number[];
  helper?: string;
};

export type ModelStats = {
  model: string;
  runs: number;
  p50: number;
  p95: number;
  avgTokens: number;
  docsShare: number;
  simShare: number;
  lastSeen: string;
};

export type RouterMetrics = {
  confusion: number[][];
  labels: string[];
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1: Record<string, number>;
  misroutes: { id: string; expected: string; got: string; prompt: string; ts: string }[];
};

export type CitationDoc = {
  id: string;
  title: string;
  type: 'pdf' | 'csv' | 'doc' | 'txt';
  cites: number;
  lastUsed: string;
};

export type RunRow = {
  id: string;
  ts: string;
  route: RouteMode;
  model: string;
  latency: number;
  tokIn: number;
  tokOut: number;
  citations: number;
  query: string;
  status: 'ok' | 'error' | 'timeout';
  confidence?: number | null;
  plannerConf?: number | null;
  ragConf?: number | null;
  helpUsed: {
    rag: boolean;
    risk: boolean;
  };
  docIds: string[];
  riskSignature?: string | null;
  disclosure?: string | null;
};

export type RunDetail = RunRow & {
  prompt?: string;
  response?: string;
};

export type ObservabilitySnapshot = {
  generatedAt: string;
  tenant: string;
  from: string;
  to: string;
  kpis: Kpi[];
  latency: TimeBucket[];
  tokensCost: TimeBucket[];
  routingMix: TimeBucket[];
  errors: TimeBucket[];
  modelStats: ModelStats[];
  router: RouterMetrics | null;
  docs: CitationDoc[];
  runs: RunDetail[];
};

export type PriceBook = Record<string, number>;
