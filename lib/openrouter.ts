// lib/openrouter.ts
export async function diagnoseWithLLM(input: {spec:any; report:any}) {
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key) return { skipped: true, reason: "no_openrouter_key" };

  const prompt = [
    "You are a senior Shopify engineer. Given failures on PDPs, produce:",
    "1) A short, likely root cause (2-3 bullets).",
    "2) A minimal Liquid/HTML snippet to restore price or ATC.",
    "3) A 3–5 step runbook for the engineer on-call.",
    "",
    `SPEC:\n${JSON.stringify(input.spec).slice(0,4000)}`,
    `REPORT:\n${JSON.stringify(input.report).slice(0,4000)}`
  ].join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{ "Content-Type":"application/json","Authorization":`Bearer ${key}` },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [{ role:"user", content: prompt }],
      temperature: 0.2,
    })
  });
  if (!res.ok) return { skipped:true, reason:`openrouter_http_${res.status}` };
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content || "";
  return { skipped:false, text };
}
