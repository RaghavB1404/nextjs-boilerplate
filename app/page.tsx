'use client';

import { useEffect, useMemo, useState } from 'react';

type Spec = any;
type ReportRow = { url: string; ok: boolean; failures: string[]; millis: number; evidence?: string | null };
type Summary = { total: number; passed: number; failed: number };

export default function Home() {
  const [prompt, setPrompt] = useState(
    'Daily at 07:00, check these PDPs for price and Add-to-Cart; post failures to Slack #ops-alerts.\nURLs:\nhttps://example.com/a\nhttps://example.com/b'
  );

  const [spec, setSpec] = useState<Spec | null>(null);
  const [repaired, setRepaired] = useState<boolean | null>(null);
  const [report, setReport] = useState<ReportRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState<string>('');

  // --- hydrate spec from sessionStorage so reloads don't wipe it
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('agentops_spec');
      if (raw) setSpec(JSON.parse(raw));
      const wh = sessionStorage.getItem('agentops_webhook');
      if (wh) setWebhookUrl(wh);
    } catch {}
  }, []);

  useEffect(() => {
    if (spec) sessionStorage.setItem('agentops_spec', JSON.stringify(spec));
  }, [spec]);

  useEffect(() => {
    if (webhookUrl) sessionStorage.setItem('agentops_webhook', webhookUrl);
  }, [webhookUrl]);

  const canSimulate = useMemo(() => !!spec, [spec]);
  const canProvision = useMemo(() => !!spec, [spec]);
  const canRun = useMemo(() => !!webhookUrl, [webhookUrl]);

  async function call(path: string, body?: any) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`${path} ${res.status} ${t}`);
    }
    return res.json();
  }

  async function onCompile() {
    try {
      setBusy('Compiling…'); setMsg('');
      const data = await call('/api/compile', { prompt });
      console.log('COMPILE response:', data);
      if (!data || !data.spec) throw new Error('No spec returned from /api/compile');
      setSpec(data.spec);
      setRepaired(!!data.repaired);
      // reset downstream state
      setReport(null); setSummary(null); setWebhookUrl('');
      setMsg('Compiled OK' + (data.repaired ? ' (repaired)' : ''));
    } catch (e: any) {
      console.error(e);
      setMsg(e.message || 'compile failed');
    } finally {
      setBusy('');
    }
  }

  async function onSimulate() {
    if (!spec) { setMsg('Compile first'); return; }
    try {
      setBusy('Simulating…'); setMsg('');
      const data = await call('/api/simulate', { spec });
      console.log('SIMULATE response:', data);
      setReport(data.report || []);
      setSummary(data.summary || null);
      setMsg(data.summary ? `Simulated: ${data.summary.passed} passed / ${data.summary.failed} failed` : 'Simulated');
    } catch (e: any) {
      console.error(e);
      setMsg(e.message || 'simulate failed');
    } finally {
      setBusy('');
    }
  }

  async function onProvision() {
    if (!spec) { setMsg('Compile first'); return; }
    try {
      setBusy('Provisioning n8n…'); setMsg('');
      const data = await call('/api/provision', { spec });
      console.log('PROVISION response:', data);
      if (!data.webhookUrl) throw new Error('No webhookUrl returned');
      setWebhookUrl(data.webhookUrl);
      setMsg('Provisioned OK');
    } catch (e: any) {
      console.error(e);
      setMsg(e.message || 'provision failed');
    } finally {
      setBusy('');
    }
  }

  async function onExecute() {
    if (!webhookUrl) { setMsg('Provision first'); return; }
    try {
      setBusy('Executing…'); setMsg('');
      const payload = { report: report || [] };
      const data = await call('/api/execute', { webhookUrl, payload });
      console.log('EXECUTE response:', data);
      setMsg('Executed: Slack posted (see channel)');
    } catch (e: any) {
      console.error(e);
      setMsg(e.message || 'execute failed');
    } finally {
      setBusy('');
    }
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
        <button type="button" onClick={onCompile} className="px-3 py-2 rounded bg-black text-white">Compile</button>
        <button type="button" onClick={onSimulate} disabled={!canSimulate} className={`px-3 py-2 rounded ${canSimulate ? 'bg-gray-800 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}>Simulate</button>
        <button type="button" onClick={onProvision} disabled={!canProvision} className={`px-3 py-2 rounded ${canProvision ? 'bg-gray-700 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}>Provision</button>
        <button type="button" onClick={onExecute} disabled={!canRun} className={`px-3 py-2 rounded ${canRun ? 'bg-gray-600 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}>Run now</button>
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
