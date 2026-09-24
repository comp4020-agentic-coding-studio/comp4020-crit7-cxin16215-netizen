import { randomUUID } from "node:crypto";
import { defineMiddleware } from "astro:middleware";

// Every browser gets a random visitor id in a cookie, and every wishlist and
// preference row is keyed by it — so the deployed URL can be opened by a whole
// crit at once without anyone editing anyone else's week. It's not an account:
// clear your cookies and you start again with an empty list.
const COOKIE = "coursefit_visitor";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YEAR = 60 * 60 * 24 * 365;

export const onRequest = defineMiddleware((context, next) => {
  const held = context.cookies.get(COOKIE)?.value;
  const visitor = held && UUID.test(held) ? held : randomUUID();

  // Re-set on every response so the year counts from the last visit, not the first.
  context.cookies.set(COOKIE, visitor, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: context.url.protocol === "https:",
    maxAge: YEAR,
  });
  context.locals.visitor = visitor;

  return next();
});
