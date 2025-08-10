export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { compileToSpec } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "prompt is required" }), { status: 400 });
  }
  try {
    const result = await compileToSpec(prompt);
    return Response.json(result);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "compile_failed" }), { status: 500 });
  }
}
