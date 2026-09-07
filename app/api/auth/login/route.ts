import {
  createSessionCookie,
  getDatabase,
  hashPin,
  jsonError,
  requireText,
} from "../../_lib/server";

const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

type LoginRateLimit = {
  failure_count: number;
  window_started_at: string;
  blocked_until: string | null;
};

async function clientKey(request: Request) {
  const address = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const bytes = new TextEncoder().encode(address);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function lockedResponse(blockedUntil: string) {
  const retrySeconds = Math.max(1, Math.ceil((Date.parse(blockedUntil) - Date.now()) / 1000));
  const minutes = Math.max(1, Math.ceil(retrySeconds / 60));
  return Response.json(
    { error: `Too many incorrect attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retrySeconds) } },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const profileId = requireText(body.profileId, "Profile");
    const pin = requireText(body.pin, "PIN", 12);
    const db = getDatabase();
    const profile = await db
      .prepare("SELECT id, pin_salt, pin_hash FROM profiles WHERE id = ?")
      .bind(profileId)
      .first<{ id: string; pin_salt: string; pin_hash: string }>();
    if (!profile) {
      return Response.json({ error: "That PIN doesn’t match this profile" }, { status: 401 });
    }

    const fingerprint = await clientKey(request);
    const nowMs = Date.now();
    const rateLimit = await db.prepare(`SELECT failure_count, window_started_at, blocked_until
        FROM login_rate_limits WHERE profile_id = ? AND client_key = ?`)
      .bind(profileId, fingerprint)
      .first<LoginRateLimit>();
    if (rateLimit?.blocked_until && Date.parse(rateLimit.blocked_until) > nowMs) {
      return lockedResponse(rateLimit.blocked_until);
    }
    if ((await hashPin(pin, profile.pin_salt)) !== profile.pin_hash) {
      const windowExpired = !rateLimit || nowMs - Date.parse(rateLimit.window_started_at) >= RATE_LIMIT_WINDOW_MS;
      const failureCount = windowExpired ? 1 : Number(rateLimit.failure_count) + 1;
      const timestamp = new Date(nowMs).toISOString();
      const blockedUntil = failureCount >= MAX_FAILURES
        ? new Date(nowMs + RATE_LIMIT_WINDOW_MS).toISOString()
        : null;
      await db.prepare(`INSERT INTO login_rate_limits
          (id, profile_id, client_key, failure_count, window_started_at, blocked_until, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(profile_id, client_key) DO UPDATE SET
            failure_count = excluded.failure_count,
            window_started_at = excluded.window_started_at,
            blocked_until = excluded.blocked_until,
            updated_at = excluded.updated_at`)
        .bind(
          crypto.randomUUID(),
          profileId,
          fingerprint,
          failureCount,
          windowExpired ? timestamp : rateLimit.window_started_at,
          blockedUntil,
          timestamp,
        )
        .run();
      if (blockedUntil) return lockedResponse(blockedUntil);
      return Response.json({ error: "That PIN doesn’t match this profile" }, { status: 401 });
    }

    const token = crypto.randomUUID() + crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    await db.batch([
      db.prepare("DELETE FROM login_rate_limits WHERE profile_id = ? AND client_key = ?")
        .bind(profile.id, fingerprint),
      db.prepare("INSERT INTO sessions (token, profile_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(token, profile.id, expiresAt, now),
      db.prepare("DELETE FROM login_rate_limits WHERE updated_at < ?")
        .bind(new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": createSessionCookie(token, request) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
