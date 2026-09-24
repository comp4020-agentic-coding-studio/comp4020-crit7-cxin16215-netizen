import { sql } from "drizzle-orm";
import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import type { ComponentKind, Day, Half, Stance } from "./scheduler";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

/** The course catalog. Read-only to the app: it arrives via a seed migration. */
export const courses = sqliteTable("courses", {
  id: int().primaryKey({ autoIncrement: true }),
  code: text().notNull().unique(),
  title: text().notNull(),
});

/**
 * The parts of a course that each need their own place in the week.
 *
 * This is where the real shape of enrolment lives: a lecture is seeded with a
 * single time and so cannot move, while a tutorial is seeded with several and
 * so can. Nothing in the scheduler special-cases `kind` — "a lecture is
 * compulsory" is just what having one option means.
 */
export const courseComponents = sqliteTable("course_components", {
  id: int().primaryKey({ autoIncrement: true }),
  courseId: int("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  kind: text().notNull().$type<ComponentKind>(),
  name: text().notNull(),
});

/** The times one component is offered at. Row order is the order it offers them in. */
export const componentOptions = sqliteTable("component_options", {
  id: int().primaryKey({ autoIncrement: true }),
  componentId: int("component_id")
    .notNull()
    .references(() => courseComponents.id, { onDelete: "cascade" }),
  // Rendered once here rather than formatted at display time, so the page and
  // the "why was this dropped" explanation can both just print it.
  label: text().notNull(),
  day: text().notNull().$type<Day>(),
  // Minutes from midnight. end is exclusive, so 10:00–12:00 and 12:00–14:00
  // sit back to back without overlapping.
  startMinute: int("start_minute").notNull(),
  endMinute: int("end_minute").notNull(),
});

// The wishlist. Like the starter's guestbook, this is one shared list for
// whoever opens the site — there are no accounts here.
export const selections = sqliteTable("selections", {
  id: int().primaryKey({ autoIncrement: true }),
  // Unique: a course is either on the wishlist or it isn't. Changing your mind
  // about how much you want it is an update, not a second row.
  courseId: int("course_id")
    .notNull()
    .unique()
    .references(() => courses.id, { onDelete: "cascade" }),
  /** Smaller is wanted more: 1 is the top pick. Ties are allowed. */
  priority: int().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * How the week suits you, one row per half-day — ten in all, seeded to "ok".
 *
 * Half-days rather than half-hours because that is the grain people actually
 * think in ("keep Friday clear", "nothing before lunch"), and because ten
 * controls fit on a page without any client-side JavaScript.
 */
export const preferences = sqliteTable(
  "preferences",
  {
    id: int().primaryKey({ autoIncrement: true }),
    day: text().notNull().$type<Day>(),
    half: text().notNull().$type<Half>(),
    stance: text().notNull().$type<Stance>(),
  },
  (table) => [unique().on(table.day, table.half)],
);

export type Course = typeof courses.$inferSelect;
export type CourseComponentRow = typeof courseComponents.$inferSelect;
export type ComponentOption = typeof componentOptions.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type Preference = typeof preferences.$inferSelect;
