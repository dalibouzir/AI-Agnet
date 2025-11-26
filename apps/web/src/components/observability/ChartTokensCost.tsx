"use client";

import { useMemo } from "react";
import { Area, AreaChart, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { TimeBucket } from "@/types/observability";

type Props = {
  data: TimeBucket[];
};

export function ChartTokensCost({ data }: Props) {
  const chartData = useMemo(() => {
    const grouped = new Map<string, { t: string; tokens: number; cost: number }>();
    data.forEach((bucket) => {
      const current = grouped.get(bucket.t) ?? { t: bucket.t, tokens: 0, cost: 0 };
      current.tokens += bucket.tokens;
      const bucketCost = typeof (bucket as Record<string, unknown>).cost === "number" ? Number((bucket as Record<string, unknown>).cost) : 0;
      current.cost += bucketCost;
      grouped.set(bucket.t, current);
    });
    return Array.from(grouped.values()).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  }, [data]);
  const hasCost = chartData.some((point) => point.cost > 0);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{hasCost ? "Tokens & cost over time" : "Tokens over time"}</h3>
          <p className="text-sm text-muted-foreground">
            {hasCost ? "Tokens (left) and USD cost (right)" : "Tokens consumed per interval"}
          </p>
        </div>
      </div>
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <XAxis dataKey="t" minTickGap={24} tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit" })} />
            <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
            {hasCost && <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `$${value.toFixed(2)}`} />}
            <Tooltip
              formatter={(value: number, key: string) => {
                if (key === "tokens") {
                  return [`${value.toLocaleString()} tokens`, "Tokens"];
                }
                return hasCost ? [`$${value.toFixed(2)}`, "Cost"] : null;
              }}
              labelFormatter={(value) => new Date(value).toLocaleString()}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="tokens"
              fill="rgba(99,102,241,0.25)"
              stroke="#6366f1"
              strokeWidth={2}
              name="Tokens"
              isAnimationActive={false}
            />
            {hasCost && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cost"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                name="Cost"
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
