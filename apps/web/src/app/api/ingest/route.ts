import { NextResponse } from 'next/server';

const TENANT = process.env.TENANT_ID?.trim() || 'tenant-demo';
const DEFAULT_BASES = [
  process.env.INGEST_BASE_URL,
  process.env.INTERNAL_DATA_TUNNEL_URL,
  process.env.DATA_TUNNEL_URL,
  process.env.NEXT_PUBLIC_DATA_TUNNEL_URL,
  'http://data-tunnel:8000',
  'http://host.docker.internal:8006',
  'http://localhost:8006',
];
const GET_PATHS = ['/v1/ingestions', '/api/ingest', '/ingest'] as const;
const POST_PATHS = ['/v1/ingest', '/api/ingest', '/ingest'] as const;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function tryFetch(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, ...(init ?? {}) });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

function resolveBases(): string[] {
  const seen = new Set<string>();
  const bases: string[] = [];
  for (const candidate of DEFAULT_BASES) {
    if (!candidate) continue;
    const trimmed = candidate.trim().replace(/\/+$/, '');
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    bases.push(trimmed);
  }
  return bases.length ? bases : ['http://host.docker.internal:8006', 'http://data-tunnel:8000'];
}

function cloneFormData(source: FormData): FormData {
  const clone = new FormData();
  source.forEach((value, key) => {
    if (typeof value === 'string') {
      clone.append(key, value);
    } else {
      clone.append(key, value, value.name);
    }
  });
  return clone;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') ?? '50';
  const tenantId = searchParams.get('tenantId') ?? TENANT;
  const bases = resolveBases();
  const attempted: string[] = [];

  for (const base of bases) {
    for (const path of GET_PATHS) {
      const url = `${base}${path}?limit=${encodeURIComponent(limit)}&tenantId=${encodeURIComponent(tenantId)}`;
      attempted.push(url);
      const response = await tryFetch(url, { cache: 'no-store' }).catch((error) => {
        console.warn('[api/ingest] GET upstream failed', { url, error: error instanceof Error ? error.message : String(error) });
        return null;
      });
      if (response && response.ok) {
        const json = await response.json().catch(() => null);
        if (json !== null) {
          return NextResponse.json(json);
        }
        const text = await response.text();
        return NextResponse.json({ message: text || 'Upstream response was not JSON' });
      }
    }
  }

  return NextResponse.json(
    {
      error: 'upstream_not_found',
      bases,
      tried: attempted,
    },
    { status: 502 },
  );
}

export async function POST(request: Request) {
  try {
    const originalForm = await request.formData();
    if (!originalForm.has('tenantId')) {
      const legacyTenant = originalForm.get('tenant_id');
      if (typeof legacyTenant === 'string' && legacyTenant.trim()) {
        originalForm.set('tenantId', legacyTenant.trim());
      } else {
        originalForm.set('tenantId', TENANT);
      }
    }
    if (!originalForm.has('tenant_id')) {
      const resolvedTenant = originalForm.get('tenantId');
      if (typeof resolvedTenant === 'string' && resolvedTenant.trim()) {
        originalForm.set('tenant_id', resolvedTenant);
      }
    }

    if (!originalForm.has('options')) {
      originalForm.set(
        'options',
        JSON.stringify({
          dq: { pii: { action: 'redact', mask: '[REDACTED]' } },
          ingest: { continue_on_warn: true, fail_on_pii: false },
        }),
      );
    }

    const file = originalForm.get('file');
    if (file && file instanceof File) {
      console.log('[api/ingest] file field', { name: file.name, size: file.size, type: file.type });
    }

    const bases = resolveBases();
    const attempted: string[] = [];
    for (const base of bases) {
      for (const path of POST_PATHS) {
        const url = `${base}${path}`;
        attempted.push(url);
        const form = cloneFormData(originalForm);
        const response = await tryFetch(url, {
          method: 'POST',
          body: form as unknown as BodyInit,
        }).catch((error) => {
          console.warn('[api/ingest] POST upstream failed', { url, error: error instanceof Error ? error.message : String(error) });
          return null;
        });

        if (response && response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return NextResponse.json(await response.json());
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          return new NextResponse(buffer, {
            status: response.status,
            headers: { 'content-type': contentType || 'application/octet-stream' },
          });
        }
      }
    }

    return NextResponse.json(
      {
        error: 'upstream_not_found',
        bases,
        tried: attempted,
      },
      { status: 502 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/ingest] proxy failed', detail);
    return NextResponse.json({ error: 'proxy_failed', detail }, { status: 500 });
  }
}
