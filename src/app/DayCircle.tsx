// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The one place a day's status turns into a colour.
//
// Both the Calendar screen's month grid and the Status screen's week row paint
// days, and they have to paint them identically — the same day seen twice in
// two colours is worse than either colour alone. So the status → tone mapping
// and the class list for each tone live here, and the legend is generated from
// the same table rather than hand-kept beside it.
//
// The circle sits *behind* the day number rather than as a glyph under it. A
// mark below the digits cost a row of height in every cell and read as a
// footnote; a filled circle is the number itself saying what kind of day it
// is, which is what a calendar is for. It is drawn as an absolutely positioned
// sibling at a negative stack level, because the framework's `MonthGrid` owns
// the cell's markup and renders the app's `renderDay` output *after* the
// number — the negative z-index is what puts it underneath. The cell needs a
// stacking context of its own for that to stay local, which the stylesheet
// gives it (`.app-cycle-calendar`, see styles.css).

import type { DayStatus } from "./dayStatus.ts";
import { useT } from "./i18n/index.ts";

/** How a day is painted. `none` draws nothing at all — an unreported day in a
 *  quiet part of the cycle should look like empty calendar, not like a fifth
 *  category. */
export type DayTone = "period" | "predicted" | "fertile" | "reported" | "none";

/** The fill for each tone. Every one is a translucent tint rather than a solid
 *  colour: the day number's own colour is the framework's (`text-fg`, or the
 *  accent on today), and a tint keeps all of them legible in both themes
 *  without this module having to reach in and restyle text it does not own. */
const TONE_CLASS: Record<Exclude<DayTone, "none">, string> = {
  period: "bg-accent/45",
  predicted: "border border-accent/70 bg-accent/10",
  fertile: "bg-link/30",
  reported: "bg-muted/20",
};

/** Which tone a status wears. Reported-but-quiet days come last so a logged
 *  fertile day still reads as fertile. */
export function toneFor(status: DayStatus): DayTone {
  if (status.kind === "period") return "period";
  if (status.kind === "predictedPeriod") return "predicted";
  if (status.kind === "fertile") return "fertile";
  if (status.reported) return "reported";
  return "none";
}

/** The circle itself. Non-interactive and absolutely positioned — the cell
 *  around it is the button. */
export function DayCircle({ tone }: { tone: DayTone }) {
  if (tone === "none") return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-1 -z-10 rounded-full ${TONE_CLASS[tone]}`}
    />
  );
}

/** The key to the colours, built from the same table the cells read. `fertile`
 *  is dropped when the fertile window is turned off, which is the whole point
 *  of that setting — the screen must not explain a colour it never paints. */
export function DayLegend({ showFertile }: { showFertile: boolean }) {
  const t = useT();
  const tones: Exclude<DayTone, "none">[] = showFertile
    ? ["period", "predicted", "fertile", "reported"]
    : ["period", "predicted", "reported"];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {tones.map((tone) => (
        <li key={tone} className="flex items-center gap-1.5">
          {/* `shrink-0`: an empty span's min-content width is zero, so on a
              narrow row it would give up its swatch to the label beside it. */}
          <span
            className={`h-3 w-3 shrink-0 rounded-full ${TONE_CLASS[tone]}`}
          />
          {t(`calendar.legend.${tone}` as const)}
        </li>
      ))}
    </ul>
  );
}
