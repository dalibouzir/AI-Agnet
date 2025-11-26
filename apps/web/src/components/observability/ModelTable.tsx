"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ModelStats, TimeBucket } from "@/types/observability";

type Props = {
  models: ModelStats[];
  latencySeries: TimeBucket[];
};

export function ModelTable({ models, latencySeries }: Props) {
  const sparkLookup = useMemo(() => {
    const grouped = new Map<string, { t: string; value: number }[]>();
    latencySeries.forEach((bucket) => {
      const arr = grouped.get(bucket.model) ?? [];
      arr.push({ t: bucket.t, value: bucket.p95 });
      grouped.set(bucket.model, arr.slice(-24));
    });
    return grouped;
  }, [latencySeries]);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Per-model performance</h3>
          <p className="text-sm text-muted-foreground">Latency, cost, routing share, acceptance, hallucinations</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p95</TableHead>
              <TableHead className="text-right">Avg tokens</TableHead>
              <TableHead className="text-right">Docs %</TableHead>
              <TableHead className="text-right">Simulation %</TableHead>
              <TableHead className="text-right">Last seen</TableHead>
              <TableHead>Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => (
              <TableRow key={model.model}>
                <TableCell className="font-medium">{model.model}</TableCell>
                <TableCell className="text-right">{model.runs.toLocaleString()}</TableCell>
                <TableCell className="text-right">{model.p50.toFixed(2)}s</TableCell>
                <TableCell className="text-right">{model.p95.toFixed(2)}s</TableCell>
                <TableCell className="text-right">{model.avgTokens.toLocaleString()}</TableCell>
                <TableCell className="text-right">{model.docsShare.toFixed(1)}%</TableCell>
                <TableCell className="text-right">{model.simShare.toFixed(1)}%</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{new Date(model.lastSeen).toLocaleString()}</TableCell>
                <TableCell className="w-32">
                  <div className="h-10">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkLookup.get(model.model) ?? []}>
                        <Area type="monotone" dataKey="value" stroke="#6366f1" fill="rgba(99,102,241,0.35)" strokeWidth={2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
