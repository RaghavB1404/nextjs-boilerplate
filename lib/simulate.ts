// lib/simulate.ts
export type Assertions = { price?: boolean; atc?: boolean; textIncludes?: string };

function findSnippet(html: string, idx: number, radius = 160) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(html.length, idx + radius);
  return html.slice(start, end).replace(/\s+/g, " ").trim();
}

function extractJsonLdPrices(html: string): { ok: boolean; evidence?: string } {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    try {
      const raw = m[1].trim();
      const json = JSON.parse(raw);
      const arr = Array.isArray(json) ? json : [json];
      for (const node of arr) {
        const offers = node?.offers || node?.Offers || node?.offer;
        if (!offers) continue;
        const maybeOffers = Array.isArray(offers) ? offers : [offers];
        for (const off of maybeOffers) {
          const p = off?.price ?? off?.lowPrice ?? off?.highPrice;
          if (p && String(p).match(/^\d[\d.,]*$/)) {
            return { ok: true, evidence: findSnippet(html, m.index ?? 0) };
          }
        }
      }
    } catch { /* ignore bad JSON */ }
  }
  return { ok: false };
}

function extractMetaPrices(html: string): { ok: boolean; evidence?: string } {
  // product:price:amount (common), og:price:amount (some themes)
  const re = /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["'](\d[\d.,]*)["'][^>]*>/i;
  const m = re.exec(html);
  if (m) return { ok: true, evidence: findSnippet(html, m.index) };

  // twitter label/data patterns sometimes hold price
  const tw = /<meta[^>]+name=["']twitter:data1["'][^>]*content=["'][^"']*(?:₹|\$|€|£)\s*\d[\d.,]*["'][^>]*>/i.exec(html);
  if (tw) return { ok: true, evidence: findSnippet(html, tw.index) };

  return { ok: false };
}

function microdataOrDataAttrPrice(html: string): { ok: boolean; evidence?: string } {
  const patterns: RegExp[] = [
    /itemprop=["']price["'][^>]*content=["']?([\p{Sc}]?\d[\d.,]*)/ui,
    /\bdata-(?:price|product-price|price-amount|selling-plan-price)=["'](\d[\d.,]*)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return { ok: true, evidence: findSnippet(html, m.index) };
  }
  return { ok: false };
}

function looseCurrencyPrice(html: string): { ok: boolean; evidence?: string } {
  const m = /(₹|\$|€|£)\s*\d[\d.,]{1,}/.exec(html);
  if (m) return { ok: true, evidence: findSnippet(html, m.index) };
  return { ok: false };
}

function hasPrice(html: string) {
  return (
    extractJsonLdPrices(html).ok ? extractJsonLdPrices(html) :
    extractMetaPrices(html).ok ? extractMetaPrices(html) :
    microdataOrDataAttrPrice(html).ok ? microdataOrDataAttrPrice(html) :
    looseCurrencyPrice(html)
  );
}

function hasATC(html: string): { ok: boolean; evidence?: string } {
  const patterns: RegExp[] = [
    /<button[^>]*>(?:\s|<!--.*?-->)*?(?:add\s*(?:to\s*)?cart|buy\s*now)(?:\s|<!--.*?-->)*?<\/button>/i,
    /name=["']add["']/i,
    /form[^>]+action=["'][^"']*\/cart\/add[^"']*["']/i,
    /id=["']AddToCart["']/i,
    /\bAddToCart\b/i
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return { ok: true, evidence: findSnippet(html, m.index) };
  }
  return { ok: false };
}

async function fetchHtml(url: string, ac: AbortController): Promise<string> {
  const res = await fetch(url, {
    signal: ac.signal,
    headers: {
      // More “real browser” helps with some CDNs
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  // Some shops 302 → follow automatically; just read text
  return await res.text();
}

export async function simulateUrls(
  urls: string[],
  assertions: Assertions,
  timeoutSec = 60
) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutSec * 1000);

  const out: Array<{url:string; ok:boolean; failures:string[]; millis:number; evidence?:string|null}> = [];

  for (const url of urls) {
    const start = Date.now();
    try {
      const html = (await fetchHtml(url, ac)).slice(0, 300_000); // cap 300KB
      const failures: string[] = [];
      let evidence: string | null = null;

      if (assertions.textIncludes) {
        const q = assertions.textIncludes;
        const idx = html.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) failures.push(`MISSING:Text("${q}")`);
        else evidence = evidence || findSnippet(html, idx);
      }
      if (assertions.price) {
        const pr = hasPrice(html);
        if (!pr.ok) failures.push("MISSING:Price");
        else evidence = evidence || pr.evidence || null;
      }
      if (assertions.atc) {
        const atc = hasATC(html);
        if (!atc.ok) failures.push("MISSING:AddToCart");
        else evidence = evidence || atc.evidence || null;
      }

      out.push({
        url,
        ok: failures.length === 0,
        failures,
        millis: Date.now() - start,
        evidence,
      });
    } catch (e: any) {
      out.push({
        url,
        ok: false,
        failures: [`FETCH_ERROR:${e?.name || "Error"}`],
        millis: Date.now() - start,
        evidence: null,
      });
    }
  }

  clearTimeout(t);
  return out;
}
