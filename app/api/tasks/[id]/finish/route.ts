import {
  closeActivitySession,
  getDatabase,
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
    validDateKey(body.date);
    const db = getDatabase();
    const task = await db.prepare(`SELECT id FROM tasks
      WHERE id = ? AND owner_id = ? AND is_archived = 0`)
      .bind(id, user.id)
      .first<{ id: string }>();
    if (!task) return Response.json({ error: "You can only finish your own routines" }, { status: 403 });
    const activity = await db.prepare(`SELECT id FROM activity_sessions
      WHERE task_id = ? AND profile_id = ? AND status = 'active'`)
      .bind(id, user.id)
      .first<{ id: string }>();
    if (!activity) return Response.json({ error: "This routine isn’t currently running" }, { status: 409 });
    const result = await closeActivitySession(db, activity.id, user.id);
    if (result.taskId !== id) throw new Error("The active routine changed. Please refresh and try again.");
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
