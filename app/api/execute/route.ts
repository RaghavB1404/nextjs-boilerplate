// app/api/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { triggerWebhook } from '@/lib/n8n';      // your existing helper
import { sendSlackText } from '@/lib/slack';     // new helper

function buildSlackText(payload: any) {
  const report = Array.isArray(payload?.report) ? payload.report : [];
  const failed = report.filter((r: any) => !r.ok);
  const lines = failed.length
    ? failed.map((f: any) => `• ${f.url} — ${(f.failures || []).join(', ')}`)
    : ['All checks passed ✅'];
  const title = payload?.title || 'PDP Guard results';
  return `${title}\n\n${lines.join('\n')}`;
}

export async function POST(req: NextRequest) {
  const { webhookUrl, payload } = await req.json().catch(() => ({}));
  if (!webhookUrl) {
    return NextResponse.json({ error: 'webhookUrl required' }, { status: 400 });
  }

  const slackUrl = process.env.SLACK_WEBHOOK_URL || ""; // from Vercel env
  const text = buildSlackText(payload || {});

  // Run n8n webhook (best-effort) and Slack in parallel
  const results: any = {};
  await Promise.allSettled([
    (async () => {
      try {
        const r = await triggerWebhook(webhookUrl, payload || {});
        results.n8n = { ok: true, response: r };
      } catch (e: any) {
        results.n8n = { ok: false, error: e.message || String(e) };
      }
    })(),
    (async () => {
      if (!slackUrl) { results.slack = { ok: false, error: 'SLACK_WEBHOOK_URL not set' }; return; }
      try {
        await sendSlackText(slackUrl, text);
        results.slack = { ok: true };
      } catch (e: any) {
        results.slack = { ok: false, error: e.message || String(e) };
      }
    })(),
  ]);

  // Prefer Slack success as ground truth for the UI
  if (results.slack?.ok) {
    return NextResponse.json({ ok: true, posted: 'slack', details: results });
  }
  if (results.n8n?.ok) {
    // n8n succeeded, but Slack failed (env or policy) — still return ok
    return NextResponse.json({ ok: true, posted: 'n8n-only', details: results });
  }
  return NextResponse.json({ error: 'execute_failed', details: results }, { status: 500 });
}
