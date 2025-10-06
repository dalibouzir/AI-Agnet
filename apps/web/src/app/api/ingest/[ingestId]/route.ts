import { NextResponse } from 'next/server';

const DATA_TUNNEL_URL = process.env.DATA_TUNNEL_URL || 'http://localhost:8006';

export async function GET(
  _request: Request,
  { params }: { params: { ingestId: string } },
) {
  const { ingestId } = params;
  const res = await fetch(new URL(`/v1/status/${ingestId}`, DATA_TUNNEL_URL), { cache: 'no-store' });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text || '{}');
  } catch {
    payload = { message: text || 'Status response was not JSON' };
  }
  return NextResponse.json(payload, { status: res.status });
}

export async function POST(
  request: Request,
  { params }: { params: { ingestId: string } },
) {
  const body = await request.json().catch(() => ({}));
  const res = await fetch(new URL('/v1/reindex', DATA_TUNNEL_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ingest_id: params.ingestId, tenant_id: body?.tenant_id }),
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text || '{}');
  } catch {
    payload = { message: text || 'Reindex response was not JSON' };
  }
  return NextResponse.json(payload, { status: res.status });
}
