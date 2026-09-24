CREATE TABLE `course_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`label` text NOT NULL,
	`day` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `selections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`priority` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `selections_course_id_unique` ON `selections` (`course_id`);