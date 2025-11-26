/* eslint-disable @next/next/no-img-element */
import { useMemo } from "react";
import type { QueryMeta } from "@/components/ChatPane";

type RiskVisualsProps = {
  charts?: QueryMeta["charts"];
  simulation?: unknown;
  text: string;
};

type HistogramBin = {
  label: string;
  count: number;
  width: number;
};

type DriverRow = {
  name: string;
  meanPct?: number;
  stdPct?: number;
  weight?: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toMillions = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return currencyFormatter.format(value / 1_000_000) + "M";
};

const toPercent = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return percentFormatter.format(value);
};

const parseHistogramBins = (charts?: RiskVisualsProps["charts"]) => {
  if (!charts?.length) return [];
  const hist = charts.find((chart) => chart.type?.toLowerCase() === "histogram");
  if (!hist || !isRecord(hist.data)) return [];
  const edgesRaw = hist.data.edges;
  const countsRaw = hist.data.counts;
  if (!Array.isArray(edgesRaw) || !Array.isArray(countsRaw)) return [];
  const edges: number[] = edgesRaw.filter((value) => typeof value === "number") as number[];
  const counts: number[] = countsRaw.filter((value) => typeof value === "number") as number[];
  if (edges.length < 2 || counts.length === 0) return [];
  const maxCount = Math.max(...counts);
  if (maxCount <= 0) return [];
  const bins: HistogramBin[] = [];
  for (let i = 0; i < Math.min(counts.length, edges.length - 1); i += 1) {
    const start = edges[i];
    const end = edges[i + 1];
    const label = [start, end].every((value) => typeof value === "number")
      ? `${toMillions(start) ?? compactNumber.format(start)} → ${toMillions(end) ?? compactNumber.format(end)}`
      : `Bucket ${i + 1}`;
    bins.push({
      label,
      count: counts[i],
      width: Math.max(6, Math.min(100, Math.round((counts[i] / maxCount) * 100))),
    });
  }
  return bins;
};

const extractHistogramImage = (charts?: RiskVisualsProps["charts"]) => {
  if (!charts?.length) return null;
  const hist = charts.find((chart) => chart.type?.toLowerCase() === "histogram");
  if (!hist || !isRecord(hist.data)) return null;
  const encoded = hist.data.image_base64;
  if (typeof encoded !== "string" || !encoded.trim()) return null;
  const mediaType =
    typeof hist.data.image_media_type === "string" && hist.data.image_media_type.trim()
      ? hist.data.image_media_type.trim()
      : "image/png";
  const trimmed = encoded.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  return `data:${mediaType};base64,${trimmed}`;
};

const parseSimulationStats = (simulation?: unknown) => {
  if (!isRecord(simulation)) return null;
  const stats = isRecord(simulation.stats) ? simulation.stats : {};
  return {
    baseline: typeof stats.baseline_value === "number" ? stats.baseline_value : undefined,
    mean: typeof stats.mean_value === "number" ? stats.mean_value : undefined,
    p10: typeof stats.p10_value === "number" ? stats.p10_value : undefined,
    p90: typeof stats.p90_value === "number" ? stats.p90_value : undefined,
    downsideProbability: typeof stats.downside_probability === "number" ? stats.downside_probability : undefined,
    trials: typeof stats.trials === "number" ? stats.trials : undefined,
    drivers: Array.isArray(stats.drivers) ? stats.drivers : [],
  };
};

const parseDriverRows = (drivers: unknown[]): DriverRow[] => {
  const rows: DriverRow[] = [];
  for (const driver of drivers) {
    if (!isRecord(driver)) continue;
    const name = typeof driver.name === "string" ? driver.name : undefined;
    const meanPct = typeof driver.mean_pct === "number" ? driver.mean_pct : undefined;
    const stdPct = typeof driver.std_pct === "number" ? driver.std_pct : undefined;
    const weight = typeof driver.weight === "number" ? driver.weight : undefined;
    if (!name) continue;
    rows.push({ name, meanPct, stdPct, weight });
  }
  return rows;
};

export default function RiskVisuals({ charts, simulation }: RiskVisualsProps) {
  const histogramBins = useMemo(() => parseHistogramBins(charts), [charts]);
  const parsedSimulation = useMemo(() => parseSimulationStats(simulation), [simulation]);
  const driverRows = useMemo(
    () => (parsedSimulation?.drivers ? parseDriverRows(parsedSimulation.drivers.slice(0, 6)) : []),
    [parsedSimulation?.drivers],
  );
  const histogramImage = useMemo(() => extractHistogramImage(charts), [charts]);

  const hasStats =
    parsedSimulation?.baseline !== undefined ||
    parsedSimulation?.mean !== undefined ||
    parsedSimulation?.p10 !== undefined ||
    parsedSimulation?.p90 !== undefined ||
    parsedSimulation?.downsideProbability !== undefined;

  if (!histogramBins.length && !hasStats && !driverRows.length) {
    return null;
  }

  return (
    <section className="mt-4 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/60 p-5">
      {hasStats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {parsedSimulation?.baseline !== undefined ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Baseline</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{toMillions(parsedSimulation.baseline)}</p>
            </div>
          ) : null}
          {parsedSimulation?.mean !== undefined ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Mean Outcome</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{toMillions(parsedSimulation.mean)}</p>
            </div>
          ) : null}
          {parsedSimulation?.p10 !== undefined && parsedSimulation?.p90 !== undefined ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Outcome Band (p10–p90)</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                {toMillions(parsedSimulation.p10)} → {toMillions(parsedSimulation.p90)}
              </p>
            </div>
          ) : null}
          {parsedSimulation?.downsideProbability !== undefined ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Downside Probability</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                {toPercent(parsedSimulation.downsideProbability)}
              </p>
            </div>
          ) : null}
          {parsedSimulation?.trials !== undefined ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Trials</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">
                {compactNumber.format(parsedSimulation.trials)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {histogramImage ? (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Histogram</h4>
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
            <img
              src={histogramImage}
              alt="Operating income distribution histogram"
              className="h-auto w-full rounded-lg"
            />
          </div>
        </div>
      ) : null}

      {histogramBins.length ? (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Outcome Distribution</h4>
          <div className="mt-3 space-y-2">
            {histogramBins.map((bin) => (
              <div key={bin.label} className="flex items-center gap-3 text-xs text-muted">
                <span className="w-40 shrink-0">{bin.label}</span>
                <div className="relative h-2 flex-1 rounded-full bg-[var(--border)]/60">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent)]/80"
                    style={{ width: `${bin.width}%` }}
                  />
                </div>
                <span className="w-12 text-right text-[var(--text)]">{bin.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {driverRows.length ? (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Top Drivers</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--panel-2)] text-xs uppercase tracking-[0.24em] text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Driver</th>
                  <th className="px-3 py-2 text-right font-semibold">Mean %</th>
                  <th className="px-3 py-2 text-right font-semibold">Std %</th>
                  <th className="px-3 py-2 text-right font-semibold">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs text-[var(--text)]">
                {driverRows.map((driver) => (
                  <tr key={driver.name} className="bg-[var(--panel)]/40">
                    <td className="px-3 py-2 font-medium">{driver.name}</td>
                    <td className="px-3 py-2 text-right">
                      {driver.meanPct !== undefined ? percentFormatter.format(driver.meanPct) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {driver.stdPct !== undefined ? percentFormatter.format(driver.stdPct) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {driver.weight !== undefined ? driver.weight.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
