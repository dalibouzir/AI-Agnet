'use client';
import { motion } from 'framer-motion';
import GlassNav from '@/components/GlassNav';
import GlassContainer from '@/components/GlassContainer';
import GlassCard from '@/components/GlassCard';
import PageHeader from '@/components/PageHeader';
import Section from '@/components/Section';
import FeatureRow from '@/components/FeatureRow';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const CONNECTORS = [
  { name: 'Snowflake warehouse', status: 'Synced 3m ago', badge: 'Active' },
  { name: 'Salesforce CRM', status: 'Webhook streaming live deals', badge: 'Active' },
  { name: 'Notion playbooks', status: 'Nightly sync · 01:00 UTC', badge: 'Scheduled' },
  { name: 'S3 /policies bucket', status: 'Watching for new PDFs', badge: 'Active' },
];

const STATUS_CARDS = [
  {
    title: 'Coverage',
    copy: '82 sources connected · 14 pending approval · 6 archived for compliance reasons.',
  },
  {
    title: 'Quality gates',
    copy: 'Schema drift alerts reroute to review. PII detections auto-redact before downstream use.',
  },
];

export default function SourcesPage() {
  const reduceMotion = usePrefersReducedMotion();
  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.5, ease: 'easeOut' },
      };

  return (
    <>
      <GlassNav />
      <GlassContainer className="space-y-12 pb-20 pt-16">
        <PageHeader
          title="Sources"
          subtitle="Connect structured data, docs, and third-party systems. Everything stays lineage-friendly and auditable."
          eyebrow="Discovery"
        />
        <Section title="Connectors" description="Manage live connectors, sync cadence, and policy status." eyebrow="Live feeds">
          <motion.div {...reveal}>
            <GlassCard className="p-0">
              <table className="min-w-full divide-y divide-white/5 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">
                  <tr>
                    <th className="px-6 py-4">Connector</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {CONNECTORS.map((connector) => (
                    <tr key={connector.name} className="divide-y divide-white/5">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{connector.name}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-white/70">{connector.status}</td>
                      <td className="px-6 py-4 text-xs text-emerald-400">{connector.badge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </motion.div>
        </Section>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div {...reveal}>
            <GlassCard className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Source health</h2>
              <p className="text-sm text-slate-600 dark:text-white/70">
                All connectors run through schema validation, content classification, and latency scoring. We surface drift before it
                impacts downstream citations.
              </p>
              <div className="grid gap-3 text-xs text-slate-500 dark:text-white/60">
                <p>• 97% of connectors within SLA</p>
                <p>• 3 flagged for manual review (new data categories)</p>
                <p>• 12 feature stores ready for prompt templates</p>
              </div>
            </GlassCard>
          </motion.div>
          <div className="space-y-4">
            {STATUS_CARDS.map((card, index) => (
              <motion.div key={card.title} {...reveal} transition={{ ...(reveal.transition ?? {}), delay: reduceMotion ? 0 : index * 0.04 }}>
                <GlassCard className="p-6">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{card.title}</p>
                  <p className="mt-2 text-xs text-slate-600 dark:text-white/70">{card.copy}</p>
                </GlassCard>
              </motion.div>
            ))}
            <motion.div {...reveal}>
              <FeatureRow
                icon="🔌"
                title="New connector request"
                description="Need a custom integration? Submit a request and our team templatizes the ingestion pathway."
                className="p-6"
              />
            </motion.div>
          </div>
        </div>
      </GlassContainer>
    </>
  );
}
