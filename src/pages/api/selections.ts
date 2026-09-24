import type { APIRoute } from "astro";
import { addSelection, courseExists } from "../../lib/db";

// Put a course on the wishlist. A plain HTML form POSTs here and the 303 sends
// the browser back to a freshly rendered page, so the whole flow works with no
// client-side JavaScript at all.
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const form = await request.formData();
  const courseId = Number(form.get("courseId"));
  const priority = Number(form.get("priority"));

  // These come from a <select> and a number input, so anything invalid is a
  // hand-made request rather than a mistake worth explaining to someone.
  const valid =
    Number.isInteger(courseId) &&
    Number.isInteger(priority) &&
    priority >= 1 &&
    courseExists(courseId);

  if (valid) addSelection(locals.visitor, courseId, priority);

  return redirect("/", 303);
};
