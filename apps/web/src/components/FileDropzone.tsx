'use client';
import { useCallback, useState } from 'react';

type FileDropzoneProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

export default function FileDropzone({ onFiles, disabled = false }: FileDropzoneProps) {
  const [highlight, setHighlight] = useState(false);

  const onDragStatus = useCallback((next: boolean) => setHighlight(next), []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;
      onFiles(Array.from(files));
    },
    [disabled, onFiles],
  );

  const borderColor = highlight ? 'border-[var(--accent)]' : 'border-[var(--border)]';
  const glow = highlight ? 'shadow-[0_0_20px_rgba(0,229,255,0.35)]' : '';

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) onDragStatus(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (!disabled) onDragStatus(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (disabled) return;
        onDragStatus(false);
        handleFiles(event.dataTransfer?.files || null);
      }}
      className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed ${borderColor} bg-[var(--panel-2)] px-8 py-12 text-center transition-all duration-base ease-standard ${glow} ${
        disabled ? 'opacity-60' : ''
      }`}
      role="presentation"
    >
      <span className="text-3xl" aria-hidden>
        📂
      </span>
      <p className="font-display text-base font-semibold text-[var(--text)]">Drop files here or browse</p>
      <p className="text-sm text-muted">We auto-detect documents, slides, spreadsheets, and images.</p>
      <label
        className={`inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--accent)] ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        }`}
      >
        Select files
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
          disabled={disabled}
        />
      </label>
    </div>
  );
}
