// app/api/diagnose/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { WorkflowSpec } from '@/lib/schema';
import { diagnoseWithLLM } from '@/lib/openrouter';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=> ({}));
  const specParsed = WorkflowSpec.safeParse(body.spec);
  if (!specParsed.success) return NextResponse.json({ error:'spec_invalid' }, { status:400 });

  const report = body.report || [];
  try{
    const out = await diagnoseWithLLM({ spec: specParsed.data, report });
    return NextResponse.json(out);
  }catch(e:any){
    return NextResponse.json({ skipped:true, reason:e?.message||'diagnose_failed' }, { status:500 });
  }
}
