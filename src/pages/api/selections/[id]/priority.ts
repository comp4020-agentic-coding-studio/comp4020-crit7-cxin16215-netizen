import type { APIRoute } from "astro";
import { updateSelectionPriority } from "../../../../lib/db";

// Change how much you want a course. Updating a row the wishlist no longer has
// simply affects nothing, which is the right answer for a stale open tab.
export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const form = await request.formData();
  const id = Number(params.id);
  const priority = Number(form.get("priority"));

  if (Number.isInteger(id) && Number.isInteger(priority) && priority >= 1) {
    updateSelectionPriority(locals.visitor, id, priority);
  }

  return redirect("/", 303);
};
