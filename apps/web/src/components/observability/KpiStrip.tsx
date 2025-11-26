"use client";

import { Kpi } from "@/types/observability";

import { KpiCard } from "./KpiCard";

type Props = {
  items: Kpi[];
};

export function KpiStrip({ items }: Props) {
  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Key performance indicators">
      {items.map((kpi) => (
        <KpiCard key={kpi.label} kpi={kpi} />
      ))}
    </section>
  );
}
