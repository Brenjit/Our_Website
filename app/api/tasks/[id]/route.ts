import {
  calculateTaskPoints,
  getDatabase,
  getSessionUser,
  jsonError,
  requireTaskCategory,
  requireTaskAnimation,
  requireTaskSchedule,
  requireText,
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
    const task = await db.prepare(`SELECT t.id, t.category, t.duration_minutes,
        EXISTS(SELECT 1 FROM activity_sessions a WHERE a.task_id = t.id AND a.status = 'active') AS is_running
      FROM tasks t WHERE t.id = ? AND t.owner_id = ? AND t.is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string; category: string; duration_minutes: number; is_running: number }>();
    if (!task) return Response.json({ error: "You can only edit your own tasks" }, { status: 403 });
    if (task.is_running) return Response.json({ error: "Finish the running session before rescheduling this task" }, { status: 409 });

    const [progress, completion] = await Promise.all([
      db.prepare(`SELECT id, elapsed_seconds, points_earned FROM task_progress
        WHERE task_id = ? AND profile_id = ? AND date_key = ?`)
        .bind(id, user.id, dateKey)
        .first<{ id: string; elapsed_seconds: number; points_earned: number }>(),
      db.prepare(`SELECT id, points_earned FROM completions
        WHERE task_id = ? AND profile_id = ? AND date_key = ?`)
        .bind(id, user.id, dateKey)
        .first<{ id: string; points_earned: number }>(),
    ]);
    const recordedSeconds = progress
      ? Number(progress.elapsed_seconds)
      : completion ? Math.max(0, task.duration_minutes * 60) : 0;
    const reopened = Boolean(completion && durationMinutes > 0 && durationMinutes * 60 > recordedSeconds);
    const previousBonus = task.category === "Entertainment" ? 0 : 5;
    const now = new Date().toISOString();
    const statements = [db.prepare(`UPDATE tasks SET
        title = ?, category = ?, duration_minutes = ?, points = ?, schedule_type = ?,
        scheduled_date = ?, scheduled_weekday = ?, scheduled_time = ?, animation_key = ?, goal_id = ?
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
        animationKey,
        goalId,
        id,
        user.id,
      )];
    if (reopened && completion) {
      statements.push(db.prepare("DELETE FROM completions WHERE id = ?").bind(completion.id));
      if (progress) {
        statements.push(db.prepare(`UPDATE task_progress SET points_earned = ?,
            completion_bonus_awarded = 0, updated_at = ? WHERE id = ?`)
          .bind(Math.round((Number(progress.points_earned) - previousBonus) * 10) / 10, now, progress.id));
      } else {
        statements.push(db.prepare(`INSERT INTO task_progress
            (id, task_id, profile_id, date_key, elapsed_seconds, points_earned, completion_bonus_awarded, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
          .bind(
            crypto.randomUUID(),
            id,
            user.id,
            dateKey,
            recordedSeconds,
            Math.round((Number(completion.points_earned) - previousBonus) * 10) / 10,
            now,
          ));
      }
    }
    await db.batch(statements);
    return Response.json({ updated: true, reopened, recordedSeconds });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const { id } = await context.params;
    const db = getDatabase();
    const task = await db.prepare(`SELECT t.id,
        EXISTS(SELECT 1 FROM activity_sessions a WHERE a.task_id = t.id AND a.status = 'active') AS is_running
      FROM tasks t WHERE t.id = ? AND t.owner_id = ? AND t.is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string; is_running: number }>();
    if (!task) return Response.json({ error: "You can only delete your own tasks" }, { status: 403 });
    if (task.is_running) return Response.json({ error: "Finish the running session before deleting this task" }, { status: 409 });
    await db.batch([
      db.prepare(`DELETE FROM activity_pauses WHERE activity_id IN (
        SELECT id FROM activity_sessions WHERE task_id = ? AND profile_id = ?
      )`).bind(id, user.id),
      db.prepare("DELETE FROM activity_sessions WHERE task_id = ? AND profile_id = ?").bind(id, user.id),
      db.prepare("DELETE FROM completions WHERE task_id = ? AND profile_id = ?").bind(id, user.id),
      db.prepare("DELETE FROM task_progress WHERE task_id = ? AND profile_id = ?").bind(id, user.id),
      db.prepare("UPDATE tasks SET is_archived = 1 WHERE id = ? AND owner_id = ?").bind(id, user.id),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
