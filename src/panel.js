// Бот управления: кнопки, тексты, настройки, база ID.
import { initDb, loadSettings, setSetting, int, list, local, sentToday, counts, DEFAULTS } from "./db.js";
import { api, notify, sendFile, esc } from "./tgapi.js";

const b = (text, data) => ({ text, callback_data: data });
const KIND = { greetings: "👋 Приветствия", explanation: "📖 Объяснение игры" };

const INPUTS = {
  delay: ["⏱ Интервал между «Привет»",
    "Пришли интервал в <b>минутах</b> в виде <b>мин-макс</b>, например <code>20-40</code>.\n" +
    "Каждый раз берётся случайное число."],
  limit: ["📅 Лимит в день", "Пришли число, например <code>15</code>."],
  hours: ["🕘 Часы работы", "Пришли часы в виде <b>с-до</b>, например <code>10-21</code>."],
  parts: ["🧩 Пауза между частями объяснения", "В секундах, <b>мин-макс</b>, например <code>2-5</code>."],
  folder: ["📁 Название папки", "Пришли точное название папки в Telegram, например <code>Крокодил</code>."],
  chats: ["👥 Группы для подгрузки",
    "Пришли группы/каналы, где сидят твои подписчики, через запятую:\n" +
    "<code>@my_group, @my_channel</code>\nЧтобы очистить — пришли <code>-</code>."],
};

// ------------------------------------------------------------ экраны
async function mainScreen(env, S) {
  const c = await counts(env);
  const run = S.running === "1";
  let next = "";
  if (run && Number(S.next_send_at) > Date.now()) {
    next = `\nСледующий «Привет» примерно через ${Math.ceil((Number(S.next_send_at) - Date.now()) / 60000)} мин.`;
  }
  const seen = Number(S.agent_seen || 0);
  const ago = Math.round((Date.now() - seen) / 1000);
  const acc = seen && ago < 120 ? `✅ программа на ПК работает${S.agent_name ? " (" + esc(S.agent_name) + ")" : ""}`
    : "❌ программа на ПК не запущена — запусти start_agent.bat";
  const text = `🐊 <b>Панель управления</b>\n\n` +
    `Аккаунт: ${acc}\n` +
    `Рассылка: ${run ? "▶️ <b>идёт</b>" : "⏸ <b>остановлена</b>"}${next}\n` +
    `Сегодня отправлено: <b>${await sentToday(env)}/${S.daily_limit}</b>\n` +
    `Часы: ${S.work_from}:00–${S.work_to}:00 · интервал ${S.delay_min}–${S.delay_max} мин\n\n` +
    `⏳ В очереди: ${c.pending}\n👋 Ждём ответа: ${c.greeted}\n` +
    `✅ Ответили, игру объяснили: ${c.explained}\n❌ Не удалось написать: ${c.failed}\n\n` +
    `📄 Чтобы добавить ID — пришли .txt файл.`;
  const kb = [
    [b(run ? "⏸ Остановить" : "▶️ Запустить", "toggle"), b("🔄 Обновить", "main")],
    [b("✏️ Тексты", "texts"), b("⚙️ Настройки", "settings")],
    [b("🗂 База ID", "base"), b("🧪 Проверить аккаунт", "test")],
  ];
  return [text, kb];
}

function textsScreen(S) {
  const text = `✏️ <b>Тексты</b>\n\n` +
    `👋 Приветствий: ${list(S, "greetings").length} (каждый раз случайное)\n` +
    `📖 Частей объяснения: ${list(S, "explanation").length} (по порядку)\n\n` +
    "Форматирование (жирный, курсив, ссылки, эмодзи) сохраняется — оформи текст в Telegram и отправь.";
  const kb = [
    [b(KIND.greetings, "list:greetings")], [b(KIND.explanation, "list:explanation")],
    [b("👁 Предпросмотр", "preview")], [b("♻️ Вернуть тексты по умолчанию", "resetask")],
    [b("◀️ Назад", "main")],
  ];
  return [text, kb];
}

