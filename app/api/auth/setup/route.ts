import {
  createSessionCookie,
  ensureDatabase,
  hashPin,
  jsonError,
  requireText,
} from "../../_lib/server";

const starterTasks = [
  { title: "Morning reset", category: "Daily essentials", duration: 10, points: 15 },
  { title: "Drink 2L water", category: "Daily essentials", duration: 0, points: 5 },
  { title: "Focused work", category: "Productive", duration: 45, points: 95 },
  { title: "Read and learn", category: "Study", duration: 30, points: 65 },
  { title: "Evening tidy-up", category: "Daily essentials", duration: 15, points: 20 },
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const coupleName = requireText(body.coupleName, "Space name", 50);
    const firstName = requireText(body.firstName, "First name", 30);
    const secondName = requireText(body.secondName, "Second name", 30);
    const firstPin = requireText(body.firstPin, "First PIN", 12);
    const secondPin = requireText(body.secondPin, "Second PIN", 12);
    if (!/^\d{4,8}$/.test(firstPin) || !/^\d{4,8}$/.test(secondPin)) {
      throw new Error("Each PIN must be 4–8 digits");
    }

    const db = await ensureDatabase();
    const existing = await db.prepare("SELECT id FROM couples LIMIT 1").first();
    if (existing) return Response.json({ error: "This space is already set up" }, { status: 409 });

    const now = new Date().toISOString();
    const coupleId = crypto.randomUUID();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const firstSalt = crypto.randomUUID();
    const secondSalt = crypto.randomUUID();
    const sessionToken = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();

    const statements = [
      db.prepare("INSERT INTO couples (id, name, created_at) VALUES (?, ?, ?)").bind(coupleId, coupleName, now),
      db.prepare(`INSERT INTO profiles
        (id, couple_id, name, avatar, accent, pin_salt, pin_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(firstId, coupleId, firstName, firstName.slice(0, 1).toUpperCase(), "sage", firstSalt, await hashPin(firstPin, firstSalt), now),
      db.prepare(`INSERT INTO profiles
        (id, couple_id, name, avatar, accent, pin_salt, pin_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(secondId, coupleId, secondName, secondName.slice(0, 1).toUpperCase(), "coral", secondSalt, await hashPin(secondPin, secondSalt), now),
      db.prepare("INSERT INTO sessions (token, profile_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(sessionToken, firstId, expiresAt, now),
    ];

    for (const ownerId of [firstId, secondId]) {
      starterTasks.forEach((task, index) => {
        statements.push(
          db.prepare(`INSERT INTO tasks
            (id, owner_id, title, category, duration_minutes, points, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), ownerId, task.title, task.category, task.duration, task.points, index, now),
        );
      });
    }
    await db.batch(statements);
    return Response.json(
      { ok: true },
      { status: 201, headers: { "Set-Cookie": createSessionCookie(sessionToken, request) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
