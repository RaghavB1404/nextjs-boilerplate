// lib/shopify.ts
type Theme = { id: number; name: string; role: 'main' | 'unpublished' | 'demo' | string };

const SHOP = (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '');
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-01';
const BASE = SHOP ? `https://${SHOP}/admin/api/${API_VERSION}` : '';
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || '';

function assertEnv() {
  if (!SHOP || !TOKEN) throw new Error('shopify_env_missing');
}

async function shopify(path: string, init: RequestInit = {}) {
  assertEnv();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch {}
    throw new Error(`shopify ${path} ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listThemes(): Promise<Theme[]> {
  const j = await shopify('/themes.json', { method: 'GET' });
  return j.themes as Theme[];
}

export async function duplicateTheme(srcId: number, name?: string): Promise<Theme> {
  const j = await shopify('/themes.json', {
    method: 'POST',
    body: JSON.stringify({
      theme: {
        name: name || `AgentOps Draft ${new Date().toISOString().slice(0, 16)}`,
        src_theme_id: srcId,
      },
    }),
  });
  return j.theme as Theme;
}

export async function getAsset(themeId: number, key: string): Promise<{ key: string; value?: string }> {
  const q = new URLSearchParams({ 'asset[key]': key }).toString();
  const j = await shopify(`/themes/${themeId}/assets.json?${q}`, { method: 'GET' });
  return j.asset || {};
}

export async function putAsset(themeId: number, key: string, value: string) {
  const payload = { asset: { key, value } };
  await shopify(`/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function previewUrl(themeId: number) {
  return `https://${SHOP}/?preview_theme_id=${themeId}`;
}

// ---------- Patch logic (surgical, reversible) ----------

export type PatchKind = 'price' | 'atc' | 'custom';
type PatchPlan = { pathTried: string[]; pathUsed: string; insertedAt: string; lines: string[] };

const CANDIDATE_ASSETS = [
  'sections/main-product.liquid',   // Online Store 2.0
  'sections/product-template.liquid',
  'templates/product.liquid',       // legacy
];

function hasATC(html: string) {
  return /<button[^>]*>(?:\s|<!--.*?-->)*?(?:add\s*(?:to\s*)?cart|buy\s*now)(?:\s|<!--.*?-->)*?<\/button>/i.test(html) ||
         /form[^>]+action=["'][^"']*\/cart\/add[^"']*["']/i.test(html) ||
         /name=["']add["']/i.test(html) ||
         /id=["']AddToCart["']/i.test(html);
}

function alreadyInjected(s: string) {
  return /AgentOps injection/i.test(s);
}

function buildSnippet(kind: PatchKind, custom?: string) {
  const header = `{% comment %} AgentOps injection start — ${new Date().toISOString()} {% endcomment %}`;
  const footer = `{% comment %} AgentOps injection end {% endcomment %}`;
  if (kind === 'price') {
    const line = `<span class="agentops-price">{{ product.selected_or_first_available_variant.price | money }}</span>`;
    return { lines: [header, line, footer] };
  }
  if (kind === 'atc') {
    const line = `<button type="submit" class="agentops-atc btn" name="add">Add to Cart</button>`;
    return { lines: [header, line, footer] };
  }
  const safe = (custom || '').trim() || `<span class="agentops-note">AgentOps snippet</span>`;
  return { lines: [header, safe, footer] };
}

function injectIntoForm(content: string, lines: string[]): { updated: string; insertedAt: string } | null {
  // Find first product form; try to insert right after opening form tag
  const re = /<form[^>]+(?:action=["'][^"']*\/cart\/add[^"']*["'][^>]*)[^>]*>/i;
  const m = re.exec(content);
  if (!m) return null;
  const insertPos = (m.index || 0) + m[0].length;
  const before = content.slice(0, insertPos);
  const after  = content.slice(insertPos);
  const block  = `\n  ${lines.join('\n  ')}\n`;
  return { updated: before + block + after, insertedAt: 'after <form … add to cart>' };
}

function injectNearHeader(content: string, lines: string[]): { updated: string; insertedAt: string } | null {
  // Fallback: inject near product title header
  const m = /<h1[^>]*>[^<]*<\/h1>/i.exec(content);
  if (!m) return null;
  const insertPos = (m.index || 0) + m[0].length;
  const before = content.slice(0, insertPos);
  const after  = content.slice(insertPos);
  const block  = `\n  ${lines.join('\n  ')}\n`;
  return { updated: before + block + after, insertedAt: 'after <h1> product title' };
}

export function planInjection(content: string, kind: PatchKind, custom?: string): { updated: string; plan: PatchPlan } | null {
  if (alreadyInjected(content)) return null;
  const { lines } = buildSnippet(kind, custom);
  // Prefer injecting inside product form (most reliable)
  const primary = injectIntoForm(content, lines);
  if (primary) return { updated: primary.updated, plan: { pathTried: [], pathUsed: '', insertedAt: primary.insertedAt, lines } };
  // Fallback near title
  const alt = injectNearHeader(content, lines);
  if (alt) return { updated: alt.updated, plan: { pathTried: [], pathUsed: '', insertedAt: alt.insertedAt, lines } };
  return null;
}

export async function applyDraftFix(kind: PatchKind, customSnippet?: string) {
  assertEnv();
  const themes = await listThemes();
  const main = themes.find(t => t.role === 'main');
  if (!main) throw new Error('no_main_theme');

  // Duplicate the live theme
  const draft = await duplicateTheme(main.id, `AgentOps Draft — ${new Date().toISOString().slice(0,16)}`);

  // Choose first existing product asset
  let usedPath = '';
  let content = '';
  const tried: string[] = [];
  for (const key of CANDIDATE_ASSETS) {
    tried.push(key);
    try {
      const a = await getAsset(draft.id, key);
      if (typeof a.value === 'string') { usedPath = key; content = a.value; break; }
    } catch { /* ignore and try next */ }
  }
  if (!usedPath) throw new Error(`asset_not_found:${tried.join(',')}`);

  // Compute injection
  const plan = planInjection(content, kind, customSnippet);
  if (!plan) {
    // Either already injected or we couldn't find an insertion point
    // Still return preview for the duplicate so user can inspect.
    return {
      themeId: draft.id,
      preview: previewUrl(draft.id),
      changed: false,
      reason: alreadyInjected(content) ? 'already_injected' : 'no_insertion_point',
      asset: usedPath,
      tried,
    };
  }

  // Write back
  await putAsset(draft.id, usedPath, plan.updated);

  return {
    themeId: draft.id,
    preview: previewUrl(draft.id),
    changed: true,
    asset: usedPath,
    tried,
    insertedAt: plan.plan.insertedAt,
    lines: plan.plan.lines,
  };
}