function listScreen(S, kind) {
  const items = list(S, kind);
  let text = `<b>${KIND[kind]}</b>\n\n`;
  items.forEach((it, i) => {
    const t = it.text.length > 250 ? it.text.slice(0, 250) + "…" : it.text;
    text += `${i + 1}. ${esc(t)}\n\n`;
  });
  const kb = items.map((_, i) => {
    const row = [b(`✏️ ${i + 1}`, `edit:${kind}:${i}`), b(`🗑 ${i + 1}`, `del:${kind}:${i}`)];
    if (i > 0) row.push(b(`⬆️ ${i + 1}`, `up:${kind}:${i}`));
    return row;
  });
  kb.push([b("➕ Добавить", `add:${kind}`)], [b("◀️ Назад", "texts")]);
  return [text.slice(0, 3900), kb];
}

function settingsScreen(S) {
  const on = (k) => (S[k] === "1" ? "вкл ✅" : "выкл ❌");
  const text = `⚙️ <b>Настройки</b>\n\n` +
    `⏱ Интервал между «Привет»: <b>${S.delay_min}–${S.delay_max} мин</b>\n` +
    `📅 Лимит в день: <b>${S.daily_limit}</b>\n` +
    `🕘 Часы работы: <b>${S.work_from}:00–${S.work_to}:00</b>\n` +
    `🧩 Пауза между частями объяснения: <b>${S.part_min}–${S.part_max} сек</b>\n\n` +
    `📁 Папка: <b>${esc(S.folder_name)}</b> — ${on("use_folder")}\n` +
    `🗄 Архив + без звука: ${on("use_archive")}\n` +
    `🔔 Уведомления об ответах: ${on("notify_replies")}\n\n` +
    `👥 Группы для подгрузки: <b>${esc(S.warmup_chats || "—")}</b>` +
    (S.warmup_state ? "\n⏳ Идёт подгрузка…" : "");
  const kb = [
    [b(INPUTS.delay[0], "set:delay")],
    [b(INPUTS.limit[0], "set:limit"), b(INPUTS.hours[0], "set:hours")],
    [b(INPUTS.parts[0], "set:parts")],
    [b(INPUTS.folder[0], "set:folder"), b("📁 Папка вкл/выкл", "tog:use_folder")],
    [b("🗄 Архив вкл/выкл", "tog:use_archive"), b("🔔 Уведомления вкл/выкл", "tog:notify_replies")],
    [b(INPUTS.chats[0], "set:chats"), b("🔄 Подгрузить сейчас", "warmup")],
    [b("◀️ Назад", "main")],
  ];
  return [text, kb];
}

async function baseScreen(env) {
  const c = await counts(env);
  const found = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users u JOIN peers p ON p.id = u.id WHERE u.status='pending'").first()).n;
  const text = `🗂 <b>База ID</b>\n\n` +
    `Всего: ${c.pending + c.greeted + c.explained + c.failed}\n` +
    `⏳ В очереди: ${c.pending} (из них найдено в группах: ${found})\n` +
    `👋 Ждём ответа: ${c.greeted}\n✅ Объяснили: ${c.explained}\n❌ Неудачных: ${c.failed}\n\n` +
    "📄 Добавить ID: пришли .txt файл (по одному ID на строку).";
  const kb = [
    [b("📤 Выгрузить всю базу (CSV)", "export")],
    [b("❌ Скачать неудачные", "failed"), b("🔁 Неудачные → в очередь", "retry")],
    [b("🗑 Очистить очередь", "clearask")],
    [b("◀️ Назад", "main")],
  ];
  return [text, kb];
}

// ------------------------------------------------------------ отправка экранов
const send = (env, [text, kb]) =>
  api(env, "sendMessage", { chat_id: env.ADMIN_ID, text, parse_mode: "HTML", reply_markup: { inline_keyboard: kb }, link_preview_options: { is_disabled: true } });

