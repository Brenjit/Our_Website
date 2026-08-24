import {
  ensureDatabase,
  getSessionUser,
  jsonError,
  calculateTaskPoints,
  categoryPointRate,
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
    const db = await ensureDatabase();
    const task = await db.prepare(`SELECT id, category FROM tasks
      WHERE id = ? AND owner_id = ? AND is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string; category: TaskCategory }>();
    if (!task) return Response.json({ error: "You can only finish your own routines" }, { status: 403 });
    const activity = await db.prepare(`SELECT id, started_at FROM activity_sessions
      WHERE task_id = ? AND profile_id = ? AND status = 'active'`)
      .bind(id, user.id)
      .first<{ id: string; started_at: string }>();
    if (!activity) return Response.json({ error: "This routine isn’t currently running" }, { status: 409 });
    const now = new Date().toISOString();
    const pauseResult = await db.prepare(`SELECT category, started_at, ended_at
      FROM activity_pauses WHERE activity_id = ? ORDER BY started_at`)
      .bind(activity.id)
      .all<{ category: TaskCategory; started_at: string; ended_at: string | null }>();
    const totalMinutes = Math.max(0.1, (Date.parse(now) - Date.parse(activity.started_at)) / 60000);
    const pauseMinutes = pauseResult.results.map((pause) => ({
      category: pause.category,
      minutes: Math.max(0, (Date.parse(pause.ended_at ?? now) - Date.parse(pause.started_at)) / 60000),
    }));
    const elapsedMinutes = Math.max(0.1, totalMinutes - pauseMinutes.reduce((sum, pause) => sum + pause.minutes, 0));
    const pausePoints = pauseMinutes.reduce((sum, pause) => sum + pause.minutes * categoryPointRate(pause.category), 0);
    const pointsEarned = Math.round((calculateTaskPoints(task.category, elapsedMinutes) + pausePoints) * 10) / 10;
    await db.batch([
      db.prepare("UPDATE activity_sessions SET status = 'finished', finished_at = ? WHERE id = ?")
        .bind(now, activity.id),
      db.prepare("UPDATE activity_pauses SET ended_at = ? WHERE activity_id = ? AND ended_at IS NULL")
        .bind(now, activity.id),
      db.prepare(`INSERT OR IGNORE INTO completions
        (id, task_id, profile_id, date_key, completed_at, points_earned)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, user.id, date, now, pointsEarned),
    ]);
    return Response.json({ completed: true, elapsedMinutes: Math.round(elapsedMinutes * 10) / 10, pointsEarned });
  } catch (error) {
    return jsonError(error);
  }
}
