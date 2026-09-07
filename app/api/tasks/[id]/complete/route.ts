import {
  getDatabase,
  getSessionUser,
  jsonError,
  calculateTaskPoints,
  type TaskCategory,
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
    const db = getDatabase();
    const task = await db.prepare(`SELECT id, category, duration_minutes FROM tasks
      WHERE id = ? AND owner_id = ? AND is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string; category: TaskCategory; duration_minutes: number }>();
    if (!task) return Response.json({ error: "You can only update your own routines" }, { status: 403 });
    if (task.duration_minutes > 0) {
      return Response.json({ error: "Start this timed routine, then finish it to check it off" }, { status: 409 });
    }
    const existing = await db.prepare("SELECT id FROM completions WHERE task_id = ? AND date_key = ?")
      .bind(id, date)
      .first<{ id: string }>();
    if (existing) {
      await db.prepare("DELETE FROM completions WHERE id = ? AND profile_id = ?")
        .bind(existing.id, user.id)
        .run();
      return Response.json({ completed: false });
    }
    await db.prepare(`INSERT INTO completions
      (id, task_id, profile_id, date_key, completed_at, points_earned)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, user.id, date, new Date().toISOString(), calculateTaskPoints(task.category))
      .run();
    return Response.json({ completed: true });
  } catch (error) {
    return jsonError(error);
  }
}
