"use client";

import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Kpi } from "@/types/observability";

type Props = {
  kpi: Kpi;
};

export function KpiCard({ kpi }: Props) {
  const trendPositive = (kpi.deltaPct ?? 0) >= 0;
  const sparkData = useMemo(
    () => kpi.spark.map((value, index) => ({ index, value })),
    [kpi.spark]
  );

  return (
    <div className="flex flex-col rounded-3xl border border-border bg-card p-4 shadow-inner">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{kpi.label}</span>
        {kpi.helper && <span>{kpi.helper}</span>}
      </div>
      <div className="mt-2 text-3xl font-semibold">{typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}</div>
      <div className="mt-1 flex items-center gap-1 text-xs">
        {kpi.deltaPct !== undefined && (
          <>
            {trendPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            )}
            <span className={trendPositive ? "text-emerald-500" : "text-rose-500"}>
              {trendPositive ? "+" : ""}
              {kpi.deltaPct.toFixed(1)}%
            </span>
          </>
        )}
      </div>
      <div className="mt-3 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={trendPositive ? "#22c55e" : "#f87171"}
              fill={trendPositive ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.2)"}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
