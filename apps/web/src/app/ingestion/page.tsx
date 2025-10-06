'use client';
import { motion } from 'framer-motion';
import GlassNav from '@/components/GlassNav';
import GlassContainer from '@/components/GlassContainer';
import GlassCard from '@/components/GlassCard';
import PageHeader from '@/components/PageHeader';
import KPIStat from '@/components/KPIStat';
import FeatureRow from '@/components/FeatureRow';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const RUNS = [
  { id: '#4821', dataset: 'Finance policies', status: 'Completed', duration: '01:12', items: 184 },
  { id: '#4820', dataset: 'Rev rec slides', status: 'Completed', duration: '00:48', items: 96 },
  { id: '#4819', dataset: 'APAC pipeline', status: 'Retrying (2/3)', duration: '—', items: 64 },
  { id: '#4818', dataset: 'Vendor contracts', status: 'Paused, awaiting approval', duration: '—', items: 37 },
];

export default function IngestionPage() {
  const reduceMotion = usePrefersReducedMotion();
  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.55, ease: 'easeOut' },
      };

  return (
    <>
      <GlassNav />
      <GlassContainer className="space-y-12 pb-20 pt-16">
        <PageHeader
          title="Ingestion Runs"
          subtitle="Monitor every batch with lineage, retries, and distribution metrics."
          eyebrow="Pipeline health"
        />
        <motion.div {...reveal}>
          <div className="grid gap-4 md:grid-cols-4">
            <KPIStat label="Runs (24h)" value="42" caption="6 rolling batches in progress" />
            <KPIStat label="Median ingest time" value="1m 24s" caption="Across all document types" />
            <KPIStat label="Pass rate" value="98.4%" caption="Quality gates cleared" trend="+1.2 pts" />
            <KPIStat label="Manual approvals" value="3" caption="Awaiting reviewer sign-off" />
          </div>
        </motion.div>
        <motion.div {...reveal}>
          <GlassCard className="p-0">
            <table className="min-w-full divide-y divide-white/5 text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">
                <tr>
                  <th className="px-6 py-4">Run</th>
                  <th className="px-6 py-4">Dataset</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Items</th>
                  <th className="px-6 py-4">Duration</th>
                </tr>
              </thead>
              <tbody>
                {RUNS.map((run) => (
                  <tr key={run.id} className="divide-y divide-white/5">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{run.id}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-white/70">{run.dataset}</td>
                    <td className="px-6 py-4 text-xs text-emerald-400">{run.status}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-white/70">{run.items}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-white/70">{run.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </motion.div>
        <div className="grid gap-6 md:grid-cols-2">
          <motion.div {...reveal}>
            <FeatureRow
              icon="🛰️"
              title="Realtime observability"
              description="Streaming logs show chunk size distribution, latency, and eval scores as runs progress."
              className="p-6"
            />
          </motion.div>
          <motion.div {...reveal}>
            <FeatureRow
              icon="🛠️"
              title="Replay any run"
              description="Deterministic seeds let you replay ingest jobs with upgraded models or changed policies."
              className="p-6"
            />
          </motion.div>
        </div>
      </GlassContainer>
    </>
  );
}
