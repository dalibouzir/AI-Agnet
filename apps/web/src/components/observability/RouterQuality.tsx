"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/Button";
import { RouterMetrics } from "@/types/observability";

type Props = {
  router: RouterMetrics;
};

export function RouterQuality({ router }: Props) {
  const [selectedMisroute, setSelectedMisroute] = useState<RouterMetrics["misroutes"][number] | null>(null);
  const totals = useMemo(() => router.confusion.map((row) => row.reduce((acc, value) => acc + value, 0)), [router.confusion]);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Router quality</h3>
          <p className="text-sm text-muted-foreground">Confusion matrix, precision/recall/F1, misroutes</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 p-4">
          <h4 className="mb-3 text-sm font-semibold">Confusion matrix</h4>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left text-muted-foreground">Expected ↓ / Routed →</th>
                  {router.labels.map((label) => (
                    <th key={label} className="p-2 text-center text-muted-foreground">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {router.confusion.map((row, rowIdx) => (
                  <tr key={router.labels[rowIdx]}>
                    <td className="p-2 font-medium">{router.labels[rowIdx]}</td>
                    {row.map((value, colIdx) => {
                      const percent = value / totals[rowIdx];
                      return (
                        <td
                          key={`${rowIdx}-${colIdx}`}
                          className="p-2 text-center"
                          title={`${value.toLocaleString()} runs (${(percent * 100).toFixed(1)}%)`}
                        >
                          <span
                            className="inline-flex min-w-[3rem] items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold"
                            style={{ backgroundColor: percent > 0.6 ? "rgba(34,197,94,0.15)" : "transparent" }}
                          >
                            {value}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            {router.labels.map((label) => (
              <div key={label} className="rounded-xl border border-border/60 p-2">
                <div className="text-muted-foreground">{label}</div>
                <div className="mt-1 font-semibold">{router.precision[label]}% precision</div>
                <div className="font-semibold">{router.recall[label]}% recall</div>
                <div className="text-muted-foreground">{router.f1[label]}% F1</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 p-4">
          <h4 className="mb-3 text-sm font-semibold">Recent misroutes</h4>
          <div className="space-y-2">
            {router.misroutes.map((misroute) => (
              <div key={misroute.id} className="rounded-xl border border-border/70 p-3">
                <div className="text-xs text-muted-foreground">
                  {new Date(misroute.ts).toLocaleString()} · expected {misroute.expected} → routed {misroute.got}
                </div>
                <p className="mt-1 text-sm">{misroute.prompt}</p>
                <Button tone="secondary" className="mt-2 gap-1 rounded-full px-3 py-1 text-xs" onClick={() => setSelectedMisroute(misroute)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open run details
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {selectedMisroute && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-background p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold">Run {selectedMisroute.id}</h4>
                <p className="text-xs text-muted-foreground">{new Date(selectedMisroute.ts).toLocaleString()}</p>
              </div>
              <Button tone="secondary" onClick={() => setSelectedMisroute(null)} className="rounded-full px-3 py-1 text-xs">
                Close
              </Button>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">Expected {selectedMisroute.expected} · Routed {selectedMisroute.got}</p>
              <p className="rounded-2xl bg-muted/80 p-3 text-muted-foreground">{selectedMisroute.prompt}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
