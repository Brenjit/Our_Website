CREATE TABLE `task_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`date_key` text NOT NULL,
	`elapsed_seconds` real DEFAULT 0 NOT NULL,
	`points_earned` real DEFAULT 0 NOT NULL,
	`completion_bonus_awarded` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_task_progress_task_date` ON `task_progress` (`task_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `idx_task_progress_profile_date` ON `task_progress` (`profile_id`,`date_key`);