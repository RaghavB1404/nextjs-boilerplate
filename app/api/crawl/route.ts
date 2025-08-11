// app/api/crawl/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { discoverProductUrls } from '@/lib/crawl';

export async function POST(req: NextRequest) {
  const { seed, max } = await req.json().catch(()=> ({}));
  if (!seed || !/^https?:\/\//i.test(seed)) return NextResponse.json({ error:'seed_url_required' }, { status:400 });
  try {
    const urls = await discoverProductUrls(seed, Math.min(Number(max)||10, 50));
    return NextResponse.json({ urls });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'crawl_failed' }, { status:500 });
  }
}
