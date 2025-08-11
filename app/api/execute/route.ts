export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { triggerWebhook } from "@/lib/n8n";

export async function POST(req: NextRequest) {
  const { webhookUrl, payload } = await req.json();
  if (!webhookUrl) return new Response(JSON.stringify({ error: "webhookUrl required" }), { status: 400 });

  try {
    const res = await triggerWebhook(webhookUrl, payload || {});
    return Response.json({ ok: true, result: res });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "execute_failed" }), { status: 500 });
  }
}
