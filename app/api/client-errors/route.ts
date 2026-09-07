import { getSessionUser, unauthorized } from "../_lib/server";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const report = {
    profileId: user.id,
    message: typeof body.message === "string" ? body.message.slice(0, 500) : "Unknown client error",
    stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : "",
    digest: typeof body.digest === "string" ? body.digest.slice(0, 200) : "",
    path: typeof body.path === "string" ? body.path.slice(0, 500) : "",
  };
  console.error(JSON.stringify({ type: "client-render-error", ...report }));
  return Response.json({ received: true });
}
