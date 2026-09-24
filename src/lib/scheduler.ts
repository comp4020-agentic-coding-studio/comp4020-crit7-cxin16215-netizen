// The scheduler: given the catalog, a prioritised wishlist and how the week
// suits you, work out what fits and what has to go.
//
// Deliberately pure — no database, no drizzle, no Astro. Everything it needs
// arrives as plain data, so spec/scheduler.test.ts can drive it with hand-made
// fixtures and no server at all. src/lib/db.ts shapes its rows to match.

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type Half = "am" | "pm";
/** How a half-day suits you: avoid it, take it or leave it, or aim for it. */
export type Stance = "no" | "ok" | "prefer";
export type ComponentKind = "lecture" | "tutorial";

export const DAYS: readonly Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const HALVES: readonly Half[] = ["am", "pm"];
export const NOON = 12 * 60;

/** One time a component can be taken at. Minutes are from midnight; end is exclusive. */
export interface SlotOption {
  id: number;
  label: string;
  day: Day;
  startMinute: number;
  endMinute: number;
}

/**
 * A part of a course that needs its own place in the week. A lecture ships with
 * a single option, which is what makes it immovable; a tutorial ships with
 * several, which is the slack the scheduler gets to use.
 */
export interface CourseComponent {
  id: number;
  kind: ComponentKind;
  name: string;
  /** Ascending by id — the order a component offers its times in. */
  options: SlotOption[];
}

export interface CatalogCourse {
  id: number;
  code: string;
  title: string;
  components: CourseComponent[];
}

export interface WishlistEntry {
  /** The selection's own id, which breaks ties between equal priorities. */
  id: number;
  courseId: number;
  /** Smaller is wanted more: 1 is the top pick. */
  priority: number;
}

/** The week's ten half-days, keyed `Mon-am`. Anything missing is "ok". */
export type Preferences = Record<string, Stance>;

export const halfKey = (day: Day, half: Half): string => `${day}-${half}`;

export interface Placement {
  component: CourseComponent;
  option: SlotOption;
}

export interface ScheduledCourse {
  course: CatalogCourse;
  priority: number;
  /** One per component, in the course's own component order. */
  placements: Placement[];
}

/** Why one candidate time couldn't be used. */
export type Obstacle =
  | { kind: "clash"; with: ScheduledCourse; at: SlotOption }
  | { kind: "unavailable"; half: Half };

export interface CandidateReport {
  option: SlotOption;
  /** null when this time was free on its own — so the course failed on the combination. */
  obstacle: Obstacle | null;
}

export interface ComponentReport {
  component: CourseComponent;
  candidates: CandidateReport[];
}

export interface DroppedCourse {
  course: CatalogCourse;
  priority: number;
  components: ComponentReport[];
}

export interface Schedule {
  included: ScheduledCourse[];
  dropped: DroppedCourse[];
}

