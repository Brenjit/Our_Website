import { env } from "cloudflare:workers";

const SESSION_COOKIE = "together_session";

export const TASK_CATEGORIES = [
  "Study",
  "Productive",
  "Entertainment",
  "Daily essentials",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_SCHEDULES = ["once", "daily", "weekdays", "weekly"] as const;
export type TaskSchedule = (typeof TASK_SCHEDULES)[number];

export const TASK_ANIMATIONS = ["study", "study-planning", "cooking", "auto"] as const;
export type TaskAnimation = (typeof TASK_ANIMATIONS)[number];

export type ProfileRow = {
  id: string;
  couple_id: string;
  name: string;
  avatar: string;
  accent: string;
};

export type SessionUser = ProfileRow & { token: string };

function getDatabase() {
  if (!env.DB) throw new Error("The D1 database binding is unavailable.");
  return env.DB;
}

export async function ensureDatabase() {
  const db = getDatabase();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS couples (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      couple_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      accent TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      points REAL NOT NULL DEFAULT 5,
      schedule_type TEXT NOT NULL DEFAULT 'daily',
      scheduled_date TEXT,
      scheduled_weekday INTEGER,
      scheduled_time TEXT,
      animation_key TEXT NOT NULL DEFAULT 'auto',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS completions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      points_earned REAL NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity_pauses (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      category TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_completions_task_date ON completions(task_id, date_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_owner_active ON tasks(owner_id, is_archived)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_activity_profile_status ON activity_sessions(profile_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_pauses_activity_open ON activity_pauses(activity_id, ended_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id)"),
    db.prepare(`UPDATE tasks SET category = CASE category
      WHEN 'Growth' THEN 'Study'
      WHEN 'Fitness' THEN 'Productive'
      WHEN 'Wellness' THEN 'Daily essentials'
      WHEN 'Health' THEN 'Daily essentials'
      WHEN 'Home' THEN 'Daily essentials'
      WHEN 'Personal' THEN 'Daily essentials'
      ELSE 'Daily essentials' END
      WHERE category NOT IN ('Study', 'Productive', 'Entertainment', 'Daily essentials')`),
    db.prepare(`UPDATE tasks SET points = CASE
      WHEN category = 'Entertainment' THEN duration_minutes * -0.5
      WHEN category IN ('Study', 'Productive') AND duration_minutes > 0 THEN 5 + duration_minutes * 2
      WHEN category = 'Daily essentials' AND duration_minutes > 0 THEN 5 + duration_minutes
      ELSE 5 END`),
    db.prepare(`UPDATE profiles SET accent = CASE
      WHEN id = (
        SELECT first_profile.id FROM profiles AS first_profile
        WHERE first_profile.couple_id = profiles.couple_id
        ORDER BY first_profile.created_at, first_profile.id LIMIT 1
      ) THEN 'sage' ELSE 'coral' END`),
  ]);
  const taskColumns = await db.prepare("PRAGMA table_info(tasks)").all<{ name: string }>();
  const columnNames = new Set(taskColumns.results.map((column) => column.name));
  const additions = [];
  if (!columnNames.has("schedule_type")) additions.push(db.prepare("ALTER TABLE tasks ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'daily'"));
  if (!columnNames.has("scheduled_date")) additions.push(db.prepare("ALTER TABLE tasks ADD COLUMN scheduled_date TEXT"));
  if (!columnNames.has("scheduled_weekday")) additions.push(db.prepare("ALTER TABLE tasks ADD COLUMN scheduled_weekday INTEGER"));
  if (!columnNames.has("scheduled_time")) additions.push(db.prepare("ALTER TABLE tasks ADD COLUMN scheduled_time TEXT"));
  if (!columnNames.has("animation_key")) additions.push(db.prepare("ALTER TABLE tasks ADD COLUMN animation_key TEXT NOT NULL DEFAULT 'auto'"));
  if (additions.length) await db.batch(additions);
  return db;
}

function parseCookies(request: Request) {
  const result = new Map<string, string>();
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key) result.set(key, decodeURIComponent(value.join("=")));
  }
  return result;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const db = await ensureDatabase();
  const user = await db
    .prepare(`SELECT p.id, p.couple_id, p.name, p.avatar, p.accent, s.token
      FROM sessions s JOIN profiles p ON p.id = s.profile_id
      WHERE s.token = ? AND s.expires_at > ?`)
    .bind(token, new Date().toISOString())
    .first<SessionUser>();
  return user ?? null;
}

export function requireText(value: unknown, field: string, max = 80) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim().slice(0, max);
}

export function requireTaskCategory(value: unknown): TaskCategory {
  if (typeof value !== "string" || !TASK_CATEGORIES.includes(value as TaskCategory)) {
    throw new Error("Choose one of the four task categories");
  }
  return value as TaskCategory;
}

export function requireTaskSchedule(value: unknown): TaskSchedule {
  if (typeof value !== "string" || !TASK_SCHEDULES.includes(value as TaskSchedule)) {
    return "once";
  }
  return value as TaskSchedule;
}

export function suggestTaskAnimation(title: string, category: TaskCategory): TaskAnimation {
  const words = title.toLowerCase();
  if (/cook|bake|meal|dinner|lunch|breakfast|kitchen|food/.test(words)) return "cooking";
  if (/study|read|learn|exam|class|notes|revision|homework|assignment|plan/.test(words) || category === "Study") return "study";
  if (category === "Productive") return "study-planning";
  return "auto";
}

export function calculateTaskPoints(category: TaskCategory, elapsedMinutes?: number) {
  if (elapsedMinutes === undefined) return category === "Entertainment" ? 0 : 5;
  const rate = category === "Entertainment" ? -0.5 : category === "Daily essentials" ? 1 : 2;
  const completionBonus = category === "Entertainment" ? 0 : 5;
  return Math.round((completionBonus + elapsedMinutes * rate) * 10) / 10;
}

export function categoryPointRate(category: TaskCategory) {
  return category === "Entertainment" ? -0.5 : category === "Daily essentials" ? 1 : 2;
}

export function validDateKey(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("A valid local date is required");
  }
  return value;
}

export function validScheduledTime(value: unknown) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Choose a valid start time");
  }
  return value;
}

export function jsonError(error: unknown, fallback = "Something went wrong") {
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status: 400 });
}

export function unauthorized() {
  return Response.json({ error: "Please sign in to continue" }, { status: 401 });
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt: string) {
  const encoded = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoded.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoded.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function createSessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}
