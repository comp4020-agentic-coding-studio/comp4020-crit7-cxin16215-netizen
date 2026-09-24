import { describe, expect, it } from "vitest";
import {
  type CatalogCourse,
  type ComponentKind,
  type CourseComponent,
  type Day,
  type Preferences,
  type Schedule,
  type SlotOption,
  type WishlistEntry,
  failedOnCombination,
  generateSchedule,
} from "../src/lib/scheduler";

// The algorithm on its own, with made-up courses. No server, no database, no
// HTTP — src/lib/scheduler.ts imports none of those, which is what lets this
// file state the scheduling rules directly instead of inferring them from a
// rendered page. The contract as it reaches a user is spec/crit-7.test.ts.

type Time = [Day, number, number];

let nextId = 0;

function at(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function slot([day, startMinute, endMinute]: Time): SlotOption {
  return { id: ++nextId, label: `${day} ${at(startMinute)}–${at(endMinute)}`, day, startMinute, endMinute };
}

/** One time and no choice about it — what makes a lecture immovable. */
function lecture(...times: Time[]): CourseComponent {
  return { id: ++nextId, kind: "lecture", name: "Lecture", options: times.map(slot) };
}

/** Several times, one of which will do — the slack the scheduler gets to use. */
function tutorial(...times: Time[]): CourseComponent {
  return { id: ++nextId, kind: "tutorial", name: "Tutorial", options: times.map(slot) };
}

function course(id: number, code: string, ...components: CourseComponent[]): CatalogCourse {
  return { id, code, title: `The ${code} course`, components };
}

/** A wishlist row: its own id is the tie-break, so it's explicit in every test. */
function wish(id: number, courseId: number, priority: number): WishlistEntry {
  return { id, courseId, priority };
}

const codes = (entries: { course: CatalogCourse }[]) => entries.map((entry) => entry.course.code);

/** Where a scheduled course's lecture or tutorial ended up. */
function placed(result: Schedule, code: string, kind: ComponentKind): SlotOption | undefined {
  const scheduled = result.included.find((entry) => entry.course.code === code);
  return scheduled?.placements.find((placement) => placement.component.kind === kind)?.option;
}

describe("generateSchedule", () => {
  it("returns nothing for an empty wishlist", () => {
    const catalog = [course(1, "AAAA1000", lecture(["Mon", 600, 720]))];
    expect(generateSchedule(catalog, [])).toEqual({ included: [], dropped: [] });
  });

  it("places every component of a course that fits", () => {
    const catalog = [course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Tue", 540, 600]))];
    const result = generateSchedule(catalog, [wish(1, 1, 1)]);

    expect(result.dropped).toEqual([]);
    expect(placed(result, "AAAA1000", "lecture")?.day).toBe("Mon");
    expect(placed(result, "AAAA1000", "tutorial")?.day).toBe("Tue");
  });

  it("treats back-to-back times as compatible", () => {
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720])),
      course(2, "BBBB2000", lecture(["Mon", 720, 840])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 1), wish(2, 2, 2)]);

    expect(codes(result.included)).toEqual(["AAAA1000", "BBBB2000"]);
    expect(result.dropped).toEqual([]);
  });

  it("moves a tutorial rather than losing the course", () => {
    // Both want Tuesday morning for their tutorial, but BBBB2000 has another
    // group — so the clash costs a tutorial slot, not a course.
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Tue", 540, 600])),
      course(2, "BBBB2000", lecture(["Wed", 600, 720]), tutorial(["Tue", 540, 600], ["Thu", 540, 600])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 1), wish(2, 2, 2)]);

    expect(codes(result.included)).toEqual(["AAAA1000", "BBBB2000"]);
    expect(placed(result, "BBBB2000", "tutorial")?.day).toBe("Thu");
  });

  it("drops a course when the two lectures cannot both happen", () => {
    // A lecture has one time and no alternative, so this clash has no way out.
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Tue", 540, 600])),
      course(2, "BBBB2000", lecture(["Mon", 600, 720]), tutorial(["Thu", 540, 600])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 1), wish(2, 2, 2)]);

    expect(codes(result.included)).toEqual(["AAAA1000"]);
    expect(codes(result.dropped)).toEqual(["BBBB2000"]);

    // and the explanation blames the lecture, not the tutorial that was fine
    const [drop] = result.dropped;
    const forLecture = drop.components.find((report) => report.component.kind === "lecture");
    const forTutorial = drop.components.find((report) => report.component.kind === "tutorial");
    expect(forLecture?.candidates[0].obstacle).toMatchObject({ kind: "clash" });
    expect(forTutorial?.candidates[0].obstacle).toBeNull();
    expect(failedOnCombination(drop)).toBe(false);
  });

  it("lets priority, not wishlist order, decide who survives", () => {
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720])),
      course(2, "BBBB2000", lecture(["Mon", 600, 720])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 5), wish(2, 2, 1)]);

    expect(codes(result.included)).toEqual(["BBBB2000"]);
    expect(codes(result.dropped)).toEqual(["AAAA1000"]);
  });

  it("breaks equal priorities by which was wishlisted first", () => {
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720])),
      course(2, "BBBB2000", lecture(["Mon", 600, 720])),
    ];
    const result = generateSchedule(catalog, [wish(7, 1, 1), wish(9, 2, 1)]);

    expect(codes(result.included)).toEqual(["AAAA1000"]);
    expect(codes(result.dropped)).toEqual(["BBBB2000"]);
  });

  it("never lets a later, less-wanted course displace one already scheduled", () => {
    // AAAA1000 takes the Monday tutorial when it is alone; adding a course that
    // can only tutor on Monday does not shuffle it to make room. A set-maximising
    // scheduler might make that trade — priority order is the instruction not to.
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Mon", 840, 900], ["Tue", 840, 900])),
      course(2, "BBBB2000", lecture(["Wed", 600, 720]), tutorial(["Mon", 840, 900])),
    ];
    const first = generateSchedule(catalog, [wish(1, 1, 1)]);
    const later = generateSchedule(catalog, [wish(1, 1, 1), wish(2, 2, 2)]);

    expect(later.included[0]).toEqual(first.included[0]);
    expect(codes(later.dropped)).toEqual(["BBBB2000"]);
  });

  it("reports a course lost to the combination rather than to any one clash", () => {
    // Nothing else is scheduled: both times are free on their own, and clash
    // only with each other.
    const catalog = [course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Mon", 600, 720]))];
    const result = generateSchedule(catalog, [wish(1, 1, 1)]);

    expect(codes(result.dropped)).toEqual(["AAAA1000"]);
    expect(failedOnCombination(result.dropped[0])).toBe(true);
  });

  it("drops a course that lists no times at all", () => {
    const catalog = [course(1, "AAAA1000", lecture())];
    const result = generateSchedule(catalog, [wish(1, 1, 1)]);

    expect(codes(result.dropped)).toEqual(["AAAA1000"]);
  });
});

