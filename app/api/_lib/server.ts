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

export const TASK_ANIMATIONS = ["study", "study-planning", "cooking", "eating", "sleeping", "meeting", "coding", "class-recording", "auto"] as const;
export type TaskAnimation = (typeof TASK_ANIMATIONS)[number];

export type ProfileRow = {
  id: string;
  couple_id: string;
  name: string;
  avatar: string;
  accent: string;
};

export type SessionUser = ProfileRow & { token: string };

export function getDatabase() {
  if (!env.DB) throw new Error("The D1 database binding is unavailable.");
  return env.DB;
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
  const db = getDatabase();
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

export function suggestTaskAnimation(title: string, category: TaskCategory, profileName = "Brenjit"): TaskAnimation {
  const words = title.toLowerCase();
  const usesBrenjitAnimations = !/^kaveri(?:\s|$)/i.test(profileName.trim());
  if (usesBrenjitAnimations && /record(?:ing|ed)?|film(?:ing)?\s+(?:a\s+)?class|class\s+(?:video|shoot)|course\s+video|lecture\s+record/i.test(words)) return "class-recording";
  if (usesBrenjitAnimations && /curiouz|cod(?:e|ing)|program(?:ming)?|develop(?:er|ment|ing)?|software|build(?:ing)?\s+(?:an?\s+)?(?:app|website|web\s*app)|app\s+build|website\s+build|work(?:ing)?\s+(?:on|for)\s+(?:my\s+)?startup/i.test(words)) return "coding";
  if (/\b(?:meeting|meetings|zoom|conference|stand-?up|sync|one-on-one|video\s+call|team\s+call|client\s+call|office\s+call|google\s+meet|teams\s+call)\b|\b1:1\b/.test(words)) return "meeting";
  if (/\b(?:sleep|sleeping|nap|napping|bedtime|power\s+nap|go\s+to\s+bed)\b/.test(words)) return "sleeping";
  if (/cook|bake|kitchen|chef|prepare|preparing|make\s+(?:a\s+)?(?:meal|breakfast|lunch|dinner|food)/.test(words)) return "cooking";
  if (/\beat(?:ing)?\b|have\s+(?:breakfast|lunch|dinner)|breakfast|lunch|dinner|snack|meal\s*time|food\s*break/.test(words)) return "eating";
  if (/study|read|learn|exam|class|notes|revision|homework|assignment|plan/.test(words) || category === "Study") return "study";
  if (category === "Productive") return "study-planning";
  return "auto";
}

export function requireTaskAnimation(value: unknown, title: string, category: TaskCategory, profileName: string): TaskAnimation {
  if (value === undefined || value === null || value === "") return suggestTaskAnimation(title, category, profileName);
  if (typeof value !== "string" || !TASK_ANIMATIONS.includes(value as TaskAnimation)) {
    throw new Error("Choose a valid task animation");
  }
  return value as TaskAnimation;
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

type ActiveSessionRow = {
  id: string;
  task_id: string;
  profile_id: string;
  date_key: string;
  started_at: string;
  category: TaskCategory;
  duration_minutes: number;
};

type TaskProgressRow = {
  id: string;
  elapsed_seconds: number;
  points_earned: number;
  completion_bonus_awarded: number;
};

/** Closes one running segment and folds it into the task's cumulative daily progress. */
export async function closeActivitySession(
  db: ReturnType<typeof getDatabase>,
  activityId: string,
  profileId: string,
  finishedAt = new Date().toISOString(),
) {
  const activity = await db.prepare(`SELECT a.id, a.task_id, a.profile_id, a.date_key, a.started_at,
      t.category, t.duration_minutes
    FROM activity_sessions a JOIN tasks t ON t.id = a.task_id
    WHERE a.id = ? AND a.profile_id = ? AND a.status = 'active'`)
    .bind(activityId, profileId)
    .first<ActiveSessionRow>();
  if (!activity) throw new Error("This routine isn’t currently running");

  const [pauseResult, progress] = await Promise.all([
    db.prepare(`SELECT category, started_at, ended_at FROM activity_pauses
      WHERE activity_id = ? ORDER BY started_at`)
      .bind(activity.id)
      .all<{ category: TaskCategory; started_at: string; ended_at: string | null }>(),
    db.prepare(`SELECT id, elapsed_seconds, points_earned, completion_bonus_awarded
      FROM task_progress WHERE task_id = ? AND date_key = ?`)
      .bind(activity.task_id, activity.date_key)
      .first<TaskProgressRow>(),
  ]);

  const segmentSeconds = Math.max(0, (Date.parse(finishedAt) - Date.parse(activity.started_at)) / 1000);
  const pauses = pauseResult.results.map((pause) => ({
    category: pause.category,
    seconds: Math.max(0, (Date.parse(pause.ended_at ?? finishedAt) - Date.parse(pause.started_at)) / 1000),
  }));
  const pausedSeconds = pauses.reduce((sum, pause) => sum + pause.seconds, 0);
  const activeSeconds = Math.max(0, segmentSeconds - pausedSeconds);
  const segmentPoints = activeSeconds / 60 * categoryPointRate(activity.category) +
    pauses.reduce((sum, pause) => sum + pause.seconds / 60 * categoryPointRate(pause.category), 0);
  const elapsedSeconds = Math.max(0, Number(progress?.elapsed_seconds ?? 0) + activeSeconds);
  const targetSeconds = activity.duration_minutes * 60;
  const completed = targetSeconds > 0 && elapsedSeconds >= targetSeconds;
  const awardBonus = completed && !progress?.completion_bonus_awarded && activity.category !== "Entertainment";
  const pointsEarned = Math.round((Number(progress?.points_earned ?? 0) + segmentPoints + (awardBonus ? 5 : 0)) * 10) / 10;
  const bonusAwarded = Boolean(progress?.completion_bonus_awarded) || completed;
  const progressId = progress?.id ?? crypto.randomUUID();

  const statements = [
    db.prepare("UPDATE activity_sessions SET status = 'finished', finished_at = ? WHERE id = ? AND status = 'active'")
      .bind(finishedAt, activity.id),
    db.prepare("UPDATE activity_pauses SET ended_at = ? WHERE activity_id = ? AND ended_at IS NULL")
      .bind(finishedAt, activity.id),
    progress
      ? db.prepare(`UPDATE task_progress SET elapsed_seconds = ?, points_earned = ?,
          completion_bonus_awarded = ?, updated_at = ? WHERE id = ?`)
        .bind(elapsedSeconds, pointsEarned, bonusAwarded ? 1 : 0, finishedAt, progressId)
      : db.prepare(`INSERT INTO task_progress
          (id, task_id, profile_id, date_key, elapsed_seconds, points_earned, completion_bonus_awarded, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(progressId, activity.task_id, activity.profile_id, activity.date_key, elapsedSeconds, pointsEarned, bonusAwarded ? 1 : 0, finishedAt),
  ];
  if (completed) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO completions
      (id, task_id, profile_id, date_key, completed_at, points_earned)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), activity.task_id, activity.profile_id, activity.date_key, finishedAt, pointsEarned));
  }
  await db.batch(statements);
  return {
    taskId: activity.task_id,
    completed,
    elapsedSeconds,
    elapsedMinutes: Math.round(elapsedSeconds / 6) / 10,
    remainingSeconds: Math.max(0, targetSeconds - elapsedSeconds),
    pointsEarned,
  };
}

export function validDateKey(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("A valid local date is required");
  }
  return value;
}

export function validScheduledTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
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
