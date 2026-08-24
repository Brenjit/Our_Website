CREATE INDEX `idx_activity_profile_status` ON `activity_sessions` (`profile_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_completions_task_date` ON `completions` (`task_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `idx_sessions_profile` ON `sessions` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_active` ON `tasks` (`owner_id`,`is_archived`);