'use client';
import { motion } from 'framer-motion';
import TopBar from '@/components/TopBar';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import FeatureRow from '@/components/FeatureRow';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const DOCS = [
  { name: 'Q4 Board Brief.pdf', owner: 'Finance', updated: '8 minutes ago', tags: ['Board', 'Finance'] },
  { name: 'Customer Journey Notion', owner: 'GTM', updated: '27 minutes ago', tags: ['Playbook'] },
  { name: 'Supply Chain Model.xlsx', owner: 'Ops', updated: '1 hour ago', tags: ['Simulation'] },
  { name: 'AI Safety Policy.md', owner: 'Legal', updated: 'Yesterday', tags: ['Governance'] },
];

export default function DocumentsPage() {
  const reduceMotion = usePrefersReducedMotion();
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
          eyebrow="Library"
          title="Documents"
          subtitle="Curate the knowledge graph powering every answer. Manage ownership, sensitivity, and review cadence."
        />

        <motion.div {...reveal}>
          <Panel padding="none">
            <ul className="divide-y divide-[var(--border)]">
              {DOCS.map((doc) => (
                <li
                  key={doc.name}
                  className="grid gap-4 px-6 py-5 text-sm text-muted md:grid-cols-[1.4fr_0.8fr_0.8fr] md:items-center"
                >
                  <div>
                    <p className="font-display text-base font-semibold text-[var(--text)]">{doc.name}</p>
                    <p className="mt-1 text-xs text-muted">Tags: {doc.tags.join(', ')}</p>
                  </div>
                  <p>{doc.owner}</p>
                  <p>{doc.updated}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          <motion.div {...reveal}>
            <FeatureRow
              icon="🔒"
              title="Governance modes"
              description="Classify documents as Public, Confidential, or Restricted. Answers honor access automatically."
            />
          </motion.div>
          <motion.div {...reveal}>
            <FeatureRow
              icon="🧬"
              title="Document DNA"
              description="See embeddings, chunk sizes, and coverage stats to refine surfacing."
            />
          </motion.div>
        </div>
      </PageContainer>
    </>
  );
}
