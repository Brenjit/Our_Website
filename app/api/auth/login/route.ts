import {
  createSessionCookie,
  ensureDatabase,
  hashPin,
  jsonError,
  requireText,
} from "../../_lib/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const profileId = requireText(body.profileId, "Profile");
    const pin = requireText(body.pin, "PIN", 12);
    const db = await ensureDatabase();
    const profile = await db
      .prepare("SELECT id, pin_salt, pin_hash FROM profiles WHERE id = ?")
      .bind(profileId)
      .first<{ id: string; pin_salt: string; pin_hash: string }>();
    if (!profile || (await hashPin(pin, profile.pin_salt)) !== profile.pin_hash) {
      return Response.json({ error: "That PIN doesn’t match this profile" }, { status: 401 });
    }

    const token = crypto.randomUUID() + crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    await db.prepare("INSERT INTO sessions (token, profile_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(token, profile.id, expiresAt, now)
      .run();
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": createSessionCookie(token, request) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
