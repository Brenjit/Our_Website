ALTER TABLE `tasks` ADD `schedule_type` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `scheduled_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `scheduled_weekday` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `animation_key` text DEFAULT 'auto' NOT NULL;