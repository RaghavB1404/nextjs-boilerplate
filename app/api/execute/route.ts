// app/api/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { triggerWebhook } from '@/lib/n8n';
import { sendSlackText } from '@/lib/slack';
import { WorkflowSpec } from '@/lib/schema';

function buildAlertText(payload: any, title='PDP Guard results') {
  const report = Array.isArray(payload?.report) ? payload.report : [];
  const failed = report.filter((r:any)=>!r.ok);
  const lines = failed.length ? failed.map((f:any)=>`• ${f.url} — ${(f.failures||[]).join(', ')}`) : ['All checks passed ✅'];
  return `${title}\n\n${lines.join('\n')}`;
}
function pickBranch(spec:any, summary:{passed:number; total:number}) {
  const anyFail = summary.passed < summary.total;
  const check = spec?.checks?.[0];
  const conds = (check?.conditions || []) as Array<{when:'onFail'|'onPass';actions:any[]}>;
  const onFail = conds.find(c=>c.when==='onFail');
  const onPass = conds.find(c=>c.when==='onPass');
  if (anyFail && onFail) return { key:'onFail', actions:onFail.actions };
  if (!anyFail && onPass) return { key:'onPass', actions:onPass.actions };
  return { key: anyFail ? 'onFail' : 'onPass', actions: spec.actions || [] };
}

export async function POST(req: NextRequest) {
  const { webhookUrl, payload, demoMode, slackOverride, spec } = await req.json().catch(()=> ({}));
  const parsed = WorkflowSpec.safeParse(spec);
  if (!parsed.success) return NextResponse.json({ error:'spec_invalid' }, { status:400 });

  const summary = (()=> {
    const r = Array.isArray(payload?.report) ? payload.report : [];
    const passed = r.filter((x:any)=>x.ok).length;
    return { passed, total: r.length };
  })();

  const branch = pickBranch(parsed.data, summary);
  const alertText = buildAlertText(payload||{}, parsed.data.name || 'PDP Guard results');
  const results:any = { alertText, branch: branch.key, summary };

  if (demoMode) return NextResponse.json({ ok: true, posted:'demo', details: results });

  // best-effort n8n + Slack (branch-controlled)
  await Promise.allSettled([
    (async () => {
      try { if (webhookUrl) { const r=await triggerWebhook(webhookUrl, payload||{}); results.n8n={ok:true,response:r}; }
            else { results.n8n={ok:false,error:'no_webhook'} } } 
      catch(e:any){ results.n8n={ok:false,error:e.message||String(e)} }
    })(),
    (async () => {
      const url = (slackOverride || process.env.SLACK_WEBHOOK_URL || "").trim();
      if (!url) { results.slack={ok:false,error:'no_slack_url'}; return; }
      // Only send if branch has any slack-like action
      const shouldSend = (branch.actions||[]).some((a:any)=>a.type==='slack');
      if (!shouldSend) { results.slack={ok:false,skipped:'no_slack_action_for_branch'}; return; }
      try { await sendSlackText(url, alertText); results.slack={ok:true}; }
      catch(e:any){ results.slack={ok:false,error:e.message||String(e)} }
    })(),
  ]);

  if (results.slack?.ok || results.n8n?.ok) return NextResponse.json({ ok:true, posted: results.slack?.ok?'slack':(results.n8n?.ok?'n8n':'none'), details: results });
  return NextResponse.json({ error:'execute_failed', details: results }, { status:500 });
}
