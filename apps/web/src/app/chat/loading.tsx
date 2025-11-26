export default function ChatLoading() {
  return (
    <div className="space-y-8 px-6 py-16">
      <div className="space-y-3">
        <div className="h-3 w-32 rounded bg-[var(--border)]/70" />
        <div className="h-8 w-3/5 rounded bg-[var(--border)]/40" />
        <div className="h-4 w-2/3 rounded bg-[var(--border)]/30" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]">
        <div className="h-[540px] rounded-3xl border border-[var(--border)] bg-[var(--panel)]/40" />
        <div className="space-y-4">
          <div className="h-64 rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/60" />
          <div className="h-48 rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/40" />
        </div>
      </div>
    </div>
  );
}
