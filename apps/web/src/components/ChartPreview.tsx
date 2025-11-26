import { memo } from "react";

type ChartSpec = {
  type: string;
  title?: string;
  data?: Record<string, unknown>;
};

type ChartPreviewProps = {
  charts: ChartSpec[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractRows = (data: Record<string, unknown> | undefined) => {
  if (!data) return null;
  const candidateKeys = ["rows", "data", "values", "points"];
  for (const key of candidateKeys) {
    const value = data[key];
    if (Array.isArray(value) && value.every(isPlainObject)) {
      return value as Array<Record<string, unknown>>;
    }
  }
  return null;
};

const formatValue = (value: unknown) => {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value);
};

const ChartCard = memo(({ chart }: { chart: ChartSpec }) => {
  const rows = extractRows(chart.data);
  const columns =
    rows && rows.length
      ? Array.from(
          rows.reduce((acc, row) => {
            Object.keys(row).forEach((key) => acc.add(key));
            return acc;
          }, new Set<string>()),
        )
      : [];

  return (
    <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/65 p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Chart</p>
          <p className="text-sm font-semibold text-[color:var(--text-primary)]">{chart.title || "Untitled"}</p>
        </div>
        <span className="rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5 text-[11px] uppercase tracking-[0.24em] text-muted">
          {chart.type || "custom"}
        </span>
      </div>
      {rows && columns.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)]/60">
          <table className="min-w-full divide-y divide-[color:var(--border-subtle)] text-left text-sm text-[color:var(--text-primary)]">
            <thead className="bg-[color:var(--surface-muted)]/60 text-xs uppercase tracking-[0.2em] text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={`${chart.title}-${column}`} className="px-3 py-2 whitespace-nowrap">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-subtle)]">
              {rows.slice(0, 25).map((row, index) => (
                <tr key={`${chart.title}-row-${index}`}>
                  {columns.map((column) => (
                    <td key={`${chart.title}-row-${index}-${column}`} className="px-3 py-2">
                      {formatValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 25 ? (
            <p className="px-3 py-2 text-xs text-muted">Showing first 25 rows of {rows.length}.</p>
          ) : null}
        </div>
      ) : chart.data ? (
        <pre className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)]/50 p-3 text-xs text-[color:var(--text-primary)]">
          {JSON.stringify(chart.data, null, 2)}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-muted">No chart data provided.</p>
      )}
    </div>
  );
});
ChartCard.displayName = "ChartCard";

export default function ChartPreview({ charts }: ChartPreviewProps) {
  if (!charts.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {charts.map((chart, index) => (
        <ChartCard key={`${chart.title ?? chart.type}-${index}`} chart={chart} />
      ))}
    </div>
  );
}
