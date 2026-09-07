import {
  getDatabase,
  getSessionUser,
  hashPin,
  jsonError,
  requireText,
  unauthorized,
} from "../../../_lib/server";

function requirePin(value: unknown) {
  const pin = requireText(value, "New PIN", 12);
  if (!/^\d{4,8}$/.test(pin)) throw new Error("New PIN must be 4–8 digits");
  return pin;
}

export async function PATCH(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const profileId = requireText(body.profileId, "Profile");
    const newPin = requirePin(body.newPin);
    const db = getDatabase();

    const initializer = await db
      .prepare("SELECT id FROM profiles WHERE couple_id = ? ORDER BY created_at, id LIMIT 1")
      .bind(user.couple_id)
      .first<{ id: string }>();
    if (!initializer || initializer.id !== user.id) {
      return Response.json({ error: "Only the person who created this space can reset the other profile’s PIN" }, { status: 403 });
    }
    if (profileId === user.id) {
      return Response.json({ error: "Use Change my PIN for your own profile" }, { status: 400 });
    }

    const target = await db
      .prepare("SELECT id FROM profiles WHERE id = ? AND couple_id = ?")
      .bind(profileId, user.couple_id)
      .first<{ id: string }>();
    if (!target) return Response.json({ error: "That partner profile was not found" }, { status: 404 });

    const salt = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE profiles SET pin_salt = ?, pin_hash = ? WHERE id = ?")
        .bind(salt, await hashPin(newPin, salt), target.id),
      db.prepare("DELETE FROM sessions WHERE profile_id = ?").bind(target.id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Couldn’t reset that PIN");
  }
}
