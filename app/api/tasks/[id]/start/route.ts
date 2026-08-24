import {
  ensureDatabase,
  getSessionUser,
  jsonError,
  unauthorized,
  validDateKey,
} from "../../../_lib/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const date = validDateKey(body.date);
    const db = await ensureDatabase();
    const task = await db.prepare(`SELECT id, duration_minutes FROM tasks
      WHERE id = ? AND owner_id = ? AND is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string; duration_minutes: number }>();
    if (!task) return Response.json({ error: "You can only start your own routines" }, { status: 403 });
    if (task.duration_minutes <= 0) {
      return Response.json({ error: "This routine has no countdown and can be checked off directly" }, { status: 409 });
    }
    const existing = await db.prepare("SELECT id FROM activity_sessions WHERE profile_id = ? AND status = 'active'")
      .bind(user.id)
      .first();
    if (existing) return Response.json({ error: "Finish your current activity before starting another" }, { status: 409 });
    const session = { id: crypto.randomUUID(), startedAt: new Date().toISOString() };
    await db.prepare(`INSERT INTO activity_sessions
      (id, task_id, profile_id, date_key, started_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')`)
      .bind(session.id, id, user.id, date, session.startedAt)
      .run();
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
