'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import TopBar from '@/components/TopBar';
import PageContainer from '@/components/PageContainer';
import Section from '@/components/Section';
import Panel from '@/components/Panel';
import KPIStat from '@/components/KPIStat';
import { ButtonLink } from '@/components/Button';
import usePrefersReducedMotion from '@/hooks/usePrefersReducedMotion';

const DATA_TUNNEL = [
  {
    step: 'Step 1 — Connect',
    description: 'Drag & drop files, connect S3, Snowflake, or Google Drive. Every source is versioned and traceable.',
  },
  {
    step: 'Step 2 — Clean & Normalize',
    description: 'We auto-redact PII, normalize tables, and run semantic quality checks—before embedding.',
  },
  {
    step: 'Step 3 — Ground',
    description: 'KPIs, entities, and glossary terms are bound to your warehouse truth for deterministic retrieval.',
  },
  {
    step: 'Step 4 — Chunk & Route',
    description: 'Adaptive chunking and governed routing choose between RAG, direct LLMs, or simulations per policy.',
  },
  {
    step: 'Step 5 — Index & Serve',
    description: 'Hybrid vector + keyword indexing returns transparent citations in milliseconds.',
  },
];

const VALUE_CARDS = [
  {
    title: 'Narrated answers',
    description: 'Each response links to documents, queries, and Monte Carlo trials—so ops and finance can verify.',
  },
  {
    title: 'Governed routing',
    description: 'Intent detection enforces policy: sensitive prompts switch to sandboxed mode with redaction.',
  },
  {
    title: 'Replay & Lineage',
    description: 'Every run is reproducible with checkpoints, lineage, and diff-able prompts.',
  },
];

const KPI_METRICS = [
  { label: 'RAG Latency', value: '2.7s', caption: 'Median across 1.2M citations' },
  { label: 'Chat SLO', value: '99.4%', caption: 'On latency & hallucination thresholds' },
  { label: 'Redaction', value: '100%', caption: 'PII blocked pre-embed' },
  { label: 'Citations', value: '3.2', caption: 'Average per claim' },
];

const INTEGRATIONS = ['Snowflake', 'BigQuery', 'Notion', 'Salesforce', 'Slack', 'Google Drive', 'Confluence'];

const GOVERNANCE_CARDS = [
  {
    title: 'Lineage everywhere',
    description: 'Document versions, SQL queries, and simulation seeds are logged for board-ready reproducibility.',
  },
  {
    title: 'Role-aware surfaces',
    description: 'Leadership, analysts, and agents see the right workflows and the right data—by policy.',
  },
  {
    title: 'DevOps ready',
    description: 'CLI & API for deploys, evaluation harnesses, and config-as-code.',
  },
];

function DataStream({ reduceMotion }: { reduceMotion: boolean }) {
  const lanes = [0, 1, 2];
  return (
    <div className="relative flex h-full min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-8">
      {lanes.map((lane) => (
        <motion.div
          key={lane}
          aria-hidden
          className="relative mx-4 h-full w-1/4 max-w-[110px] rounded-full"
          style={{
            background:
              'linear-gradient(180deg, rgba(15,22,36,0.85) 0%, rgba(15,22,36,0.6) 35%, rgba(15,22,36,0.85) 70%)',
            boxShadow: 'inset 0 0 0 1px rgba(30,42,58,0.8)',
          }}
        >
          <motion.span
            className="absolute inset-x-2 top-[-20%] h-1.5 rounded-full"
            style={{ background: 'var(--grad-1)', filter: 'drop-shadow(0 0 12px rgba(0,229,255,0.45))' }}
            initial={{ y: '-20%' }}
            animate={reduceMotion ? undefined : { y: '130%' }}
            transition={{ duration: 2.4 + lane * 0.25, repeat: Infinity, repeatType: 'loop', ease: 'easeOut' }}
          />
          <motion.span
            className="absolute left-1/2 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[var(--accent-3)]/30 to-transparent"
            animate={reduceMotion ? undefined : { opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 3 + lane * 0.3, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }}
          />
        </motion.div>
      ))}
      <span className="pointer-events-none absolute inset-0 border border-[var(--border)]" aria-hidden />
    </div>
  );
}

