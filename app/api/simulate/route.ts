// app/api/simulate/route.ts  (or src/app/... if you use src/)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { WorkflowSpec } from '@/lib/schema';
import { simulateUrls } from '@/lib/simulate';

export async function GET() {
  return NextResponse.json({ ok: true, usage: 'POST { spec }' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) return NextResponse.json({ error: 'spec_invalid', details: parsed.error.format() }, { status: 400 });

  const spec = parsed.data;
  const check = spec.checks[0];
  if (!check || check.type !== 'pdpCheck') return NextResponse.json({ error: 'unsupported_or_missing_check' }, { status: 400 });

  const timeoutSec = spec.guardrails?.timeoutSec ?? 60;
  const report = await simulateUrls(check.urls, check.assertions, timeoutSec);
  const summary = { total: report.length, passed: report.filter(r=>r.ok).length, failed: report.filter(r=>!r.ok).length };

  return NextResponse.json({ report, summary });
}
