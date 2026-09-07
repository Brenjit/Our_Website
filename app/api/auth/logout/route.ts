import { clearSessionCookie, getDatabase, getSessionUser } from "../../_lib/server";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (user) {
    const db = getDatabase();
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(user.token).run();
  }
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(request) } },
  );
}
