// lib/slack.ts
export async function sendSlackText(webhookUrl: string, text: string) {
  if (!webhookUrl) throw new Error("Missing Slack webhook URL");

  // 1) Try modern JSON body
  let res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text }),
  });

  // 2) If Slack says invalid_payload, try legacy form-encoded payload=
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    if (/invalid_payload/i.test(body)) {
      const formBody = new URLSearchParams({
        payload: JSON.stringify({ text }),
      }).toString();
      res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
      });
      if (!res.ok) {
        const b = await res.text().catch(() => "");
        throw new Error(`slack form-encoded failed: ${res.status} ${b}`);
      }
      return "ok";
    }
    throw new Error(`slack json failed: ${res.status} ${body}`);
  }
  return "ok";
}
