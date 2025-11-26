import PageHeader from '@/components/PageHeader';
import GlassCard from '@/components/GlassCard';
import EmptyState from '@/components/EmptyState';
export default function InsightsPage() {
  const items: any[] = [];
  return (
    <div>
      <PageHeader title="Insights" subtitle="Saved answers, simulations, and briefings" />
      {items.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {items.map((it, i) => (
            <GlassCard key={i} className="p-6 text-sm text-muted">
              Insight placeholder
            </GlassCard>
          ))}
        </div>
      ) : (
        <EmptyState title="No insights yet" desc="Run a few questions in Chat, then save them here for your team." />
      )}
    </div>
  );
}
