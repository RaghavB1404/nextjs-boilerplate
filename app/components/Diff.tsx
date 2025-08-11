'use client';
import { useEffect, useRef, useState } from 'react';

function drawImage(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = img.width; canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
}

function computeDiff(a: HTMLCanvasElement, b: HTMLCanvasElement, out: HTMLCanvasElement) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  out.width = w; out.height = h;
  const ca = a.getContext('2d')!, cb = b.getContext('2d')!, co = out.getContext('2d')!;
  const da = ca.getImageData(0,0,w,h), db = cb.getImageData(0,0,w,h), outData = co.createImageData(w,h);
  const ta = da.data, tb = db.data, to = outData.data;
  for (let i=0;i<ta.length;i+=4){
    const dr = Math.abs(ta[i]-tb[i]), dg = Math.abs(ta[i+1]-tb[i+1]), dbv = Math.abs(ta[i+2]-tb[i+2]);
    const delta = dr+dg+dbv;
    if (delta > 64) { to[i]=255; to[i+1]=0; to[i+2]=0; to[i+3]=180; }  // red diff
    else { to[i]=ta[i]*0.7; to[i+1]=ta[i+1]*0.7; to[i+2]=ta[i+2]*0.7; to[i+3]=180; }
  }
  co.putImageData(outData,0,0);
}

export default function Diff({ currentUrl, baseline }: { currentUrl: string; baseline?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [saved, setSaved] = useState<boolean>(false);
  const canA = useRef<HTMLCanvasElement>(null);
  const canB = useRef<HTMLCanvasElement>(null);
  const canO = useRef<HTMLCanvasElement>(null);

  async function fetchShot(target: string) {
    setLoading(true); setError('');
    const r = await fetch('/api/screenshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ url: target }) });
    if (!r.ok) { setLoading(false); setError('Screenshot failed'); return null; }
    const blob = await r.blob();
    setLoading(false);
    return URL.createObjectURL(blob);
  }

  async function run() {
    const imgA = new Image(); const imgB = new Image();
    const urlA = await fetchShot(currentUrl); if (!urlA) return;
    imgA.src = urlA;
    const base = baseline || localStorage.getItem(`agentops:baseline:${currentUrl}`) || '';
    let urlB = base;
    if (!urlB) {
      // if no baseline, take current as baseline first time
      urlB = urlA; localStorage.setItem(`agentops:baseline:${currentUrl}`, urlA); setSaved(true);
    }
    imgB.src = urlB;

    await new Promise<void>(res => imgA.onload = () => res());
    await new Promise<void>(res => imgB.onload = () => res());

    drawImage(canA.current!, imgA);
    drawImage(canB.current!, imgB);
    computeDiff(canA.current!, canB.current!, canO.current!);
  }

  function saveAsBaseline() {
    const dataURL = canA.current!.toDataURL('image/png');
    localStorage.setItem(`agentops:baseline:${currentUrl}`, dataURL);
    setSaved(true);
  }

  useEffect(()=>{ setSaved(!!localStorage.getItem(`agentops:baseline:${currentUrl}`)); }, [currentUrl]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={run} className="px-3 py-1 rounded bg-black text-white">Capture & Diff</button>
        <button onClick={saveAsBaseline} className="px-3 py-1 rounded border">{saved?'Update Baseline':'Save Baseline'}</button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-sm text-gray-600">Capturing…</div>}
      <div className="grid grid-cols-3 gap-2">
        <div><div className="text-xs mb-1">Current</div><canvas ref={canA} className="border rounded w-full"/></div>
        <div><div className="text-xs mb-1">Baseline</div><canvas ref={canB} className="border rounded w-full"/></div>
        <div><div className="text-xs mb-1">Diff</div><canvas ref={canO} className="border rounded w-full"/></div>
      </div>
    </div>
  );
}
