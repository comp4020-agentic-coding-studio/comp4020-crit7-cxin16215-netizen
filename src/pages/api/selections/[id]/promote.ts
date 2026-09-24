import type { APIRoute } from "astro";
import { promoteSelection } from "../../../../lib/db";

// "Rank this above the course that beat it", straight from the schedule page's
// explanation of a clash. Back to the schedule, because the question the button
// answers is what the week looks like the other way round.
export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const form = await request.formData();
  const id = Number(params.id);
  const aheadOf = Number(form.get("aheadOf"));

  if (Number.isInteger(id) && Number.isInteger(aheadOf)) {
    promoteSelection(locals.visitor, id, aheadOf);
  }

  return redirect("/schedule/", 303);
};