describe("generateSchedule, with the week's preferences", () => {
  it("steers a tutorial away from a half-day ruled out", () => {
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Tue", 540, 600], ["Tue", 840, 900])),
    ];
    const preferences: Preferences = { "Tue-am": "no" };
    const result = generateSchedule(catalog, [wish(1, 1, 1)], preferences);

    expect(result.dropped).toEqual([]);
    expect(placed(result, "AAAA1000", "tutorial")?.startMinute).toBe(840);
  });

  it("drops a course whose lecture lands in a half-day ruled out", () => {
    const catalog = [course(1, "AAAA1000", lecture(["Mon", 600, 720]))];
    const result = generateSchedule(catalog, [wish(1, 1, 1)], { "Mon-am": "no" });

    expect(codes(result.dropped)).toEqual(["AAAA1000"]);
    expect(result.dropped[0].components[0].candidates[0].obstacle).toMatchObject({
      kind: "unavailable",
      half: "am",
    });
  });

  it("aims teaching at the half-days asked for", () => {
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Tue", 540, 600], ["Thu", 540, 600])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 1)], { "Thu-am": "prefer" });

    expect(placed(result, "AAAA1000", "tutorial")?.day).toBe("Thu");
  });

  it("never costs a course its place to satisfy a preference", () => {
    // Thursday is wanted, but the only Thursday tutorial is taken. The course
    // takes the time it can get rather than being dropped for it.
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720]), tutorial(["Thu", 540, 600])),
      course(2, "BBBB2000", lecture(["Wed", 600, 720]), tutorial(["Thu", 540, 600], ["Fri", 540, 600])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 1), wish(2, 2, 2)], { "Thu-am": "prefer" });

    expect(result.dropped).toEqual([]);
    expect(placed(result, "BBBB2000", "tutorial")?.day).toBe("Fri");
  });

  it("gathers the week onto fewer days when nothing else separates the options", () => {
    const catalog = [
      course(1, "AAAA1000", lecture(["Mon", 600, 720])),
      course(2, "BBBB2000", lecture(["Wed", 600, 720]), tutorial(["Thu", 840, 900], ["Mon", 840, 900])),
    ];
    const result = generateSchedule(catalog, [wish(1, 1, 1), wish(2, 2, 2)]);

    // Monday is already a day on campus, so the tutorial joins it rather than
    // opening up a fourth day — even though Thursday is offered first.
    expect(placed(result, "BBBB2000", "tutorial")?.day).toBe("Mon");
  });
});
