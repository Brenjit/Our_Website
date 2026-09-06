CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`event_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempted_at` text NOT NULL,
	`delivered_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notification_deliveries_subscription_event` ON `notification_deliveries` (`subscription_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `idx_notification_deliveries_attempted` ON `notification_deliveries` (`attempted_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_profile` ON `push_subscriptions` (`profile_id`);