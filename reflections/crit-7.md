# Crit 7 — Coursefit

## What was the breakthrough that moved the work forward?

I stopped treating every class time as interchangeable. In the first version,
the scheduler could only say a course did not fit. It could not tell whether a
clash had ruled out one tutorial group or the whole course.

Putting that difference in the data made the rest simpler. A lecture has one
possible time; a tutorial has a choice of groups. The scheduler does not need
to know which is which. It tries the available times and can now explain
exactly where it ran out of room. That gave me a better test, too: the seed
data contains a clash of each kind, and the HTTP tests check what the page
says about them.

## What did this work change about who I want to be as a software developer?

I want to get better at putting the important decisions somewhere the system
can hold me to them. Here, that meant the shape of the data, a unique index,
deliberate clashes in the seed, and a test that a lower-ranked course never
pushes out a higher-ranked one. Those choices say more about the app than a
paragraph describing what I meant to build.

I am also less willing to call a page done because the tests pass. The first
model worked but described the wrong problem. Later, the tests missed a
two-hour lecture displayed as one hour and a wishlist that did not fit on a
phone. I need to check both the rule the code enforces and the week a person
actually sees.
