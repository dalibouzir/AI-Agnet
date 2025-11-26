"use client";

import { useMemo, useState } from "react";
import { Download, RefreshCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import { RefreshOption } from "@/hooks/useObservability";

type DatePreset = "24h" | "7d" | "30d" | "custom";

type RangeState = {
  preset: DatePreset;
  customFrom?: string;
  customTo?: string;
};

type HeaderControlsProps = {
  tenants: string[];
  tenant: string;
  onTenantChange: (value: string) => void;
  range: RangeState;
  onRangeChange: (value: RangeState) => void;
  refresh: RefreshOption;
  onRefreshChange: (value: RefreshOption) => void;
  lastUpdated?: string;
  exportHandlers: {
    onExportPNG: () => Promise<void>;
    onExportCSV: () => void;
    onExportJSON: () => void;
  };
};

const refreshLabel: Record<RefreshOption, string> = {
  off: "Off",
  "5s": "5s",
  "15s": "15s",
  "60s": "60s",
};

export function HeaderControls({
  tenants,
  tenant,
  onTenantChange,
  range,
  onRangeChange,
  refresh,
  onRefreshChange,
  lastUpdated,
  exportHandlers,
}: HeaderControlsProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const presetButtons: Array<{ value: DatePreset; label: string }> = [
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
    { value: "custom", label: "Custom" },
  ];

  const formattedUpdated =
    lastUpdated && !Number.isNaN(Date.parse(lastUpdated))
      ? new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "—";

  const customRangeLabel = useMemo(() => {
    if (range.preset !== "custom" || !range.customFrom || !range.customTo) return "Custom";
    return `${range.customFrom} → ${range.customTo}`;
  }, [range]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-background/90 px-6 py-4 shadow-sm backdrop-blur supports-[backdrop-filter]:backdrop-blur">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Tenant</label>
          <select
            value={tenant}
            onChange={(event) => onTenantChange(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Tenant selector"
          >
            {tenants.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Date range</label>
          <div className="flex overflow-hidden rounded-full border border-border bg-muted/50 p-0.5">
            {presetButtons.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() =>
                  onRangeChange(
                    preset.value === "custom"
                      ? { preset: preset.value, customFrom: range.customFrom, customTo: range.customTo }
                      : { preset: preset.value }
                  )
                }
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  range.preset === preset.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={range.preset === preset.value}
              >
                {preset.value === "custom" ? customRangeLabel : preset.label}
              </button>
            ))}
          </div>
          {range.preset === "custom" && (
            <div className="flex items-center gap-1">
              <input
                type="datetime-local"
                value={range.customFrom ?? ""}
                onChange={(event) => onRangeChange({ ...range, customFrom: event.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Custom range start"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="datetime-local"
                value={range.customTo ?? ""}
                onChange={(event) => onRangeChange({ ...range, customTo: event.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Custom range end"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Live refresh</label>
          <select
            value={refresh}
            onChange={(event) => onRefreshChange(event.target.value as RefreshOption)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Refresh interval"
          >
            {(Object.keys(refreshLabel) as RefreshOption[]).map((option) => (
              <option key={option} value={option}>
                {refreshLabel[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground shadow-inner" aria-live="polite">
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          Updated {formattedUpdated}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Button
            tone="primary"
            className="gap-2 rounded-full px-3 py-1 text-xs"
            onClick={() => setExportOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-border bg-popover p-2 shadow-lg"
            >
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={async () => {
                  setExportOpen(false);
                  await exportHandlers.onExportPNG();
                }}
              >
                PNG · charts view
              </button>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setExportOpen(false);
                  exportHandlers.onExportCSV();
                }}
              >
                CSV · runs table
              </button>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setExportOpen(false);
                  exportHandlers.onExportJSON();
                }}
              >
                JSON snapshot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

HeaderControls.displayName = "HeaderControls";

export type { DatePreset, RangeState, HeaderControlsProps };
