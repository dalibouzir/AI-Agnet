import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import GlassCard from '@/components/GlassCard';

export default function DataPage() {
  const hasItems = true; // replace with real state
  return (
    <div>
      <PageHeader title="Data Pipeline" subtitle="Ingestion runs, quality gates, and lineage" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total ingests" value="12" hint="Last 7 days" />
        <StatCard label="Pass rate" value="92%" hint="DQ checks" />
        <StatCard label="Avg ingest time" value="1m 42s" hint="p50" />
      </div>
      {hasItems ? (
        <GlassCard className="p-0 overflow-hidden">{/* table/list goes here */}</GlassCard>
      ) : (
        <EmptyState title="No ingestions yet" desc="Upload files to kick off the pipeline." />
      )}
    </div>
  );
}
