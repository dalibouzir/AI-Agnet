import { NextResponse } from 'next/server';

const ORCH_URL = process.env.ORCH_URL || process.env.NEXT_PUBLIC_ORCH_URL || 'http://localhost:8001';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ detail: 'Invalid payload' }, { status: 400 });
  }

  const { query, top_k: topK } = payload as { query?: unknown; top_k?: unknown };
  const question = typeof query === 'string' ? query.trim() : '';
  if (!question) {
    return NextResponse.json({ detail: 'Query is required' }, { status: 400 });
  }

  const upstreamBody: Record<string, unknown> = { query: question };
  if (typeof topK === 'number' && Number.isFinite(topK) && topK > 0) {
    upstreamBody.top_k = Math.floor(topK);
  }

  const response = await fetch(new URL('/ask', ORCH_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(upstreamBody),
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    data = { detail: text || 'Upstream response was not valid JSON' };
  }

  return NextResponse.json(data, { status: response.status });
}
