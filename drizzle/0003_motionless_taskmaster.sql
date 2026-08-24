CREATE TABLE `activity_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`category` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_pauses_activity_open` ON `activity_pauses` (`activity_id`,`ended_at`);