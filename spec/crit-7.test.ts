import { beforeEach, describe, expect, inject, it } from "vitest";

// The week's contract, driven the way a person drives it: over HTTP, against
// the built server, through the same forms the pages render. The scheduling
// rules themselves are stated directly in spec/scheduler.test.ts — what this
// file asks is whether they survive the round trip through SQLite and HTML.
//
// Course codes, not database ids, are the fixture: the catalog ships in
// drizzle/0003_seed_catalog.sql and drizzle/0006_seed_components.sql, and ids
// are scraped from the rendered page so a reshuffled seed can't quietly make
// these tests assert the wrong thing.
const baseUrl = inject("baseUrl");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HALVES = ["am", "pm"];

// Each wishlist belongs to the browser holding its visitor cookie, so this
// file keeps the one cookie a browser would: whatever the server last set.
// Clearing it is how a test becomes somebody new.
let visitor = "";

function remember(res: Response): Response {
  for (const cookie of res.headers.getSetCookie()) {
    const held = cookie.match(/^coursefit_visitor=([^;]+)/)?.[1];
    if (held) visitor = held;
  }
  return res;
}

const cookie = (): Record<string, string> =>
  visitor ? { cookie: `coursefit_visitor=${visitor}` } : {};

// Astro checks form POSTs carry a same-origin Origin header (CSRF
// protection); browsers send it automatically, a bare fetch doesn't.
const post = async (path: string, fields: Record<string, string> = {}) =>
  remember(
    await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { origin: baseUrl, ...cookie() },
      body: new URLSearchParams(fields),
      redirect: "manual",
    }),
  );

async function page(path: string): Promise<string> {
  const res = remember(await fetch(new URL(path, baseUrl), { headers: cookie() }));
  expect(res.status).toBe(200);
  return res.text();
}

/** Courses still offered in the "add" form, by code — wishlisting one removes it. */
async function addable(): Promise<Map<string, string>> {
  const html = await page("/");
  const found = new Map<string, string>();
  for (const [, id, code] of html.matchAll(/<option value="(\d+)"[^>]*>\s*(COMP\d+)/g)) {
    found.set(code, id);
  }
  return found;
}

/** The wishlist table, by course code. Splitting on rows keeps one row's markup out of the next. */
async function wishlist(): Promise<Map<string, { id: string; priority: string }>> {
  const html = await page("/");
  const rows = new Map<string, { id: string; priority: string }>();
  for (const row of html.split("<tr")) {
    const id = row.match(/\/api\/selections\/(\d+)\/priority/)?.[1];
    const code = row.match(/aria-label="Priority for (COMP\d+)"/)?.[1];
    const priority = row.match(/name="priority"[^>]*\svalue="(\d+)"/)?.[1];
    if (id && code && priority) rows.set(code, { id, priority });
  }
  return rows;
}

/** One section of the schedule page, from its heading to the next one. */
function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start === -1) return "";
  const rest = html.slice(start);
  const end = rest.indexOf("<h2", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * The week grid's blocks, keyed "COMP1100 lecture" — a course holds more than
 * one place in the week now, and which part landed where is the whole point.
 * Each block states its own day and time for anyone reading it outside the
 * column it sits in, which is also what lets a test ask where it went.
 */
function blocks(html: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const chunk of section(html, "scheduled").split('class="block ')) {
    const kind = chunk.match(/^(lecture|tutorial)/)?.[1];
    const code = chunk.match(/(COMP\d+)/)?.[1];
    if (kind && code) found.set(`${code} ${kind}`, chunk);
  }
  return found;
}

async function add(code: string, priority: number): Promise<void> {
  const courseId = (await addable()).get(code);
  if (!courseId) throw new Error(`${code} is not offered in the add form`);
  const res = await post("/api/selections", { courseId, priority: String(priority) });
  expect(res.status).toBe(303);
}

/** Set the whole week at once; anything not named goes back to "either way". */
async function setTimes(overrides: Record<string, string> = {}): Promise<void> {
  const fields: Record<string, string> = {};
  for (const day of DAYS) {
    for (const half of HALVES) fields[`${day}-${half}`] = overrides[`${day}-${half}`] ?? "ok";
  }
  const res = await post("/api/preferences", fields);
  expect(res.status).toBe(303);
}

// Every test is a first visit: a new visitor, an empty wishlist, a week with
// no opinions — with nothing to clean up after the test before.
beforeEach(async () => {
  visitor = "";
  expect([...(await wishlist()).keys()]).toEqual([]);
});

