import PageHeader from '@/components/PageHeader';
import GlassCard from '@/components/GlassCard';
export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Export PDF/HTML with citations & assumptions" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <GlassCard className="p-6">
          <p className="font-medium">Weekly Ops Brief</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Top risks, opportunities, and actions.</p>
        </GlassCard>
        <GlassCard className="p-6">
          <p className="font-medium">Forecast Pack</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Distribution, sensitivity, scenarios.</p>
        </GlassCard>
      </div>
    </div>
  );
}
