'use client';
import { motion } from 'framer-motion';
import GlassNav from '@/components/GlassNav';
import GlassContainer from '@/components/GlassContainer';
import GlassCard from '@/components/GlassCard';
import PageHeader from '@/components/PageHeader';
import KPIStat from '@/components/KPIStat';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const INCIDENTS = [
  { id: 'INC-209', title: 'Latency spike (RAG)', status: 'Resolved', summary: 'Scaled to backup region after ingest burst.' },
  {
    id: 'INC-208',
    title: 'Guardrail trigger',
    status: 'Mitigated',
    summary: 'Prompt contained restricted terms; sandboxed answer delivered with redacted output.',
  },
];

export default function ObservabilityPage() {
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
          title="Observability"
          subtitle="Stay ahead of latency, token usage, and guardrail triggers across your AI surface area."
          eyebrow="Telemetry"
        />
        <motion.div {...reveal}>
          <div className="grid gap-4 md:grid-cols-4">
            <KPIStat label="Latency p95" value="3.9s" caption="Across chat + summarization flows" />
            <KPIStat label="Token usage" value="86K" caption="Last hour" />
            <KPIStat label="Guardrail triggers" value="4" caption="All resolved" />
            <KPIStat label="Incidents" value="0 open" caption="Last 30 days" />
          </div>
        </motion.div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div {...reveal}>
            <GlassCard className="h-full p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Performance timeline</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-white/70">
                Rolling hour view of latency, throughput, and token consumption. (Charts dynamically load in production.)
              </p>
              <div className="mt-6 h-48 rounded-3xl border border-white/10 bg-white/5" aria-hidden>
                <div className="flex h-full items-center justify-center text-xs text-white/40">Charts load client-side</div>
              </div>
            </GlassCard>
          </motion.div>
          <div className="space-y-4">
            {INCIDENTS.map((incident, index) => (
              <motion.div key={incident.id} {...reveal} transition={{ ...(reveal.transition ?? {}), delay: reduceMotion ? 0 : index * 0.05 }}>
                <GlassCard className="p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-white/60">{incident.id}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{incident.title}</p>
                  <p className="mt-1 text-xs text-emerald-400">{incident.status}</p>
                  <p className="mt-2 text-xs text-slate-600 dark:text-white/70">{incident.summary}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </GlassContainer>
    </>
  );
}
