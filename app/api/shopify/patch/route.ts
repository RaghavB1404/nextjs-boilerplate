// app/api/shopify/patch/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { applyDraftFix, PatchKind } from '@/lib/shopify';

export async function POST(req: NextRequest) {
  try {
    const { kind, custom } = await req.json().catch(() => ({}));
    if (!kind || !['price','atc','custom'].includes(kind)) {
      return NextResponse.json({ error: 'kind must be price|atc|custom' }, { status: 400 });
    }
    const out = await applyDraftFix(kind as PatchKind, custom);
    return NextResponse.json(out);
  } catch (e:any) {
    const msg = e?.message || 'patch_failed';
    return NextResponse.json({ error: msg }, { status: msg.includes('shopify') ? 400 : 500 });
  }
}
