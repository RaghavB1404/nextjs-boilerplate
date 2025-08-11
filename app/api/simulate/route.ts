// app/api/simulate/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // avoid static optimization

import { NextRequest, NextResponse } from 'next/server';
import { WorkflowSpec } from '../../../lib/schema';
import { simulateUrls } from '../../../lib/simulate';

const JSON_HDR = { 'content-type': 'application/json' };

// Helpful GET so hitting in browser doesn't 405
export async function GET() {
  return new Response(JSON.stringify({ ok: true, usage: 'POST { spec } to /api/simulate' }), {
    status: 200,
    headers: JSON_HDR,
  });
}

// Handle preflight just in case
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) {
    return NextResponse.json({ error: 'spec_invalid', details: parsed.error.format() }, { status: 400 });
  }
  const spec = parsed.data;
  const timeoutSec = spec.guardrails?.timeoutSec ?? 60;

  const check = spec.checks[0];
  if (!check || check.type !== 'pdpCheck') {
    return NextResponse.json({ error: 'unsupported_or_missing_check' }, { status: 400 });
  }

  try {
    const report = await simulateUrls(check.urls, check.assertions, timeoutSec);
    const summary = {
      total: report.length,
      passed: report.filter((r) => r.ok).length,
      failed: report.filter((r) => !r.ok).length,
    };
    return NextResponse.json({ report, summary }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'simulate_failed' }, { status: 500 });
  }
}
