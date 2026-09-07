import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const couples = sqliteTable("couples", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  coupleId: text("couple_id").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  accent: text("accent").notNull(),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    profileId: text("profile_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_sessions_profile").on(table.profileId)],
);

export const loginRateLimits = sqliteTable(
  "login_rate_limits",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    clientKey: text("client_key").notNull(),
    failureCount: integer("failure_count").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
    blockedUntil: text("blocked_until"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_login_rate_limits_profile_client").on(table.profileId, table.clientKey),
    index("idx_login_rate_limits_updated").on(table.updatedAt),
  ],
);

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    title: text("title").notNull(),
    targetMinutes: integer("target_minutes").notNull().default(60),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_goals_profile").on(table.profileId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    points: real("points").notNull().default(5),
    scheduleType: text("schedule_type").notNull().default("daily"),
    scheduledDate: text("scheduled_date"),
    scheduledWeekday: integer("scheduled_weekday"),
    scheduledTime: text("scheduled_time"),
    animationKey: text("animation_key").notNull().default("auto"),
    sortOrder: integer("sort_order").notNull().default(0),
    goalId: text("goal_id"),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_tasks_owner_active").on(table.ownerId, table.isArchived),
    index("idx_tasks_reminder_schedule").on(table.isArchived, table.scheduledTime),
  ],
);

export const completions = sqliteTable(
  "completions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    profileId: text("profile_id").notNull(),
    dateKey: text("date_key").notNull(),
    completedAt: text("completed_at").notNull(),
    pointsEarned: real("points_earned").notNull(),
  },
  (table) => [
    uniqueIndex("idx_completions_task_date").on(table.taskId, table.dateKey),
    index("idx_completions_profile_date").on(table.profileId, table.dateKey),
  ],
);

export const activitySessions = sqliteTable(
  "activity_sessions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    profileId: text("profile_id").notNull(),
    dateKey: text("date_key").notNull(),
    startedAt: text("started_at").notNull(),
    extensionSeconds: integer("extension_seconds").notNull().default(0),
    finishedAt: text("finished_at"),
    status: text("status").notNull(),
  },
  (table) => [
    index("idx_activity_profile_status").on(table.profileId, table.status),
    index("idx_activity_task_status").on(table.taskId, table.status),
    index("idx_activity_profile_date_status").on(table.profileId, table.dateKey, table.status),
  ],
);

export const alarmActionReceipts = sqliteTable(
  "alarm_action_receipts",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    activityId: text("activity_id").notNull(),
    action: text("action").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_alarm_action_profile").on(table.profileId, table.createdAt)],
);

export const activityPauses = sqliteTable(
  "activity_pauses",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id").notNull(),
    profileId: text("profile_id").notNull(),
    category: text("category").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
  },
  (table) => [index("idx_pauses_activity_open").on(table.activityId, table.endedAt)],
);

export const taskProgress = sqliteTable(
  "task_progress",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    profileId: text("profile_id").notNull(),
    dateKey: text("date_key").notNull(),
    elapsedSeconds: real("elapsed_seconds").notNull().default(0),
    pointsEarned: real("points_earned").notNull().default(0),
    completionBonusAwarded: integer("completion_bonus_awarded", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_task_progress_task_date").on(table.taskId, table.dateKey),
    index("idx_task_progress_profile_date").on(table.profileId, table.dateKey),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_push_subscriptions_endpoint").on(table.endpoint),
    index("idx_push_subscriptions_profile").on(table.profileId),
  ],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull(),
    eventKey: text("event_key").notNull(),
    status: text("status").notNull().default("pending"),
    attemptedAt: text("attempted_at").notNull(),
    deliveredAt: text("delivered_at"),
  },
  (table) => [
    uniqueIndex("idx_notification_deliveries_subscription_event").on(table.subscriptionId, table.eventKey),
    index("idx_notification_deliveries_attempted").on(table.attemptedAt),
    index("idx_notification_deliveries_status_attempted").on(table.status, table.attemptedAt),
  ],
);
