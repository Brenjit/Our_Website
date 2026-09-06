import { buildPushPayload } from "@block65/webcrypto-web-push";

export type PushPayload = {
  title: string;
  body: string;
  tag: string;
  url?: string;
};

export type StoredPushSubscription = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
};

type PlannedTaskRow = {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  duration_minutes: number;
  schedule_type: string;
  scheduled_date: string | null;
  scheduled_weekday: number | null;
  scheduled_time: string;
};

type ActiveTimerRow = {
  id: string;
  profile_id: string;
  task_id: string;
  task_title: string;
  date_key: string;
  started_at: string;
  duration_minutes: number;
  progress_seconds: number;
  paused_seconds: number;
  has_open_pause: number;
};

export class PushDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "PushDeliveryError";
  }
}

export function pushIsConfigured(env: Env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export async function sendWebPush(env: Env, subscription: StoredPushSubscription, payload: PushPayload) {
  if (!pushIsConfigured(env)) throw new Error("Push notifications are not configured");
  const details = await buildPushPayload(
    {
      data: { ...payload, url: payload.url ?? "/" },
      options: { ttl: 60 * 60, urgency: "high" },
    },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  );
  const response = await fetch(subscription.endpoint, details);
  await response.body?.cancel();
  if (!response.ok) throw new PushDeliveryError(`Push service returned ${response.status}`, response.status);
}

function localClock(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    weekday,
  };
}

function plannedTaskIsDue(task: PlannedTaskRow, clock: ReturnType<typeof localClock>, now: Date) {
  const [taskHours, taskMinutes] = task.scheduled_time.split(":").map(Number);
  const [nowHours, nowMinutes] = clock.time.split(":").map(Number);
  const minutesLate = nowHours * 60 + nowMinutes - (taskHours * 60 + taskMinutes);
  if (minutesLate < 0 || minutesLate > 2) return false;
  if (task.schedule_type === "daily") return true;
  if (task.schedule_type === "weekdays") return clock.weekday >= 1 && clock.weekday <= 5;
  if (task.schedule_type === "weekly") return task.scheduled_weekday === clock.weekday;
  if (task.schedule_type === "once") return task.scheduled_date === clock.dateKey;
  console.warn(JSON.stringify({ message: "Unknown task schedule while sending reminders", taskId: task.id, at: now.toISOString() }));
  return false;
}

async function claimDelivery(db: D1Database, subscriptionId: string, eventKey: string, now: Date) {
  const attemptedAt = now.toISOString();
  const retryBefore = new Date(now.getTime() - 45_000).toISOString();
  const result = await db.prepare(`INSERT INTO notification_deliveries
      (id, subscription_id, event_key, status, attempted_at, delivered_at)
      VALUES (?, ?, ?, 'pending', ?, NULL)
      ON CONFLICT(subscription_id, event_key) DO UPDATE SET
        id = excluded.id, status = 'pending', attempted_at = excluded.attempted_at, delivered_at = NULL
      WHERE notification_deliveries.status != 'delivered'
        AND notification_deliveries.attempted_at < ?`)
    .bind(crypto.randomUUID(), subscriptionId, eventKey, attemptedAt, retryBefore)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

async function markDelivered(db: D1Database, subscriptionId: string, eventKey: string, now: Date) {
  await db.prepare(`UPDATE notification_deliveries
      SET status = 'delivered', delivered_at = ?
      WHERE subscription_id = ? AND event_key = ?`)
    .bind(now.toISOString(), subscriptionId, eventKey)
    .run();
}

async function handleFailedDelivery(
  db: D1Database,
  subscription: StoredPushSubscription,
  eventKey: string,
  error: unknown,
) {
  if (error instanceof PushDeliveryError && (error.statusCode === 404 || error.statusCode === 410)) {
    await db.batch([
      db.prepare("DELETE FROM notification_deliveries WHERE subscription_id = ?").bind(subscription.id),
      db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id),
    ]);
    return;
  }
  await db.prepare(`UPDATE notification_deliveries SET status = 'failed'
      WHERE subscription_id = ? AND event_key = ?`)
    .bind(subscription.id, eventKey)
    .run();
  console.error(JSON.stringify({
    message: "Push notification delivery failed",
    subscriptionId: subscription.id,
    eventKey,
    error: error instanceof Error ? error.message : String(error),
  }));
}

async function deliver(
  env: Env,
  subscription: StoredPushSubscription,
  eventKey: string,
  payload: PushPayload,
  now: Date,
) {
  if (!await claimDelivery(env.DB, subscription.id, eventKey, now)) return false;
  try {
    await sendWebPush(env, subscription, payload);
    await markDelivered(env.DB, subscription.id, eventKey, now);
    return true;
  } catch (error) {
    await handleFailedDelivery(env.DB, subscription, eventKey, error);
    return false;
  }
}

