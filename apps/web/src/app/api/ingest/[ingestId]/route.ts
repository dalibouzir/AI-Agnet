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

async function callUpstream(url: string, init?: RequestInit) {
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

export async function GET(
  _request: Request,
  { params }: { params: { ingestId: string } },
) {
  const { ingestId } = params;
  const bases = resolveBases();
  const attempted: string[] = [];

  for (const base of bases) {
    const url = `${base}/v1/status/${encodeURIComponent(ingestId)}`;
    attempted.push(url);
    const response = await callUpstream(url, { cache: 'no-store' }).catch((error) => {
      console.warn('[api/ingest/:id] status upstream failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (!response) continue;

    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text || '{}');
    } catch {
      payload = { message: text || 'Status response was not JSON' };
    }
    return NextResponse.json(payload, { status: response.status });
  }

  return NextResponse.json(
    { error: 'status_fetch_failed', bases, tried: attempted },
    { status: 502 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: { ingestId: string } },
) {
  const body = await request.json().catch(() => ({}));
  const tenantId =
    (typeof body?.tenantId === 'string' && body.tenantId.trim()) ||
    (typeof body?.tenant_id === 'string' && body.tenant_id.trim()) ||
    TENANT;

  const bases = resolveBases();
  const attempted: string[] = [];

  for (const base of bases) {
    const url = `${base}/v1/reindex`;
    attempted.push(url);
    const response = await callUpstream(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ingest_id: params.ingestId, tenant_id: tenantId }),
    }).catch((error) => {
      console.warn('[api/ingest/:id] reindex upstream failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (!response) continue;

    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text || '{}');
    } catch {
      payload = { message: text || 'Reindex response was not JSON' };
    }
    return NextResponse.json(payload, { status: response.status });
  }

  return NextResponse.json(
    { error: 'reindex_failed', bases, tried: attempted },
    { status: 502 },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: { ingestId: string } },
) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') ?? TENANT;
  const bases = resolveBases();
  const attempted: string[] = [];

  for (const base of bases) {
    const url = `${base}/v1/ingest/${encodeURIComponent(params.ingestId)}?tenant_id=${encodeURIComponent(tenantId)}`;
    attempted.push(url);
    const response = await callUpstream(url, { method: 'DELETE' }).catch((error) => {
      console.warn('[api/ingest/:id] delete upstream failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (!response) continue;

    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text || '{}');
    } catch {
      payload = { message: text || 'Delete response was not JSON' };
    }
    return NextResponse.json(payload, { status: response.status });
  }

  return NextResponse.json(
    { error: 'delete_failed', bases, tried: attempted },
    { status: 502 },
  );
}
