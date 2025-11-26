'use client';

import { RefObject, useCallback } from 'react';
import { toPng } from 'html-to-image';

type ExportFilters = {
  tenant: string;
  from: string;
  to: string;
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useExport(filters: ExportFilters) {
  const exportPNG = useCallback(
    async (ref: RefObject<HTMLElement>, filename: string) => {
      if (!ref.current) {
        throw new Error('Cannot export empty node');
      }
      const dataUrl = await toPng(ref.current, {
        backgroundColor: 'var(--background)',
      });
      const blob = await (await fetch(dataUrl)).blob();
      triggerDownload(blob, `${filename}.png`);
    },
    []
  );

  const exportCSV = useCallback(
    (rows: string[][], filename: string) => {
      const header = `# Observability export for ${filters.tenant} (${filters.from} → ${filters.to})`;
      const csv = [header, '', ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(blob, `${filename}.csv`);
    },
    [filters]
  );

  const exportJSON = useCallback(
    (payload: unknown, filename: string) => {
      const decorated = {
        filters,
        generatedAt: new Date().toISOString(),
        data: payload,
      };
      const blob = new Blob([JSON.stringify(decorated, null, 2)], { type: 'application/json' });
      triggerDownload(blob, `${filename}.json`);
    },
    [filters]
  );

  return {
    exportPNG,
    exportCSV,
    exportJSON,
  };
}
