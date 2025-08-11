'use client';
import { useEffect, useMemo, useState } from 'react';

type SimRow = { url: string; ok: boolean; failures: string[]; millis: number; evidence?: string|null };
type Summary = { total: number; passed: number; failed: number };

const TEMPLATES: Record<string,string> = {
  "Guaranteed Demo": `Check these URLs. Verify price and Add-to-Cart. Post failures.\nURLs:\n/d
emo/pass\n/demo/fail`,
  "Promo Compliance": `On these PDPs, verify textIncludes: "Free shipping" and atc. Alert #ops-alerts.\nURLs:\nhttps://example.com/`,
  "ATC Regression": `Check atc on these SKUs; post failures.\nURLs:\nhttps://example.com/`,
  "SEO Price Signal": `Verify price meta present on these PDPs. Post failures.\nURLs:\nhttps://example.com/`,
};

function encodeShare(obj: any) {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return `/share/${encodeURIComponent(b64)}`;
}

export default function Home() {
  const [prompt, setPrompt] = useState<string>(TEMPLATES["Guaranteed Demo"]);
  const [spec, setSpec] = useState<any|null>(null);
  const [report, setReport] = useState<SimRow[]|null>(null);
  const [summary, setSummary] = useState<Summary|null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [alertFeed, setAlertFeed] = useState<string[]>([]);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [slackOverride, setSlackOverride] = useState<string>('');

  // Persist critical state
  useEffect(()=>{
    const s = sessionStorage.getItem('spec'); if (s) setSpec(JSON.parse(s));
    const w = sessionStorage.getItem('webhookUrl'); if (w) setWebhookUrl(w);
    const r = sessionStorage.getItem('report'); if (r) setReport(JSON.parse(r));
    const su = sessionStorage.getItem('summary'); if (su) setSummary(JSON.parse(su));
  },[]);
  useEffect(()=>{
    if (spec) sessionStorage.setItem('spec', JSON.stringify(spec));
    if (webhookUrl) sessionStorage.setItem('webhookUrl', webhookUrl);
    if (report) sessionStorage.setItem('report', JSON.stringify(report));
    if (summary) sessionStorage.setItem('summary', JSON.stringify(summary));
  }, [spec, webhookUrl, report, summary]);

  // Dumb compile (delegates to your existing /api/compile if you have it).
  // If you already have /api/compile working, keep using it. Otherwise, synthesize a simple spec here.
  async function compileSpec() {
    setStatus('Compiling…');
    // Try your existing /api/compile; if 404, fallback to heuristic builder.
    try {
      const r = await fetch('/api/compile', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ prompt }) });
      if (r.ok) {
        const j = await r.json();
        setSpec(j.spec || j); setStatus('Compiled ✓'); return;
      }
    } catch {}
    // Heuristic fallback:
    const urls = (prompt.match(/https?:\/\/[^\s]+|\/demo\/[a-z]+/gi) || []).slice(0, 10);
    const wantPrice = /price/i.test(prompt);
    const wantATC = /(add to cart|atc)/i.test(prompt);
    const m = /textIncludes:\s*["']([^"']+)["']/i.exec(prompt);
    const textIncludes = m?.[1];
    const specLocal = {
      name: 'Guard',
      checks: [{ type: 'pdpCheck', name: 'PDP Check', urls, assertions: { price: wantPrice, atc: wantATC, ...(textIncludes?{textIncludes}:{} ) } }],
      actions: [{ type: 'slack', channel: '#ops-alerts', template: 'PDP Guard results' }],
      guardrails: { timeoutSec: 60, maxUrls: 50 },
    };
    setSpec(specLocal); setStatus('Compiled (local) ✓');
  }

  async function simulate() {
    if (!spec) return;
    setStatus('Simulating…');
    const r = await fetch('/api/simulate', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ spec }) });
    const j = await r.json();
    if (!r.ok) { setStatus(`Simulate error: ${j.error || r.status}`); return; }
    setReport(j.report); setSummary(j.summary); setStatus(`Simulated: ${j.summary.passed}/${j.summary.total} passed`);
  }

  async function provision() {
    if (!spec) return;
    setStatus('Provisioning…');
    const r = await fetch('/api/provision', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ spec }) });
    const j = await r.json();
    if (!r.ok) { setStatus(`Provision error: ${j.error || r.status}`); return; }
    setWebhookUrl(j.webhookUrl); setStatus('Provisioned ✓');
  }

  async function execute() {
    if (!spec) return;
    setStatus('Executing…');
    const payload = { title: spec?.name || 'PDP Guard results', report: report || [] };
    const r = await fetch('/api/execute', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ webhookUrl, payload, demoMode, slackOverride: slackOverride || undefined }) });
    const j = await r.json();
    if (!r.ok) { setStatus(`Execute error: ${j.error || r.status}`); return; }
    const txt: string = j?.details?.alertText || '(no text)';
    setAlertFeed(a => [txt, ...a].slice(0, 10));
    setStatus(`Executed (${j.posted}) ✓`);
  }

  const shareHref = useMemo(()=>{
    if (!spec || !summary || alertFeed.length === 0) return '';
    return encodeShare({ spec, summary, alertText: alertFeed[0] });
  }, [spec, summary, alertFeed]);

  return (
    <main className="min-h-screen p-4 md:p-6 grid md:grid-cols-[240px_1fr] gap-4">
      {/* Left rail: Templates */}
      <aside className="space-y-2">
        <h2 className="font-semibold">Templates</h2>
        {Object.keys(TEMPLATES).map(k=>(
          <button key={k} className="w-full text-left px-3 py-2 rounded border hover:bg-gray-50"
            onClick={()=>{ setPrompt(TEMPLATES[k]); setSpec(null); setReport(null); setSummary(null); setWebhookUrl(''); setStatus(''); }}>
            {k}
          </button>
        ))}
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={demoMode} onChange={e=>setDemoMode(e.target.checked)} />
            <span>Demo Mode (no external calls)</span>
          </label>
          <input placeholder="Optional: override Slack webhook URL"
            className="w-full px-3 py-2 rounded border"
            value={slackOverride}
            onChange={e=>setSlackOverride(e.target.value)} />
          {shareHref ? (
            <a className="block text-blue-600 underline" href={shareHref} target="_blank">Share last run</a>
          ) : <span className="text-gray-400 text-sm">Run once to enable share link</span>}
        </div>
      </aside>

      {/* Main */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">AgentOpsStudio</h1>
          <div className="text-sm px-2 py-1 rounded bg-gray-100">{status || 'Ready'}</div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-3 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Prompt</h2>
              <button onClick={compileSpec} className="px-3 py-1 rounded bg-black text-white">Compile</button>
            </div>
            <textarea className="w-full h-48 p-2 rounded border" value={prompt} onChange={e=>setPrompt(e.target.value)} />
          </div>

          <div className="p-3 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Spec</h2>
              {spec ? <span className="text-xs px-2 py-0.5 rounded bg-green-100">ready</span> : <span className="text-xs px-2 py-0.5 rounded bg-gray-100">—</span>}
            </div>
            <pre className="text-xs whitespace-pre-wrap">{spec ? JSON.stringify(spec, null, 2) : 'Compile to view spec'}</pre>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-3 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Simulate</h3>
              <button disabled={!spec} onClick={simulate} className={`px-3 py-1 rounded ${spec?'bg-black text-white':'bg-gray-200 text-gray-500'}`}>Simulate</button>
            </div>
            {summary && (
              <div className="text-sm mb-2">Summary: {summary.passed}/{summary.total} passed</div>
            )}
            <div className="max-h-64 overflow-auto">
              {report?.length ? (
                <table className="w-full text-xs">
                  <thead><tr className="text-left"><th>URL</th><th>OK</th><th>ms</th><th>Reason</th></tr></thead>
                  <tbody>
                    {report.map((r,i)=>(
                      <tr key={i}>
                        <td className="pr-2 align-top max-w-[220px] break-words">{r.url}</td>
                        <td className={`pr-2 align-top ${r.ok?'text-green-600':'text-red-600'}`}>{r.ok?'✓':'×'}</td>
                        <td className="pr-2 align-top">{r.millis}</td>
                        <td className="align-top">{r.ok?'—':(r.failures[0]||'')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="text-sm text-gray-500">No results yet</div>}
            </div>
          </div>

          <div className="p-3 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Provision</h3>
              <button disabled={!spec} onClick={provision} className={`px-3 py-1 rounded ${spec?'bg-black text-white':'bg-gray-200 text-gray-500'}`}>Provision</button>
            </div>
            <div className="text-xs break-all">{webhookUrl || '—'}</div>
          </div>

          <div className="p-3 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Execute</h3>
              <button disabled={!spec} onClick={execute} className={`px-3 py-1 rounded ${spec?'bg-black text-white':'bg-gray-200 text-gray-500'}`}>Run now</button>
            </div>
            <div className="text-xs text-gray-600">Demo Mode: {demoMode ? 'ON' : 'OFF'}</div>
            <div className="text-xs text-gray-600">Slack: {slackOverride ? 'override' : (process.env.NEXT_PUBLIC_SLACK_HIDDEN?'set':'unset')}</div>
          </div>
        </div>

        <div className="p-3 rounded border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Alert Feed</h3>
            {shareHref && <a className="text-blue-600 underline text-sm" href={shareHref} target="_blank">Share last run</a>}
          </div>
          {alertFeed.length ? (
            <ul className="space-y-2 text-sm">
              {alertFeed.map((t,idx)=>(
                <li key={idx} className="p-2 rounded border whitespace-pre-wrap">{t}</li>
              ))}
            </ul>
          ) : <div className="text-sm text-gray-500">No alerts yet</div>}
        </div>
      </section>
    </main>
  );
}
