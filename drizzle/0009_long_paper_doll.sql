CREATE INDEX `idx_activity_task_status` ON `activity_sessions` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_activity_profile_date_status` ON `activity_sessions` (`profile_id`,`date_key`,`status`);--> statement-breakpoint
CREATE INDEX `idx_completions_profile_date` ON `completions` (`profile_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `idx_notification_deliveries_status_attempted` ON `notification_deliveries` (`status`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_reminder_schedule` ON `tasks` (`is_archived`,`scheduled_time`);