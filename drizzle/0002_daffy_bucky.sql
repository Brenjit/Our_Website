PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`date_key` text NOT NULL,
	`completed_at` text NOT NULL,
	`points_earned` real NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_completions`("id", "task_id", "profile_id", "date_key", "completed_at", "points_earned") SELECT "id", "task_id", "profile_id", "date_key", "completed_at", "points_earned" FROM `completions`;--> statement-breakpoint
DROP TABLE `completions`;--> statement-breakpoint
ALTER TABLE `__new_completions` RENAME TO `completions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_completions_task_date` ON `completions` (`task_id`,`date_key`);--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`points` real DEFAULT 5 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "owner_id", "title", "category", "duration_minutes", "points", "sort_order", "is_archived", "created_at") SELECT "id", "owner_id", "title", "category", "duration_minutes", "points", "sort_order", "is_archived", "created_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_active` ON `tasks` (`owner_id`,`is_archived`);
--> statement-breakpoint
UPDATE `tasks` SET `category` = CASE `category`
  WHEN 'Growth' THEN 'Study'
  WHEN 'Fitness' THEN 'Productive'
  WHEN 'Wellness' THEN 'Daily essentials'
  WHEN 'Health' THEN 'Daily essentials'
  WHEN 'Home' THEN 'Daily essentials'
  WHEN 'Personal' THEN 'Daily essentials'
  ELSE 'Daily essentials'
END
WHERE `category` NOT IN ('Study', 'Productive', 'Entertainment', 'Daily essentials');
--> statement-breakpoint
UPDATE `tasks` SET `points` = CASE
  WHEN `category` = 'Entertainment' THEN `duration_minutes` * -0.5
  WHEN `category` IN ('Study', 'Productive') AND `duration_minutes` > 0 THEN 5 + `duration_minutes` * 2
  WHEN `category` = 'Daily essentials' AND `duration_minutes` > 0 THEN 5 + `duration_minutes`
  ELSE 5
END;
--> statement-breakpoint
PRAGMA optimize;
