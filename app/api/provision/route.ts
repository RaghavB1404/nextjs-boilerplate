export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(JSON.stringify({ ok: true, route: 'provision' }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}
export async function POST() {
  return new Response(JSON.stringify({ ok: true, stub: true }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}
