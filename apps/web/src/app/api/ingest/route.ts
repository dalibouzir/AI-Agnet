import { NextResponse } from 'next/server';

const DATA_TUNNEL_URL = process.env.DATA_TUNNEL_URL || 'http://localhost:8006';

function buildUrl(searchParams: URLSearchParams): string {
  const upstream = new URL('/v1/ingestions', DATA_TUNNEL_URL);
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
  const formData = await request.formData();
  const res = await fetch(new URL('/v1/ingest', DATA_TUNNEL_URL), {
    method: 'POST',
    body: formData,
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text || '{}');
  } catch {
    payload = { message: text || 'Upload failed' };
  }
  return NextResponse.json(payload, { status: res.status });
}
