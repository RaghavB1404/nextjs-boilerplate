// app/api/compile/route.ts
export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { WorkflowSpec } from '../../../lib/schema';
import { compileToSpec } from '../../../lib/llm';

function extractUrls(s: string): string[] {
  const re = /(https?:\/\/[^\s)]+)\b/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  // de-dupe, cap 50
  return Array.from(new Set(out)).slice(0, Number(process.env.MAX_URLS || 50));
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), { status: 400 });
    }

    // 1) Try the LLM path
    try {
      const res = await compileToSpec(prompt);
      if (res && (res as any).spec) {
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    } catch (e) {
      // fall through to fallback
    }

    // 2) Deterministic fallback from the prompt (URL parsing)
    const urls = extractUrls(prompt);
    if (urls.length === 0) {
      return new Response(JSON.stringify({ error: 'no URLs found in prompt (fallback failed)' }), { status: 400 });
    }

    const fallbackSpec = {
      name: `Guard ${new Date().toISOString().slice(0, 10)}`,
      checks: [
        {
          type: 'pdpCheck',
          urls,
          assertions: { price: true, atc: true }, // safe defaults
        },
      ],
      actions: [
        { type: 'slack', channel: '#ops-alerts', template: 'PDP Guard results' },
      ],
      guardrails: {
        timeoutSec: Number(process.env.SIM_TIMEOUT_SEC || 60),
        maxUrls: Number(process.env.MAX_URLS || 50),
      },
    };

    // Validate the fallback to guarantee shape
    const parsed = WorkflowSpec.parse(fallbackSpec);

    return new Response(
      JSON.stringify({ spec: parsed, repaired: false, note: 'fallback-from-prompt' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'compile_failed' }), { status: 500 });
  }
}
export {};
