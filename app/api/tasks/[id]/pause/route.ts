import {
  ensureDatabase,
  getSessionUser,
  jsonError,
  requireTaskCategory,
  unauthorized,
} from "../../../_lib/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const pauseCategory = requireTaskCategory(body.category);
    const db = await ensureDatabase();
    const activity = await db.prepare(`SELECT a.id, t.category
      FROM activity_sessions a
      JOIN tasks t ON t.id = a.task_id
      WHERE a.task_id = ? AND a.profile_id = ? AND a.status = 'active'`)
      .bind(id, user.id)
      .first<{ id: string; category: string }>();
    if (!activity) return Response.json({ error: "This routine isn’t currently running" }, { status: 409 });
    if (pauseCategory === activity.category) {
      return Response.json({ error: "Choose one of the other three categories for this pause" }, { status: 400 });
    }
    const existing = await db.prepare("SELECT id FROM activity_pauses WHERE activity_id = ? AND ended_at IS NULL")
      .bind(activity.id)
      .first();
    if (existing) return Response.json({ error: "This routine is already paused" }, { status: 409 });
    const pause = { id: crypto.randomUUID(), category: pauseCategory, startedAt: new Date().toISOString() };
    await db.prepare(`INSERT INTO activity_pauses
      (id, activity_id, profile_id, category, started_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(pause.id, activity.id, user.id, pause.category, pause.startedAt)
      .run();
    return Response.json({ pause }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
