// app/api/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { triggerWebhook } from '@/lib/n8n';
import { sendSlackText } from '@/lib/slack';

function buildAlertText(payload: any) {
  const report = Array.isArray(payload?.report) ? payload.report : [];
  const failed = report.filter((r:any)=>!r.ok);
  const lines = failed.length ? failed.map((f:any)=>`• ${f.url} — ${(f.failures||[]).join(', ')}`) : ['All checks passed ✅'];
  const title = payload?.title || 'PDP Guard results';
  return `${title}\n\n${lines.join('\n')}`;
}

export async function GET() { return NextResponse.json({ ok: true, usage: 'POST { webhookUrl?, payload, demoMode?, slackOverride? }' }); }

export async function POST(req: NextRequest) {
  const { webhookUrl, payload, demoMode, slackOverride } = await req.json().catch(()=>({}));
  const alertText = buildAlertText(payload||{});
  const results:any = { alertText };

  // If demo mode: skip n8n/Slack, just return alert text
  if (demoMode) return NextResponse.json({ ok: true, posted: 'demo', details: results });

  // Run both best-effort
  await Promise.allSettled([
    (async () => {
      try {
        if (webhookUrl) { const r = await triggerWebhook(webhookUrl, payload||{}); results.n8n = { ok:true, response: r }; }
        else results.n8n = { ok:false, error: 'no_webhook' };
      } catch (e:any) { results.n8n = { ok:false, error: e.message || String(e) }; }
    })(),
    (async () => {
      const url = (slackOverride || process.env.SLACK_WEBHOOK_URL || "").trim();
      if (!url) { results.slack = { ok:false, error: 'no_slack_url' }; return; }
      try { await sendSlackText(url, alertText); results.slack = { ok:true }; }
      catch (e:any) { results.slack = { ok:false, error: e.message || String(e) }; }
    })(),
  ]);

  if (results.slack?.ok || results.n8n?.ok) return NextResponse.json({ ok: true, posted: results.slack?.ok ? 'slack' : 'n8n', details: results });
  return NextResponse.json({ error: 'execute_failed', details: results }, { status: 500 });
}
