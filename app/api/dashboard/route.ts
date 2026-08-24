import {
  ensureDatabase,
  getSessionUser,
  unauthorized,
  validDateKey,
} from "../_lib/server";

type Profile = {
  id: string;
  name: string;
  avatar: string;
  accent: string;
};

type TaskRow = {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  duration_minutes: number;
  points: number;
  schedule_type: string;
  scheduled_date: string | null;
  scheduled_weekday: number | null;
  scheduled_time: string | null;
  animation_key: string;
  sort_order: number;
  completed_at: string | null;
  activity_id: string | null;
  started_at: string | null;
  pause_id: string | null;
  pause_category: string | null;
  pause_started_at: string | null;
  paused_seconds: number;
  pause_points: number;
};

type FocusSessionRow = {
  id: string;
  profile_id: string;
  category: string;
  started_at: string;
  finished_at: string | null;
};

type FocusPauseRow = {
  activity_id: string;
  profile_id: string;
  category: string;
  started_at: string;
  ended_at: string | null;
};

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const date = validDateKey(url.searchParams.get("date"));
  const from = validDateKey(url.searchParams.get("from"));
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const db = await ensureDatabase();

  const now = new Date().toISOString();
  const [profileResult, taskResult, scoreResult, activityResult, focusSessionResult, focusPauseResult] = await Promise.all([
    db.prepare("SELECT id, name, avatar, accent FROM profiles WHERE couple_id = ? ORDER BY created_at")
      .bind(user.couple_id)
      .all<Profile>(),
    db.prepare(`SELECT t.id, t.owner_id, t.title, t.category, t.duration_minutes, t.points,
        t.schedule_type, t.scheduled_date, t.scheduled_weekday, t.scheduled_time, t.animation_key, t.sort_order,
        c.completed_at,
        a.id AS activity_id, a.started_at,
        ap.id AS pause_id, ap.category AS pause_category, ap.started_at AS pause_started_at,
        COALESCE((SELECT SUM((julianday(closed_pause.ended_at) - julianday(closed_pause.started_at)) * 86400)
          FROM activity_pauses closed_pause
          WHERE closed_pause.activity_id = a.id AND closed_pause.ended_at IS NOT NULL), 0) AS paused_seconds,
        COALESCE((SELECT SUM(
          (julianday(closed_pause.ended_at) - julianday(closed_pause.started_at)) * 1440 *
          CASE closed_pause.category WHEN 'Entertainment' THEN -0.5 WHEN 'Daily essentials' THEN 1 ELSE 2 END
        ) FROM activity_pauses closed_pause
          WHERE closed_pause.activity_id = a.id AND closed_pause.ended_at IS NOT NULL), 0) AS pause_points
      FROM tasks t
      LEFT JOIN completions c ON c.task_id = t.id AND c.date_key = ?
      LEFT JOIN activity_sessions a ON a.task_id = t.id AND a.status = 'active'
      LEFT JOIN activity_pauses ap ON ap.activity_id = a.id AND ap.ended_at IS NULL
      WHERE t.is_archived = 0 AND t.owner_id IN (
        SELECT id FROM profiles WHERE couple_id = ?
      )
      AND (
        t.schedule_type = 'daily'
        OR (t.schedule_type = 'weekdays' AND ? BETWEEN 1 AND 5)
        OR (t.schedule_type = 'weekly' AND t.scheduled_weekday = ?)
        OR (t.schedule_type = 'once' AND t.scheduled_date = ?)
      )
      ORDER BY t.owner_id, t.sort_order, t.scheduled_time IS NULL, t.scheduled_time, t.created_at`)
      .bind(date, user.couple_id, weekday, weekday, date)
      .all<TaskRow>(),
    db.prepare(`SELECT p.id AS profile_id, COALESCE(SUM(c.points_earned), 0) AS score,
        COUNT(c.id) AS completed
      FROM profiles p
      LEFT JOIN completions c ON c.profile_id = p.id AND c.date_key BETWEEN ? AND ?
      WHERE p.couple_id = ?
      GROUP BY p.id`)
      .bind(from, date, user.couple_id)
      .all<{ profile_id: string; score: number; completed: number }>(),
    db.prepare(`SELECT c.id, c.completed_at, c.points_earned, c.profile_id,
        p.name AS profile_name, t.title AS task_title, t.category
      FROM completions c
      JOIN profiles p ON p.id = c.profile_id
      JOIN tasks t ON t.id = c.task_id
      WHERE p.couple_id = ?
      ORDER BY c.completed_at DESC LIMIT 12`)
      .bind(user.couple_id)
      .all(),
    db.prepare(`SELECT a.id, a.profile_id, t.category, a.started_at, a.finished_at
      FROM activity_sessions a
      JOIN tasks t ON t.id = a.task_id
      JOIN profiles p ON p.id = a.profile_id
      WHERE p.couple_id = ? AND a.date_key BETWEEN ? AND ? AND a.status IN ('active', 'finished')`)
      .bind(user.couple_id, from, date)
      .all<FocusSessionRow>(),
    db.prepare(`SELECT ap.activity_id, ap.profile_id, ap.category, ap.started_at, ap.ended_at
      FROM activity_pauses ap
      JOIN activity_sessions a ON a.id = ap.activity_id
      JOIN profiles p ON p.id = ap.profile_id
      WHERE p.couple_id = ? AND a.date_key BETWEEN ? AND ?`)
      .bind(user.couple_id, from, date)
      .all<FocusPauseRow>(),
  ]);

  const profiles = profileResult.results.map((profile) => {
    const tasks = taskResult.results.filter((task) => task.owner_id === profile.id);
    const score = scoreResult.results.find((entry) => entry.profile_id === profile.id);
    const focus = { study: 0, productive: 0 };
    for (const session of focusSessionResult.results.filter((entry) => entry.profile_id === profile.id)) {
      const sessionEnd = session.finished_at ?? now;
      const totalMinutes = Math.max(0, (Date.parse(sessionEnd) - Date.parse(session.started_at)) / 60000);
      const sessionPauses = focusPauseResult.results.filter((pause) => pause.activity_id === session.id);
      const pausedMinutes = sessionPauses.reduce(
        (sum, pause) => sum + Math.max(0, (Date.parse(pause.ended_at ?? now) - Date.parse(pause.started_at)) / 60000),
        0,
      );
      const activeMinutes = Math.max(0, totalMinutes - pausedMinutes);
      if (session.category === "Study") focus.study += activeMinutes;
      if (session.category === "Productive") focus.productive += activeMinutes;
    }
    for (const pause of focusPauseResult.results.filter((entry) => entry.profile_id === profile.id)) {
      const minutes = Math.max(0, (Date.parse(pause.ended_at ?? now) - Date.parse(pause.started_at)) / 60000);
      if (pause.category === "Study") focus.study += minutes;
      if (pause.category === "Productive") focus.productive += minutes;
    }
    const activeTask = tasks.find((task) => task.activity_id);
    return {
      ...profile,
      isCurrent: profile.id === user.id,
      score: Number(score?.score ?? 0),
      weeklyCompleted: Number(score?.completed ?? 0),
      focusMinutes: {
        study: Math.max(0, Math.round(focus.study * 10) / 10),
        productive: Math.max(0, Math.round(focus.productive * 10) / 10),
      },
      todayCompleted: tasks.filter((task) => task.completed_at).length,
      totalToday: tasks.length,
      busy: activeTask
        ? {
            taskId: activeTask.id,
            taskTitle: activeTask.title,
            category: activeTask.category,
            durationMinutes: activeTask.duration_minutes,
            startedAt: activeTask.started_at,
            currentPause: activeTask.pause_id
              ? { id: activeTask.pause_id, category: activeTask.pause_category, startedAt: activeTask.pause_started_at }
              : null,
          }
        : null,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        category: task.category,
        durationMinutes: task.duration_minutes,
        points: task.points,
        scheduleType: task.schedule_type,
        scheduledDate: task.scheduled_date,
        scheduledWeekday: task.scheduled_weekday,
        scheduledTime: task.scheduled_time,
        animationKey: task.animation_key,
        sortOrder: task.sort_order,
        completedAt: task.completed_at,
        activeSession: task.activity_id
          ? {
              id: task.activity_id,
              startedAt: task.started_at,
              pausedSeconds: Number(task.paused_seconds ?? 0),
              pausePoints: Number(task.pause_points ?? 0),
              currentPause: task.pause_id
                ? { id: task.pause_id, category: task.pause_category, startedAt: task.pause_started_at }
                : null,
            }
          : null,
      })),
    };
  });

  return Response.json({
    generatedAt: now,
    user: { id: user.id, name: user.name, avatar: user.avatar, accent: user.accent },
    isInitializer: profileResult.results[0]?.id === user.id,
    profiles,
    recentActivity: activityResult.results,
    date,
  });
}
