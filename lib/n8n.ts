// lib/n8n.ts
type N8nWorkflow = {
  name: string; nodes: any[]; connections: Record<string, any>;
  settings?: Record<string, any>; staticData?: Record<string, any>;
};

const API_BASE = (process.env.N8N_BASE_URL || "").replace(/\/+$/, ""); // https://host/api/v1
const N8N_KEY  = process.env.N8N_API_KEY || "";

async function n8n(path: string, init: RequestInit = {}) {
  const url = `${API_BASE}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-N8N-API-KEY": N8N_KEY, ...(init.headers || {}) },
  });
  if (!res.ok) {
    let body = ""; try { body = await res.text(); } catch {}
    throw new Error(`n8n ${path} ${res.status}: ${body}`);
  }
  return res.json();
}
async function urlExists(url: string) {
  try { const r = await fetch(url, { method: "OPTIONS" }); return r.ok; } catch { return false; }
}

export async function provisionN8nWorkflow(name: string) {
  const slug = `agentops-${Date.now()}`;
  const workflow: N8nWorkflow = {
    name,
    nodes: [
      { id: "Webhook", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [240,300],
        parameters: { path: slug, httpMethod: "POST", options: {} } },
      { id: "Function", name: "Format Message", type: "n8n-nodes-base.function", typeVersion: 1, position: [500,300],
        parameters: { functionCode:
`const body = items[0].json || {};
const failed = (body.report || []).filter(r => !r.ok);
const lines = failed.length ? failed.map(f => '• ' + f.url + ' — ' + ((f.failures||[]).join(', '))) : ['All checks passed ✅'];
return [{ json: { text: 'PDP Guard results\\n\\n' + lines.join('\\n') } }];` } },
    ],
    connections: { "Webhook": { "main": [[{ node: "Format Message", type: "main", index: 0 }]] } },
    settings: { timezone: "UTC" },
  };

  const created = await n8n("workflows", { method: "POST", body: JSON.stringify(workflow) });
  const id = created.id;
  try { await n8n(`workflows/${id}/activate`, { method: "POST" }); } catch {}

  const hostBase = API_BASE.replace(/\/api\/v\d+$/, "");
  const prodUrl = `${hostBase}/webhook/${slug}`;
  const testUrl = `${hostBase}/webhook-test/${slug}`;
  const webhookUrl = (await urlExists(prodUrl)) ? prodUrl : testUrl;

  return { workflowId: id, webhookUrl, prodWebhookUrl: prodUrl, testWebhookUrl: testUrl };
}

export async function triggerWebhook(webhookUrl: string, payload: any) {
  async function post(url: string) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  }
  let res = await post(webhookUrl);
  if (res.status === 404 && /\/webhook\//.test(webhookUrl)) {
    res = await post(webhookUrl.replace("/webhook/", "/webhook-test/"));
  }
  if (!res.ok) { let t=""; try { t = await res.text(); } catch {}; throw new Error(`webhook ${res.status} ${t}`); }
  try { return await res.json(); } catch { return {}; }
}
