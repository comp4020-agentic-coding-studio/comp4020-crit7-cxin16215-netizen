-- Lectures and tutorials for the catalog seeded in 0003. The `courses` rows
-- themselves are untouched, so nothing already on a wishlist is disturbed.
--
-- Codes and titles are real ANU School of Computing courses. The TIMES are
-- invented — the point of the prototype is the clash, not the 2026 timetable.
-- Each course gets one lecture, seeded with a single time so it cannot move,
-- and one tutorial, seeded with two so it can.
--
-- Exactly two collisions exist in this data, and the spec tests lean on both:
--
--   * COMP1100 and COMP2620 lecture at the same hour (Mon 10:00–12:00) and a
--     lecture has nowhere else to go. Whichever you ranked lower is lost — no
--     amount of tutorial shuffling saves it.
--   * COMP1100 and COMP2100 both offer their first tutorial at Tue 14:00–15:00,
--     and both have a second group. That clash costs a tutorial slot, not a
--     course.
--
-- Everything else is clash-free, including each course against its own lecture.

INSERT INTO `course_components` (`id`, `course_id`, `kind`, `name`) VALUES
	(1,  1, 'lecture',  'Lecture'),   -- COMP1100
	(2,  1, 'tutorial', 'Tutorial'),
	(3,  2, 'lecture',  'Lecture'),   -- COMP2100
	(4,  2, 'tutorial', 'Tutorial'),
	(5,  3, 'lecture',  'Lecture'),   -- COMP2310
	(6,  3, 'tutorial', 'Tutorial'),
	(7,  4, 'lecture',  'Lecture'),   -- COMP2620
	(8,  4, 'tutorial', 'Tutorial'),
	(9,  5, 'lecture',  'Lecture'),   -- COMP3600
	(10, 5, 'tutorial', 'Tutorial'),
	(11, 6, 'lecture',  'Lecture'),   -- COMP3620
	(12, 6, 'tutorial', 'Tutorial'),
	(13, 7, 'lecture',  'Lecture'),   -- COMP4020
	(14, 7, 'tutorial', 'Tutorial');
--> statement-breakpoint
-- Row order is preference order: a component is offered its times in the order
-- they appear here, and takes the first one that survives everything else.
INSERT INTO `component_options` (`component_id`, `label`, `day`, `start_minute`, `end_minute`) VALUES
	(1,  'Mon 10:00–12:00', 'Mon', 600, 720),
	(2,  'Tue 14:00–15:00', 'Tue', 840, 900),
	(2,  'Thu 14:00–15:00', 'Thu', 840, 900),
	(3,  'Tue 10:00–12:00', 'Tue', 600, 720),
	(4,  'Tue 14:00–15:00', 'Tue', 840, 900),
	(4,  'Fri 14:00–15:00', 'Fri', 840, 900),
	(5,  'Wed 10:00–12:00', 'Wed', 600, 720),
	(6,  'Mon 14:00–15:00', 'Mon', 840, 900),
	(6,  'Fri 09:00–10:00', 'Fri', 540, 600),
	(7,  'Mon 10:00–12:00', 'Mon', 600, 720),
	(8,  'Wed 09:00–10:00', 'Wed', 540, 600),
	(8,  'Thu 09:00–10:00', 'Thu', 540, 600),
	(9,  'Thu 10:00–12:00', 'Thu', 600, 720),
	(10, 'Tue 09:00–10:00', 'Tue', 540, 600),
	(10, 'Fri 15:00–16:00', 'Fri', 900, 960),
	(11, 'Fri 10:00–12:00', 'Fri', 600, 720),
	(12, 'Mon 15:00–16:00', 'Mon', 900, 960),
	(12, 'Thu 15:00–16:00', 'Thu', 900, 960),
	(13, 'Wed 14:00–16:00', 'Wed', 840, 960),
	(14, 'Wed 16:00–17:00', 'Wed', 960, 1020),
	(14, 'Fri 16:00–17:00', 'Fri', 960, 1020);
--> statement-breakpoint
-- The week starts out entirely unopinionated: every half-day is "ok" until
-- somebody says otherwise, so the scheduler behaves exactly as it did before
-- anyone touched the preferences page.
INSERT INTO `preferences` (`day`, `half`, `stance`) VALUES
	('Mon', 'am', 'ok'), ('Mon', 'pm', 'ok'),
	('Tue', 'am', 'ok'), ('Tue', 'pm', 'ok'),
	('Wed', 'am', 'ok'), ('Wed', 'pm', 'ok'),
	('Thu', 'am', 'ok'), ('Thu', 'pm', 'ok'),
	('Fri', 'am', 'ok'), ('Fri', 'pm', 'ok');
