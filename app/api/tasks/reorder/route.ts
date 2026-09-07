import { getDatabase, getSessionUser, jsonError, unauthorized } from "../../_lib/server";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  try {
    const body = (await request.json()) as { orderedIds?: unknown };
    if (!Array.isArray(body.orderedIds) || body.orderedIds.length > 100) {
      throw new Error("Choose a valid task order");
    }
    const orderedIds = body.orderedIds.filter((id): id is string => typeof id === "string" && id.length > 0);
    if (orderedIds.length !== body.orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
      throw new Error("Choose a valid task order");
    }
    const db = getDatabase();
    const owned = orderedIds.length
      ? await db.prepare(`SELECT id FROM tasks WHERE owner_id = ? AND is_archived = 0
          AND id IN (${orderedIds.map(() => "?").join(",")})`)
        .bind(user.id, ...orderedIds)
        .all<{ id: string }>()
      : { results: [] as Array<{ id: string }> };
    if (owned.results.length !== orderedIds.length) {
      return Response.json({ error: "You can only reorder your own tasks" }, { status: 403 });
    }
    if (orderedIds.length) {
      await db.batch(orderedIds.map((id, index) => db.prepare(
        "UPDATE tasks SET sort_order = ? WHERE id = ? AND owner_id = ? AND is_archived = 0",
      ).bind(index, id, user.id)));
    }
    return Response.json({ reordered: true });
  } catch (error) {
    return jsonError(error);
  }
}
