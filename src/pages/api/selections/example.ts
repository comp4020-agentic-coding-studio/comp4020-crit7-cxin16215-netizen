import type { APIRoute } from "astro";
import { addExample } from "../../../lib/db";

// Fill an empty wishlist with courses that clash in both ways the scheduler
// knows about, then show the week they make.
export const POST: APIRoute = ({ redirect, locals }) => {
  addExample(locals.visitor);
  return redirect("/schedule/", 303);
};
