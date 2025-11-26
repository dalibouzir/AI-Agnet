'use client';

import { Check } from 'lucide-react';

import { ButtonLink } from '@/components/Button';
import PageContainer from '@/components/PageContainer';
import TopBar from '@/components/TopBar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Plan = {
  name: string;
  price: string;
  blurb: string;
  label: string;
  features: string[];
  cta: { label: string; href: string; tone?: 'primary' | 'secondary' };
  recommended?: boolean;
};

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '€0 / month',
    label: 'Best for trying the agent on your own data.',
    blurb: 'Personal or solo usage to validate retrieval quality and chat cadence.',
    features: [
      'Core LLM access',
      'Up to 50k AI tokens / month',
      'Upload up to 20 files (RAG)',
      '1 workspace, 1 user',
      'Standard response speed',
    ],
    cta: { label: 'Start for free', href: '/chat', tone: 'secondary' },
  },
  {
    name: 'Go',
    price: '€29 / month',
    label: 'For startups and small teams using the agent every day.',
    blurb: 'Everything in Free plus team-ready routing, hybrid search, and faster responses.',
    features: [
      'Core + advanced LLM (GPT-4o-mini)',
      'Up to 500k AI tokens / month',
      'Upload up to 500 files (RAG, hybrid search)',
      'Monte Carlo risk simulations (100 runs / month)',
      'Team collaboration (up to 5 users)',
      'Priority response speed',
    ],
    cta: { label: 'Start 14-day trial', href: '/chat', tone: 'primary' },
    recommended: true,
  },
  {
    name: 'Pro',
    price: 'From €99 / month',
    label: 'For companies that need scale, governance and advanced risk analysis.',
    blurb: 'Designed for multi-workspace orgs that need governance, API access, and custom models.',
    features: [
      'Highest token and file limits',
      'Multiple workspaces and namespaces',
      'Advanced Monte Carlo engine (1,000+ runs / month)',
      'RBAC, audit logs, PII & retention policies',
      'Optional custom fine-tuned model per tenant',
      'API access and priority support',
    ],
    cta: { label: 'Book a demo', href: '/docs', tone: 'primary' },
  },
];

const COMPARISON_ROWS = [
  { label: 'Monthly AI tokens', free: '50k', go: '500k', pro: 'Custom (1M+)' },
  { label: 'Max files for RAG', free: '20', go: '500', pro: 'Enterprise-scale' },
  { label: 'Monte Carlo simulations', free: 'N/A', go: '100 runs / mo', pro: '1,000+ runs / mo' },
  { label: 'Users / seats', free: '1 user', go: 'Up to 5 users', pro: 'Unlimited with RBAC' },
  { label: 'API access', free: 'SDK-limited', go: 'Standard API', pro: 'Full API + priority support' },
];

export default function PricingPage() {
  return (
    <>
      <TopBar />
      <PageContainer className="pb-24 pt-20">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">Pricing</p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            AI Business Agent Plans
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
            Choose the right plan for your data and decision workflows.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-7xl">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
            {PLANS.map((plan) => {
              const ctaToneClasses =
                plan.cta.tone === 'primary'
                  ? '!bg-sky-500 !text-white hover:!bg-sky-400 dark:!bg-sky-500 dark:hover:!bg-sky-400 focus-visible:!ring-sky-500'
                  : '!border-slate-300 !bg-white !text-slate-900 hover:!border-sky-300 dark:!border-slate-700 dark:!bg-slate-950 dark:!text-slate-100 dark:hover:!border-sky-400 focus-visible:!ring-sky-500';

              return (
                <article
                  key={plan.name}
                  className={cn(
                    'flex h-full flex-col gap-6 rounded-2xl border px-7 py-8 shadow-lg transition-transform duration-200 ease-out hover:-translate-y-1 sm:px-8 sm:py-10',
                    'bg-white text-slate-900 border-slate-200 shadow-slate-200/60 dark:bg-slate-900 dark:text-slate-50 dark:border-white/10 dark:shadow-none',
                    plan.recommended &&
                      'md:-mt-2 md:scale-[1.02] border-cyan-400 shadow-cyan-100/70 dark:border-cyan-400 dark:shadow-[0_25px_70px_rgba(0,0,0,0.45)] bg-cyan-50/80 dark:bg-cyan-950/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{plan.label}</p>
                      <div className="flex flex-wrap items-baseline gap-3">
                        <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white md:text-3xl">
                          {plan.name}
                        </h2>
                        <span className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white md:text-4xl">
                          {plan.price}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 md:text-[15px]">{plan.blurb}</p>
                    </div>
                    {plan.recommended ? (
                      <span className="rounded-full border border-cyan-200 bg-cyan-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-800 dark:border-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-100">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <ul className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/70 dark:text-sky-100 dark:ring-sky-800">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="text-[15px] leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-2">
                    <ButtonLink
                      href={plan.cta.href}
                      tone={plan.cta.tone ?? 'secondary'}
                      className={cn(
                        'w-full justify-center text-[15px] shadow-sm focus-visible:!ring-2 focus-visible:!ring-offset-2 focus-visible:!ring-offset-white focus-visible:!outline-none focus-visible:!shadow-none dark:focus-visible:!ring-offset-slate-900',
                        ctaToneClasses,
                      )}
                    >
                      {plan.cta.label}
                    </ButtonLink>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-7xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">Comparison</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">Feature coverage by plan</p>
            </div>
            <Badge
              variant="accent"
              className="border border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-900/60 dark:text-sky-100"
            >
              API ready
            </Badge>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-auto border-collapse text-sm leading-6 text-slate-700 dark:text-slate-200">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left">Feature</th>
                    <th className="px-4 py-3 text-left">Free</th>
                    <th className="px-4 py-3 text-left">Go</th>
                    <th className="px-4 py-3 text-left">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, index) => (
                    <tr
                      key={row.label}
                      className={cn(
                        'border-b border-slate-200 transition-colors hover:bg-sky-50 dark:border-white/10 dark:hover:bg-slate-800/70',
                        index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-950/60',
                      )}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.label}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.free}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-white">{row.go}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-white">{row.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
