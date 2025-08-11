// lib/crawl.ts
export async function discoverProductUrls(seed: string, max = 10) {
  const res = await fetch(seed, {
    headers: { "user-agent":"Mozilla/5.0", "accept":"text/html,*/*" }
  });
  const html = await res.text();
  const host = new URL(seed).origin;
  const hrefs = new Set<string>();

  // crude PDP patterns (Shopify & common)
  const re = /href=["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) {
    try {
      let href = m[1];
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;
      if (href.startsWith("//")) href = "https:" + href;
      if (href.startsWith("/")) href = host + href;
      // PDP-ish heuristics
      if (/\/products\/[^/]+/.test(href) || /\/product\/[^/]+/.test(href)) hrefs.add(href);
      if (hrefs.size >= max) break;
    } catch {}
  }
  return Array.from(hrefs).slice(0, max);
}
