import { NextResponse } from 'next/server';

const textDecoder = new TextDecoder('utf-8', { fatal: false });

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const objectKey = searchParams.get('objectKey')?.trim();
  const tenantId = searchParams.get('tenantId')?.trim() || TENANT;
  const expiresIn = Number(searchParams.get('expiresIn') ?? '900');
  const mode = searchParams.get('mode') ?? 'json';

  if (!objectKey) {
    return NextResponse.json({ error: 'object_key_required' }, { status: 400 });
  }

  const bases = resolveBases();
  const attempted: string[] = [];

  for (const base of bases) {
    const url = `${base}/v1/files/presign?tenant_id=${encodeURIComponent(tenantId)}&object_key=${encodeURIComponent(
      objectKey,
    )}&expires_in=${encodeURIComponent(String(expiresIn))}`;
    attempted.push(url);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        console.warn('[api/files] presign failed', url, response.status);
        continue;
      }
      const payload = await response.json();
      if (mode === 'proxy') {
        const fileUrl = typeof payload?.url === 'string' ? payload.url : null;
        if (!fileUrl) {
          return NextResponse.json({ error: 'presign_missing_url' }, { status: 502 });
        }
        try {
          const upstream = await fetch(fileUrl, { cache: 'no-store' });
          const buffer = await upstream.arrayBuffer();
          const text = textDecoder.decode(buffer);
          return new NextResponse(text, {
            status: upstream.ok ? 200 : upstream.status,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        } catch (error) {
          console.warn('[api/files] proxy fetch failed', { fileUrl, error });
          return NextResponse.json(
            { error: 'proxy_fetch_failed', detail: error instanceof Error ? error.message : String(error) },
            { status: 502 },
          );
        }
      }
      return NextResponse.json(payload, { status: 200 });
    } catch (error) {
      console.warn('[api/files] presign upstream error', { url, error });
    }
  }

  return NextResponse.json({ error: 'presign_failed', bases, tried: attempted }, { status: 502 });
}
