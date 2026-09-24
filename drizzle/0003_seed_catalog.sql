-- The course catalog. Reference data the app only ever reads, so it ships in
-- the migration trail rather than in seeding code that runs at startup: applied
-- exactly once per database, identically in dev, in the spec's throwaway
-- database, and on the deployed volume.
--
-- Codes and titles are real ANU School of Computing courses. The TIMES are
-- invented — the point of the prototype is the clash, not the 2026 timetable —
-- and each course is modelled as a couple of interchangeable slots rather than
-- a lecture stream plus tutorial groups. Both simplifications are called out in
-- README.md.
--
-- Two collisions are deliberate, and the spec tests lean on them:
--   * COMP1100 and COMP4020 both prefer Mon 10:00–12:00, and both have a
--     fallback — so a good scheduler keeps them both.
--   * COMP2620 and COMP3600 are each offered at Wed 10:00–12:00 and nowhere
--     else — genuinely mutually exclusive, so one of them has to go.
-- Every other pair is clash-free.

INSERT INTO `courses` (`id`, `code`, `title`) VALUES
	(1, 'COMP1100', 'Programming as Problem Solving'),
	(2, 'COMP2100', 'Software Construction'),
	(3, 'COMP2310', 'Systems, Networks and Concurrency'),
	(4, 'COMP2620', 'Logic'),
	(5, 'COMP3600', 'Algorithms'),
	(6, 'COMP3620', 'Artificial Intelligence'),
	(7, 'COMP4020', 'Agentic Coding Studio');
--> statement-breakpoint
-- Row order is preference order: a course is offered its times in the order
-- they appear here, and takes the first one that is still free.
INSERT INTO `course_options` (`course_id`, `label`, `day`, `start_minute`, `end_minute`) VALUES
	(1, 'Mon 10:00–12:00', 'Mon', 600, 720),
	(1, 'Thu 14:00–16:00', 'Thu', 840, 960),
	(2, 'Tue 09:00–10:30', 'Tue', 540, 630),
	(2, 'Thu 09:00–10:30', 'Thu', 540, 630),
	(3, 'Mon 14:00–16:00', 'Mon', 840, 960),
	(3, 'Fri 14:00–16:00', 'Fri', 840, 960),
	(4, 'Wed 10:00–12:00', 'Wed', 600, 720),
	(5, 'Wed 10:00–12:00', 'Wed', 600, 720),
	(6, 'Tue 14:00–16:00', 'Tue', 840, 960),
	(6, 'Wed 14:00–16:00', 'Wed', 840, 960),
	(7, 'Mon 10:00–12:00', 'Mon', 600, 720),
	(7, 'Fri 10:00–12:00', 'Fri', 600, 720);
