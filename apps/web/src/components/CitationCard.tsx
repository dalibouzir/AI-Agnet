'use client';

import Link from "next/link";
import type { CitationMeta } from "@/components/ChatPane";

type CitationCardProps = {
  citations: CitationMeta[];
};

export default function CitationCard({ citations }: CitationCardProps) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return null;
  }

  return (
    <aside className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)]/70 p-4 shadow-[var(--shadow-soft)]/25">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.32em] text-muted">
        <span>Citations</span>
        <span>{citations.length}</span>
      </div>
      <div className="mt-3 space-y-2.5">
        {citations.map((citation) => (
          <Link
            key={citation.id}
            href={`/docs?path=${encodeURIComponent(citation.path)}`}
            className="group block rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/80 px-3 py-2.5 text-sm text-[color:var(--text-primary)] transition hover:-translate-y-0.5 hover:border-[color:var(--color-primary)]/60 focus-visible:[box-shadow:var(--focus-ring)]"
            prefetch={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[color:var(--text-primary)] group-hover:text-[color:var(--color-primary)]">
                  {citation.file_name}
                </p>
                <p className="text-xs text-muted">{citation.id}</p>
              </div>
              <span
                className="text-base text-muted transition group-hover:text-[color:var(--color-primary)]"
                aria-hidden
              >
                ↗
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">View source</p>
            {typeof citation.score === "number" ? (
              <span className="mt-2 inline-flex items-center rounded-full bg-[color:var(--surface-glass)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
                score {citation.score.toFixed(3)}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </aside>
  );
}
