import { NextResponse } from 'next/server';
import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

import { resolveChatTranscriptPath } from '@/lib/datasets';

const ORCH_URL =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.ORCH_URL ||
  process.env.NEXT_PUBLIC_ORCH_URL ||
  'http://localhost:8005';

const datasetPath = resolveChatTranscriptPath();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function persistTranscript(entry: Record<string, unknown>) {
  try {
    const dir = path.dirname(datasetPath);
    await mkdir(dir, { recursive: true });
    await appendFile(datasetPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[chat-transcript] Failed to persist transcript', error);
  }
}

function resolveTimeout(): number {
  const rawMs =
    process.env.ORCH_TIMEOUT_MS ?? process.env.NEXT_PUBLIC_ORCH_TIMEOUT_MS ?? null;
  if (rawMs) {
    const parsedMs = Number(rawMs);
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return parsedMs;
    }
  }

  const rawSeconds = process.env.LLM_REQUEST_TIMEOUT_S;
  if (rawSeconds) {
    const parsedSeconds = Number(rawSeconds);
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      return parsedSeconds * 1000;
    }
  }

  return 120_000;
}

const ORCH_TIMEOUT_MS = resolveTimeout();

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

  const { query, message, thread_id: threadIdRaw, meta } = payload as {
    query?: unknown;
    message?: unknown;
    thread_id?: unknown;
    meta?: unknown;
  };
  const questionSource = typeof message === 'string' ? message : typeof query === 'string' ? query : '';
  const question = questionSource.trim();
  if (!question) {
    return NextResponse.json({ detail: 'Query is required' }, { status: 400 });
  }

  const threadId =
    typeof threadIdRaw === 'string' && threadIdRaw.trim().length > 0 ? threadIdRaw.trim() : 'web-thread-default';

  const upstreamBody: Record<string, unknown> = {
    thread_id: threadId,
    message: question,
    query: question,
  };
  if (isRecord(meta)) {
    upstreamBody.meta = meta;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), ORCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(new URL('/v1/query', ORCH_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(upstreamBody),
      cache: 'no-store',
      signal: abortController.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Upstream request timed out.'
        : error instanceof Error
          ? error.message
          : 'Failed to reach orchestrator.';
    return NextResponse.json({ detail: message }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    data = { detail: text || 'Upstream response was not valid JSON' };
  }

  if (response.ok && typeof data === 'object' && data !== null) {
    const payload = data as Record<string, unknown>;
    const entry = {
      ts: new Date().toISOString(),
      query: question,
      route: payload.route ?? null,
      metrics: payload.metrics ?? null,
      telemetry: payload.telemetry ?? null,
      used: payload.used ?? null,
      citations: payload.citations ?? null,
      text: payload.text ?? null,
    };
    void persistTranscript(entry);
  }

  return NextResponse.json(data, { status: response.status });
}
