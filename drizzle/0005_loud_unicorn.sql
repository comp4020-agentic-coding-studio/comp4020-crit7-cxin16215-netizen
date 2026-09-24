CREATE TABLE `component_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`component_id` integer NOT NULL,
	`label` text NOT NULL,
	`day` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `course_components`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `course_components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`half` text NOT NULL,
	`stance` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_day_half_unique` ON `preferences` (`day`,`half`);