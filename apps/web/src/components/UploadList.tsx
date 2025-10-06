const uploads = [
  { name: 'finance-q3.pdf', status: 'Indexed', detail: 'PII scrubbed · embeddings ready' },
  { name: 'gtm-playbook.docx', status: 'Processing', detail: 'Splitting slides · ~20s left' },
];
export default function UploadList() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent uploads</h3>
        <span className="text-xs text-slate-400">Updated moments ago</span>
      </div>
      <ul className="mt-4 space-y-3">
        {uploads.map((file) => (
          <li
            key={file.name}
            className="glass edge-glow rounded-2xl px-4 py-3 text-sm text-left shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700 dark:text-slate-100">{file.name}</span>
              <span className="text-xs uppercase tracking-wide text-brand-500">{file.status}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{file.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
