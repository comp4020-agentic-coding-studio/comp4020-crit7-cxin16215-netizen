# Process overview

## What I built

Coursefit takes a ranked course wishlist and works out the week it can actually
fit. When a course drops out, it says which class caused the clash and why. The
`README.md` explains the app and what I think a good result looks like.

## How I got here

I made the first two passes on 21 September and committed them afterwards,
grouped by concern. That history shows what changed, but not exactly when I made
each decision.

At first, a course was a set of interchangeable time slots. The scheduler ran,
but it had no way to tell a tutorial clash from a lecture clash. Losing one
tutorial group is inconvenient; losing a fixed lecture can mean losing the
course. I changed the data to reflect that difference: each lecture has one
time, while a tutorial has a choice of groups. The scheduler does not need a
special rule for lectures. It simply runs out of options sooner ([`aca2a07`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-cxin16215-netizen/commit/aca2a07)).

I used the seed data to make that decision checkable. Its two deliberate clashes
cover both outcomes, and `spec/crit-7.test.ts` checks them over HTTP using
course codes rather than database IDs ([`dcde187`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-cxin16215-netizen/commit/dcde187)).

On 24 September, I asked the agent to look for the next thing worth fixing and
to inspect the app in a real browser at desktop and phone width. It found a
two-hour lecture drawn as one hour and a wishlist that ran off the phone screen.
Both had passed the tests ([`5a8bb61`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-cxin16215-netizen/commit/5a8bb61)). It also noticed that a shared wishlist would let
everyone at the crit edit the same week. I had it scope the wishlist to a visitor
cookie and add a button to rank a dropped course above the course that beat
it, so someone can see the trade for themselves ([`cc036a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-cxin16215-netizen/commit/cc036a4)).

That browser pass changed my rule for finishing a page. `CLAUDE.md` now asks for
a check at about 400px, because an HTTP test cannot tell whether the timetable
is readable ([`cadb2da`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-cxin16215-netizen/commit/cadb2da)). I still have not tested the explanations with someone choosing
courses, or established that this is the part of ANU enrolment most worth
fixing.
