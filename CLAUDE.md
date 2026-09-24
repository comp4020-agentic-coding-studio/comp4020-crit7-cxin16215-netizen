# Coursefit — agent rules

Coursefit models the gap between choosing ANU courses and getting a timetable.
It makes one promise: the week follows from your ranking, and every course it
loses comes with an explanation. Each rule below exists to keep that promise
from eroding one reasonable-looking change at a time.

## 1. The promise

- Priority order is absolute. Once a course is scheduled it is never revisited,
  so a lower-ranked course can never displace a higher-ranked one. Do not
  "improve" the scheduler by maximising the number of courses placed. That is
  the trade the ranking exists to refuse. `spec/scheduler.test.ts` enforces it.
- **Keep it clear** is a rule and **Aim for it** is a wish. A wish only chooses
  between times a course could already take and never costs it its place. A
  rule can drop a course, and the page says so. Every page, comment and README
  line describes the two the same way.
- Every dropped course explains itself in plain words: which part couldn't be
  placed, which times it has, and what each one collided with. A new way of
  losing a course isn't finished until the "Couldn't fit" section can explain it.
- The scheduler never special-cases `kind`. A lecture is immovable because it
  was seeded with one time. If a change seems to need
  `if (kind === "lecture")`, the data is wrong, so fix the seed instead.

## 2. Data and migrations

- `src/lib/schema.ts` is the ground truth. To change it: edit it, run
  `pnpm db:generate`, and commit the schema and the migration together. Never
  edit a database by hand.
- Read every migration `pnpm db:generate` writes before trusting it, and apply
  it to a fresh database and to a copy of `.data/app.db` before committing. Its
  SQLite output can be SQL that SQLite refuses: 0007 came out as `ADD COLUMN
  ... NOT NULL` with no default and had to be rewritten as a table rebuild.
- Never edit a migration that has been committed. Add a new one. The Fly volume
  keeps every migration it has applied, and Drizzle won't re-run an edited one,
  so an edited migration leaves the live database silently out of step with the
  code.
- Reference data (the catalog and its lectures and tutorials) arrives as
  hand-written seed migrations, not as seeding code that runs at
  startup. Each seed migration's header comment lists every deliberate collision
  the spec tests rely on. Changing the data means updating that header and those
  tests in the same commit.
- Deploy only committed work. `flyctl deploy` uploads the working tree, not
  `HEAD`, and migrations apply to the persistent volume when the server boots.

## 3. Shape of the app

- The wishlist and the preferences belong to a visitor, whose id
  `src/middleware.ts` puts in `Astro.locals.visitor`. Every read and every write
  of `selections` and `preferences` filters on it, including a lookup by an id
  taken from the URL. A query without that filter leaks into somebody else's
  week. `spec/crit-7.test.ts` checks that a hand-made request can't cross over.
- `src/lib/scheduler.ts` stays pure: no database, Drizzle or Astro imports. A
  new rule is stated as a fixture test in `spec/scheduler.test.ts` first.
- The core flow needs no client-side JavaScript. A form posts, the handler
  validates it, a 303 redirects, and the page re-renders from SQLite. A
  malformed hand-made request is ignored. It is never a 500.
- The schedule is computed on every request and never stored.
- When you add a page, add its route to `spec/routes.ts`, or the invariants and
  the accessibility floor stop covering it.

## 4. Spec discipline

- `spec/crit-7.test.ts` drives the running server over HTTP, through the same
  forms a person uses. Fixtures are course codes. Database ids are scraped from
  the rendered page and never hard-coded, so reseeding can't quietly make a test
  assert the wrong thing.
- Test what a person can see: where a lecture landed, which course was dropped,
  and why. Where a test needs a hook (`id="scheduled"`, `id="dropped"`, the
  priority field's `aria-label`), keep that hook stable.
- Keep `invariants.test.ts` and `readme.test.ts` green and never delete them.
  Each block in the week grid states its own day and time for anyone reading it
  outside its column.

## 5. Process honesty

- `PROCESS.md` cites only commit SHAs that exist in this repo. Write it after
  the commits it cites, never before.
- Commit as each piece of work lands, not as one batch at the end. A history
  written after the fact is evidence of a retrofitted process, not a clean one.
- Never claim a result that wasn't actually produced and checked. "Not
  verified" is worth more than a confident guess.

## 6. Check discipline

- Run `pnpm check` after every change that touches the scheduler, the schema or
  a page. Fix red immediately.
- A change to a page isn't done until it has been looked at in a real browser,
  at desktop width and at about 400px. The tests read HTML, not layout: a
  two-hour lecture drawn as one hour, and a wishlist whose last two columns fell
  off a phone screen, both passed every test.
- Before calling the work finished: `pnpm check:evidence` passes, `README.md`
  describes the app rather than the template, and the deployed app loads at its
  `*.fly.dev` URL with a wishlist that survives a reload.
- A green `pnpm check` is backpressure, not a mark. It can't tell whether an
  explanation reads clearly or whether this is the right slice of ANU to fix.
