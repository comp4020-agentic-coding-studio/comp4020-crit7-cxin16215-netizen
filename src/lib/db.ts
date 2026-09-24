import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, inArray } from "drizzle-orm";
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
// The catalog arrives the same way, as hand-written seed migrations. It is
// reference data the app never edits, so the
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

// Every function below that touches the wishlist or the preferences takes the
// visitor first and filters on it, writes included. An id in a URL is only
// ever looked up inside that visitor's own rows, so a hand-made request can't
// reach into anyone else's week.

const mine = (visitor: string, id: number) =>
  and(eq(selections.visitorId, visitor), eq(selections.id, id));

/** Processing order: best priority first, ties to whichever was added first. */
const queueOrder = [asc(selections.priority), asc(selections.id)];

/**
 * The wishlist, in the same order the scheduler will process it — so the page
 * lists courses in the order they actually get their pick of the week.
 */
export function listSelections(visitor: string, catalog: CatalogCourse[]): WishlistRow[] {
  const byId = new Map(catalog.map((course) => [course.id, course]));

  return db
    .select()
    .from(selections)
    .where(eq(selections.visitorId, visitor))
    .orderBy(...queueOrder)
    .all()
    .flatMap((row) => {
      const course = byId.get(row.courseId);
      return course ? [{ id: row.id, courseId: row.courseId, priority: row.priority, course }] : [];
    });
}

export function courseExists(id: number): boolean {
  return db.select({ id: courses.id }).from(courses).where(eq(courses.id, id)).get() !== undefined;
}

export function addSelection(visitor: string, courseId: number, priority: number): void {
  try {
    db.insert(selections).values({ visitorId: visitor, courseId, priority }).run();
  } catch (error) {
    // The unique index on (visitor, course) is what keeps a course from being
    // wishlisted twice. A double-click, or a second tab submitting a form
    // rendered before the first add, lands here — the wishlist already says
    // what the user asked for, so that is not a 500.
    if ((error as { code?: string }).code !== "SQLITE_CONSTRAINT_UNIQUE") throw error;
  }
}

export function updateSelectionPriority(visitor: string, id: number, priority: number): void {
  db.update(selections).set({ priority }).where(mine(visitor, id)).run();
}

export function removeSelection(visitor: string, id: number): void {
  db.delete(selections).where(mine(visitor, id)).run();
}

/**
 * Move one course to just ahead of another in the queue, then renumber the
 * whole wishlist 1, 2, 3… in its new order.
 *
 * Renumbering rather than nudging one number is what makes this exact: nothing
 * ahead of the rival moves, the moved course lands directly in front of it, and
 * no tie is left for insertion order to decide. The cost is that ties you set
 * on purpose become consecutive numbers, in the order they were already in.
 */
export function promoteSelection(visitor: string, id: number, aheadOf: number): void {
  db.transaction((tx) => {
    const queue = tx
      .select({ id: selections.id })
      .from(selections)
      .where(eq(selections.visitorId, visitor))
      .orderBy(...queueOrder)
      .all()
      .map((row) => row.id);

    const from = queue.indexOf(id);
    const to = queue.indexOf(aheadOf);
    // Unknown ids, or already ahead: nothing to do.
    if (from === -1 || to === -1 || from < to) return;

    queue.splice(from, 1);
    queue.splice(to, 0, id);
    queue.forEach((rowId, index) => {
      tx.update(selections).set({ priority: index + 1 }).where(mine(visitor, rowId)).run();
    });
  });
}

/**
 * A wishlist that shows both kinds of clash at once, for someone opening the
 * app cold. It leans on the two collisions 0006_seed_components.sql documents:
 * COMP2620's lecture loses to COMP1100's, and COMP2100's tutorial moves to its
 * Friday group rather than losing the course.
 */
const EXAMPLE = ["COMP1100", "COMP2620", "COMP2100"];

/** Only ever fills an empty wishlist, so it can't clobber one you've built. */
export function addExample(visitor: string): void {
  db.transaction((tx) => {
    const existing = tx
      .select({ id: selections.id })
      .from(selections)
      .where(eq(selections.visitorId, visitor))
      .get();
    if (existing) return;

    const rows = tx.select().from(courses).where(inArray(courses.code, EXAMPLE)).all();
    for (const row of rows) {
      tx.insert(selections)
        .values({ visitorId: visitor, courseId: row.id, priority: EXAMPLE.indexOf(row.code) + 1 })
        .run();
    }
  });
}

/** The half-days this visitor has saved, keyed the way the scheduler reads them. */
export function listPreferences(visitor: string): Preferences {
  const rows = db.select().from(preferences).where(eq(preferences.visitorId, visitor)).all();
  return Object.fromEntries(rows.map((row) => [halfKey(row.day, row.half), row.stance]));
}

/**
 * The preferences form posts all ten cells at once, so this writes all ten in
 * one transaction — no half-saved week if something goes wrong midway.
 */
export function setPreferences(
  visitor: string,
  entries: { day: Day; half: Half; stance: Stance }[],
): void {
  db.transaction((tx) => {
    for (const entry of entries) {
      tx.insert(preferences)
        .values({ visitorId: visitor, ...entry })
        .onConflictDoUpdate({
          target: [preferences.visitorId, preferences.day, preferences.half],
          set: { stance: entry.stance },
        })
        .run();
    }
  });
}
