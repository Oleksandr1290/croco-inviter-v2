// Точка входа Worker'а: только бот управления (панель, тексты, настройки, база ID).
// Твой аккаунт работает в программе на ПК (agent.py) — она берёт данные из этой же базы D1.
//  • POST /hook            — сообщения и кнопки бота управления (вебхук Telegram)
//  • GET  /setup?key=...   — один раз подключить вебхук
import { handleUpdate, setupWebhook } from "./panel.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/hook" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const update = await request.json();
      try {
        await handleUpdate(update, env, ctx, url.origin);
      } catch (e) {
        console.log("panel error", e?.stack || e);
      }
      return new Response("ok");
    }

    if (url.pathname === "/setup") {
      if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) return new Response("Неверный key", { status: 403 });
      const r = await setupWebhook(env, url.origin);
      return new Response(r.ok ? "✅ Готово! Открой своего бота и нажми /menu" : "❌ Ошибка: " + JSON.stringify(r),
        { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    return new Response("croco-inviter работает 🐊", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
