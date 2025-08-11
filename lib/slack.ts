// lib/slack.ts
export async function sendSlackText(webhookUrl: string, text: string) {
  if (!webhookUrl) throw new Error("Missing Slack webhook URL");
  let res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let body = ""; try { body = await res.text(); } catch {}
    if (/invalid_payload/i.test(body)) {
      const form = new URLSearchParams({ payload: JSON.stringify({ text }) }).toString();
      res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
    } else {
      throw new Error(`slack ${res.status} ${body}`);
    }
  }
  if (!res.ok) { let b=""; try { b = await res.text(); } catch {}; throw new Error(`slack ${res.status} ${b}`); }
  return "ok";
}