const edit = (env, msg, [text, kb]) =>
  api(env, "editMessageText", { chat_id: msg.chat.id, message_id: msg.message_id, text, parse_mode: "HTML", reply_markup: { inline_keyboard: kb }, link_preview_options: { is_disabled: true } });

const sendItem = (env, it) =>
  api(env, "sendMessage", { chat_id: env.ADMIN_ID, text: it.text, entities: it.entities, link_preview_options: { is_disabled: true } });

function parseRange(t, lo, hi) {
  const m = String(t).trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (!m) return null;
  const a = +m[1], c = +m[2];
  return lo <= a && a <= c && c <= hi ? [a, c] : null;
}

// ------------------------------------------------------------ входящие обновления
export async function handleUpdate(update, env, ctx, origin) {
  const admin = String(env.ADMIN_ID);
  if (update.callback_query) {
    const q = update.callback_query;
    if (String(q.from.id) !== admin) return;
    await initDb(env);
    const S = await loadSettings(env);
    return onButton(env, ctx, S, q, origin);
  }
  const msg = update.message;
  if (!msg || msg.chat.type !== "private" || String(msg.from?.id) !== admin) return;
  await initDb(env);
  const S = await loadSettings(env);
  return onMessage(env, ctx, S, msg, origin);
}

async function onButton(env, ctx, S, q, origin) {
  const [cmd, a1, a2] = q.data.split(":");
  const msg = q.message;
  const answer = (text, alert = false) => api(env, "answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert });
  if (!["edit", "add", "set"].includes(cmd) && S.waiting) await setSetting(env, S, "waiting", "");

  switch (cmd) {
    case "main": await answer(); return edit(env, msg, await mainScreen(env, S));
    case "toggle":
      await setSetting(env, S, "running", S.running === "1" ? "0" : "1");
      if (S.running === "1") await setSetting(env, S, "next_send_at", "0");
      await answer(S.running === "1" ? "Рассылка запущена ▶️ Первый «Привет» — в течение минуты (если программа на ПК запущена)" : "Остановлено ⏸", true);
      return edit(env, msg, await mainScreen(env, S));
    case "test":
      await setSetting(env, S, "agent_ping", Date.now());
      return answer("Запрос отправлен программе на ПК. Если она запущена — ответит в течение 30 секунд.", true);

    // ---- тексты
    case "texts": await answer(); return edit(env, msg, textsScreen(S));
    case "list": await answer(); return edit(env, msg, listScreen(S, a1));
    case "edit": {
      await answer();
      await setSetting(env, S, "waiting", JSON.stringify({ action: "edit", kind: a1, i: +a2 }));
      await notify(env, `✏️ Сейчас текст №${+a2 + 1}:`);
      await sendItem(env, list(S, a1)[+a2]);
      return notify(env, "Пришли новый текст одним сообщением.\n/cancel — отмена");
    }
    case "add":
      await answer();
      await setSetting(env, S, "waiting", JSON.stringify({ action: "add", kind: a1 }));
      return notify(env, "➕ Пришли новый текст одним сообщением.\n/cancel — отмена");
    case "del": {
      const items = list(S, a1);
      if (items.length <= 1) return answer("Нельзя удалить последний текст", true);
      items.splice(+a2, 1);
      await setSetting(env, S, a1, JSON.stringify(items));
      await answer("Удалено 🗑");
      return edit(env, msg, listScreen(S, a1));
    }
    case "up": {
      const items = list(S, a1), i = +a2;
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
      await setSetting(env, S, a1, JSON.stringify(items));
      await answer();
      return edit(env, msg, listScreen(S, a1));
    }
    case "preview":
      await answer();
      await notify(env, "👁 Так увидит человек.\n\nПервое сообщение (одно из):");
      for (const it of list(S, "greetings")) await sendItem(env, it);
      await notify(env, "…после его ответа:");
      for (const it of list(S, "explanation")) await sendItem(env, it);
      return send(env, textsScreen(S));
    case "resetask":
      await answer();
      return edit(env, msg, ["♻️ Вернуть все тексты по умолчанию? Твои правки пропадут.",
        [[b("Да, вернуть", "reset"), b("Нет", "texts")]]]);
    case "reset":
      await setSetting(env, S, "greetings", DEFAULTS.greetings);
      await setSetting(env, S, "explanation", DEFAULTS.explanation);
      await answer("Тексты сброшены");
      return edit(env, msg, textsScreen(S));

    // ---- настройки
    case "settings": await answer(); return edit(env, msg, settingsScreen(S));
    case "set":
      await answer();
      await setSetting(env, S, "waiting", JSON.stringify({ action: "set", key: a1 }));
      return notify(env, `${INPUTS[a1][0]}\n\n${INPUTS[a1][1]}\n\n/cancel — отмена`);
    case "tog":
      await setSetting(env, S, a1, S[a1] === "1" ? "0" : "1");
      await answer();
      return edit(env, msg, settingsScreen(S));
    case "warmup":
      if (!S.warmup_chats) {
        await answer("Сначала укажи группы: 👥 Группы для подгрузки. Подгружу пока только твои переписки.", true);
      } else {
        await answer("Программа на ПК начнёт подгрузку в течение 30 секунд и пришлёт отчёт.", true);
      }
      await setSetting(env, S, "warmup_state", JSON.stringify({ i: -1, offset: 0, total: 0 }));
      return edit(env, msg, settingsScreen(S));

    // ---- база
    case "base": await answer(); return edit(env, msg, await baseScreen(env));
    case "export": {
      await answer();
      const cols = ["id", "status", "file", "added_at", "greeted_at", "replied_at", "error"];
      const { results } = await env.DB.prepare(`SELECT ${cols.join(",")} FROM users ORDER BY rowid`).all();
      const q2 = (v) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
      const csv = "﻿" + [cols.join(","), ...results.map((r) => cols.map((c) => q2(r[c])).join(","))].join("\n");
      return sendFile(env, `base_${local(env).date}.csv`, csv, "📤 Вся база");
    }
    case "failed": {
      const { results } = await env.DB.prepare("SELECT id, error FROM users WHERE status='failed'").all();
      if (!results.length) return answer("Неудачных нет 👍", true);
      await answer();
      return sendFile(env, "failed.txt", results.map((r) => `${r.id}\t${r.error}`).join("\n"), `❌ Неудачных: ${results.length}`);
    }
    case "retry": {
      const r = await env.DB.prepare("UPDATE users SET status='pending', error=NULL WHERE status='failed'").run();
      await answer(`Вернул в очередь: ${r.meta.changes}`, true);
      return edit(env, msg, await baseScreen(env));
    }
    case "clearask":
      await answer();
      return edit(env, msg, ["🗑 Удалить из базы все ID, которым ещё <b>не писали</b>?",
        [[b("Да, удалить", "clear"), b("Нет", "base")]]]);
    case "clear": {
      const r = await env.DB.prepare("DELETE FROM users WHERE status='pending'").run();
      await answer(`Удалено: ${r.meta.changes}`, true);
      return edit(env, msg, await baseScreen(env));
    }
  }
  return answer();
}

async function onMessage(env, ctx, S, msg, origin) {
  const text = msg.text || "";
  if (text.startsWith("/cancel")) {
    await setSetting(env, S, "waiting", "");
    await notify(env, "Отменено.");
    return send(env, await mainScreen(env, S));
  }
  if (text.startsWith("/start") || text.startsWith("/menu")) {
    await setSetting(env, S, "waiting", "");
    return send(env, await mainScreen(env, S));
  }

  // файл с ID
  if (msg.document) {
    const f = await api(env, "getFile", { file_id: msg.document.file_id });
    if (!f.ok) return notify(env, "Не смог скачать файл. Пришли .txt до 20 МБ.");
    const content = await (await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${f.result.file_path}`)).text();
    const ids = [...new Set((content.match(/\b\d{5,15}\b/g) || []).map(Number))];
    const name = msg.document.file_name || "file.txt";
    let added = 0;
    for (let i = 0; i < ids.length; i += 2000) {
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO users(id, status, file, added_at)
         SELECT value, 'pending', ?, ? FROM json_each(?)`)
        .bind(name, local(env).stamp, JSON.stringify(ids.slice(i, i + 2000))).run();
      added += r.meta.changes;
    }
    const found = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users u JOIN peers p ON p.id = u.id WHERE u.status='pending'").first()).n;
    return api(env, "sendMessage", {
      chat_id: env.ADMIN_ID, parse_mode: "HTML",
      text: `📥 <b>${esc(name)}</b>\nНайдено ID: ${ids.length}\nНовых добавлено: ${added}\n` +
        `Уже были в базе: ${ids.length - added}\n\nВ очереди найдено в твоих группах: <b>${found}</b>\n` +
        "Если мало — укажи группы в ⚙️ Настройках и нажми «🔄 Подгрузить сейчас».",
      reply_markup: { inline_keyboard: [[b("▶️ В меню", "main")]] },
    });
  }


  if (!S.waiting) return send(env, await mainScreen(env, S));
  const w = JSON.parse(S.waiting);


  if (w.action === "edit" || w.action === "add") {
    if (!text.trim()) return notify(env, "Нужен текст. Пришли ещё раз или /cancel");
    const items = list(S, w.kind);
    const item = { text, entities: msg.entities || [] };
    if (w.action === "edit") items[w.i] = item; else items.push(item);
    await setSetting(env, S, w.kind, JSON.stringify(items));
    await setSetting(env, S, "waiting", "");
    await notify(env, "✅ Сохранено");
    return send(env, listScreen(S, w.kind));
  }

  if (w.action === "set") {
    let warn = "";
    const k = w.key;
    if (k === "limit") {
      const n = parseInt(text, 10);
      if (!(n >= 1 && n <= 200)) return notify(env, "Нужно число от 1 до 200. Ещё раз или /cancel");
      await setSetting(env, S, "daily_limit", n);
      if (n > 30) warn = "\n⚠️ Больше 30 в день незнакомым людям — высокий риск спам-блока.";
    } else if (k === "folder") {
      if (!text.trim()) return notify(env, "Пришли название папки или /cancel");
      await setSetting(env, S, "folder_name", text.trim());
      await setSetting(env, S, "folder_warn", "");
    } else if (k === "chats") {
      await setSetting(env, S, "warmup_chats", text.trim() === "-" ? "" :
        text.split(",").map((x) => x.trim()).filter(Boolean).join(", "));
      warn = "\nТеперь нажми «🔄 Подгрузить сейчас».";
    } else {
      const lim = { delay: [1, 1440], hours: [0, 24], parts: [0, 60] }[k];
      const r = parseRange(text, ...lim);
      if (!r || (k === "hours" && r[0] === r[1])) {
        return notify(env, "Неверный формат. Пример: <code>20-40</code>. Ещё раз или /cancel");
      }
      const keys = { delay: ["delay_min", "delay_max"], hours: ["work_from", "work_to"], parts: ["part_min", "part_max"] }[k];
      await setSetting(env, S, keys[0], r[0]);
      await setSetting(env, S, keys[1], r[1]);
      if (k === "delay" && r[0] < 10) warn = "\n⚠️ Слишком частые сообщения повышают риск бана.";
    }
    await setSetting(env, S, "waiting", "");
    await notify(env, "✅ Сохранено" + warn);
    return send(env, settingsScreen(S));
  }
}

// ------------------------------------------------------------ подключение вебхука
export async function setupWebhook(env, origin) {
  const r = await api(env, "setWebhook", {
    url: `${origin}/hook`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await api(env, "setMyCommands", { commands: [
    { command: "menu", description: "Панель управления" },
    { command: "cancel", description: "Отменить ввод" },
  ] });
  if (r.ok) await notify(env, "🐊 Бот управления подключён! Нажми /menu");
  return r;
}
