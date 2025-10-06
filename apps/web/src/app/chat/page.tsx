'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import TopBar from '@/components/TopBar';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import ChatPane, { SourceInfo } from '@/components/ChatPane';
import SourcesPanel from '@/components/SourcesPanel';
import FeatureRow from '@/components/FeatureRow';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const powerTips = [
  'Say ‘run liquidity scenario with 15% churn’ to trigger Monte Carlo.',
  'Ask ‘according to our Q3 report’ to auto-scope sources.',
];

export default function ChatPage() {
  const reduceMotion = usePrefersReducedMotion();
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.2, ease: 'easeOut' },
      };

  return (
    <>
      <TopBar />
      <PageContainer className="space-y-10 pb-24 pt-20">
        <PageHeader
          eyebrow="Realtime intelligence"
          title="Chat Console"
          subtitle="Ask for grounded answers, trigger simulations, and ship citations your operators trust."
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div {...reveal}>
            <Panel padding="none" className="overflow-hidden">
              <ChatPane onSourcesUpdate={setSources} onStatusChange={setStatus} />
            </Panel>
          </motion.div>

          <div className="space-y-4">
            <motion.div {...reveal}>
              <Panel variant="secondary">
                <SourcesPanel sources={sources} status={status} />
              </Panel>
            </motion.div>
            <motion.div {...reveal}>
              <Panel variant="secondary" className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-[var(--text)]">Power tips</h3>
                <ul className="space-y-2 text-sm text-muted">
                  {powerTips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </Panel>
            </motion.div>
            <motion.div {...reveal}>
              <FeatureRow
                icon="🛡️"
                title="Governance notice"
                description="All prompts run through policy filters. Sensitive intents switch to sandboxed mode with redaction."
              />
            </motion.div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
