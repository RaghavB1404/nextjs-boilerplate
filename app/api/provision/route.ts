// app/api/provision/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { WorkflowSpec } from '@/lib/schema';
import { provisionN8nWorkflow } from '@/lib/n8n';

export async function GET() {
  return NextResponse.json({ ok: true, usage: 'POST { spec }' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) return NextResponse.json({ error: 'spec_invalid', details: parsed.error.format() }, { status: 400 });

  try {
    const out = await provisionN8nWorkflow(parsed.data.name);
    return NextResponse.json(out);
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'provision_failed' }, { status: 500 });
  }
}
