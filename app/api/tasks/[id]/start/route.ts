import {
  closeActivitySession,
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
    const task = await db.prepare(`SELECT t.id, t.duration_minutes,
        EXISTS(SELECT 1 FROM completions c WHERE c.task_id = t.id AND c.date_key = ?) AS is_complete
      FROM tasks t
      WHERE id = ? AND owner_id = ? AND is_archived = 0`)
      .bind(date, id, user.id)
      .first<{ id: string; duration_minutes: number; is_complete: number }>();
    if (!task) return Response.json({ error: "You can only start your own routines" }, { status: 403 });
    if (task.duration_minutes <= 0) {
      return Response.json({ error: "This routine has no countdown and can be checked off directly" }, { status: 409 });
    }
    if (task.is_complete) {
      return Response.json({ error: "This routine is already complete for today" }, { status: 409 });
    }
    const existing = await db.prepare("SELECT id, task_id FROM activity_sessions WHERE profile_id = ? AND status = 'active'")
      .bind(user.id)
      .first<{ id: string; task_id: string }>();
    if (existing?.task_id === id) return Response.json({ error: "This routine is already running" }, { status: 409 });
    const switchedFrom = existing ? await closeActivitySession(db, existing.id, user.id) : null;
    const session = { id: crypto.randomUUID(), startedAt: new Date().toISOString() };
    await db.prepare(`INSERT INTO activity_sessions
      (id, task_id, profile_id, date_key, started_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')`)
      .bind(session.id, id, user.id, date, session.startedAt)
      .run();
    return Response.json({ session, switchedFrom }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
