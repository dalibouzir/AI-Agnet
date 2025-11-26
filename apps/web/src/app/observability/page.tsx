'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import PageContainer from '@/components/PageContainer';
import TopBar from '@/components/TopBar';
import { HeaderControls, RangeState } from '@/components/observability/HeaderControls';
import { KpiStrip } from '@/components/observability/KpiStrip';
import { ChartLatency } from '@/components/observability/ChartLatency';
import { ChartTokensCost } from '@/components/observability/ChartTokensCost';
import { ChartRouting } from '@/components/observability/ChartRouting';
import { ChartErrors } from '@/components/observability/ChartErrors';
import { ModelPerformance } from '@/components/observability/ModelPerformance';
import { DocsPanel } from '@/components/observability/DocsPanel';
import { RunsPanel } from '@/components/observability/RunsPanel';
import { useObservability } from '@/hooks/useObservability';
import { useExport } from '@/hooks/useExport';
import { RunDetail } from '@/types/observability';

const TENANTS = ['Acme Retail', 'Northwind Wholesale', 'Contoso Health'];

function toIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toInputValue(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function computeRange(range: RangeState): { from: string; to: string } {
  const to = range.preset === 'custom' && range.customTo ? new Date(range.customTo) : new Date();
  let from: Date;
  switch (range.preset) {
    case '7d':
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'custom':
      from = range.customFrom ? new Date(range.customFrom) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '24h':
    default:
      from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export default function ObservabilityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTenant = searchParams.get('tenant') ?? TENANTS[0];
  const initialRange: RangeState =
    searchParams.get('from') && searchParams.get('to')
      ? {
          preset: 'custom',
          customFrom: toInputValue(searchParams.get('from')),
          customTo: toInputValue(searchParams.get('to')),
        }
      : { preset: '24h' };

  const [tenant, setTenant] = useState(initialTenant);
  const [range, setRange] = useState<RangeState>(initialRange);
  const computedRange = useMemo(() => computeRange(range), [range]);

  const chartsRef = useRef<HTMLDivElement>(null);
  const [visibleRuns, setVisibleRuns] = useState<RunDetail[]>([]);
  const { exportPNG, exportCSV, exportJSON } = useExport({ tenant, from: computedRange.from, to: computedRange.to });

  const searchSignature = searchParams.toString();

  useEffect(() => {
    const next = new URLSearchParams(searchSignature);
    const changed =
      next.get('tenant') !== tenant ||
      next.get('from') !== computedRange.from ||
      next.get('to') !== computedRange.to;
    if (!changed) {
      return;
    }
    next.set('tenant', tenant);
    next.set('from', computedRange.from);
    next.set('to', computedRange.to);
    router.replace(`/observability?${next.toString()}`, { scroll: false });
  }, [tenant, computedRange.from, computedRange.to, router, searchSignature]);

  const { data, error, isLoading, refreshOption, setRefreshOption } = useObservability({
    tenant,
    from: computedRange.from,
    to: computedRange.to,
    bucket: '5',
    limit: 2000,
  });

  const lastUpdated = data?.latency?.slice(-1)[0]?.t ?? null;

  const handleExportPNG = async () => {
    if (!chartsRef.current) {
      throw new Error('Charts are still rendering');
    }
    await exportPNG(chartsRef, 'observability-charts');
  };

  const handleExportCSV = () => {
    const csvRows = [
      ['Run ID', 'Timestamp', 'Route', 'Model', 'Latency', 'Tokens In', 'Tokens Out', 'Status', 'Query'],
      ...visibleRuns.map((run) => [
        run.id,
        run.ts,
        run.route,
        run.model,
        `${run.latency}`,
        run.tokIn.toString(),
        run.tokOut.toString(),
        run.status,
        run.query,
      ]),
    ];
    exportCSV(csvRows, 'runs');
  };

  const handleExportJSON = () => {
    if (!data) return;
    exportJSON(
      {
        kpis: data.kpis,
        router: data.router,
        models: data.modelStats,
        runs: visibleRuns,
      },
      'observability-snapshot'
    );
  };

  return (
    <>
      <TopBar />
      <PageContainer className="pt-[calc(var(--topbar-height)+1rem)] pb-10">
        <div className="sticky top-[calc(var(--topbar-height)+0.5rem)] z-40">
          <HeaderControls
            tenants={TENANTS}
            tenant={tenant}
            onTenantChange={setTenant}
            range={range}
            onRangeChange={setRange}
            refresh={refreshOption}
            onRefreshChange={setRefreshOption}
            lastUpdated={lastUpdated ?? undefined}
            exportHandlers={{
              onExportPNG: handleExportPNG,
              onExportCSV: handleExportCSV,
              onExportJSON: handleExportJSON,
            }}
          />
        </div>
        <div className="space-y-6 px-0 pb-16 pt-6">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Failed to load observability data: {String(error)}
          </div>
        )}
        {!data && isLoading && (
          <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Loading observability snapshot…</div>
        )}
        {data && (
          <>
            <KpiStrip items={data.kpis} />
            <div ref={chartsRef} className="grid gap-4 xl:grid-cols-2">
              <ChartLatency data={data.latency} />
              <ChartTokensCost data={data.tokensCost} />
              <ChartRouting data={data.routingMix} />
              <ChartErrors data={data.errors} />
            </div>
            <ModelPerformance stats={data.modelStats} latencySeries={data.latency} />
            {data.docs.length > 0 && <DocsPanel docs={data.docs} />}
            <RunsPanel runs={data.runs} onVisibleRowsChange={setVisibleRuns} onExportJSON={(payload, filename) => exportJSON(payload, filename)} />
          </>
        )}
        </div>
      </PageContainer>
    </>
  );
}
