// Bot API: бот управления пишет тебе.
export async function api(env, method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json();
}

export function notify(env, text, extra = {}) {
  return api(env, "sendMessage", {
    chat_id: env.ADMIN_ID, text, parse_mode: "HTML",
    link_preview_options: { is_disabled: true }, ...extra,
  }).catch(() => {});
}

export async function sendFile(env, name, content, caption) {
  const fd = new FormData();
  fd.append("chat_id", String(env.ADMIN_ID));
  fd.append("caption", caption);
  fd.append("document", new Blob([content]), name);
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
}

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
