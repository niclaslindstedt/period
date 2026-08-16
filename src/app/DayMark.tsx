// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The one place a day's status turns into a mark.
//
// Both the Calendar screen's month grid and the Status screen's week row paint
// days, and they have to paint them identically — the same day seen twice in
// two colours is worse than either colour alone. So the status → tone mapping
// and the paint for each tone live here, and the legend is generated from the
// same table rather than hand-kept beside it.
//
// The shape carries as much meaning as the colour. A period and a fertile
// window are *spans* — they have a first day and a last day, and the days
// between them are one continuous thing — so they are drawn as a single stroke
// running from end to end with a rounded cap at each end, the way a range is
// drawn anywhere else. A row of separate circles would say "five days that each
// happen to be red" when what happened was one five-day period. A report with
// no bleeding on it is the opposite: it is a fact about that one day and joins
// up with nothing, so it stays a circle. Reading the calendar, the difference
// between a stroke and a dot is the difference between a stretch and an entry.
//
// A one-day span comes out of the same rule as a circle — capped at both ends
// with nothing in between — which is right: a period that lasted a day *is* a
// dot.
//
// The mark sits *behind* the day number rather than as a glyph under it. A mark
// below the digits cost a row of height in every cell and read as a footnote;
// painting behind the number is the number itself saying what kind of day it
// is, which is what a calendar is for. It is drawn as an absolutely positioned
// sibling at a negative stack level, because the framework's `MonthGrid` owns
// the cell's markup and renders the app's `renderDay` output *after* the
// number — the negative z-index is what puts it underneath. The cell needs a
// stacking context of its own for that to stay local, which the stylesheet
// gives it (`.app-cycle-calendar`, see styles.css).

import { addDays, type DayKey } from "@niclaslindstedt/oss-framework/calendar";

import type { DayStatus } from "./dayStatus.ts";
import { useT } from "./i18n/index.ts";

/** How a day is painted. `none` draws nothing at all — an unreported day in a
 *  quiet part of the cycle should look like empty calendar, not like a further
 *  category. */
export type DayTone =
  "period" | "predicted" | "fertile" | "predictedFertile" | "reported" | "none";

/** What a run of days *is*, which is not the same question as how a day is
 *  painted. A period that has been bled through and a period still to come are
 *  one stretch of cycle seen from either side of today — the first half filled
 *  in, the second not yet — so they belong to the same run and the change of
 *  paint happens mid-stroke rather than between two strokes. `null` is a day
 *  that joins up with nothing. */
type RunKind = "period" | "fertile" | null;

type ToneStyle = {
  /** The colour, and nothing else — no width, no radius, no side. The shape
   *  classes are composed around it, so the stroke in a cell and the swatch in
   *  the legend cannot drift apart on colour. */
  paint: string;
  /** The run this tone joins, or `null` for a mark that stands alone. */
  run: RunKind;
  /** Drawn as an outline rather than a fill, so the border-width classes have
   *  to be added per side (a stroke's sides are only capped at its ends). */
  outlined?: boolean;
};

/** The paint for each tone. The filled ones are translucent tints rather than
 *  solid colours: the day number's own colour is the framework's (`text-fg`,
 *  or the accent on today), and a tint keeps all of them legible in both themes
 *  without this module having to reach in and restyle text it does not own.
 *
 *  Hue says *what*, fill says *whether it has happened*. So each of the two
 *  things a cycle is made of comes in a pair: rose filled for the bleeding you
 *  reported and rose hollow for a period still expected, blue filled for the
 *  fertile window of a period that started and blue hollow for the window of one
 *  that has not. An outline is how a drawing says "this is where it will be"
 *  without claiming the day the way a filled stroke does — and a fertile window
 *  in front of a predicted period is exactly as provisional as the period it is
 *  counted back from, which a filled stroke there would quietly deny.
 *
 *  Running `predicted` in the same `period` run as the reported days is what
 *  makes those two read as one period whose far end has not happened yet: the
 *  fill stops where the reports stop, the outline carries on to where the period
 *  is expected to end, and the seam between them is straight because nothing
 *  ends there. The two fertile tones share a run for the same reason, though in
 *  practice they never meet — the windows they mark are a cycle apart. */
const TONE: Record<Exclude<DayTone, "none">, ToneStyle> = {
  period: { paint: "bg-accent/45", run: "period" },
  predicted: { paint: "border-accent/70", run: "period", outlined: true },
  fertile: { paint: "bg-link/30", run: "fertile" },
  predictedFertile: {
    paint: "border-link/70",
    run: "fertile",
    outlined: true,
  },
  reported: { paint: "bg-muted/20", run: null },
};

/** The run a day belongs to. An unpainted day joins nothing, and neither do two
 *  of them side by side — `null` never equals `null` here, which is why this
 *  returns it through a comparison that treats it as its own answer. */
function runOf(tone: DayTone): RunKind {
  return tone === "none" ? null : TONE[tone].run;
}

/** Whether two neighbouring days are the same stretch, and so should be drawn
 *  without a cap between them. Days that join nothing are never continuous,
 *  with each other least of all. */
