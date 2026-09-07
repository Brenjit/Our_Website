import {
  getDatabase,
  getSessionUser,
  jsonError,
  unauthorized,
} from "../../../_lib/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const { id } = await context.params;
    const db = getDatabase();
    const pause = await db.prepare(`SELECT ap.id
      FROM activity_pauses ap
      JOIN activity_sessions a ON a.id = ap.activity_id
      WHERE a.task_id = ? AND a.profile_id = ? AND a.status = 'active' AND ap.ended_at IS NULL`)
      .bind(id, user.id)
      .first<{ id: string }>();
    if (!pause) return Response.json({ error: "This routine isn’t paused" }, { status: 409 });
    await db.prepare("UPDATE activity_pauses SET ended_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), pause.id)
      .run();
    return Response.json({ resumed: true });
  } catch (error) {
    return jsonError(error);
  }
}
