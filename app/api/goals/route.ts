import { getDatabase, getSessionUser, jsonError, requireText, unauthorized, validDateKey } from "../_lib/server";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const url = new URL(request.url);
    const dateKey = validDateKey(url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
    const db = getDatabase();

    // Fetch all goals for this profile
    const goalsResult = await db
      .prepare("SELECT id, title, target_minutes, created_at FROM goals WHERE profile_id = ? ORDER BY created_at ASC")
      .bind(user.id)
      .all<{ id: string; title: string; target_minutes: number; created_at: string }>();

    const goals = goalsResult.results;
    if (!goals.length) return Response.json({ goals: [] });

    // Today's elapsed seconds per goal (via tasks linked to these goals)
    const todayProgress = await db
      .prepare(`
        SELECT t.goal_id, COALESCE(SUM(tp.elapsed_seconds), 0) AS total_seconds
        FROM task_progress tp
        JOIN tasks t ON t.id = tp.task_id
        WHERE tp.profile_id = ? AND tp.date_key = ? AND t.goal_id IS NOT NULL
        GROUP BY t.goal_id
      `)
      .bind(user.id, dateKey)
      .all<{ goal_id: string; total_seconds: number }>();

    const todayMap = new Map(todayProgress.results.map((r) => [r.goal_id, r.total_seconds]));

    // Heatmap: last 56 days of daily minutes per goal
    const heatmapFrom = new Date(`${dateKey}T12:00:00Z`);
    heatmapFrom.setUTCDate(heatmapFrom.getUTCDate() - 55);
    const heatmapFromKey = heatmapFrom.toISOString().slice(0, 10);

    const heatmapResult = await db
      .prepare(`
        SELECT t.goal_id, tp.date_key, COALESCE(SUM(tp.elapsed_seconds), 0) AS total_seconds
        FROM task_progress tp
        JOIN tasks t ON t.id = tp.task_id
        WHERE tp.profile_id = ? AND tp.date_key >= ? AND t.goal_id IS NOT NULL
        GROUP BY t.goal_id, tp.date_key
      `)
      .bind(user.id, heatmapFromKey)
      .all<{ goal_id: string; date_key: string; total_seconds: number }>();

    // Build heatmap map: goalId -> { dateKey -> minutes }
    const heatmapMap = new Map<string, Map<string, number>>();
    for (const row of heatmapResult.results) {
      if (!heatmapMap.has(row.goal_id)) heatmapMap.set(row.goal_id, new Map());
      heatmapMap.get(row.goal_id)!.set(row.date_key, Math.round(row.total_seconds / 60));
    }

    // Build date range (56 days)
    const dateRange: string[] = [];
    for (let i = 55; i >= 0; i--) {
      const d = new Date(`${dateKey}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      dateRange.push(d.toISOString().slice(0, 10));
    }

    const enriched = goals.map((goal) => {
      const todayMinutes = Math.round((todayMap.get(goal.id) ?? 0) / 60);
      const dayMap = heatmapMap.get(goal.id) ?? new Map<string, number>();
      const heatmap = dateRange.map((date) => ({ date, minutes: dayMap.get(date) ?? 0 }));
      return {
        id: goal.id,
        title: goal.title,
        targetMinutes: goal.target_minutes,
        todayMinutes,
        heatmap,
      };
    });

    return Response.json({ goals: enriched });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = requireText(body.title, "Goal name", 80);
    const targetMinutes = Math.max(1, Math.min(1440, Number(body.targetMinutes) || 60));
    const db = getDatabase();
    const goal = {
      id: crypto.randomUUID(),
      profileId: user.id,
      title,
      targetMinutes,
      createdAt: new Date().toISOString(),
    };
    await db
      .prepare("INSERT INTO goals (id, profile_id, title, target_minutes, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(goal.id, goal.profileId, goal.title, goal.targetMinutes, goal.createdAt)
      .run();
    return Response.json({ goal: { id: goal.id, title: goal.title, targetMinutes: goal.targetMinutes, todayMinutes: 0, heatmap: [] } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const url = new URL(request.url);
    const goalId = url.searchParams.get("id");
    if (!goalId) throw new Error("Goal id is required");
    const db = getDatabase();
    // Verify ownership
    const goal = await db
      .prepare("SELECT id FROM goals WHERE id = ? AND profile_id = ?")
      .bind(goalId, user.id)
      .first<{ id: string }>();
    if (!goal) throw new Error("Goal not found");
    await db.batch([
      // Unlink tasks from this goal
      db.prepare("UPDATE tasks SET goal_id = NULL WHERE goal_id = ? AND owner_id = ?").bind(goalId, user.id),
      db.prepare("DELETE FROM goals WHERE id = ? AND profile_id = ?").bind(goalId, user.id),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
