export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { WorkflowSpec } from '@/lib/schema';
import { provisionN8nWorkflow } from '@/lib/n8n'; // use relative path if you didn't set tsconfig alias

// after provisionN8nWorkflow(...):
const { workflowId, webhookUrl } = await provisionN8nWorkflow(...);
const testUrl = webhookUrl.replace("/webhook/", "/webhook-test/");
return NextResponse.json({ workflowId, webhookUrl, testWebhookUrl: testUrl });


export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) {
    return NextResponse.json({ error: 'spec_invalid', details: parsed.error.format() }, { status: 400 });
  }
  const spec = parsed.data;
  const slack = spec.actions.find(a => a.type === 'slack') as any;
  if (!slack) return NextResponse.json({ error: 'no_slack_action' }, { status: 400 });

  try {
    const { workflowId, webhookUrl } =
      await provisionN8nWorkflow(spec.name, slack.channel, slack.template);
    return NextResponse.json({ workflowId, webhookUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'provision_failed' }, { status: 500 });
  }
}

