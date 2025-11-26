"use client";

import { useState } from "react";

import { CitationDoc } from "@/types/observability";

type Props = {
  docs: CitationDoc[];
};

const TYPE_BADGE: Record<CitationDoc["type"], string> = {
  pdf: "PDF",
  csv: "CSV",
  doc: "DOC",
  txt: "TXT",
};

export function DocsPanel({ docs }: Props) {
  const [selected, setSelected] = useState<CitationDoc | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Knowledge & citations</h3>
          <p className="text-sm text-muted-foreground">Top referenced docs with previews</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2 text-right">Citations</th>
                <th className="px-4 py-2">Last used</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => setSelected(doc)}>
                  <td className="px-4 py-3 font-medium">{doc.title}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">{TYPE_BADGE[doc.type]}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{doc.cites}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(doc.lastUsed).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Content type mix</h4>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(
              docs.reduce<Record<string, number>>((acc, doc) => {
                acc[doc.type] = (acc[doc.type] ?? 0) + doc.cites;
                return acc;
              }, {})
            ).map(([type, total]) => (
              <div key={type} className="flex items-center gap-2 rounded-2xl border border-border/70 px-3 py-2 text-xs">
                <span className="font-semibold uppercase tracking-wide">{type}</span>
                <span className="text-muted-foreground">{total} cites</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold">{selected.title}</h4>
                <p className="text-xs text-muted-foreground">{TYPE_BADGE[selected.type]} · last used {new Date(selected.lastUsed).toLocaleString()}</p>
              </div>
              <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Preview snippets unavailable in the transcript export.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