describe("the wishlist survives a reload", () => {
  it("accepts a course and redirects back to the page", async () => {
    const courseId = (await addable()).get("COMP2310");
    const res = await post("/api/selections", { courseId: courseId ?? "", priority: "1" });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });

  it("still has the course on a fresh page load", async () => {
    await add("COMP2310", 1);

    // A fresh request, so anything here came back out of SQLite.
    expect((await wishlist()).get("COMP2310")?.priority).toBe("1");
    // and it is no longer something you can add a second time
    expect((await addable()).has("COMP2310")).toBe(false);
  });

  it("still has a changed priority on a fresh page load", async () => {
    await add("COMP2310", 1);
    const { id } = (await wishlist()).get("COMP2310")!;

    await post(`/api/selections/${id}/priority`, { priority: "4" });

    expect((await wishlist()).get("COMP2310")?.priority).toBe("4");
  });

  it("stays empty after a course is removed", async () => {
    await add("COMP2310", 1);
    const { id } = (await wishlist()).get("COMP2310")!;

    await post(`/api/selections/${id}/delete`);

    expect((await wishlist()).has("COMP2310")).toBe(false);
    expect((await addable()).has("COMP2310")).toBe(true);
  });
});

describe("the generated week", () => {
  it("says there is nothing to schedule for an empty wishlist", async () => {
    const html = await page("/schedule/");

    expect(html).toContain("nothing to schedule");
    expect(html).not.toContain('id="scheduled"');
  });

  it("places both the lecture and the tutorial of a course that fits", async () => {
    await add("COMP1100", 1);

    const html = await page("/schedule/");
    const placed = blocks(html);

    expect(html).not.toContain('id="dropped"');
    expect(placed.get("COMP1100 lecture")).toContain("Monday 10:00 to 12:00");
    expect(placed.get("COMP1100 tutorial")).toContain("Tuesday 14:00 to 15:00");
  });

  it("moves a tutorial to its other group rather than losing the course", async () => {
    // COMP1100 and COMP2100 both offer their first tutorial at Tue 14:00, and
    // both have a second group, so the clash costs a slot and not a course.
    await add("COMP1100", 1);
    await add("COMP2100", 2);

    const html = await page("/schedule/");
    const placed = blocks(html);

    expect(html).not.toContain('id="dropped"');
    expect(placed.get("COMP1100 tutorial")).toContain("Tuesday 14:00 to 15:00");
    expect(placed.get("COMP2100 tutorial")).toContain("Friday 14:00 to 15:00");
  });

  it("drops the lower-priority course when the lectures cannot both happen", async () => {
    // COMP1100 and COMP2620 lecture at the same hour, and a lecture cannot move.
    await add("COMP1100", 1);
    await add("COMP2620", 2);

    const html = await page("/schedule/");

    expect(blocks(html).has("COMP1100 lecture")).toBe(true);
    expect(section(html, "dropped")).toMatch(/COMP2620[\s\S]*?cannot move[\s\S]*?COMP1100/);
  });

  it("swaps which course is dropped when the priorities swap", async () => {
    // The same two courses, added in the same order — so if the outcome
    // flips, priority is what decided it, not insertion order or course id.
    await add("COMP1100", 1);
    await add("COMP2620", 2);
    const rows = await wishlist();

    await post(`/api/selections/${rows.get("COMP1100")!.id}/priority`, { priority: "5" });

    const html = await page("/schedule/");
    expect(blocks(html).has("COMP2620 lecture")).toBe(true);
    expect(section(html, "dropped")).toMatch(/COMP1100[\s\S]*?cannot move[\s\S]*?COMP2620/);
  });
});

describe("the week's preferences", () => {
  it("keeps a saved week across a reload", async () => {
    await setTimes({ "Fri-pm": "no", "Tue-am": "prefer" });

    const html = await page("/times/");
    expect(html).toMatch(/name="Fri-pm"[\s\S]*?<option value="no" selected/);
    expect(html).toMatch(/name="Tue-am"[\s\S]*?<option value="prefer" selected/);
  });

  it("steers a tutorial away from a half-day kept clear", async () => {
    await add("COMP1100", 1);
    await setTimes({ "Tue-pm": "no" });

    const placed = blocks(await page("/schedule/"));

    // its other group, rather than the Tuesday one it would otherwise take
    expect(placed.get("COMP1100 tutorial")).toContain("Thursday 14:00 to 15:00");
  });

  it("drops a course whose lecture only runs in a half-day kept clear", async () => {
    await add("COMP1100", 1);
    await setTimes({ "Mon-am": "no" });

    const html = await page("/schedule/");

    expect(section(html, "scheduled")).toContain("Nothing could be placed");
    expect(section(html, "dropped")).toMatch(/COMP1100[\s\S]*?keeping clear/);
  });
});

