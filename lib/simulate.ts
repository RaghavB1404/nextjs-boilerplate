// lib/simulate.ts
export type Assertions = { price?: boolean; atc?: boolean; textIncludes?: string };
export type SimResult = { url:string; ok:boolean; failures:string[]; millis:number; evidence?:string|null };

function snippet(html: string, idx: number, r = 160) {
  const s = Math.max(0, idx - r), e = Math.min(html.length, idx + r);
  return html.slice(s, e).replace(/\s+/g, " ").trim();
}
function fromJsonLd(html: string) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const j = JSON.parse(m[1]); const arr = Array.isArray(j) ? j : [j];
      for (const node of arr) {
        const offers = node?.offers ?? node?.offer; if (!offers) continue;
        const list = Array.isArray(offers) ? offers : [offers];
        for (const o of list) { const p = o?.price ?? o?.lowPrice ?? o?.highPrice;
          if (p && String(p).match(/^\d[\d.,]*$/)) return { ok: true as const, evidence: snippet(html, m.index ?? 0) }; }
      }
    } catch {}
  } return { ok: false as const };
}
function fromMeta(html: string) {
  const re = /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["'](\d[\d.,]*)["'][^>]*>/i;
  const m = re.exec(html); if (m) return { ok: true as const, evidence: snippet(html, m.index) };
  const tw = /<meta[^>]+name=["']twitter:data1["'][^>]*content=["'][^"']*(?:₹|\$|€|£)\s*\d[\d.,]*["'][^>]*>/i.exec(html);
  if (tw) return { ok: true as const, evidence: snippet(html, tw.index) };
  return { ok: false as const };
}
function fromMicro(html: string) {
  const pats = [
    /itemprop=["']price["'][^>]*content=["']?([\p{Sc}]?\d[\d.,]*)/ui,
    /\bdata-(?:price|product-price|price-amount|selling-plan-price)=["'](\d[\d.,]*)/i,
  ];
  for (const re of pats) { const m = re.exec(html); if (m) return { ok: true as const, evidence: snippet(html, m.index) }; }
  return { ok: false as const };
}
function looseCurr(html: string) {
  const m = /(₹|\$|€|£)\s*\d[\d.,]{1,}/.exec(html);
  if (m) return { ok: true as const, evidence: snippet(html, m.index) };
  return { ok: false as const };
}
function hasPrice(html:string){ return fromJsonLd(html).ok?fromJsonLd(html):fromMeta(html).ok?fromMeta(html):fromMicro(html).ok?fromMicro(html):looseCurr(html); }
function hasATC(html:string){
  const pats=[
    /<button[^>]*>(?:\s|<!--.*?-->)*?(?:add\s*(?:to\s*)?cart|buy\s*now)(?:\s|<!--.*?-->)*?<\/button>/i,
    /name=["']add["']/i,/form[^>]+action=["'][^"']*\/cart\/add[^"']*["']/i,/id=["']AddToCart["']/i,/\bAddToCart\b/i
  ];
  for (const re of pats){ const m=re.exec(html); if(m) return {ok:true,evidence:snippet(html,m.index)} }
  return {ok:false};
}

async function fetchHtml(url: string, ac: AbortController) {
  const res = await fetch(url, {
    signal: ac.signal,
    headers: {
      "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "accept-language":"en-US,en;q=0.9","accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  }); return await res.text();
}

// simple promise pool
async function mapPool<T, R>(items:T[], size:number, fn:(x:T)=>Promise<R>):Promise<R[]>{
  const out:R[]=[]; let i=0;
  const runners=Array(Math.min(size,items.length)).fill(0).map(async ()=>{
    while(i<items.length){ const idx=i++; out[idx]=await fn(items[idx]); }
  });
  await Promise.all(runners); return out;
}

export async function simulateUrls(urls: string[], assertions: Assertions, timeoutSec = 60) {
  const ac = new AbortController();
  const timer = setTimeout(()=>ac.abort(), timeoutSec*1000);

  const work = await mapPool(urls, 4, async (url) => {
    // Built-in demo short-circuits
    if (url.startsWith("/demo/pass")) {
      return { url, ok: true, failures: [], millis: 5, evidence: "demo: price+ATC present" };
    }
    if (url.startsWith("/demo/fail")) {
      return { url, ok: false, failures: ["MISSING:Price","MISSING:AddToCart"], millis: 7, evidence: "demo" };
    }

    // ... existing fetch/parse logic below ...

    const start=Date.now();
    try{
      const html=(await fetchHtml(url,ac)).slice(0,300_000);
      const fails:string[]=[]; let evidence:string|null=null;
      if(assertions.textIncludes){ const q=assertions.textIncludes; const i=html.toLowerCase().indexOf(q.toLowerCase());
        if(i===-1) fails.push(`MISSING:Text("${q}")`); else evidence=evidence??snippet(html,i); }
      if(assertions.price){ const pr=hasPrice(html); if(!pr.ok) fails.push("MISSING:Price"); else evidence=evidence??pr.evidence??null; }
      if(assertions.atc){ const atc=hasATC(html); if(!atc.ok) fails.push("MISSING:AddToCart"); else evidence=evidence??atc.evidence??null; }
      return { url, ok: fails.length===0, failures:fails, millis: Date.now()-start, evidence };
    }catch(e:any){ return { url, ok:false, failures:[`FETCH_ERROR:${e?.name||"Error"}`], millis:Date.now()-start, evidence:null }; }
  });
  clearTimeout(timer);
  return work as SimResult[];
}

