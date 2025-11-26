'use client';

import useSWR from 'swr';

import { ObservabilitySnapshot } from '@/types/observability';
import { usePersistentState } from '@/hooks/usePersistentState';

const REFRESH_OPTIONS = {
  off: 0,
  '5s': 5000,
  '15s': 15000,
  '60s': 60000,
} as const;

export type RefreshOption = keyof typeof REFRESH_OPTIONS;

export type ObservabilityFilters = {
  tenant: string;
  from: string;
  to: string;
  bucket?: string;
  limit?: number;
};

async function fetchSnapshot(key: string): Promise<ObservabilitySnapshot> {
  const response = await fetch(`/api/obs/snapshot?${key}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load observability snapshot (${response.status})`);
  }
  const payload = (await response.json()) as { data: ObservabilitySnapshot };
  return payload.data;
}

export function useObservability(filters: ObservabilityFilters) {
  const [refreshOption, setRefreshOption] = usePersistentState<RefreshOption>('obs-refresh', '15s');
  const params = new URLSearchParams();
  params.set('tenant', filters.tenant);
  params.set('from', filters.from);
  params.set('to', filters.to);
  params.set('bucket', filters.bucket ?? '5');
  params.set('limit', String(filters.limit ?? 500));

  const refreshInterval = REFRESH_OPTIONS[refreshOption];

  const swr = useSWR(['observability', params.toString()], ([, key]) => fetchSnapshot(key), {
    refreshInterval,
    revalidateOnFocus: refreshInterval > 0,
  });

  return {
    ...swr,
    refreshOption,
    setRefreshOption,
    refreshInterval,
  };
}