function continues(here: RunKind, there: DayTone): boolean {
  return here !== null && runOf(there) === here;
}

/**
 * Which tone a status wears. Reported-but-quiet days come last so a logged
 * fertile day still reads as fertile.
 *
 * `expectedPeriod` and `expectedFertile` sit alongside the calls they echo
 * rather than below them, and they are what puts the months after next on the
 * calendar at all. A day is *called* a period day when it is more likely than
 * not one, which stops being true of any single day a few cycles out — but the
 * model still has a perfectly good opinion about where that period falls, and
 * the outline that has always meant "expected, not observed" is exactly the
 * mark for it (see `expectedPeriod` in `dayStatus.ts`). The word and the
 * percentage on the Status screen keep the stricter rule; only the paint reads
 * these.
 */
export function toneFor(status: DayStatus): DayTone {
  if (status.kind === "period") return "period";
  if (status.kind === "predictedPeriod" || status.expectedPeriod) {
    return "predicted";
  }
  // The filled fertile window comes first because it is the one anchored to a
  // day that actually happened. The two only ever compete where a projected
  // onset lands a cycle away from a logged one, and there the logged one is the
  // better claim — the same reason a reported bleeding day outranks everything
  // above.
  if (status.observedFertile) return "fertile";
  if (status.kind === "fertile" || status.expectedFertile) {
    return "predictedFertile";
  }
  if (status.reported) return "reported";
  return "none";
}

/** A day's mark: its tone, plus where it sits in the run of days it belongs to.
 *  `first` and `last` are what earn a rounded cap; an uncapped side runs on into
 *  the neighbouring cell. */
export type DayMarkShape = {
  tone: DayTone;
  first: boolean;
  last: boolean;
};

/**
 * Where a day sits in its run.
 *
 * A run is the maximal stretch of days belonging to the same thing, so the ends
 * are found by asking the neighbours — no span has to be assembled or stored,
 * and a caller painting one cell at a time (which the framework's grid is)
 * never needs to know what the rest of the month looks like. `toneAt` is
 * expected to answer for any day, including ones outside whatever the caller is
 * drawing: the first cell of a month is mid-period as often as not, and it has
 * to know that to leave its left side open.
 *
 * A cap therefore means "the stretch ends here", not "the colour changes here".
 * The two come apart exactly once — where reported bleeding meets the predicted
 * rest of the same period — and that is the point: the cap goes on the far end
 * of the prediction, where the period is actually expected to stop.
 *
 * Days that join nothing are capped both sides — one day, one mark.
 */
export function markFor(
  day: DayKey,
  toneAt: (day: DayKey) => DayTone,
): DayMarkShape {
  const tone = toneAt(day);
  const run = runOf(tone);
  return {
    tone,
    first: !continues(run, toneAt(addDays(day, -1))),
    last: !continues(run, toneAt(addDays(day, 1))),
  };
}

/** The mark itself. Non-interactive and absolutely positioned — the cell around
 *  it is the button.
 *
 *  The horizontal insets are the whole trick. A capped end stops `1` in from
 *  the cell edge, which puts the cap's centre exactly where the old circle's
 *  was; an open end bleeds half the grid's 2px cell padding (`-0.5`) so it
 *  meets its neighbour's bleed and the two read as one stroke. A run that
 *  crosses a week boundary is cut by the row, which is the row's job to say —
 *  the bleed stops at the cell padding, so it never spills out of the grid. */
export function DayMark({ tone, first, last }: DayMarkShape) {
  if (tone === "none") return null;
  const style = TONE[tone];
  const outline = style.outlined ? "border-y" : "";
  const left = first
    ? `left-1 rounded-l-full ${style.outlined ? "border-l" : ""}`
    : "-left-0.5";
  const right = last
    ? `right-1 rounded-r-full ${style.outlined ? "border-r" : ""}`
    : "-right-0.5";
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-1 -z-10 ${style.paint} ${outline} ${left} ${right}`}
    />
  );
}

/** The key to the colours, built from the same table the cells read — and to
 *  the shapes too: a span's swatch is a stroke and a single day's is a dot, so
 *  the legend explains the grammar and not only the palette.
 *
 *  `fertile` is dropped when the fertile window is turned off, which is the
 *  whole point of that setting — the screen must not explain a colour it never
 *  paints. */
export function DayLegend({ showFertile }: { showFertile: boolean }) {
  const t = useT();
  const tones: Exclude<DayTone, "none">[] = showFertile
    ? ["period", "predicted", "fertile", "predictedFertile", "reported"]
    : ["period", "predicted", "reported"];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {tones.map((tone) => {
        const style = TONE[tone];
        return (
          <li key={tone} className="flex items-center gap-1.5">
            {/* `shrink-0`: an empty span's min-content width is zero, so on a
                narrow row it would give up its swatch to the label beside it. */}
            <span
              className={`h-3 shrink-0 rounded-full ${style.run !== null ? "w-6" : "w-3"} ${
                style.outlined ? "border" : ""
              } ${style.paint}`}
            />
            {t(`calendar.legend.${tone}` as const)}
          </li>
        );
      })}
    </ul>
  );
}
