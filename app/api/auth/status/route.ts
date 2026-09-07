import { getDatabase, getSessionUser } from "../../_lib/server";

export async function GET(request: Request) {
  const db = getDatabase();
  const couple = await db.prepare("SELECT id, name FROM couples LIMIT 1").first<{ id: string; name: string }>();
  if (!couple) return Response.json({ configured: false, user: null, profiles: [] });

  const profiles = await db
    .prepare("SELECT id, name, avatar, accent FROM profiles WHERE couple_id = ? ORDER BY created_at")
    .bind(couple.id)
    .all();
  const user = await getSessionUser(request);
  return Response.json({ configured: true, couple, profiles: profiles.results, user });
}
