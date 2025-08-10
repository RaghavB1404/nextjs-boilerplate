const PRICE_RE = /itemprop=["']price["']|data-price|class=["'][^"']*price[^"']*["']|(\$|₹|€|£)\s*\d/i;
const ATC_RE   = /#AddToCart|name=["']add["']|<button[^>]*type=["']submit["'][^>]*>|form[^>]*cart[^>]*>.*?<button[^>]*submit/i;

function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export async function simulateUrls(
  urls: string[],
  assertions: { price?: boolean; atc?: boolean; textIncludes?: string },
  timeoutSec = 60
) {
  const results: Array<{
    url: string;
    ok: boolean;
    millis: number;
    failures: string[];
    evidence: string | null;
  }> = [];

  const perUrlTimeout = Math.min(8000, timeoutSec * 1000); // cap 8s each

  for (const url of urls) {
    const t0 = Date.now();
    try {
      const resp = await withTimeout(fetch(url, {
        headers: { "User-Agent": "AgentOps-Simulator/1.0" },
      }), perUrlTimeout);

      if (!resp.ok) {
        results.push({ url, ok: false, millis: Date.now()-t0, failures: [`HTTP:${resp.status}`], evidence: null });
        continue;
      }
      const html = await resp.text();
      const fails: string[] = [];

      if (assertions.price && !PRICE_RE.test(html)) fails.push("MISSING:Price");
      if (assertions.atc && !ATC_RE.test(html)) fails.push("MISSING:AddToCart");
      if (assertions.textIncludes &&
          !html.toLowerCase().includes(assertions.textIncludes.toLowerCase())) {
        fails.push(`MISSING:textIncludes("${assertions.textIncludes}")`);
      }

      // For MVP: return a small snippet as evidence (avoid extra storage deps)
      const snippet = html.slice(0, 8000);
      results.push({ url, ok: fails.length === 0, millis: Date.now()-t0, failures: fails, evidence: snippet });
    } catch (e: any) {
      results.push({ url, ok: false, millis: Date.now()-t0, failures: [e.message || "fetch_error"], evidence: null });
    }
  }

  return results;
}
