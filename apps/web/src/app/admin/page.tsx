import PageHeader from '@/components/PageHeader';
import GlassCard from '@/components/GlassCard';
import StatCard from '@/components/StatCard';

export default function AdminPage() {
  return (
    <div>
      <PageHeader title="Admin" subtitle="Tenant, usage, and security" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Users" value="3" />
        <StatCard label="Token usage" value="48K" hint="last 24h" />
        <StatCard label="Storage" value="1.2 GB" hint="documents" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <p className="font-medium mb-1">API Key</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Rotate keys regularly. Keep them secret.</p>
        </GlassCard>
        <GlassCard className="p-6">
          <p className="font-medium mb-1">Security</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">PII redaction on; right-to-be-forgotten supported.</p>
        </GlassCard>
      </div>
    </div>
  );
}
