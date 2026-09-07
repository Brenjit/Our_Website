import {
  closeActivitySession,
  getDatabase,
  getSessionUser,
  jsonError,
  unauthorized,
} from "../../_lib/server";

type AlarmAction = "stop" | "snooze";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionId = typeof body.actionId === "string" ? body.actionId.trim() : "";
    const activityId = typeof body.activityId === "string" ? body.activityId.trim() : "";
    const action = body.action === "stop" || body.action === "snooze" ? body.action as AlarmAction : null;
    if (!actionId || !activityId || !action) throw new Error("A valid alarm action is required");

    const db = getDatabase();
    const handled = await db.prepare("SELECT id FROM alarm_action_receipts WHERE id = ? AND profile_id = ?")
      .bind(actionId, user.id)
      .first<{ id: string }>();
    if (handled) return Response.json({ handled: true, duplicate: true, action });

    const activity = await db.prepare(`SELECT id FROM activity_sessions
      WHERE id = ? AND profile_id = ? AND status = 'active'`)
      .bind(activityId, user.id)
      .first<{ id: string }>();
    if (!activity) return Response.json({ handled: true, inactive: true, action });

    const now = new Date().toISOString();
    if (action === "snooze") {
      await db.batch([
        db.prepare(`UPDATE activity_sessions
          SET extension_seconds = MIN(extension_seconds + 300, 43200)
          WHERE id = ? AND profile_id = ? AND status = 'active'`)
          .bind(activityId, user.id),
        db.prepare(`INSERT INTO alarm_action_receipts
          (id, profile_id, activity_id, action, created_at) VALUES (?, ?, ?, 'snooze', ?)`)
          .bind(actionId, user.id, activityId, now),
      ]);
      return Response.json({ handled: true, action, addedSeconds: 300 });
    }

    const result = await closeActivitySession(db, activityId, user.id, now);
    await db.prepare(`INSERT INTO alarm_action_receipts
      (id, profile_id, activity_id, action, created_at) VALUES (?, ?, ?, 'stop', ?)`)
      .bind(actionId, user.id, activityId, now)
      .run();
    return Response.json({ handled: true, action, ...result });
  } catch (error) {
    return jsonError(error, "Couldn’t apply the alarm action");
  }
}