export async function sendDueNotifications(env: Env, scheduledTime: number) {
  if (!pushIsConfigured(env)) {
    console.warn(JSON.stringify({ message: "Skipping scheduled notifications because VAPID is not configured" }));
    return;
  }

  const now = new Date(scheduledTime);
  const [subscriptionResult, plannedTaskResult, timerResult] = await Promise.all([
    env.DB.prepare(`SELECT id, profile_id, endpoint, p256dh, auth, timezone
      FROM push_subscriptions`).all<StoredPushSubscription>(),
    env.DB.prepare(`SELECT id, owner_id, title, category, duration_minutes,
        schedule_type, scheduled_date, scheduled_weekday, scheduled_time
      FROM tasks
      WHERE is_archived = 0 AND scheduled_time IS NOT NULL`).all<PlannedTaskRow>(),
    env.DB.prepare(`SELECT a.id, a.profile_id, a.task_id, a.date_key, a.started_at,
        t.title AS task_title, t.duration_minutes,
        COALESCE(tp.elapsed_seconds, 0) AS progress_seconds,
        COALESCE(SUM(CASE WHEN ap.ended_at IS NOT NULL
          THEN (julianday(ap.ended_at) - julianday(ap.started_at)) * 86400 ELSE 0 END), 0) AS paused_seconds,
        MAX(CASE WHEN ap.id IS NOT NULL AND ap.ended_at IS NULL THEN 1 ELSE 0 END) AS has_open_pause
      FROM activity_sessions a
      JOIN tasks t ON t.id = a.task_id
      LEFT JOIN task_progress tp ON tp.task_id = a.task_id AND tp.date_key = a.date_key
      LEFT JOIN activity_pauses ap ON ap.activity_id = a.id
      WHERE a.status = 'active' AND t.duration_minutes > 0
      GROUP BY a.id`).all<ActiveTimerRow>(),
  ]);

  const tasksByProfile = new Map<string, PlannedTaskRow[]>();
  for (const task of plannedTaskResult.results) {
    const tasks = tasksByProfile.get(task.owner_id) ?? [];
    tasks.push(task);
    tasksByProfile.set(task.owner_id, tasks);
  }

  const timersByProfile = new Map(timerResult.results.map((timer) => [timer.profile_id, timer]));
  let delivered = 0;
  for (const subscription of subscriptionResult.results) {
    let clock: ReturnType<typeof localClock>;
    try {
      clock = localClock(now, subscription.timezone);
    } catch {
      clock = localClock(now, "UTC");
    }
    const timer = timersByProfile.get(subscription.profile_id);

    for (const task of tasksByProfile.get(subscription.profile_id) ?? []) {
      if (timer?.task_id === task.id) continue;
      if (!plannedTaskIsDue(task, clock, now)) continue;
      const completion = await env.DB.prepare("SELECT id FROM completions WHERE task_id = ? AND date_key = ?")
        .bind(task.id, clock.dateKey)
        .first<{ id: string }>();
      if (completion) continue;
      const eventKey = `plan:${task.id}:${clock.dateKey}:${task.scheduled_time}`;
      const sent = await deliver(env, subscription, eventKey, {
        title: `Time for ${task.title}`,
        body: task.duration_minutes > 0
          ? `${task.category} · ${task.duration_minutes} min planned`
          : `${task.category} · ready when you are`,
        tag: eventKey,
        url: "/",
      }, now);
      if (sent) delivered += 1;
    }

    if (!timer || timer.has_open_pause) continue;
    const sessionSeconds = Math.max(0, (scheduledTime - Date.parse(timer.started_at)) / 1000 - Number(timer.paused_seconds || 0));
    if (Number(timer.progress_seconds || 0) + sessionSeconds < timer.duration_minutes * 60) continue;
    const eventKey = `timer:${timer.id}`;
    const sent = await deliver(env, subscription, eventKey, {
      title: `${timer.task_title} is complete`,
      body: "Your focus goal is reached. Open Twogether to finish or keep going.",
      tag: eventKey,
      url: "/",
    }, now);
    if (sent) delivered += 1;
  }

  const cleanupBefore = new Date(now.getTime() - 30 * 86400_000).toISOString();
  await env.DB.prepare("DELETE FROM notification_deliveries WHERE attempted_at < ?")
    .bind(cleanupBefore)
    .run();
  console.log(JSON.stringify({
    message: "Scheduled notification check completed",
    subscriptions: subscriptionResult.results.length,
    delivered,
    scheduledAt: now.toISOString(),
  }));
}
