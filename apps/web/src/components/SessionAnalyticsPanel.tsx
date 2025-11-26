type Mode = "LLM" | "RAG" | "RISK";

export type SessionAnalytics = {
  total: number;
  perMode: Record<Mode, number>;
  totalLatency: number;
  totalTokens: number;
  totalConfidence: number;
};

const formatNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const formatTokens = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export default function SessionAnalyticsPanel({ analytics }: { analytics: SessionAnalytics }) {
  const { total, perMode, totalLatency, totalTokens, totalConfidence } = analytics;
  const averageLatency = total ? totalLatency / total : 0;
  const averageTokens = total ? totalTokens / total : 0;
  const averageConfidence = total ? totalConfidence / total : 0;

  const modeEntries: Array<{ mode: Mode; count: number; pct: number }> = (Object.keys(perMode) as Mode[]).map(
    (mode) => {
      const count = perMode[mode];
      const pct = total ? Math.round((count / total) * 100) : 0;
      return { mode, count, pct };
    },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Total Prompts</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{formatNumber.format(total)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Avg Latency</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{formatNumber.format(averageLatency)}s</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Avg Confidence</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{formatNumber.format(averageConfidence * 100)}%</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Avg Tokens</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{formatTokens.format(averageTokens)}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Mode distribution</span>
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted">Session</span>
        </div>
        <ul className="space-y-2">
          {modeEntries.map(({ mode, count, pct }) => {
            const barWidth = pct === 0 ? 0 : Math.max(4, pct);
            return (
              <li key={mode} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-2 text-[var(--text)]">
                    <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                      {mode}
                    </span>
                    <span className="text-xs text-muted">{count} responses</span>
                  </div>
                  <span className="text-xs text-muted">{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--border)]/60">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]/80"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
