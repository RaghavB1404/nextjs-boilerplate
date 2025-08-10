// app/api/compile/route.ts
export const runtime = 'nodejs';

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Force TS to treat this file as a module, even if some editors strip exports:
export {};
