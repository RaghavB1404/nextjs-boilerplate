export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { WorkflowSpec } from "@/lib/schema";
import { simulateUrls } from "@/lib/simulate";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = WorkflowSpec.safeParse(body.spec);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "spec_invalid", details: parsed.error.format() }), { status: 400 });
  }
  const spec = parsed.data;
  const timeoutSec = spec.guardrails?.timeoutSec ?? 60;

  // MVP: run only the first pdpCheck block
  const check = spec.checks[0];
  if (check.type !== "pdpCheck") {
    return new Response(JSON.stringify({ error: "unsupported_check_type" }), { status: 400 });
  }

  try {
    const report = await simulateUrls(check.urls, check.assertions, timeoutSec);
    const summary = {
      total: report.length,
      passed: report.filter(r => r.ok).length,
      failed: report.filter(r => !r.ok).length,
    };
    return Response.json({ report, summary });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "simulate_failed" }), { status: 500 });
  }
}
