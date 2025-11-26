"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { RouteMode, TimeBucket } from "@/types/observability";

const ROUTES: RouteMode[] = ["LLM_ONLY", "LLM_DOCS", "LLM_RISK", "LLM_DOCS_RISK"];
const COLORS: Record<RouteMode, string> = {
  LLM_ONLY: "#6366f1",
  LLM_DOCS: "#0ea5e9",
  LLM_RISK: "#f97316",
  LLM_DOCS_RISK: "#a855f7",
};

type Props = {
  data?: TimeBucket[];
};

export function ChartRouting({ data = [] }: Props) {
  const chartData = useMemo(() => {
    const grouped = new Map<string, Record<RouteMode | "t", number | string>>();
    data.forEach((bucket) => {
      const base: Record<RouteMode | "t", number | string> = {
        t: bucket.t,
        LLM_ONLY: 0,
        LLM_DOCS: 0,
        LLM_RISK: 0,
        LLM_DOCS_RISK: 0,
      };
      const current = grouped.get(bucket.t) ?? base;
      current[bucket.route] = (current[bucket.route] as number) + 1;
      grouped.set(bucket.t, current);
    });
    return Array.from(grouped.values())
      .sort((a, b) => Date.parse(a.t as string) - Date.parse(b.t as string))
      .map((row) => {
        const total =
          (row.LLM_ONLY as number) +
            (row.LLM_DOCS as number) +
            (row.LLM_RISK as number) +
            (row.LLM_DOCS_RISK as number) || 1;
        return {
          ...row,
          LLM_ONLY: Number((((row.LLM_ONLY as number) / total) * 100).toFixed(1)),
          LLM_DOCS: Number((((row.LLM_DOCS as number) / total) * 100).toFixed(1)),
          LLM_RISK: Number((((row.LLM_RISK as number) / total) * 100).toFixed(1)),
          LLM_DOCS_RISK: Number((((row.LLM_DOCS_RISK as number) / total) * 100).toFixed(1)),
        };
      });
  }, [data]);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-base font-semibold">Helper mix over time</h3>
        <p className="text-sm text-muted-foreground">Share of answers using documents and/or simulation</p>
      </div>
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} stackOffset="expand">
            <XAxis dataKey="t" minTickGap={24} tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit" })} />
            <YAxis tickFormatter={(value) => `${(value as number).toFixed(0)}%`} />
            <Tooltip
              formatter={(value: number, key: string) => [`${value.toFixed(1)}%`, key]}
              labelFormatter={(value) => new Date(value).toLocaleString()}
            />
            {ROUTES.map((route) => (
              <Area
                key={route}
                type="monotone"
                dataKey={route}
                stackId="1"
                stroke={COLORS[route]}
                fill={COLORS[route]}
                fillOpacity={0.6}
                name={route}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
