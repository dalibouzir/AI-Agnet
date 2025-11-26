"use client";

import { ModelStats, TimeBucket } from "@/types/observability";

import { ModelTable } from "./ModelTable";

type Props = {
  stats: ModelStats[];
  latencySeries: TimeBucket[];
};

export function ModelPerformance({ stats, latencySeries }: Props) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Model performance</h3>
          <p className="text-sm text-muted-foreground">Latency and token averages pulled from recent runs.</p>
        </div>
      </div>
      <div className="mt-6">
        <ModelTable models={stats} latencySeries={latencySeries} />
      </div>
    </section>
  );
}
