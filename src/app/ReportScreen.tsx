// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useRef, useState } from "react";

import {
  daysBetween,
  extendRange,
  isInRange,
  type DayKey,
  type DayRange,
  type WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  Button,
  CalendarIcon,
  CheckIcon,
  CloudUploadIcon,
  Modal,
  SegmentedControl,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import {
  MAX_RANGE_DAYS,
  bulkEntries,
  daysInRange,
  isSingleDay,
  loggedCount,
  rangeLength,
} from "./bulk.ts";
import { DiskIcon } from "./icons.tsx";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { formatDay, formatFullDay } from "./format.ts";
import { useT, type TFn } from "./i18n/index.ts";
import { dayHeadline } from "./labels.ts";
import { ReportFields } from "./ReportFields.tsx";
import { maskOf, type TemperatureUnit } from "./temperature.ts";
import { blankEntry, type DayEntry } from "./types.ts";
import type { DocStore } from "./useDocStore.ts";

// The screen the app opens on: one day, four taps, one Save — and the whole of
// it on one phone screen, without scrolling, on the smallest phone worth
// designing for.
//
// It is short on purpose. Every field that used to be here (how heavy the
// bleeding was, which moods, how far the mood moved on a 0–3 scale, a note) was
// asked every evening and read by nothing. Everything that *is* here is read:
// `bleeding` is the answer the derivation needs, and the other five are the
// evidence channels the forecast weighs each candidate onset day against.
//
// The four yes/no answers sit in one row rather than in a 2×2 block, and that
// is a height decision rather than a taste one — a second row of targets this
// size is the difference between a screen that fits a 375×667 phone and one
// that scrolls. Their labels are one word each for the same reason.
//
// The two measurements are stacked below them because neither is a tap: a
// temperature is a number and a test result is one of three states, and both
// need a control wide enough to be hit without aiming.
//
// The controls themselves are in `ReportFields.tsx`, because there are two ways
// into a report: this screen, where one is filed, and the Calendar screen's day
// editor, where one is corrected (see `DayEditModal.tsx`). The layout decisions
// above travel with them. What stays here is the draft, the day (or span) it is
// for, and what Save does with it.
//
// The layout is centred rather than top-aligned. There is still more screen
// than content, and putting the card under the thumb — instead of stranding it
// at the top above 200px of nothing — is what the space is for.
//
// The day is picked from the card itself: tapping the date opens the month
// grid. The old week strip cost a row of chevrons and seven buttons at the top
// of the screen to save one tap on the six days a year anyone back-fills.
//
// That picker also selects a *span*, which is the one bulk gesture the screen
// has: a period is five or six consecutive bleeding days, and filing one after
// the fact was the same four taps repeated six times. Save then writes the
// yes/no answers to every day in the span (see `bulk.ts`). The screen itself
// does not change shape for it — the same four buttons, the same Save — because
// a span is not a different kind of report, it is the same report on more days.
//
// The two measurements are the exception, and they are disabled rather than
// ignored while a span is selected: each is one morning's observation, and a
// control the user can still move whose value is then dropped on six days would
// promise something the save does not do. The readings and test results already
// on those days survive the write untouched.
//
// The draft is held locally and only reaches the store on Save. That keeps a
// half-finished report from moving the forecast under the user mid-edit, and
// makes "I opened the wrong day" a no-op rather than an edit to undo.
//
// Save confirms on the button itself — a checkmark where the disk glyph was,
// for a moment — rather than by raising a toast. There is no server here and
// nothing to wait for: the write is a synchronous line into a document on this
// device, so a card sliding in from the top of the screen was announcing a
// round trip that never happened, and it announced it over the top bar, away
// from the thumb that had just pressed the button. Confirmation belongs on the
// control that was pressed. A failed write is the opposite case — something the
// user has to be told, because the screen would otherwise look exactly as it
// does on success — and that one still raises a toast (see `useDocStore.ts`).

/** Which selection the date picker is making: one day, or a span of them. */
type PickerMode = "day" | "range";

type Props = {
  store: DocStore;
  today: DayKey;
  weekStartsOn: WeekStart;
  temperatureUnit: TemperatureUnit;
  /** True when a cloud account is connected, so Save can say where the report
   *  is going. It changes the glyph on the button and nothing else — the save
   *  itself is the same write to the same local document either way, and the
   *  push to the cloud is the sync engine's business afterwards. */
  cloudBacked: boolean;
  /** Raise a passing message. Saving no longer uses it — the button says so
   *  itself — so this is clearing, which removes reports and is worth a
   *  sentence naming how many. */
  onNotice: (message: string) => void;
};

/** How long Save wears its checkmark. Long enough to read after the thumb
 *  lifts, short enough that the button is back to naming its action before
 *  anyone would press it again. */
const CONFIRM_MS = 1600;

export function ReportScreen({
  store,
  today,
  weekStartsOn,
  temperatureUnit,
  cloudBacked,
  onNotice,
}: Props) {
  const t = useT();
  // The days this report is for. A one-day report is the degenerate span, so
  // there is one selection here rather than a day and an optional range beside
  // it — two pieces of state that can disagree about which days Save writes is
  // exactly the bug worth designing out.
  const [span, setSpan] = useState<DayRange>(() => ({
    start: today,
    end: today,
  }));
  const multi = !isSingleDay(span);
  const day = span.start;
  const spanDays = rangeLength(span);
  const spanLogged = multi ? loggedCount(store.data, span) : 0;
  const [pickerOpen, setPickerOpen] = useState(false);
  // The picker's own state, live only while it is open. `mode` is which of the
  // two selections is being made; `pending` is the first end of a range that
  // has been tapped but not finished — null means the next tap starts one.
  const [mode, setMode] = useState<PickerMode>("day");
  const [pending, setPending] = useState<DayRange | null>(null);
  const stored = store.data.entries[day] ?? null;

  // The editable draft. Re-seeded whenever the selected day changes (or the
  // stored entry does — a cloud pull can land while this screen is open), so
  // the form always shows what is actually saved for the day on display.
  const [draft, setDraft] = useState<DayEntry>(
    () => stored ?? blankEntry(day, new Date().toISOString()),
  );
  // The temperature box keeps the digits that were typed, not the number they
  // mean. "6" on the way to "6.5" is a complete reading (36.00) and a partial
  // one at the same time, and only the digits remember which — deriving them
  // back from the value would renumber the field under the typist.
  const [temperatureDigits, setTemperatureDigits] = useState(() =>
    maskOf(stored?.temperature ?? null, temperatureUnit),
  );

  // True for the moment after a save, which is the whole of the confirmation.
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropConfirm = useCallback(() => {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setConfirming(false);
  }, []);
  useEffect(() => dropConfirm, [dropConfirm]);

  useEffect(() => {
    const entry = store.data.entries[day];
    setDraft(entry ?? blankEntry(day, new Date().toISOString()));
    setTemperatureDigits(maskOf(entry?.temperature ?? null, temperatureUnit));
  }, [day, store.data.entries, temperatureUnit]);

  // Moving to another day drops the checkmark with the report it belonged to.
  // A tick left over from the previous day would read as a claim about the one
  // now on screen, which is the day nobody has saved yet.
  useEffect(() => {
    dropConfirm();
  }, [day, span.end, dropConfirm]);

  // So does a refused write. The store persists in an effect of its own, so the
  // failure lands a beat after the tap — and a checkmark sitting next to the
  // toast that says it didn't save is worse than either alone.
  useEffect(() => {
    dropConfirm();
  }, [store.writeFailures, dropConfirm]);

  /** Every change the form makes to the draft. It goes through here rather
   *  than through `setDraft` directly so an edit also takes the checkmark
   *  down: the instant a field moves, what is on screen is no longer what was
   *  saved, and the button must stop saying otherwise. */
  const edit = (patch: (prev: DayEntry) => DayEntry) => {
    dropConfirm();
    setDraft(patch);
  };

  const save = () => {
    const now = new Date().toISOString();
    if (multi) {
      // The yes/no answers over the span; each day keeps whatever temperature
      // and test result it already had (see `bulkEntries`).
      store.saveEntries(bulkEntries(store.data, span, draft, now));
    } else {
      store.saveEntry({ ...draft, date: day, updatedAt: now });
    }
    // The write is synchronous and local, so by here it has happened — the
    // only way it fails is the storage itself refusing, which `useDocStore`
    // reports on its own and `App` turns into a toast.
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    setConfirming(true);
    confirmTimer.current = setTimeout(() => {
      confirmTimer.current = null;
      setConfirming(false);
    }, CONFIRM_MS);
  };

  const clear = () => {
    dropConfirm();
    if (multi) {
      store.deleteEntries(daysInRange(span));
      setDraft(blankEntry(day, new Date().toISOString()));
      setTemperatureDigits("");
      onNotice(t("report.clearedRange", { count: String(spanDays) }));
      return;
    }
    store.deleteEntry(day);
    setDraft(blankEntry(day, new Date().toISOString()));
    setTemperatureDigits("");
    onNotice(t("report.cleared"));
  };

  const openPicker = () => {
    // Reopen in the mode the current selection is in, with no half-made range
    // left over from last time.
    setMode(multi ? "range" : "day");
    setPending(null);
    setPickerOpen(true);
  };

  const switchMode = (next: PickerMode) => {
    setMode(next);
    setPending(null);
    // Leaving range mode collapses the selection onto its first day. The span
    // is the thing range mode selects, so keeping one after switching away
    // would leave the screen writing six days while claiming to write one.
    if (next === "day" && multi) setSpan({ start: day, end: day });
  };

  const pickDay = (key: DayKey) => {
    if (mode === "day") {
      setSpan({ start: key, end: key });
      setPickerOpen(false);
      return;
    }
    // Two taps: the first drops an anchor, the second closes the span around
    // it — in either direction, so picking the end first still works.
    if (!pending) {
      setPending({ start: key, end: key });
      return;
    }
    setSpan(extendRange(pending, key));
    setPending(null);
    setPickerOpen(false);
  };

  // What the grid paints as the current span: the range being built if there
  // is one, otherwise whatever is already selected.
  const shown = mode === "range" ? (pending ?? span) : null;

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 px-4 py-4">
      <div className="flex flex-col items-center gap-1.5">
        {/* The date is the picker. Tapping it opens the month grid — there is
            no separate control, because the date is the only thing anyone
            would be pressing it for. */}
        <button
          type="button"
          onClick={openPicker}
          aria-label={t("report.pickDate")}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface-3 px-4 py-3 text-left transition-colors hover:border-accent/60 hover:bg-surface-2"
        >
          {/* The glyph is as tall as the three lines beside it and sits to
              their left, so the card reads as one object with a mark on it
              rather than as a caption with a decoration in the middle of it.
              At 56px the shared 2px stroke would draw a 4.7px outline — a
              different weight of glyph from every other one in the app — so
              the stroke is thinned back to something like its usual optical
              weight on the way up. */}
          <CalendarIcon className="h-14 w-14 shrink-0 stroke-[1.1] text-muted" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[0.7rem] font-medium tracking-wide text-muted uppercase">
              {t("report.forDay")}
            </span>
            <span className="text-xl leading-tight font-bold text-fg-bright">
              {headlineFor(t, span, today)}
            </span>
            <span className="text-xs text-muted">
              {multi
                ? t("report.rangeSpan", { count: String(spanDays) })
                : formatFullDay(day)}
            </span>
          </span>
        </button>
        {/* Whether this day already carries a report — the answer to "did I
            log today?", which is most of why the app gets opened at all. Over
            a span the same question needs a count: filing six days over a week
            where two are already logged is an overwrite, and the line is where
            that is visible before Save rather than after it. */}
        <p className="text-xs text-muted">
          {multi
            ? t("report.rangeLogged", {
                logged: String(spanLogged),
                count: String(spanDays),
              })
            : stored
              ? t("report.logged")
              : t("report.empty")}
        </p>
      </div>

      <ReportFields
        answers={draft}
        onAnswers={(patch) => edit((prev) => ({ ...prev, ...patch }))}
        fertilityTest={draft.fertilityTest}
        onFertilityTest={(fertilityTest) =>
          edit((prev) => ({ ...prev, fertilityTest }))
        }
        temperature={draft.temperature}
        digits={temperatureDigits}
        onTemperature={(temperature, digits) => {
          edit((prev) => ({ ...prev, temperature }));
          setTemperatureDigits(digits);
        }}
        temperatureUnit={temperatureUnit}
        span={multi}
      />

      <div className="flex flex-col items-center gap-2">
        {/* Twice the framework Button's own height. Save is the last gesture
            of the whole screen and the one made one-handed in the dark, so it
            gets a target sized for a thumb that is not aiming — the rest of
            the card is already tall enough that the extra rem costs nothing on
            a 375×667 screen. */}
        <Button
          variant="primary"
          className="h-[4.25rem] w-full rounded-2xl text-base font-semibold"
          onClick={save}
        >
          {/* Before the tap the glyph says where the report is going, which is
              the one thing about Save that is not already obvious from the
              word: a disk while the document lives on this device only, a
              cloud once an account is connected. It is decorative — the button
              already says what it does in words — so it carries no label of
              its own.

              After the tap both halves become the confirmation. The check is
              plain in either case, deliberately: a cloud with a tick would
              claim the report had reached the account, and all that has
              happened is a write to this device — the push is the sync
              engine's afterwards (see `useSyncEngine.ts`).

              `aria-live` on the wrapper is what carries the same news to a
              screen reader, since the label changing under a button that still
              has focus is otherwise silent. */}
          <span
            aria-live="polite"
            className="flex items-center justify-center gap-2"
          >
            {confirming ? (
              <CheckIcon className="h-5 w-5" />
            ) : cloudBacked ? (
              <CloudUploadIcon className="h-5 w-5" />
            ) : (
              <DiskIcon className="h-5 w-5" />
            )}
            {confirming
              ? multi
                ? t("report.savedRange", { count: String(spanDays) })
                : t("report.saved")
              : multi
                ? // The count is on the button because it is the one gesture
                  // on this screen that writes more than the day on display,
                  // and the number of days it writes is the thing worth being
                  // sure of.
                  t("report.saveRange", { count: String(spanDays) })
                : stored
                  ? t("report.saveExisting")
                  : t("report.saveNew")}
          </span>
        </Button>
        {/* Clearing is rarer than saving and destructive, so it reads as a
            link under the button rather than a second button beside it. The
            bin is what tells the two apart at a glance, which matters most in
            the half-second before the tap rather than after it. */}
        {(multi ? spanLogged > 0 : stored !== null) && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted hover:text-danger"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {multi ? t("report.clearRange") : t("report.clear")}
          </button>
        )}
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        labelledBy="date-picker-title"
        closeLabel={t("common.close")}
        centered
        size="max-w-xs"
      >
        {/* `app-cycle-calendar` is the stylesheet hook that gives each day
            cell a stacking context, so the range tint can sit behind the day
            number rather than over it (see `styles.css`). */}
        <div className="app-cycle-calendar p-4">
          <h2
            id="date-picker-title"
            className="mb-3 text-sm font-bold text-fg-bright"
          >
            {t("report.pickDate")}
          </h2>
          {/* One day or several, as a two-way switch above the grid. It is a
              mode rather than a modifier on the grid itself — a calendar where
              the second tap sometimes extends and sometimes replaces is one
              nobody can predict, and the switch is what makes which one it is
              readable before the tap. */}
          <SegmentedControl<PickerMode>
            value={mode}
            options={[
              { value: "day", label: t("report.modeDay") },
              { value: "range", label: t("report.modeRange") },
            ]}
            onChange={switchMode}
            ariaLabel={t("report.modeLabel")}
            fullWidth
            className="mb-3"
          />
          <MonthCalendar
            anchor={day}
            selected={pending ? pending.start : day}
            max={today}
            // Once an anchor is down, everything past the span cap is greyed
            // out: the limit is visible in the grid rather than discovered by
            // a tap that does nothing.
            isDisabled={
              pending
                ? (key) =>
                    Math.abs(daysBetween(pending.start, key)) >= MAX_RANGE_DAYS
                : undefined
            }
            weekStartsOn={weekStartsOn}
            onSelect={pickDay}
            renderDay={
              shown && !isSingleDay(shown)
                ? (cell) =>
                    isInRange(cell.key, shown) ? (
                      <RangeFill
                        first={cell.key === shown.start}
                        last={cell.key === shown.end}
                      />
                    ) : null
                : undefined
            }
          />
          {mode === "range" && (
            <p className="mt-2 text-center text-xs text-muted">
              {pending
                ? t("report.rangeEndHint")
                : t("report.rangeStartHint", {
                    count: String(MAX_RANGE_DAYS),
                  })}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** The big line on the date card. "Today" and "Yesterday" carry more than a
 *  date does — they are the two days almost every report is filed for — and
 *  the exact date is spelled out underneath either way. A span gets both its
 *  ends in the short form: "3 Mar – 8 Mar" is what fits at this size on a
 *  375px screen, and the day count sits underneath it. */
function headlineFor(t: TFn, span: DayRange, today: DayKey): string {
  if (!isSingleDay(span)) {
    return `${formatDay(span.start)} – ${formatDay(span.end)}`;
  }
  return dayHeadline(t, span.start, today);
}

/** The tint behind a day that falls inside the span being picked. Drawn the
 *  way `DayMark` is — an absolutely positioned sibling at a negative stack
 *  level, so it sits behind the day number rather than over it, as a continuous
 *  band because a span is continuous and a row of separate circles reads as
 *  separate days. The half-cell bleed either side is what closes the grid's 2px
 *  cell padding so the band joins up; the two ends are the only ones rounded.
 *
 *  Squared-off corners rather than the calendar's round caps, because this band
 *  is a selection being dragged out and not a period: the rounded stroke means
 *  "this is a stretch of cycle", and a picker highlight borrowing it would say
 *  the same thing about days you are only pointing at. */
function RangeFill({ first, last }: { first: boolean; last: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-1 -inset-x-0.5 -z-10 bg-accent/25 ${
        first ? "rounded-l-md" : ""
      } ${last ? "rounded-r-md" : ""}`}
    />
  );
}