describe("the wishlist is yours", () => {
  it("keeps one visitor's wishlist out of another's", async () => {
    await add("COMP2310", 1);
    const first = visitor;

    visitor = "";
    expect((await wishlist()).has("COMP2310")).toBe(false);
    expect((await addable()).has("COMP2310")).toBe(true);

    visitor = first;
    expect((await wishlist()).get("COMP2310")?.priority).toBe("1");
  });

  it("keeps one visitor's times out of another's", async () => {
    await setTimes({ "Fri-pm": "no" });
    const first = visitor;

    visitor = "";
    expect(await page("/times/")).toMatch(/name="Fri-pm"[\s\S]*?<option value="ok" selected/);

    visitor = first;
    expect(await page("/times/")).toMatch(/name="Fri-pm"[\s\S]*?<option value="no" selected/);
  });

  it("ignores a hand-made request against somebody else's course", async () => {
    await add("COMP2310", 1);
    const first = visitor;
    const { id } = (await wishlist()).get("COMP2310")!;

    visitor = "";
    await page("/");
    await post(`/api/selections/${id}/priority`, { priority: "9" });
    await post(`/api/selections/${id}/delete`);

    visitor = first;
    expect((await wishlist()).get("COMP2310")?.priority).toBe("1");
  });
});

describe("from a clash to the other outcome", () => {
  /** The dropped section's "rank above" button, as the ids it would post. */
  function swapOffer(html: string): { action: string; aheadOf: string } | undefined {
    const match = section(html, "dropped").match(
      /action="(\/api\/selections\/\d+\/promote)"[\s\S]*?name="aheadOf" value="(\d+)"/,
    );
    return match ? { action: match[1], aheadOf: match[2] } : undefined;
  }

  it("offers to rank a dropped course above the course that beat it", async () => {
    await add("COMP1100", 1);
    await add("COMP2620", 2);
    const rows = await wishlist();

    const html = await page("/schedule/");
    const offer = swapOffer(html);

    expect(offer?.action).toBe(`/api/selections/${rows.get("COMP2620")!.id}/promote`);
    expect(offer?.aheadOf).toBe(rows.get("COMP1100")!.id);
    expect(section(html, "dropped")).toContain("Rank COMP2620 above COMP1100");
  });

  it("swaps which course is kept in one step", async () => {
    await add("COMP1100", 1);
    await add("COMP2620", 2);
    const offer = swapOffer(await page("/schedule/"))!;

    const res = await post(offer.action, { aheadOf: offer.aheadOf });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/schedule/");

    const html = await page("/schedule/");
    expect(blocks(html).has("COMP2620 lecture")).toBe(true);
    expect(section(html, "dropped")).toMatch(/COMP1100[\s\S]*?cannot move[\s\S]*?COMP2620/);

    const rows = await wishlist();
    expect(rows.get("COMP2620")?.priority).toBe("1");
    expect(rows.get("COMP1100")?.priority).toBe("2");
  });

  it("offers no swap for a course lost to a half-day kept clear", async () => {
    await add("COMP1100", 1);
    await setTimes({ "Mon-am": "no" });

    expect(swapOffer(await page("/schedule/"))).toBeUndefined();
  });
});

describe("the example wishlist", () => {
  it("shows both kinds of clash in one click", async () => {
    const res = await post("/api/selections/example");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/schedule/");

    const html = await page("/schedule/");
    const placed = blocks(html);
    expect(placed.get("COMP1100 lecture")).toContain("Monday 10:00 to 12:00");
    expect(placed.get("COMP2100 tutorial")).toContain("Friday 14:00 to 15:00");
    expect(section(html, "dropped")).toMatch(/COMP2620[\s\S]*?cannot move[\s\S]*?COMP1100/);
  });

  it("leaves a wishlist you have started alone", async () => {
    await add("COMP2310", 1);

    await post("/api/selections/example");

    expect([...(await wishlist()).keys()]).toEqual(["COMP2310"]);
  });
});
