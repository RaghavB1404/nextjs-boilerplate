type N8nWorkflow = { name: string; nodes: any[]; connections: Record<string, any>; settings?: Record<string, any>; staticData?: Record<string, any>; };

const API_BASE = process.env.N8N_BASE_URL!.replace(/\/+$/, "");
const N8N_KEY  = process.env.N8N_API_KEY!;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL!;

async function n8n(path: string, init: RequestInit = {}) {
  const url = `${API_BASE}/${path.replace(/^\/+/, "")}`; // e.g. /api/v1/workflows
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-N8N-API-KEY": N8N_KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`n8n ${path} ${res.status}: ${await res.text().catch(()=>"")}`);
  return res.json();
}

export async function provisionN8nWorkflow(name: string, _channel: string, template: string) {
  const slug = `agentops-${Date.now()}`;
  const webhookPath = slug;

  const workflow: N8nWorkflow = {
    name,
    nodes: [
      { id: "Webhook", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [240,300], parameters: { path: webhookPath, options: {}, httpMethod: "POST" } },
      { id: "Function", name: "Format Message", type: "n8n-nodes-base.function", typeVersion: 1, position: [500,300],
        parameters: { functionCode:
`const body = items[0].json || {};
const failed = (body.report || []).filter(r => !r.ok);
const lines = failed.length ? failed.map(f => \`• \${f.url} — \${(f.failures||[]).join(', ')}\`) : ['All checks passed ✅'];
return [{ json: { text: \`${template}\\n\\n\${lines.join('\\n')}\` } }];` } },
      { id: "HTTP", name: "Slack Webhook", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [760,300],
        parameters: { url: SLACK_WEBHOOK, method: "POST", jsonParameters: true, sendBody: true, options: {}, bodyParametersJson: "{ \"text\": {{$json[\"text\"]}} }" } }
    ],
    connections: {
      "Webhook": { "main": [[{ node: "Format Message", type: "main", index: 0 }]] },
      "Format Message": { "main": [[{ node: "Slack Webhook", type: "main", index: 0 }]] }
    },
    settings: { timezone: "UTC" },
  };

  // API v1 endpoints:
  const created = await n8n("workflows", { method: "POST", body: JSON.stringify(workflow) });
  const id = created.id;
  await n8n(`workflows/${id}/activate`, { method: "POST" });

  // Webhook host is the n8n host without /api/v1
  const hostBase = API_BASE.replace(/\/api\/v\d+$/, "");
  const webhookUrl = `${hostBase}/webhook/${webhookPath}`; // e.g. https://host/webhook/<slug>
  return { workflowId: id, webhookUrl };
}

export async function triggerWebhook(webhookUrl: string, payload: any) {
  const res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
  return res.json().catch(() => ({}));
}
