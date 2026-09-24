import type { APIRoute } from "astro";
import { removeSelection } from "../../../../lib/db";

// Take a course off the wishlist. A POST rather than a link because it changes
// state — and deleting a row that has already gone is a no-op, not an error.
export const POST: APIRoute = ({ params, redirect, locals }) => {
  const id = Number(params.id);
  if (Number.isInteger(id)) removeSelection(locals.visitor, id);

  return redirect("/", 303);
};