export default function Home() {
  const reduceMotion = usePrefersReducedMotion();
  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.2, ease: 'easeOut' },
      };

  return (
    <>
      <TopBar />
      <PageContainer className="space-y-24 pb-24 pt-20 md:pt-28">
        <motion.section
          {...reveal}
          className="grid gap-12 md:grid-cols-[minmax(0,1fr)_360px] md:items-center"
        >
          <div className="space-y-6">
            <p className="text-[11px] uppercase tracking-[0.32em] text-muted">Neural operations for business teams</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-[var(--text)] md:text-5xl">
              AI Business Agent – your private analyst for company data.
            </h1>
            <p className="max-w-2xl text-base text-muted">
              Connect sources, run governed RAG and simulations, and ship cited answers your ops and finance teams can trust.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/chat" tone="primary" className="px-5">
                Open live console
              </ButtonLink>
              <ButtonLink href="/upload" tone="secondary" className="px-5">
                Upload knowledge base
              </ButtonLink>
              <LinkCTA />
            </div>
            <p className="text-xs text-muted">
              FastAPI • Next.js 14 • Docker Compose • Prometheus • OpenSearch
            </p>
          </div>
          <DataStream reduceMotion={reduceMotion} />
        </motion.section>

        <Section id="how-it-works" eyebrow="Data tunnel" title="How it works" className="space-y-10">
          <div className="grid gap-4 md:grid-cols-5">
            {DATA_TUNNEL.map((item, index) => (
              <motion.div
                key={item.step}
                {...reveal}
                transition={{ ...(reveal.transition || {}), delay: reduceMotion ? 0 : index * 0.04 }}
              >
                <Panel className="h-full space-y-3 border border-[var(--border)] bg-[var(--panel-2)]">
                  <div className="text-sm font-semibold text-[var(--accent)]">{item.step}</div>
                  <p className="text-sm text-muted">{item.description}</p>
                  {index < DATA_TUNNEL.length - 1 && (
                    <span className="block h-[2px] w-full bg-[var(--border)]">
                      <motion.span
                        aria-hidden
                        className="block h-full w-0 bg-[var(--accent)]"
                        animate={reduceMotion ? undefined : { width: '100%' }}
                        transition={{ duration: 0.35, delay: 0.1 + index * 0.05, ease: 'easeOut' }}
                      />
                    </span>
                  )}
                </Panel>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="value" eyebrow="What you get" title="Ship value your operators can trust">
          <div className="grid gap-4 md:grid-cols-3">
            {VALUE_CARDS.map((card, index) => (
              <motion.div
                key={card.title}
                {...reveal}
                transition={{ ...(reveal.transition || {}), delay: reduceMotion ? 0 : index * 0.06 }}
              >
                <Panel className="h-full space-y-3">
                  <h3 className="font-display text-lg font-semibold text-[var(--text)]">{card.title}</h3>
                  <p className="text-sm text-muted">{card.description}</p>
                </Panel>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="metrics" eyebrow="Metrics" title="Telemetry tuned for neural operations">
          <div className="grid gap-4 md:grid-cols-4">
            {KPI_METRICS.map((stat, index) => (
              <motion.div
                key={stat.label}
                {...reveal}
                transition={{ ...(reveal.transition || {}), delay: reduceMotion ? 0 : index * 0.05 }}
              >
                <KPIStat {...stat} />
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Telemetry is sampled from staging datasets; your tenancy runs in isolation.
          </p>
        </Section>

        <Section
          id="integrations"
          eyebrow="Integrations"
          title="Plug into every source"
          description="Any source becomes searchable in minutes."
        >
          <Panel className="flex flex-wrap items-center justify-center gap-3 bg-[var(--panel-2)]">
            {INTEGRATIONS.map((name) => (
              <span key={name} className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-muted">
                {name}
              </span>
            ))}
          </Panel>
        </Section>

        <Section id="live" eyebrow="Live preview" title="See the workflow in action">
          <Panel className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted">
                Ask ‘According to Q3 finance, how did revenue trend?’ or run a liquidity simulation with 15% churn.
              </p>
            </div>
            <ButtonLink href="/chat" tone="primary">
              Open Live Console
            </ButtonLink>
          </Panel>
        </Section>

        <Section eyebrow="Governance & DevOps" title="Guardrails wired into every surface">
          <div className="grid gap-4 md:grid-cols-3">
            {GOVERNANCE_CARDS.map((item, index) => (
              <motion.div
                key={item.title}
                {...reveal}
                transition={{ ...(reveal.transition || {}), delay: reduceMotion ? 0 : index * 0.05 }}
              >
                <Panel className="h-full space-y-3">
                  <h3 className="font-display text-lg font-semibold text-[var(--text)]">{item.title}</h3>
                  <p className="text-sm text-muted">{item.description}</p>
                </Panel>
              </motion.div>
            ))}
          </div>
        </Section>

        <footer className="space-y-6 text-sm text-muted">
          <div className="grid gap-6 md:grid-cols-3">
            <FooterColumn title="Product" items={['Chat', 'Upload KB', 'Runs', 'Observability']} />
            <FooterColumn title="Governance" items={['RBAC', 'Audit Logs', 'Redaction', 'SSO/SCIM']} />
            <FooterColumn title="Support" items={['Playbooks', 'Evaluations', 'Incident Hotline']} />
          </div>
          <p className="text-xs text-muted">© 2025 AI Business Agent. Built for neural operations.</p>
        </footer>
      </PageContainer>
    </>
  );
}

function LinkCTA() {
  return (
    <Link href="#live" className="text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline">
      See a live, cited answer →
    </Link>
  );
}

function FooterColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.32em] text-muted">{title}</p>
      <ul className="space-y-1 text-sm text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

