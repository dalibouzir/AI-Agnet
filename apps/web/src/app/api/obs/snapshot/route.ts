import { NextRequest, NextResponse } from 'next/server';

import { buildSnapshot } from "@/app/api/obs/_lib/snapshot";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const payload = await buildSnapshot(searchParams);
  return NextResponse.json(payload);
}
