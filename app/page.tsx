'use client';

import { useState } from 'react';

type Spec = any;

export default function Home() {
  const [prompt, setPrompt] = useState(
    'Daily at 07:00, check these PDPs for price and Add-to-Cart; post failures to Slack #ops-alerts.\nURLs:\nhttps://example.com/a\nhttps://example.com/b'
  );
  const [spec, setSpec] = useState<Spec | null>(null);
  const [repaired, setRepaired] = useState<boolean | null>(null);
  const [report, setReport] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState<string>('');

  async function call(path: string, body?: any) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  }

  async function onCompile() {
    try {
      setBusy('Compiling…'); setMsg('');
      const data = await call('/api/compile', { prompt });
      setSpec(data.spec); setRepaired(!!data.repaired);
      setMsg('Compiled OK' + (data.repaired ? ' (repaired)' : ''));
    } catch (e: any) { setMsg(e.message || 'compile failed'); }
    finally { setBusy(''); }
  }

  async function onSimulate() {
    if (!spec) { setMsg('Compile first'); return; }
    try {
      setBusy('Simulating…'); setMsg('');
      const data = await call('/api/simulate', { spec });
      setReport(data.report); setSummary(data.summary);
      setMsg(`Simulated: ${data.summary.passed} passed / ${data.summary.failed} failed`);
    } catch (e: any) { setMsg(e.message || 'simulate failed'); }
    finally { setBusy(''); }
  }

  async function onProvision() {
    if (!spec) { setMsg('Compile first'); return; }
    try {
      setBusy('Provisioning n8n…'); setMsg('');
      const data = await call('/api/provision', { spec });
      setWebhookUrl(data.webhookUrl);
      setMsg('Provisioned OK');
    } catch (e: any) { setMsg(e.message || 'provision failed'); }
    finally { setBusy(''); }
  }

  async function onExecute() {
    if (!webhookUrl) { setMsg('Provision first'); return; }
    try {
      setBusy('Executing…'); setMsg('');
      const payload = { report: report || [] };
      const data = await call('/api/execute', { webhookUrl, payload });
      setMsg('Executed: Slack posted');
    } catch (e: any) { setMsg(e.message || 'execute failed'); }
    finally { setBusy(''); }
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">AgentOps Studio (MVP)</h1>

      <label className="block text-sm font-medium mb-2">Prompt</label>
      <textarea
        className="w-full border rounded p-3 h-40"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="flex gap-3 mt-4">
        <button onClick={onCompile} className="px-3 py-2 rounded bg-black text-white">Compile</button>
        <button onClick={onSimulate} className="px-3 py-2 rounded bg-gray-800 text-white">Simulate</button>
        <button onClick={onProvision} className="px-3 py-2 rounded bg-gray-700 text-white">Provision</button>
        <button onClick={onExecute} className="px-3 py-2 rounded bg-gray-600 text-white">Run now</button>
        {busy && <span className="ml-2 text-sm">{busy}</span>}
      </div>

      {msg && <p className="mt-3 text-sm">{msg}</p>}

      {spec && (
        <section className="mt-6">
          <h2 className="font-medium mb-2">Spec {repaired ? <em>(repaired)</em> : null}</h2>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">{JSON.stringify(spec, null, 2)}</pre>
        </section>
      )}

      {summary && (
        <section className="mt-6">
          <h2 className="font-medium mb-1">Simulation summary</h2>
          <div className="text-sm mb-2">
            {summary.passed} passed / {summary.failed} failed
          </div>
          {report && (
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">{JSON.stringify(report, null, 2)}</pre>
          )}
        </section>
      )}

      {webhookUrl && (
        <section className="mt-6">
          <h2 className="font-medium mb-1">n8n Webhook</h2>
          <code className="text-xs">{webhookUrl}</code>
        </section>
      )}
    </main>
  );
}
