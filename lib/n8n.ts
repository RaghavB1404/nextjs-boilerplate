// lib/n8n.ts
type N8nWorkflow = {
  name: string; nodes: any[]; connections: Record<string, any>;
  settings?: Record<string, any>; staticData?: Record<string, any>;
};

const API_BASE = process.env.N8N_BASE_URL!.replace(/\/+$/, ""); // e.g. https://host/api/v1
const N8N_KEY  = process.env.N8N_API_KEY!;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL!;

async function n8n(path: string, init: RequestInit = {}) {
  const url = `${API_BASE}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-N8N-API-KEY": N8N_KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`n8n ${path} ${res.status}: ${await res.text().catch(()=>"")}`);
  return res.json();
}

async function urlExists(url: string) {
  try {
    const r = await fetch(url, { method: "OPTIONS" }); // does not trigger the flow
    return r.ok;
  } catch { return false; }
}

export async function provisionN8nWorkflow(name: string, _channel: string, template: string) {
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
const lines = failed.length ? failed.map(f => \`• \${f.url} — \${(f.failures||[]).join(', ')}\`) : ['All checks passed ✅'];
return [{ json: { text: \`${template}\\n\\n\${lines.join('\\n')}\` } }];` } },
      { id: "HTTP", name: "Slack Webhook", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [760,300],
        parameters: { url: SLACK_WEBHOOK, method: "POST", jsonParameters: true, sendBody: true, options: {},
          bodyParametersJson: "{ \"text\": {{$json[\"text\"]}} }" } }
    ],
    connections: {
      "Webhook": { "main": [[{ node: "Format Message", type: "main", index: 0 }]] },
      "Format Message": { "main": [[{ node: "Slack Webhook", type: "main", index: 0 }]] }
    },
    settings: { timezone: "UTC" },
  };

  // Create + activate
  const created = await n8n("workflows", { method: "POST", body: JSON.stringify(workflow) });
  const id = created.id;
  // verify active (some instances need a beat before activation “sticks”)
  const info = await n8n(`workflows/${id}`); // read status
  if (!info.active) await n8n(`workflows/${id}/activate`, { method: "POST" });

  // Build candidate URLs
  const hostBase = API_BASE.replace(/\/api\/v\d+$/, ""); // strip /api/v1
  const prodUrl = `${hostBase}/webhook/${slug}`;
  const testUrl = `${hostBase}/webhook-test/${slug}`;

  // Pick the one that exists
  const webhookUrl = (await urlExists(prodUrl)) ? prodUrl : testUrl;

  return { workflowId: id, webhookUrl };
}

// replace your triggerWebhook with this:
export async function triggerWebhook(webhookUrl: string, payload: any) {
  async function post(url: string) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    return res;
  }

  let res = await post(webhookUrl);
  if (res.status === 404 && /\/webhook\//.test(webhookUrl)) {
    // try test endpoint automatically
    const alt = webhookUrl.replace("/webhook/", "/webhook-test/");
    res = await post(alt);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`webhook ${res.status} ${t}`);
  }
  return res.json().catch(() => ({}));
}


