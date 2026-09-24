# Coursefit

Coursefit answers the question enrolment leaves until too late: can the courses
I want actually share a week? You put courses on a wishlist and rank them, say
which half-days you want kept clear or would rather use, and it builds the week.
Lectures stay where they are, tutorials pick whichever group still fits, and any
course that can't be placed is listed with the exact clash that knocked it out.
Opening it cold? **Load an example** from the empty wishlist shows both kinds of
clash in one click.

## The slice of ANU it models

Choosing courses and getting a timetable are separate steps at ANU. You pick
courses first, and only find out two of them lecture at the same hour once class
registration opens and one has to go. Coursefit models the gap between those
steps: the catalog, lectures and tutorials, a ranked wishlist, and the week that
follows from them. It doesn't enrol you in anything.

## How it decides

- Courses get their pick of the week in priority order. A course ranked lower
  never bumps one ranked higher. Equal priorities go to whichever was added
  first.
- A lecture has one time and cannot move. A tutorial is offered in several
  groups, and a clash costs you a tutorial group before it costs you a course.
- **Keep it clear** is a rule: nothing is placed in that half-day, and a course
  whose lecture only runs then is dropped and says why.
- **Aim for it** is a wish: it only chooses between times a course could already
  take. When nothing else separates two options, the week gathers onto fewer
  days.
- The week is worked out fresh on every request, so there is no "regenerate"
  button to forget.

## What good looks like here

A timetable you can't argue with is worse than no timetable. Good here means
every outcome explains itself: a dropped course names the part that couldn't be
placed and what each of its times collided with. The page also offers the one
move that changes the outcome, as a button: rank the dropped course directly
above the course that beat it, and see the week the other way round.

I chose greedy-by-priority over maximising the number of courses placed. A
cleverer search could sometimes fit one more course overall by giving up a
mid-priority course for two low-priority ones, which is exactly the trade a
ranked list says not to make.

Everything works with plain forms: each change posts, redirects and re-renders
from SQLite, so the wishlist and your times survive a reload and a redeploy.
Each browser gets its own wishlist, so a room full of people can open the same
URL at once without editing each other's week. The week grid fits all five days
on a phone.

## What it leaves out

- Course codes and titles are real ANU School of Computing courses. The times
  are invented, because the point is the clash, not the 2026 timetable. Two
  collisions are deliberate: COMP1100 and COMP2620 lecture at the same hour, and
  COMP1100 and COMP2100 share a first tutorial group.
- Each course has one lecture and one tutorial. There are no labs, no multiple
  lecture streams and no teaching weeks.
- There are no accounts. A cookie ties a wishlist to one browser, so clearing
  cookies or switching browsers starts you over.
- Preferences are set per half-day, the grain people actually think in ("keep
  Friday clear").

## What is checked and what is judgement

`spec/scheduler.test.ts` states the scheduling rules against hand-made data:
priority beats wishlist order, a later course never displaces an earlier one,
and a half-day you aim for never costs a course its place. `spec/crit-7.test.ts`
drives the running server over HTTP. It checks that the wishlist and your times
survive a reload, that swapping two priorities swaps which course is dropped,
and that a half-day kept clear moves a tutorial or drops a course. It also
checks that one visitor can't see or change another's wishlist, even with a
hand-made request, and that the "rank above" button flips the outcome in one
step. Whether the explanations read clearly, and whether this is the right slice
of ANU to fix, are judgement calls, not tests.
