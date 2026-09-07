import {
  getDatabase,
  getSessionUser,
  jsonError,
  calculateTaskPoints,
  requireText,
  requireTaskCategory,
  requireTaskAnimation,
  requireTaskSchedule,
  unauthorized,
  validDateKey,
  validScheduledTime,
} from "../_lib/server";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireText(body.title, "Task name", 80);
    const category = requireTaskCategory(body.category);
    const duration = Math.max(0, Math.min(240, Number(body.durationMinutes) || 0));
    const points = duration > 0 ? calculateTaskPoints(category, duration) : calculateTaskPoints(category);
    const scheduleType = requireTaskSchedule(body.scheduleType);
    const scheduledDate = validDateKey(body.dateKey);
    const scheduledWeekday = new Date(`${scheduledDate}T12:00:00Z`).getUTCDay();
    const scheduledTime = validScheduledTime(body.scheduledTime);
    const animationKey = requireTaskAnimation(body.animationKey, title, category, user.name);
    const goalId = typeof body.goalId === "string" && body.goalId ? body.goalId : null;
    const db = getDatabase();
    // Validate goal ownership if provided
    if (goalId) {
      const goal = await db.prepare("SELECT id FROM goals WHERE id = ? AND profile_id = ?")
        .bind(goalId, user.id)
        .first<{ id: string }>();
      if (!goal) throw new Error("Goal not found");
    }
    const order = await db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE owner_id = ?")
      .bind(user.id)
      .first<{ next_order: number }>();
    const task = {
      id: crypto.randomUUID(),
      ownerId: user.id,
      title,
      category,
      durationMinutes: duration,
      points,
      scheduleType,
      scheduledDate: scheduleType === "once" ? scheduledDate : null,
      scheduledWeekday: scheduleType === "weekly" ? scheduledWeekday : null,
      scheduledTime,
      animationKey,
      goalId,
      sortOrder: Number(order?.next_order ?? 0),
      createdAt: new Date().toISOString(),
    };
    await db.prepare(`INSERT INTO tasks
      (id, owner_id, title, category, duration_minutes, points, schedule_type, scheduled_date, scheduled_weekday, scheduled_time, animation_key, goal_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(task.id, task.ownerId, task.title, task.category, task.durationMinutes, task.points, task.scheduleType, task.scheduledDate, task.scheduledWeekday, task.scheduledTime, task.animationKey, task.goalId, task.sortOrder, task.createdAt)
      .run();
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const db = getDatabase();
    const running = await db.prepare(`SELECT a.id FROM activity_sessions a
      JOIN tasks t ON t.id = a.task_id
      WHERE a.profile_id = ? AND t.owner_id = ? AND a.status = 'active' LIMIT 1`)
      .bind(user.id, user.id)
      .first<{ id: string }>();
    if (running) return Response.json({ error: "Finish your running session before clearing your tasks" }, { status: 409 });
    await db.batch([
      db.prepare(`DELETE FROM activity_pauses WHERE activity_id IN (
        SELECT a.id FROM activity_sessions a JOIN tasks t ON t.id = a.task_id
        WHERE t.owner_id = ?
      )`).bind(user.id),
      db.prepare(`DELETE FROM activity_sessions WHERE task_id IN (
        SELECT id FROM tasks WHERE owner_id = ?
      )`).bind(user.id),
      db.prepare(`DELETE FROM completions WHERE task_id IN (
        SELECT id FROM tasks WHERE owner_id = ?
      )`).bind(user.id),
      db.prepare(`DELETE FROM task_progress WHERE task_id IN (
        SELECT id FROM tasks WHERE owner_id = ?
      )`).bind(user.id),
      db.prepare("UPDATE tasks SET is_archived = 1 WHERE owner_id = ? AND is_archived = 0").bind(user.id),
    ]);
    return Response.json({ cleared: true });
  } catch (error) {
    return jsonError(error);
  }
}
