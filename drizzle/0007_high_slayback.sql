-- The wishlist and the week's preferences become per-visitor.
--
-- Generated as ALTER TABLE ... ADD `visitor_id` text NOT NULL, which SQLite
-- refuses outright: a NOT NULL column can't be added without a default. Both
-- tables are rebuilt instead, the way drizzle-kit rebuilds SQLite tables.
--
-- Rows written before visitors existed are kept but belong to 'legacy', an id
-- no cookie can hold (src/middleware.ts only accepts UUIDs). That includes the
-- ten "ok" rows 0006 seeded, which are now redundant: a half-day with no row is
-- already "ok".
CREATE TABLE `__new_selections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_id` text NOT NULL,
	`course_id` integer NOT NULL,
	`priority` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_selections` (`id`, `visitor_id`, `course_id`, `priority`, `created_at`)
	SELECT `id`, 'legacy', `course_id`, `priority`, `created_at` FROM `selections`;
--> statement-breakpoint
DROP TABLE `selections`;
--> statement-breakpoint
ALTER TABLE `__new_selections` RENAME TO `selections`;
--> statement-breakpoint
CREATE UNIQUE INDEX `selections_visitor_id_course_id_unique` ON `selections` (`visitor_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_id` text NOT NULL,
	`day` text NOT NULL,
	`half` text NOT NULL,
	`stance` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_preferences` (`id`, `visitor_id`, `day`, `half`, `stance`)
	SELECT `id`, 'legacy', `day`, `half`, `stance` FROM `preferences`;
--> statement-breakpoint
DROP TABLE `preferences`;
--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_visitor_id_day_half_unique` ON `preferences` (`visitor_id`,`day`,`half`);
