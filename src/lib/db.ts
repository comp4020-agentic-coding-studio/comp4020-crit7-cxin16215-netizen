import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type CatalogCourse,
  type Day,
  type Half,
  type Preferences,
  type SlotOption,
  type Stance,
  type WishlistEntry,
  halfKey,
} from "./scheduler";
import { componentOptions, courseComponents, courses, preferences, selections } from "./schema";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// SQLite ignores REFERENCES unless asked, per connection. Without this the
// cascades declared in schema.ts are documentation rather than behaviour.
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
//
// The catalog and the starting preferences arrive the same way, as hand-written
// seed migrations. They are reference data the app never edits, so the
// migration trail is the honest place for them: applied exactly once per
// database, identically in dev, in the spec's throwaway database, and on the
// deployed volume, with no seeding code to run at startup.
migrate(db, { migrationsFolder: "./drizzle" });

/** A wishlist row, with the course it points at resolved for display. */
export interface WishlistRow extends WishlistEntry {
  course: CatalogCourse;
}

function toSlot(row: typeof componentOptions.$inferSelect): SlotOption {
  return {
    id: row.id,
    label: row.label,
    day: row.day,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  };
}

/**
 * The whole catalog, each course carrying its components and each component its
 * times, both in ascending id order — the order the scheduler treats as their
 * own preference.
 *
 * Three flat reads stitched together in JS rather than a join: the catalog is a
 * few dozen rows, and this keeps the nesting obvious.
 */
export function listCatalog(): CatalogCourse[] {
  const courseRows = db.select().from(courses).orderBy(asc(courses.code)).all();
  const componentRows = db.select().from(courseComponents).orderBy(asc(courseComponents.id)).all();
  const optionRows = db.select().from(componentOptions).orderBy(asc(componentOptions.id)).all();

  return courseRows.map((course) => ({
    id: course.id,
    code: course.code,
    title: course.title,
    components: componentRows
      .filter((component) => component.courseId === course.id)
      .map((component) => ({
        id: component.id,
        kind: component.kind,
        name: component.name,
        options: optionRows.filter((option) => option.componentId === component.id).map(toSlot),
      })),
  }));
}

/**
 * The wishlist, in the same order the scheduler will process it — so the page
 * lists courses in the order they actually get their pick of the week.
 */
export function listSelections(catalog: CatalogCourse[]): WishlistRow[] {
  const byId = new Map(catalog.map((course) => [course.id, course]));

  return db
    .select()
    .from(selections)
    .orderBy(asc(selections.priority), asc(selections.id))
    .all()
    .flatMap((row) => {
      const course = byId.get(row.courseId);
      return course ? [{ id: row.id, courseId: row.courseId, priority: row.priority, course }] : [];
    });
}

export function courseExists(id: number): boolean {
  return db.select({ id: courses.id }).from(courses).where(eq(courses.id, id)).get() !== undefined;
}

export function addSelection(courseId: number, priority: number): void {
  try {
    db.insert(selections).values({ courseId, priority }).run();
  } catch (error) {
    // The unique index on course_id is what keeps a course from being
    // wishlisted twice. A double-click, or a second tab submitting a form
    // rendered before the first add, lands here — the wishlist already says
    // what the user asked for, so that is not a 500.
    if ((error as { code?: string }).code !== "SQLITE_CONSTRAINT_UNIQUE") throw error;
  }
}

export function updateSelectionPriority(id: number, priority: number): void {
  db.update(selections).set({ priority }).where(eq(selections.id, id)).run();
}

export function removeSelection(id: number): void {
  db.delete(selections).where(eq(selections.id, id)).run();
}

/** The ten half-days, keyed the way the scheduler reads them. */
export function listPreferences(): Preferences {
  const rows = db.select().from(preferences).all();
  return Object.fromEntries(rows.map((row) => [halfKey(row.day, row.half), row.stance]));
}

/**
 * The preferences form posts all ten cells at once, so this replaces all ten
 * in one transaction — no half-saved week if something goes wrong midway.
 */
export function setPreferences(entries: { day: Day; half: Half; stance: Stance }[]): void {
  db.transaction((tx) => {
    for (const entry of entries) {
      tx.update(preferences)
        .set({ stance: entry.stance })
        .where(and(eq(preferences.day, entry.day), eq(preferences.half, entry.half)))
        .run();
    }
  });
}