/** Half-open overlap: touching at an edge (10–12 and 12–14) is not a clash. */
function clashes(a: SlotOption, b: SlotOption): boolean {
  return a.day === b.day && a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/** How much of an option falls inside one half-day. */
function minutesIn(option: SlotOption, half: Half): number {
  const from = half === "am" ? 0 : NOON;
  const to = half === "am" ? NOON : 24 * 60;
  return Math.max(0, Math.min(option.endMinute, to) - Math.max(option.startMinute, from));
}

/** The half-day, if any, that rules this option out. */
function ruledOutBy(option: SlotOption, preferences: Preferences): Half | null {
  for (const half of HALVES) {
    if (minutesIn(option, half) > 0 && preferences[halfKey(option.day, half)] === "no") return half;
  }
  return null;
}

/** Minutes of this option landing in a half-day you asked for. */
function wantedMinutes(option: SlotOption, preferences: Preferences): number {
  let total = 0;
  for (const half of HALVES) {
    if (preferences[halfKey(option.day, half)] === "prefer") total += minutesIn(option, half);
  }
  return total;
}

// A course is a lecture and a tutorial or two, so the product stays tiny. The
// cap is only there so malformed catalog data can't hang a page render.
const MAX_COMBINATIONS = 2000;

/** Every way of giving each component one of its times, in component order. */
function combinations(components: CourseComponent[]): SlotOption[][] {
  let all: SlotOption[][] = [[]];
  for (const component of components) {
    const next: SlotOption[][] = [];
    for (const partial of all) {
      for (const option of component.options) {
        if (next.length >= MAX_COMBINATIONS) return next;
        next.push([...partial, option]);
      }
    }
    all = next;
  }
  return all;
}

/**
 * Greedy by priority, best-fit within each course.
 *
 * Walk the wishlist best-priority first. For each course, consider every way of
 * placing all of its components at once, discard the ones that hit a half-day
 * you ruled out, collide with each other, or collide with a course already
 * scheduled — then take the survivor that puts the most teaching in half-days
 * you asked for, breaking ties towards a week spread over fewer days.
 *
 * A course is dropped only when no combination survives. Because a scheduled
 * course is never revisited, a later, less-wanted course can never bump an
 * earlier, more-wanted one — which is the whole promise the page makes. A
 * half-day you aim for only ever chooses between times a course could already
 * have, and never costs it its place. A half-day kept clear is a rule, not a
 * wish: it can, and the dropped list says so.
 *
 * This is not an approximation of "closest to what you asked for": a cleverer
 * algorithm could sometimes fit one more course in total by sacrificing a
 * mid-priority one for two low-priority ones, but that is exactly the trade the
 * priority order says not to make.
 */
export function generateSchedule(
  courses: CatalogCourse[],
  selections: WishlistEntry[],
  preferences: Preferences = {},
): Schedule {
  const byId = new Map(courses.map((course) => [course.id, course]));
  const wanted = [...selections].sort((a, b) => a.priority - b.priority || a.id - b.id);

  const included: ScheduledCourse[] = [];
  const dropped: DroppedCourse[] = [];
  const locked: { option: SlotOption; owner: ScheduledCourse }[] = [];

  for (const entry of wanted) {
    const course = byId.get(entry.courseId);
    if (!course) continue; // a wishlisted course that left the catalog

    let best: { options: SlotOption[]; wanted: number; days: number } | null = null;

    for (const options of combinations(course.components)) {
      const usable =
        options.every((option) => !ruledOutBy(option, preferences)) &&
        options.every((option, i) => !options.slice(i + 1).some((other) => clashes(option, other))) &&
        options.every((option) => !locked.some((held) => clashes(option, held.option)));
      if (!usable) continue;

      const score = options.reduce((sum, option) => sum + wantedMinutes(option, preferences), 0);
      const days = new Set([
        ...locked.map((held) => held.option.day),
        ...options.map((option) => option.day),
      ]).size;

      // Ties keep the earlier combination, which is the catalog's own order.
      if (!best || score > best.wanted || (score === best.wanted && days < best.days)) {
        best = { options, wanted: score, days };
      }
    }

    if (best) {
      const scheduled: ScheduledCourse = {
        course,
        priority: entry.priority,
        placements: course.components.map((component, index) => ({
          component,
          option: best.options[index],
        })),
      };
      included.push(scheduled);
      for (const option of best.options) locked.push({ option, owner: scheduled });
    } else {
      dropped.push({
        course,
        priority: entry.priority,
        components: course.components.map((component) => ({
          component,
          candidates: component.options.map((option) => {
            const half = ruledOutBy(option, preferences);
            if (half) return { option, obstacle: { kind: "unavailable", half } as Obstacle };

            const held = locked.find((taken) => clashes(option, taken.option));
            if (held) {
              return { option, obstacle: { kind: "clash", with: held.owner, at: held.option } as Obstacle };
            }
            return { option, obstacle: null };
          }),
        })),
      });
    }
  }

  return { included, dropped };
}

/** One row per placed component — what the week grid actually draws. */
export interface PlacedSlot {
  course: CatalogCourse;
  priority: number;
  component: CourseComponent;
  option: SlotOption;
}

export function placedSlots(included: ScheduledCourse[]): PlacedSlot[] {
  return included.flatMap((scheduled) =>
    scheduled.placements.map((placement) => ({
      course: scheduled.course,
      priority: scheduled.priority,
      component: placement.component,
      option: placement.option,
    })),
  );
}

/** Timetable reading order — for display only; the algorithm works in priority order. */
export function byTimetableOrder(a: PlacedSlot, b: PlacedSlot): number {
  return (
    DAYS.indexOf(a.option.day) - DAYS.indexOf(b.option.day) ||
    a.option.startMinute - b.option.startMinute ||
    a.course.code.localeCompare(b.course.code)
  );
}

/**
 * True when every component had at least one free time, so the course was lost
 * to the combination rather than to any single clash.
 */
export function failedOnCombination(drop: DroppedCourse): boolean {
  return drop.components.every((report) =>
    report.candidates.some((candidate) => candidate.obstacle === null),
  );
}
