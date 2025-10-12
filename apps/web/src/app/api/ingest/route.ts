import { NextResponse } from 'next/server';

const DATA_TUNNEL_BASE_URL =
  process.env.INTERNAL_DATA_TUNNEL_URL?.trim() ||
  process.env.DATA_TUNNEL_URL?.trim() ||
  'http://localhost:8006';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildUrl(searchParams: URLSearchParams): string {
  const upstream = new URL('/v1/ingestions', DATA_TUNNEL_BASE_URL);
  const tenantId = searchParams.get('tenantId');
  const limit = searchParams.get('limit');
  if (tenantId) upstream.searchParams.set('tenant_id', tenantId);
  if (limit) upstream.searchParams.set('limit', limit);
  return upstream.toString();
}

export async function GET(request: Request) {
  const upstreamUrl = buildUrl(new URL(request.url).searchParams);
  const res = await fetch(upstreamUrl, { cache: 'no-store' });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    data = { message: text || 'Upstream response was not JSON' };
  }
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    console.log('[api/ingest] incoming keys', Array.from(formData.keys()));

    if (!formData.get('tenant_id')) {
      formData.set('tenant_id', 'tenant-demo');
    }

    if (!formData.has('options')) {
      formData.set(
        'options',
        JSON.stringify({
          dq: { pii: { action: 'redact', mask: '[REDACTED]' } },
        ingest: { continue_on_warn: true, fail_on_pii: false },
      }),
    );
    }

    const file = formData.get('file') as File | null;
    console.log(
      '[api/ingest] file field',
      file ? { name: file.name, size: file.size, type: file.type } : 'missing',
    );

    const upstream = await fetch(new URL('/v1/ingest', DATA_TUNNEL_BASE_URL), {
      method: 'POST',
      body: formData,
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error('[api/ingest] upstream error', upstream.status, text);
    }
    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') ?? 'application/json');
    return new Response(text, { status: upstream.status, headers });
  } catch (error: unknown) {
    console.error('[api/ingest] proxy failed', error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'proxy_failed', detail }, { status: 500 });
  }
}
