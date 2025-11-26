export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--page)] px-6 text-center text-muted">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" aria-hidden />
      <p className="text-sm uppercase tracking-[0.34em]">Loading workspace…</p>
    </div>
  );
}
