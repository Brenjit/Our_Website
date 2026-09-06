CREATE TABLE `login_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`client_key` text NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`blocked_until` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_login_rate_limits_profile_client` ON `login_rate_limits` (`profile_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `idx_login_rate_limits_updated` ON `login_rate_limits` (`updated_at`);