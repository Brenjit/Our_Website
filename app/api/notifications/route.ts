import { env } from "cloudflare:workers";
import { getDatabase, getSessionUser, jsonError, unauthorized } from "../_lib/server";
import { pushIsConfigured, sendWebPush, type StoredPushSubscription } from "../../../worker/push";

type NotificationRequest = {
  action?: "subscribe" | "test" | "test-background";
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  timezone?: unknown;
};

function validString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function validEndpoint(value: unknown) {
  const endpoint = validString(value, "Notification endpoint", 2048);
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Notification endpoint must be secure");
  return endpoint;
}

function validSubscriptionKey(value: unknown, field: string, expectedBytes: number) {
  const key = validString(value, field, 512);
  if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error(`${field} is invalid`);
  try {
    const base64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    if (bytes.length !== expectedBytes || (expectedBytes === 65 && bytes[0] !== 4)) {
      throw new Error(`${field} is invalid`);
    }
  } catch {
    throw new Error(`${field} is invalid`);
  }
  return key;
}

function validTimezone(value: unknown) {
  const timezone = typeof value === "string" ? value.slice(0, 100) : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "UTC";
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const db = getDatabase();
  const [deviceResult, reminderResult] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE profile_id = ?")
      .bind(user.id)
      .first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM tasks
        WHERE owner_id = ? AND is_archived = 0 AND scheduled_time IS NOT NULL`)
      .bind(user.id)
      .first<{ count: number }>(),
  ]);
  const configured = pushIsConfigured(env);
  return Response.json({
    configured,
    publicKey: configured ? env.VAPID_PUBLIC_KEY : null,
    deviceCount: Number(deviceResult?.count ?? 0),
    reminderCount: Number(reminderResult?.count ?? 0),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (!pushIsConfigured(env)) return Response.json({ error: "Notifications are not configured yet" }, { status: 503 });

  try {
    const body = await request.json<NotificationRequest>();
    const endpoint = validEndpoint(body.endpoint);
    const db = getDatabase();

    if (body.action === "test" || body.action === "test-background") {
      const subscription = await db.prepare(`SELECT id, profile_id, endpoint, p256dh, auth, timezone
          FROM push_subscriptions WHERE profile_id = ? AND endpoint = ?`)
        .bind(user.id, endpoint)
        .first<StoredPushSubscription>();
      if (!subscription) throw new Error("Enable notifications on this device first");
      if (body.action === "test-background") {
        const eventKey = `background-test:${crypto.randomUUID()}`;
        const dueAt = new Date(Date.now() + 10_000).toISOString();
        await db.prepare(`INSERT INTO notification_deliveries
            (id, subscription_id, event_key, status, attempted_at, delivered_at)
            VALUES (?, ?, ?, 'queued', ?, NULL)`)
          .bind(crypto.randomUUID(), subscription.id, eventKey, dueAt)
          .run();
        return Response.json({ scheduled: true, dueAt });
      }
      await sendWebPush(env, subscription, {
        title: "Twogether notifications are ready",
        body: "Scheduled tasks and completed focus timers can now reach this device.",
        tag: `test-${subscription.id}`,
        url: "/",
      });
      return Response.json({ sent: true });
    }

    const p256dh = validSubscriptionKey(body.keys?.p256dh, "Notification key", 65);
    const auth = validSubscriptionKey(body.keys?.auth, "Notification authorization", 16);
    const timezone = validTimezone(body.timezone);
    const timestamp = new Date().toISOString();
    const userAgent = request.headers.get("user-agent")?.slice(0, 250) ?? null;
    await db.prepare(`INSERT INTO push_subscriptions
        (id, profile_id, endpoint, p256dh, auth, timezone, user_agent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          profile_id = excluded.profile_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          timezone = excluded.timezone,
          user_agent = excluded.user_agent,
          updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), user.id, endpoint, p256dh, auth, timezone, userAgent, timestamp, timestamp)
      .run();
    const count = await db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE profile_id = ?")
      .bind(user.id)
      .first<{ count: number }>();
    return Response.json({ subscribed: true, deviceCount: Number(count?.count ?? 0) });
  } catch (error) {
    return jsonError(error, "Couldn’t update notifications");
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const body = await request.json<{ endpoint?: unknown }>();
    const endpoint = validEndpoint(body.endpoint);
    const db = getDatabase();
    const subscription = await db.prepare("SELECT id FROM push_subscriptions WHERE profile_id = ? AND endpoint = ?")
      .bind(user.id, endpoint)
      .first<{ id: string }>();
    if (subscription) {
      await db.batch([
        db.prepare("DELETE FROM notification_deliveries WHERE subscription_id = ?").bind(subscription.id),
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id),
      ]);
    }
    const count = await db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE profile_id = ?")
      .bind(user.id)
      .first<{ count: number }>();
    return Response.json({ subscribed: false, deviceCount: Number(count?.count ?? 0) });
  } catch (error) {
    return jsonError(error, "Couldn’t disable notifications");
  }
}
