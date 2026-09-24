import type { APIRoute } from "astro";
import { setPreferences } from "../../lib/db";
import { DAYS, HALVES, type Stance, halfKey } from "../../lib/scheduler";

const STANCES: Stance[] = ["no", "ok", "prefer"];

// The form posts all ten half-days at once, so the week is saved whole. Any
// cell missing or unrecognised keeps whatever it already had rather than
// silently becoming "ok".
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const entries = DAYS.flatMap((day) =>
    HALVES.flatMap((half) => {
      const value = String(form.get(halfKey(day, half)) ?? "");
      return STANCES.includes(value as Stance) ? [{ day, half, stance: value as Stance }] : [];
    }),
  );

  setPreferences(entries);

  return redirect("/times/", 303);
};
