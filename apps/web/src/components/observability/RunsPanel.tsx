"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";

import { RouteMode, RunDetail } from "@/types/observability";

import { RunDetailDrawer } from "./RunDetailDrawer";

type FilterState = {
  query: string;
  route: "all" | RunDetail["route"];
  status: "all" | RunDetail["status"];
  model: "all" | string;
};

type Props = {
  runs: RunDetail[];
  onVisibleRowsChange?: (rows: RunDetail[]) => void;
  onExportJSON: (payload: unknown, filename: string) => void;
};

const initialFilters: FilterState = {
  query: "",
  route: "all",
  status: "all",
  model: "all",
};

const ROUTE_LABELS: Record<RouteMode, string> = {
  LLM_ONLY: "LLM only",
  LLM_DOCS: "LLM + Docs",
  LLM_RISK: "LLM + Simulation",
  LLM_DOCS_RISK: "LLM + Docs + Sim",
};

export function RunsPanel({ runs, onVisibleRowsChange, onExportJSON }: Props) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const models = useMemo(() => Array.from(new Set(runs.map((run) => run.model))), [runs]);

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (filters.route !== "all" && run.route !== filters.route) return false;
      if (filters.status !== "all" && run.status !== filters.status) return false;
      if (filters.model !== "all" && run.model !== filters.model) return false;
      if (filters.query && !run.query.toLowerCase().includes(filters.query.toLowerCase())) return false;
      return true;
    });
  }, [runs, filters]);

  useEffect(() => {
    onVisibleRowsChange?.(filteredRuns);
  }, [filteredRuns, onVisibleRowsChange]);

  const rowVirtualizer = useVirtualizer({
    count: filteredRuns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });

  const openRun = (row: RunDetail) => {
    setSelectedRun(row);
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm" aria-label="Recent runs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Recent runs</h3>
          <p className="text-sm text-muted-foreground">Virtualized stream with filters and quick search</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1 rounded-2xl border border-border px-3 py-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search query"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              className="bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <select
            value={filters.route}
            onChange={(event) => setFilters((current) => ({ ...current, route: event.target.value as FilterState["route"] }))}
            className="rounded-xl border border-border bg-background px-3 py-1 text-xs"
          >
            <option value="all">Route: All</option>
            {Object.entries(ROUTE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FilterState["status"] }))}
            className="rounded-xl border border-border bg-background px-3 py-1 text-xs"
          >
            <option value="all">Status: All</option>
            <option value="ok">OK</option>
            <option value="error">Error</option>
            <option value="timeout">Timeout</option>
          </select>
          <select
            value={filters.model}
            onChange={(event) => setFilters((current) => ({ ...current, model: event.target.value }))}
            className="rounded-xl border border-border bg-background px-3 py-1 text-xs"
          >
            <option value="all">Model: All</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div ref={parentRef} className="mt-4 h-[420px] overflow-y-auto rounded-3xl border border-border/60">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const run = filteredRuns[virtualRow.index];
            return (
              <div
                key={run.id}
                className="absolute left-0 right-0 border-b border-border/40 px-4 py-3"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <button
                  className="flex w-full items-center gap-3 text-left text-sm hover:text-primary"
                  onClick={() => openRun(run)}
                >
                  <span className="w-32 text-xs text-muted-foreground">{new Date(run.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="w-32 rounded-full border border-border px-2 py-0.5 text-center text-xs">{ROUTE_LABELS[run.route]}</span>
                  <span className="w-32 truncate text-xs text-muted-foreground">{run.model}</span>
                  <span className="w-20 text-right">{run.latency.toFixed(2)}s</span>
                  <span className="w-24 text-right">{(run.tokIn + run.tokOut).toLocaleString()} tok</span>
                  <span className="flex-1 truncate text-muted-foreground">{run.query}</span>
                  <span className="text-xs uppercase text-muted-foreground">{run.status}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {filteredRuns.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No runs match your filters.</p>}
      {selectedRun && (
        <RunDetailDrawer detail={selectedRun} onClose={() => setSelectedRun(null)} onExportJSON={onExportJSON} />
      )}
    </section>
  );
}
