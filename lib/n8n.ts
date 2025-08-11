type N8nWorkflow = {
name: string;
nodes: any[];
connections: Record<string, any>;
settings?: Record<string, any>;
staticData?: Record<string, any>;
};

const API_BASE = (process.env.N8N_BASE_URL || "").replace(//+$/, ""); // e.g. https://host/api/v1
const N8N_KEY = process.env.N8N_API_KEY!;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL!;

async function n8n(path: string, init: RequestInit = {}) {
const url = ${API_BASE}/${path.replace(/^\/+/, "")};
const res = await fetch(url, {
...init,
headers: {
"Content-Type": "application/json",
"X-N8N-API-KEY": N8N_KEY,
...(init.headers || {}),
},
});
if (!res.ok) {
let body = "";
try {
body = await res.text();
} catch {}
throw new Error(n8n ${path} ${res.status}: ${body});
}
return res.json();
}

async function urlExists(url: string) {
try {
const r = await fetch(url, { method: "OPTIONS" });
return r.ok;
} catch {
return false;
}
}

export async function provisionN8nWorkflow(name: string, _channel: string, template: string) {
const slug = agentops-${Date.now()};

const functionCode = const body = items.json || {}; const failed = (body.report || []).filter(r => !r.ok); const lines = failed.length ? failed.map(f => '- ' + f.url + ' — ' + ((f.failures || []).join(', '))) : ['All checks passed ✅']; return [{ json: { text: \${template}\n\n${lines.join('\n')}` } }];
`.trim();

const workflow: N8nWorkflow = {
name,
nodes: [
{
id: "Webhook",
name: "Webhook",
type: "n8n-nodes-base.webhook",
typeVersion: 1,
position: ,
parameters: { path: slug, httpMethod: "POST", options: {} },
},
{
id: "Function",
name: "Format Message",
type: "n8n-nodes-base.function",
typeVersion: 1,
position: [500,
parameters: {
functionCode,
},
},
{
id: "HTTP",
name: "Slack Webhook",
type: "n8n-nodes-base.httpRequest",
typeVersion: 1,
position: ,
parameters: {
url: SLACK_WEBHOOK,
method: "POST",
sendBody: true,
jsonParameters: true,
options: { bodyContentType: "json" },
// n8n expressions in JSON must be quoted and use ={{ ... }}
jsonBody: {
text: '={{$json["text"]}}',
},
},
},
],
connections: {
Webhook: { main: [[{ node: "Format Message", type: "main", index: 0 }]] },
"Format Message": { main: [[{ node: "Slack Webhook", type: "main", index: 0 }]] },
},
settings: { timezone: "UTC" },
};

// Create + activate
const created = await n8n("workflows", { method: "POST", body: JSON.stringify(workflow) });
const id = created.id;

// Ensure active
const info = await n8n(workflows/${id});
if (!info.active) await n8n(workflows/${id}/activate, { method: "POST" });

// Build candidate URLs
const hostBase = API_BASE.replace(//api/v\d+$/, "");
const prodUrl = ${hostBase}/webhook/${slug};
const testUrl = ${hostBase}/webhook-test/${slug};

// Pick whichever answers first
const webhookUrl = (await urlExists(prodUrl)) ? prodUrl : testUrl;

return { workflowId: id, webhookUrl, prodWebhookUrl: prodUrl, testWebhookUrl: testUrl, active: !!info.active };
}

export async function triggerWebhook(webhookUrl: string, payload: any) {
async function post(url: string) {
return fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(payload || {}),
});
}
let res = await post(webhookUrl);
if (res.status === 404 && //webhook//.test(webhookUrl)) {
// auto-fallback to test webhook
const alt = webhookUrl.replace("/webhook/", "/webhook-test/");
res = await post(alt);
}
if (!res.ok) {
let t = "";
try {
t = await res.text();
} catch {}
throw new Error(webhook ${res.status} ${t});
}
try {
return await res.json();
} catch {
return {};
}
}
