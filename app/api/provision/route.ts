// app/api/provision/route.ts   (or src/app/... if you use src/)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
// If you don't have "@/lib" alias in tsconfig, change these to relative paths:
// import { WorkflowSpec } from '../../../lib/schema';
// import { provisionN8nWorkflow } from '../../../lib/n8n';
import { WorkflowSpec } from '@/lib/schema';
import { provisionN8nWorkflow } from '@/lib/n8n';

export async function GET() {
  return NextResponse.json({ ok: true, usage: 'POST { spec }' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'spec_invalid', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const spec = parsed.data;
  const slack = spec.actions.find(a => a.type === 'slack') as any;
  if (!slack) {
    return NextResponse.json({ error: 'no_slack_action' }, { status: 400 });
  }

  try {
    const { workflowId, webhookUrl } =
      await provisionN8nWorkflow(spec.name, slack.channel, slack.template);

    // Return both prod and test webhook candidates so "Run now" can try either.
    const testWebhookUrl = webhookUrl.includes('/webhook/')
      ? webhookUrl.replace('/webhook/', '/webhook-test/')
      : webhookUrl;

    return NextResponse.json({ workflowId, webhookUrl, testWebhookUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'provision_failed' },
      { status: 500 }
    );
  }
}
