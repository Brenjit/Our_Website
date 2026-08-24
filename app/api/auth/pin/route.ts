import {
  ensureDatabase,
  getSessionUser,
  hashPin,
  jsonError,
  requireText,
  unauthorized,
} from "../../_lib/server";

function requirePin(value: unknown, label: string) {
  const pin = requireText(value, label, 12);
  if (!/^\d{4,8}$/.test(pin)) throw new Error(`${label} must be 4–8 digits`);
  return pin;
}

export async function PATCH(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const currentPin = requirePin(body.currentPin, "Current PIN");
    const newPin = requirePin(body.newPin, "New PIN");
    if (currentPin === newPin) throw new Error("Choose a PIN different from your current PIN");

    const db = await ensureDatabase();
    const profile = await db
      .prepare("SELECT pin_salt, pin_hash FROM profiles WHERE id = ?")
      .bind(user.id)
      .first<{ pin_salt: string; pin_hash: string }>();
    if (!profile || (await hashPin(currentPin, profile.pin_salt)) !== profile.pin_hash) {
      return Response.json({ error: "Your current PIN doesn’t match" }, { status: 401 });
    }

    const salt = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE profiles SET pin_salt = ?, pin_hash = ? WHERE id = ?")
        .bind(salt, await hashPin(newPin, salt), user.id),
      db.prepare("DELETE FROM sessions WHERE profile_id = ? AND token <> ?")
        .bind(user.id, user.token),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Couldn’t change your PIN");
  }
}
