export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { triggerWebhook } from '@/lib/n8n';

export async function POST(req: NextRequest) {
  const { webhookUrl, payload } = await req.json().catch(() => ({}));
  if (!webhookUrl) {
    return NextResponse.json({ error: 'webhookUrl required' }, { status: 400 });
  }
  try {
    const result = await triggerWebhook(webhookUrl, payload || {});
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'execute_failed' }, { status: 500 });
  }
}
