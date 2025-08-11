'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Dag from './components/Dag';

const Diff = dynamic(() => import('./components/Diff'), { ssr: false });

type SimRow = { url: string; ok: boolean; failures: string[]; millis: number; evidence?: string|null };
type Summary = { total: number; passed: number; failed: number };

const TEMPLATES: Record<string,string> = {
  "Guaranteed Demo": `Check these URLs. Verify price and Add-to-Cart. Notify on fail only.
URLs:
/demo/pass
/demo/fail`,
  "Promo Compliance": `On these PDPs, verify textIncludes: "Free shipping" and atc. If any fail, alert #ops-alerts. If all pass, alert #ops-ok.
URLs:
https://example.com/`,
  "ATC Regression": `Daily 07:00: check atc on these SKUs; alert on fail.
URLs:
https://example.com/`,
};

function encodeShare(obj: any) {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return `/share/${encodeURIComponent(b64)}`;
}

function parseBranching(prompt: string){
  const fail = /if\s+any\s+fail/i.test(prompt) || /alert on fail/i.test(prompt);
  const pass = /if\s+all\s+pass/i.test(prompt) || /alert on pass/i.test(prompt);
  const onFailActions = [{ type:'slack', channel:'#ops-alerts', template:'PDP Guard results' }];
  const onPassActions = [{ type:'slack', channel:'#ops-ok',    template:'PDP Guard results' }];
  const conds:any[]=[];
  if (fail) conds.push({ when:'onFail', actions:onFailActions });
  if (pass) conds.push({ when:'onPass', actions:onPassActions });
  return conds.length? conds : undefined;
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
  const [approvalNeeded, setApprovalNeeded] = useState<boolean>(false);
  const [approved, setApproved] = useState<boolean>(false);
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [crawlSeed, setCrawlSeed] = useState<string>('');

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

  async function compileSpec() {
    setStatus('Compiling…');
    try {
      const r = await fetch('/api/compile', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ prompt }) });
      if (r.ok) { const j = await r.json(); setSpec(j.spec || j); setStatus('Compiled ✓'); return; }
    } catch {}
    const urls = (prompt.match(/https?:\/\/[^\s]+|\/demo\/[a-z]+/gi) || []).slice(0, 10);
    const wantPrice = /price/i.test(prompt);
    const wantATC = /(add to cart|atc)/i.test(prompt);
    const m = /textIncludes:\s*["']([^"']+)["']/i.exec(prompt);
    const textIncludes = m?.[1];
    const conditions = parseBranching(prompt);
    const needApproval = /require approval/i.test(prompt) || /approval/i.test(prompt);
    const specLocal = {
      name: 'Guard',
      checks: [{ type: 'pdpCheck', name:'PDP Check', urls, assertions: { price: wantPrice, atc: wantATC, ...(textIncludes?{textIncludes}:{}) }, ...(conditions?{conditions}:{}) }],
      actions: [{ type:'slack', channel:'#ops-alerts', template:'PDP Guard results' }],
      guardrails: { timeoutSec:60, maxUrls:50 },
      ...(needApproval?{ requireApproval:true }:{}),
    };
    setSpec(specLocal); setStatus('Compiled (local) ✓'); setApprovalNeeded(!!specLocal.requireApproval);
  }

  async function simulate() {
    if (!spec) return;
    setStatus('Simulating…');
    const r = await fetch('/api/simulate', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ spec }) });
    const j = await r.json();
    if (!r.ok) { setStatus(`Simulate error: ${j.error || r.status}`); return; }
    setReport(j.report); setSummary(j.summary);
    setStatus(`Simulated: ${j.summary.passed}/${j.summary.total} passed`);
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
    if (spec.requireApproval && !approved) { setStatus('Waiting for approval…'); return; }
    setStatus('Executing…');
    const payload = { title: spec?.name || 'PDP Guard results', report: report || [] };
    const r = await fetch('/api/execute', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ webhookUrl, payload, demoMode, slackOverride: slackOverride || undefined, spec }) });
    const j = await r.json();
    if (!r.ok) { setStatus(`Execute error: ${j.error || r.status}`); return; }
    const txt: string = j?.details?.alertText || '(no text)';
    setAlertFeed(a => [txt, ...a].slice(0, 10));
    setStatus(`Executed (${j.posted}) ✓`);
  }

  async function runDiagnosis() {
    if (!spec || !report) return;
    setStatus('Diagnosing…');
    const r = await fetch('/api/diagnose', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ spec, report }) });
    const j = await r.json();
    if (!r.ok || j.skipped) { setDiagnosis(`(skipped) ${j.reason || 'no key'}`); setStatus('Diagnosis skipped'); return; }
    setDiagnosis(j.text || ''); setStatus('Diagnosis ✓');
  }

  async function expandUrls() {
    if (!crawlSeed) return;
    setStatus('Discovering PDPs…');
    const r = await fetch('/api/crawl', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ seed:crawlSeed, max: 10 }) });
    const j = await r.json();
    if (!r.ok) { setStatus(`Crawl error: ${j.error||r.status}`); return; }
    setSpec((prev:any)=> {
      if (!prev) return prev;
      const merged = Array.from(new Set([...(prev.checks?.[0]?.urls||[]), ...j.urls])).slice(0, prev.guardrails?.maxUrls||50);
      const next = { ...prev, checks:[{ ...prev.checks[0], urls: merged }] };
      return next;
    });
    setStatus(`Added ${j.urls.length} URLs ✓`);
  }

  const shareHref = useMemo(()=>{
    if (!spec || !summary || alertFeed.length === 0) return '';
    return encodeShare({ spec, summary, alertText: alertFeed[0] });
  }, [spec, summary, alertFeed]);

  const passActions = spec?.checks?.[0]?.conditions?.find((c:any)=>c.when==='onPass')?.actions?.length || 0;
  const failActions = spec?.checks?.[0]?.conditions?.find((c:any)=>c.when==='onFail')?.actions?.length || (spec?.actions?.length||0);
  const trace = summary ? (summary.passed<summary.total ? 'onFail' : 'onPass') : null;

  const firstFail = report?.find(r=>!r.ok) || null;

  return (
    <main className="min-h-screen p-4 md:p-6 grid md:grid-cols-[260px_1fr] gap-4">
      {/* Left rail */}
      <aside className="space-y-3">
        <h2 className="font-semibold">Templates</h2>
        {Object.keys(TEMPLATES).map(k=>(
          <button key={k} className="w-full text-left px-3 py-2 rounded border hover:bg-gray-50"
            onClick={()=>{ setPrompt(TEMPLATES[k]); setSpec(null); setReport(null); setSummary(null); setWebhookUrl(''); setStatus(''); setDiagnosis(''); setApproved(false); }}>
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
          <div className="space-y-2 pt-2 border-t">
            <input placeholder="Seed URL to auto-discover PDPs"
              className="w-full px-3 py-2 rounded border"
              value={crawlSeed}
              onChange={e=>setCrawlSeed(e.target.value)} />
            <button onClick={expandUrls} className="w-full px-3 py-2 rounded bg-white border hover:bg-gray-50">Auto-Expand URLs</button>
          </div>
          {shareHref ? (
            <a className="block text-blue-600 underline" href={shareHref} target="_blank">Share last run</a>
          ) : <span className="text-gray-400 text-sm">Run once to enable share link</span>}
        </div>
      </aside>

      {/* Main */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">AgentOpsStudio</h1>
          <div className="text-sm px-2 py-1 rounded bg-gray-100">{status || 'Ready'}</div>
        </div>

        {/* DAG */}
        <div className="p-3 rounded border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Flow</h2>
            <span className="text-xs text-gray-600">{summary ? (trace==='onFail'?'Path: onFail':'Path: onPass') : '—'}</span>
          </div>
          <Dag passActions={passActions} failActions={failActions} trace={trace as any} />
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
            {summary && <div className="text-sm mb-2">Summary: {summary.passed}/{summary.total} passed</div>}
            <div className="max-h-64 overflow-auto">
              {report?.length ? (
                <table className="w-full text-xs">
                  <thead><tr className="text-left"><th>URL</th><th>OK</th><th>ms</th><th>Reason</th></tr></thead>
                  <tbody>
                    {report.map((r,i)=>(
                      <tr key={i}>
                        <td className="pr-2 align-top max-w-[240px] break-words">{r.url}</td>
                        <td className={`pr-2 align-top ${r.ok?'text-green-600':'text-red-600'}`}>{r.ok?'✓':'×'}</td>
                        <td className="pr-2 align-top">{r.millis}</td>
                        <td className="align-top">{r.ok?'—':(r.failures[0]||'')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="text-sm text-gray-500">No results yet</div>}
            </div>

            {/* Evidence (first failing URL) */}
            {firstFail && (
              <div className="mt-3 p-2 rounded border">
                <div className="font-semibold text-sm mb-2">Evidence — {firstFail.url}</div>
                <div className="text-xs mb-2">{firstFail.evidence ? `Snippet: ${firstFail.evidence}` : '—'}</div>
                <div className="text-xs mb-2">Visual proof (Current vs Baseline):</div>
                <Diff currentUrl={firstFail.url} />
              </div>
            )}
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
              <div className="space-x-2">
                <button disabled={!spec} onClick={execute} className={`px-3 py-1 rounded ${spec?'bg-black text-white':'bg-gray-200 text-gray-500'}`}>Run now</button>
                <button disabled={!spec || !report} onClick={runDiagnosis} className={`px-3 py-1 rounded ${spec && report ? 'bg-white border' : 'bg-gray-200 text-gray-500'}`}>Diagnose</button>
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-2">Demo Mode: {demoMode ? 'ON' : 'OFF'}</div>
            {spec?.requireApproval && !approved && (
              <div className="p-2 border rounded bg-yellow-50 text-xs space-y-2">
                <div><strong>Approval required</strong> to execute this run.</div>
                <div className="flex gap-2">
                  <button onClick={()=>setApproved(true)} className="px-2 py-1 rounded bg-black text-white text-xs">Approve</button>
                  <button onClick={()=>setApproved(false)} className="px-2 py-1 rounded border text-xs">Reject</button>
                </div>
              </div>
            )}
            {diagnosis && (
              <div className="mt-3 p-2 rounded border text-xs whitespace-pre-wrap">
                <div className="flex items-center justify-between">
                  <div className="font-semibold mb-1">Diagnosis & Fix</div>
                  <div className="space-x-2">
                    <button
                      onClick={async ()=>{
                        const r = await fetch('/api/shopify/patch', {
                          method:'POST', headers:{'content-type':'application/json'},
                          body: JSON.stringify({ kind: 'price' })
                        });
                        const j = await r.json();
                        if (!r.ok) { alert(`Shopify patch error: ${j.error||r.status}`); return; }
                        if (j.preview) window.open(j.preview, '_blank');
                      }}
                      className="px-2 py-1 rounded bg-black text-white text-xs"
                      title="Creates a draft theme with a price snippet injected"
                    >Create Draft (Price)</button>

                    <button
                      onClick={async ()=>{
                        const r = await fetch('/api/shopify/patch', {
                          method:'POST', headers:{'content-type':'application/json'},
                          body: JSON.stringify({ kind: 'atc' })
                        });
                        const j = await r.json();
                        if (!r.ok) { alert(`Shopify patch error: ${j.error||r.status}`); return; }
                        if (j.preview) window.open(j.preview, '_blank');
                      }}
                      className="px-2 py-1 rounded border text-xs"
                      title="Creates a draft theme with an ATC button injected"
                    >Create Draft (ATC)</button>

                    <button
                      onClick={async ()=>{
                        const snippet = prompt('Custom Liquid/HTML snippet to inject:','<span class="agentops-note">AgentOps snippet</span>');
                        if (!snippet) return;
                        const r = await fetch('/api/shopify/patch', {
                          method:'POST', headers:{'content-type':'application/json'},
                          body: JSON.stringify({ kind: 'custom', custom: snippet })
                        });
                        const j = await r.json();
                        if (!r.ok) { alert(`Shopify patch error: ${j.error||r.status}`); return; }
                        if (j.preview) window.open(j.preview, '_blank');
                      }}
                      className="px-2 py-1 rounded border text-xs"
                      title="Creates a draft theme with your snippet injected"
                    >Create Draft (Custom)</button>
                  </div>
                </div>
                {diagnosis}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 rounded border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Alert Feed</h3>
            {alertFeed.length>0 && (
              <div className="space-x-2 text-sm">
                {summary && <a className="text-blue-600 underline" href={shareHref} target="_blank">Share last run</a>}
                <button className="text-gray-700 underline" onClick={()=>navigator.clipboard.writeText(alertFeed[0])}>Copy</button>
              </div>
            )}
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
