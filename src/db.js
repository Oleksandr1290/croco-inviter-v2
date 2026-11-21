// Работа с базой D1: таблицы, настройки, время.
import { GREETINGS, EXPLANATION } from "./texts.js";

const asItems = (arr) => JSON.stringify(arr.map((text) => ({ text, entities: [] })));

export const DEFAULTS = {
  running: "0",
  daily_limit: "15",
  delay_min: "20", delay_max: "40",   // пауза между «Привет», минуты
  work_from: "10", work_to: "21",     // часы работы
  part_min: "2", part_max: "5",       // пауза между частями объяснения, секунды
  folder_name: "Крокодил",
  use_folder: "1",
  use_archive: "1",
  notify_replies: "1",
  warmup_chats: "",
  warmup_state: "",                   // прогресс подгрузки участников
  next_send_at: "0",
  waiting: "",                        // что бот ждёт от админа
  last_error: "",
  folder_warn: "",
  tg_session: "",                     // сессия аккаунта (создаётся входом через бота)
  login_state: "",
  agent_seen: "0",                    // когда программа на ПК последний раз выходила на связь
  agent_name: "",
  agent_ping: "0",                    // запрос «проверить аккаунт» для программы на ПК
  greetings: asItems(GREETINGS),
  explanation: asItems(EXPLANATION),
};

export async function initDb(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      file TEXT, added_at TEXT, greeted_at TEXT, replied_at TEXT, error TEXT)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)"),
    // id → access_hash всех людей, найденных в твоих группах/каналах
    env.DB.prepare("CREATE TABLE IF NOT EXISTS peers(id INTEGER PRIMARY KEY, access_hash TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)"),
  ]);
}

export async function loadSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const s = { ...DEFAULTS };
  for (const r of results) s[r.key] = r.value;
  return s;
}

export async function setSetting(env, S, key, value) {
  S[key] = String(value);
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)")
    .bind(key, String(value)).run();
}

export const int = (S, k) => parseInt(S[k], 10);
export const list = (S, k) => JSON.parse(S[k]);

// Локальное время (по умолчанию Бухарест)
export function local(env) {
  const tz = env.TZ_NAME || "Europe/Bucharest";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  const hour = parseInt(p.hour, 10) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, stamp: `${p.year}-${p.month}-${p.day} ${String(hour).padStart(2, "0")}:${p.minute}` };
}

export async function sentToday(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE greeted_at LIKE ?")
    .bind(local(env).date + "%").first();
  return r.n;
}

export async function counts(env) {
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM users GROUP BY status").all();
  const c = { pending: 0, greeted: 0, explained: 0, failed: 0 };
  for (const r of results) c[r.status] = r.n;
  return c;
}
