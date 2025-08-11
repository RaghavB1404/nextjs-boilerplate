export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { WorkflowSpec } from '@/lib/schema';
import { simulateUrls } from '@/lib/simulate';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=> ({}));
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) return NextResponse.json({ error: 'spec_invalid', details: parsed.error.flatten() }, { status: 400 });

  const spec = parsed.data;
  const check = spec.checks[0];
  const urls = (check.urls || []).slice(0, spec.guardrails.maxUrls);
  if (!urls.length) return NextResponse.json({ error: 'no_urls' }, { status: 400 });

  try {
    const report = await simulateUrls(urls, check.assertions || {}, spec.guardrails.timeoutSec);
    const passed = report.filter(r => r.ok).length;
    const summary = { total: report.length, passed, failed: report.length - passed };
    return NextResponse.json({ report, summary });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'simulate_failed' }, { status: 500 });
  }
}
