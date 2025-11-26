"use client";

import { useEffect, useMemo } from "react";
import { Brush, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { usePersistentState } from "@/hooks/usePersistentState";
import { RouteMode, TimeBucket } from "@/types/observability";

const ROUTES: RouteMode[] = ["LLM_ONLY", "LLM_DOCS", "LLM_RISK", "LLM_DOCS_RISK"];
const ROUTE_LABELS: Record<RouteMode, string> = {
  LLM_ONLY: "LLM only",
  LLM_DOCS: "LLM + Docs",
  LLM_RISK: "LLM + Simulation",
  LLM_DOCS_RISK: "LLM + Docs + Sim",
};
const COLORS = ["#6366f1", "#0ea5e9", "#a855f7", "#14b8a6", "#f97316", "#ef4444"];

type Props = {
  data: TimeBucket[];
};

export function ChartLatency({ data }: Props) {
  const models = useMemo(() => Array.from(new Set(data.map((bucket) => bucket.model))).sort(), [data]);
  const [routeState, setRouteState] = usePersistentState<Record<RouteMode, boolean>>("latency-routes", {
    LLM_ONLY: true,
    LLM_DOCS: true,
    LLM_RISK: true,
    LLM_DOCS_RISK: true,
  });
  const [modelState, setModelState] = usePersistentState<Record<string, boolean>>(
    "latency-models",
    models.reduce<Record<string, boolean>>((acc, model) => {
      acc[model] = true;
      return acc;
    }, {})
  );

  useEffect(() => {
    setModelState((current) => {
      const next = { ...current };
      models.forEach((model) => {
        if (next[model] === undefined) {
          next[model] = true;
        }
      });
      return next;
    });
  }, [models, setModelState]);

  const filteredModels = models.filter((model) => modelState[model] ?? true);

  const chartData = useMemo(() => {
    const byTimestamp = new Map<string, Record<string, number | string | null>>();

    data.forEach((bucket) => {
      if (!routeState[bucket.route]) return;
      if (!modelState[bucket.model]) return;
      const key = bucket.t;
      const current: Record<string, number | string | null> = byTimestamp.get(key) ?? { t: key };
      current[`${bucket.model}-p50`] = bucket.p50;
      current[`${bucket.model}-p95`] = bucket.p95;
      current[`${bucket.model}-p99`] = bucket.p99 ?? null;
      byTimestamp.set(key, current);
    });

    return Array.from(byTimestamp.entries())
      .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
      .map(([, value]) => value);
  }, [data, modelState, routeState]);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Latency over time</h3>
          <p className="text-sm text-muted-foreground">p50 / p95 / p99 envelope, grouped by model + route</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {ROUTES.map((route) => (
            <label key={route} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
              <input
                type="checkbox"
                checked={routeState[route]}
                onChange={() =>
                  setRouteState((current) => ({
                    ...current,
                    [route]: !current[route],
                  }))
                }
                className="accent-primary"
              />
              {ROUTE_LABELS[route]}
            </label>
          ))}
          {models.map((model) => (
            <label key={model} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
              <input
                type="checkbox"
                checked={modelState[model]}
                onChange={() =>
                  setModelState((current) => ({
                    ...current,
                    [model]: !current[model],
                  }))
                }
                className="accent-primary"
              />
              {model}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="t" minTickGap={24} tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
            <YAxis tickFormatter={(value) => `${value.toFixed(1)}s`} />
            <Tooltip
              formatter={(value: number, key: string) => [`${value.toFixed(2)}s`, key.replace("-p95", "").replace("-p50", "").toUpperCase()]}
              labelFormatter={(value) => new Date(value).toLocaleString()}
            />
            <Legend />
            <Brush dataKey="t" height={24} stroke="#8884d8" />
            {filteredModels.map((model, index) => (
              <Line
                key={`${model}-p95`}
                type="monotone"
                dataKey={`${model}-p95`}
                name={`${model} p95`}
                stroke={COLORS[index % COLORS.length]}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
            <ReferenceArea y1={2} y2={3} fill="rgba(34,197,94,0.06)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
