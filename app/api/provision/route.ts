export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { WorkflowSpec } from "@/lib/schema";
import { provisionN8nWorkflow } from "@/lib/n8n";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "spec_invalid", details: parsed.error.format() }), { status: 400 });
  }
  const spec = parsed.data;

  // Use first Slack action for MVP
  const slack = spec.actions.find(a => a.type === "slack") as any;
  if (!slack) return new Response(JSON.stringify({ error: "no_slack_action" }), { status: 400 });

  try {
    const { workflowId, webhookUrl } = await provisionN8nWorkflow(spec.name, slack.channel, slack.template);
    return Response.json({ workflowId, webhookUrl });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "provision_failed" }), { status: 500 });
  }
}
