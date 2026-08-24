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
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_tasks_owner_active").on(table.ownerId, table.isArchived)],
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
  (table) => [uniqueIndex("idx_completions_task_date").on(table.taskId, table.dateKey)],
);

export const activitySessions = sqliteTable(
  "activity_sessions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    profileId: text("profile_id").notNull(),
    dateKey: text("date_key").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status").notNull(),
  },
  (table) => [index("idx_activity_profile_status").on(table.profileId, table.status)],
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
