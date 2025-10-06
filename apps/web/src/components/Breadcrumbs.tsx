import Link from 'next/link';
export default function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="text-sm mb-3" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {it.href ? (
              <Link className="hover:underline" href={it.href}>
                {it.label}
              </Link>
            ) : (
              <span>{it.label}</span>
            )}
            {i < items.length - 1 && <span>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
