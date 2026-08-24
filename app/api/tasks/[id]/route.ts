import {
  calculateTaskPoints,
  ensureDatabase,
  getSessionUser,
  jsonError,
  requireTaskCategory,
  requireTaskSchedule,
  requireText,
  suggestTaskAnimation,
  unauthorized,
  validDateKey,
  validScheduledTime,
} from "../../_lib/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireText(body.title, "Task name", 80);
    const category = requireTaskCategory(body.category);
    const durationMinutes = Math.max(0, Math.min(240, Number(body.durationMinutes) || 0));
    const scheduleType = requireTaskSchedule(body.scheduleType);
    const dateKey = validDateKey(body.dateKey);
    const scheduledTime = validScheduledTime(body.scheduledTime);
    const scheduledWeekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
    const points = durationMinutes > 0
      ? calculateTaskPoints(category, durationMinutes)
      : calculateTaskPoints(category);
    const db = await ensureDatabase();
    const task = await db.prepare(`SELECT t.id,
        EXISTS(SELECT 1 FROM activity_sessions a WHERE a.task_id = t.id AND a.status = 'active') AS is_running
      FROM tasks t WHERE t.id = ? AND t.owner_id = ? AND t.is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string; is_running: number }>();
    if (!task) return Response.json({ error: "You can only edit your own tasks" }, { status: 403 });
    if (task.is_running) return Response.json({ error: "Finish the running session before rescheduling this task" }, { status: 409 });

    await db.prepare(`UPDATE tasks SET
        title = ?, category = ?, duration_minutes = ?, points = ?, schedule_type = ?,
        scheduled_date = ?, scheduled_weekday = ?, scheduled_time = ?, animation_key = ?
      WHERE id = ? AND owner_id = ?`)
      .bind(
        title,
        category,
        durationMinutes,
        points,
        scheduleType,
        scheduleType === "once" ? dateKey : null,
        scheduleType === "weekly" ? scheduledWeekday : null,
        scheduledTime,
        suggestTaskAnimation(title, category),
        id,
        user.id,
      )
      .run();
    return Response.json({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
