"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/Button";
import { RouteMode, RunDetail } from "@/types/observability";

type Props = {
  detail: RunDetail;
  onClose: () => void;
  onExportJSON: (payload: unknown, filename: string) => void;
};

const STATUS_COLORS: Record<RunDetail["status"], string> = {
  ok: "text-emerald-500",
  error: "text-rose-500",
  timeout: "text-amber-500",
};

const ROUTE_LABELS: Record<RouteMode, string> = {
  LLM_ONLY: "LLM only",
  LLM_DOCS: "LLM + Docs",
  LLM_RISK: "LLM + Simulation",
  LLM_DOCS_RISK: "LLM + Docs + Sim",
};

export function RunDetailDrawer({ detail, onClose, onExportJSON }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-background p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-lg font-semibold">Run {detail.id}</h4>
            <p className="text-xs text-muted-foreground">{new Date(detail.ts).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-border px-2 py-1">{ROUTE_LABELS[detail.route]}</span>
            <span className="rounded-full border border-border px-2 py-1">{detail.model}</span>
            <span className={`rounded-full border border-border px-2 py-1 ${STATUS_COLORS[detail.status]}`}>{detail.status.toUpperCase()}</span>
            <Button tone="secondary" onClick={() => onExportJSON(detail, `run-${detail.id}`)} className="gap-1 rounded-full px-3 py-1 text-xs">
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
            <Button tone="secondary" onClick={onClose} className="rounded-full px-3 py-1 text-xs">
              Close
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Metric label="Latency" value={`${detail.latency}s`} />
          <Metric label="Tokens in/out" value={`${detail.tokIn.toLocaleString()} / ${detail.tokOut.toLocaleString()}`} />
          {typeof detail.plannerConf === "number" && (
            <Metric label="Planner confidence" value={`${(detail.plannerConf * 100).toFixed(1)}%`} />
          )}
          {typeof detail.ragConf === "number" && <Metric label="RAG confidence" value={`${(detail.ragConf * 100).toFixed(1)}%`} />}
          <Metric label="Docs cited" value={detail.docIds.length} />
          {detail.riskSignature && <Metric label="Simulation signature" value={detail.riskSignature.slice(0, 10)} />}
          <Metric label="Citations" value={detail.citations} />
        </div>
        {detail.disclosure && (
          <div className="mt-4 rounded-2xl border border-border/60 px-3 py-2 text-sm text-muted-foreground">
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Disclosure</p>
            <p className="mt-1 whitespace-pre-line">{detail.disclosure}</p>
          </div>
        )}
        {detail.docIds.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border/60 px-3 py-2 text-sm text-muted-foreground">
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Document IDs</p>
            <p className="mt-1 break-all">{detail.docIds.join(", ")}</p>
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h5 className="text-sm font-semibold">Prompt</h5>
            <p className="mt-2 rounded-2xl bg-muted/80 p-3 text-sm text-muted-foreground whitespace-pre-line">{detail.prompt ?? "Prompt text unavailable in log."}</p>
          </div>
          <div>
            <h5 className="text-sm font-semibold">Response</h5>
            <p className="mt-2 rounded-2xl bg-muted/80 p-3 text-sm text-muted-foreground whitespace-pre-line">{detail.response ?? "Response text not captured."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
