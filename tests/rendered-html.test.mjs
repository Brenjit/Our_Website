import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function render() {
  const worker = await loadWorker();
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey("raw", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  return {
    publicKey: Buffer.from(publicKey).toString("base64url"),
    privateKey: privateKey.d,
  };
}

test("server-renders the finished Twogether shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Twogether/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"[^>]+\/icons\/apple-touch-icon\.png/);
  assert.match(html, /\/icons\/icon-192\.png/);
  assert.match(html, /Preparing your shared day/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("built worker exposes the scheduled notification handler", async () => {
  const worker = await loadWorker();
  assert.equal(typeof worker.scheduled, "function");
});

test("scheduled notification check completes safely with no subscriptions", async () => {
  const worker = await loadWorker();
  const statements = [];
  const database = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() { return this; },
        async all() { return { results: [] }; },
        async run() { return { meta: { changes: 0 } }; },
      };
    },
  };
  await worker.scheduled(
    { scheduledTime: Date.UTC(2026, 8, 5, 12), cron: "* * * * *", noRetry() {} },
    {
      DB: database,
      VAPID_PUBLIC_KEY: "configured",
      VAPID_PRIVATE_KEY: "configured",
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.ok(statements.some((sql) => sql.includes("FROM push_subscriptions")));
  assert.ok(statements.some((sql) => sql.includes("FROM tasks")));
  assert.ok(statements.some((sql) => sql.includes("FROM activity_sessions")));
});

test("scheduled handler sends both planned-task and finished-timer pushes", async () => {
  const worker = await loadWorker();
  const vapid = await generateVapidKeys();
  const deviceKey = createECDH("prime256v1");
  deviceKey.generateKeys();
  const subscription = {
    id: "subscription-1",
    profile_id: "profile-1",
    endpoint: "https://push.example.test/device",
    p256dh: deviceKey.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    timezone: "UTC",
  };
  const deliveredEvents = [];
  const database = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (sql.includes("WITH timer_rows")) return { results: [
            { kind: "subscription", ...subscription },
            { kind: "task",
            id: "planned-task",
            owner_id: "profile-1",
            title: "Read together",
            category: "Study",
            duration_minutes: 30,
            schedule_type: "once",
            scheduled_date: "2026-09-05",
            scheduled_weekday: null,
            scheduled_time: "12:00",
            },
            { kind: "timer",
            id: "timer-session",
            profile_id: "profile-1",
            task_id: "active-task",
            task_title: "Deep work",
            date_key: "2026-09-05",
            started_at: "2026-09-05T11:58:00.000Z",
            duration_minutes: 1,
            progress_seconds: 0,
            paused_seconds: 0,
            has_open_pause: 0,
            },
          ] };
          return { results: [] };
        },
        async first() { return null; },
        async run() {
          if (sql.includes("INSERT INTO notification_deliveries")) deliveredEvents.push(this.values[2]);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  const originalFetch = globalThis.fetch;
  const pushRequests = [];
  globalThis.fetch = async (input, init) => {
    pushRequests.push({ input: String(input), init });
    return new Response(null, { status: 201 });
  };
  try {
    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 8, 5, 12), cron: "* * * * *", noRetry() {} },
      {
        DB: database,
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:test@example.com",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(pushRequests.length, 2);
  assert.deepEqual(deliveredEvents.sort(), [
    "plan:planned-task:2026-09-05:12:00",
    "timer:timer-session",
  ]);
  assert.ok(pushRequests.every(({ input, init }) => input === subscription.endpoint && init.method.toUpperCase() === "POST"));
});

test("scheduled handler delivers a queued closed-app notification test", async () => {
  const worker = await loadWorker();
  const vapid = await generateVapidKeys();
  const deviceKey = createECDH("prime256v1");
  deviceKey.generateKeys();
  const job = {
    id: "subscription-1",
    profile_id: "profile-1",
    endpoint: "https://push.example.test/device",
    p256dh: deviceKey.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    timezone: "UTC",
    event_key: "background-test:test-1",
  };
  const updates = [];
  const database = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (sql.includes("WITH timer_rows")) return { results: [{ kind: "queued", ...job }] };
          return { results: [] };
        },
        async run() {
          if (sql.includes("UPDATE notification_deliveries")) updates.push(sql);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  const originalFetch = globalThis.fetch;
  const pushRequests = [];
  globalThis.fetch = async (input, init) => {
    pushRequests.push({ input: String(input), init });
    return new Response(null, { status: 201 });
  };
  try {
    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 8, 5, 12), cron: "* * * * *", noRetry() {} },
      {
        DB: database,
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:test@example.com",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(pushRequests.length, 1);
  assert.equal(pushRequests[0].input, job.endpoint);
  assert.ok(updates.some((sql) => sql.includes("status = 'pending'")));
  assert.ok(updates.some((sql) => sql.includes("status = 'delivered'")));
});
