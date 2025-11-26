"use client";

import { useMemo } from "react";
import { Bar, BarChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { TimeBucket } from "@/types/observability";

type Props = {
  data?: TimeBucket[];
};

export function ChartErrors({ data = [] }: Props) {
  const chartData = useMemo(() => {
    const grouped = new Map<string, { t: string; errors: number; retries: number }>();
    data.forEach((bucket) => {
      const current = grouped.get(bucket.t) ?? { t: bucket.t, errors: 0, retries: 0 };
      current.errors += bucket.errors ?? 0;
      current.retries += bucket.retries ?? 0;
      grouped.set(bucket.t, current);
    });
    return Array.from(grouped.values()).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  }, [data]);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Errors & retries</h3>
          <p className="text-sm text-muted-foreground">Error spikes with retry rate overlay</p>
        </div>
      </div>
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="t" minTickGap={24} tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit" })} />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip formatter={(value: number, key: string) => [value, key === "errors" ? "Errors" : "Retries"]} labelFormatter={(value) => new Date(value).toLocaleString()} />
            <Bar yAxisId="left" dataKey="errors" fill="rgba(239,68,68,0.6)" name="Errors" />
            <Line yAxisId="right" dataKey="retries" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Retries" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
