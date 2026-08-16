// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState, type ReactNode } from "react";

import {
  addDays,
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
  HeartIcon,
  Modal,
  SegmentedControl,
} from "@niclaslindstedt/oss-framework/components";

import {
  MAX_RANGE_DAYS,
  bulkEntries,
  daysInRange,
  isSingleDay,
  loggedCount,
  rangeLength,
} from "./bulk.ts";
import {
  DropletIcon,
  RingsIcon,
  TestStripIcon,
  ThermometerIcon,
  WaveIcon,
} from "./icons.tsx";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { formatDay, formatFullDay, formatShortDay } from "./format.ts";
import { useT, type TFn } from "./i18n/index.ts";
import {
  SLIDER_MAX_INDEX,
  formatTemperature,
  isFever,
  isUnusuallyLow,
  maskCelsius,
  maskDigits,
  maskOf,
  maskText,
  sliderCelsiusAt,
  sliderIndexOf,
  type TemperatureUnit,
} from "./temperature.ts";
import { blankEntry, type DayEntry, type FertilityTest } from "./types.ts";
import type { PeriodStore } from "./usePeriodStore.ts";

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

/** Which selection the date picker is making: one day, or a span of them. */
type PickerMode = "day" | "range";

type Props = {
  store: PeriodStore;
  today: DayKey;
  weekStartsOn: WeekStart;
  temperatureUnit: TemperatureUnit;
  onSaved: (message: string) => void;
};

export function ReportScreen({
  store,
  today,
  weekStartsOn,
  temperatureUnit,
  onSaved,
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

  useEffect(() => {
    const entry = store.data.entries[day];
    setDraft(entry ?? blankEntry(day, new Date().toISOString()));
    setTemperatureDigits(maskOf(entry?.temperature ?? null, temperatureUnit));
  }, [day, store.data.entries, temperatureUnit]);

  const save = () => {
    const now = new Date().toISOString();
    if (multi) {
      // The yes/no answers over the span; each day keeps whatever temperature
      // and test result it already had (see `bulkEntries`).
      store.saveEntries(bulkEntries(store.data, span, draft, now));
      onSaved(t("report.savedRange", { count: String(spanDays) }));
      return;
    }
    store.saveEntry({ ...draft, date: day, updatedAt: now });
    onSaved(t("report.saved"));
  };

  const clear = () => {
    if (multi) {
      store.deleteEntries(daysInRange(span));
      setDraft(blankEntry(day, new Date().toISOString()));
      setTemperatureDigits("");
      onSaved(t("report.clearedRange", { count: String(spanDays) }));
      return;
    }
    store.deleteEntry(day);
    setDraft(blankEntry(day, new Date().toISOString()));
    setTemperatureDigits("");
    onSaved(t("report.cleared"));
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
          className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-line bg-surface-3 px-4 py-3 transition-colors hover:border-accent/60 hover:bg-surface-2"
        >
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-muted uppercase">
            <CalendarIcon className="h-3.5 w-3.5" />
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

      <div className="flex flex-col gap-3">
        {/* The four questions, in one row. Targets this size cost less height
            than four labelled rows would, which is what buys the two
            measurements their room on a 375×667 screen. */}
        <div className="grid grid-cols-4 gap-2">
          <Answer
            icon={<DropletIcon className="h-6 w-6" />}
            label={t("report.blood")}
            value={draft.bleeding}
            onChange={(bleeding) => setDraft((prev) => ({ ...prev, bleeding }))}
          />
          <Answer
            icon={<WaveIcon className="h-6 w-6" />}
            label={t("report.swings")}
            value={draft.moodSwings}
            onChange={(moodSwings) =>
              setDraft((prev) => ({ ...prev, moodSwings }))
            }
          />
          <Answer
            icon={<HeartIcon className="h-6 w-6" />}
            label={t("report.lust")}
            value={draft.lust}
            onChange={(lust) => setDraft((prev) => ({ ...prev, lust }))}
          />
          <Answer
            icon={<RingsIcon className="h-6 w-6" />}
            label={t("report.sex")}
            value={draft.sex}
            onChange={(sex) => setDraft((prev) => ({ ...prev, sex }))}
          />
        </div>
        <FertilityTestField
          // Blank over a span, on the same reasoning as the temperature: the
          // control is not showing a value there, so showing one would read as
          // the value about to be written to all of them.
          value={multi ? null : draft.fertilityTest}
          disabled={multi}
          onChange={(fertilityTest) =>
            setDraft((prev) => ({ ...prev, fertilityTest }))
          }
        />
        <Temperature
          unit={temperatureUnit}
          // Blank rather than the span's first day's reading: over a span this
          // control is not showing a value, so showing one would read as the
          // value about to be written to all of them.
          celsius={multi ? null : draft.temperature}
          digits={multi ? "" : temperatureDigits}
          disabled={multi}
          onChange={(temperature, digits) => {
            setDraft((prev) => ({ ...prev, temperature }));
            setTemperatureDigits(digits);
          }}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Twice the framework Button's own height. Save is the last gesture
            of the whole screen and the one made one-handed in the dark, so it
            gets a target sized for a thumb that is not aiming — the rest of
            the card is already tall enough that the extra rem costs nothing on
            a 375×667 screen. */}
        <Button
          variant="primary"
          className="h-[4.25rem] w-full text-base font-semibold"
          onClick={save}
        >
          {multi
            ? // The count is on the button because it is the one gesture on
              // this screen that writes more than the day on display, and the
              // number of days it writes is the thing worth being sure of.
              t("report.saveRange", { count: String(spanDays) })
            : stored
              ? t("report.saveExisting")
              : t("report.saveNew")}
        </Button>
        {/* Clearing is rarer than saving and destructive, so it reads as a
            link under the button rather than a second button beside it. */}
        {(multi ? spanLogged > 0 : stored !== null) && (
          <button
            type="button"
            onClick={clear}
            className="px-2 py-1 text-xs text-muted hover:text-danger"
          >
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
    return `${formatShortDay(span.start)} – ${formatShortDay(span.end)}`;
  }
  const day = span.start;
  if (day === today) return t("common.today");
  if (day === addDays(today, -1)) return t("common.yesterday");
  return formatDay(day);
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

/**
 * The ovulation test, as the three states a strip can be in.
 *
 * Three options rather than a toggle, because "no test" and "a negative test"
 * are different claims and the model treats them differently: a negative on the
 * day a surge was due is evidence, and a morning nobody tested is not. That is
 * the same distinction the document draws between an absent day and a no/no
 * day, and it is worth a third segment to keep.
 *
 * `None` is the left-hand default, where a blank report opens — most mornings
 * nobody tests, and a control that opened on an answer would collect one from
 * everybody who walked past it.
 */
function FertilityTestField({
  value,
  disabled = false,
  onChange,
}: {
  value: FertilityTest | null;
  /** True while a span is selected. Like the temperature, the control stays on
   *  screen and stops accepting a value a span has no room to store. */
  disabled?: boolean;
  onChange: (next: FertilityTest | null) => void;
}) {
  const t = useT();
  return (
    <div
      className={`flex flex-col gap-1.5 ${disabled ? "opacity-50" : ""}`}
      aria-disabled={disabled || undefined}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg">
        <span className="text-muted">
          <TestStripIcon className="h-4 w-4" />
        </span>
        <span className="truncate">{t("report.fertilityTest")}</span>
        <span className="shrink-0 text-xs font-normal text-muted">
          {disabled
            ? t("report.fertilityTestRangeOff")
            : t("report.fertilityTestOptional")}
        </span>
      </span>
      <SegmentedControl<FertilityTestChoice>
        value={value ?? "none"}
        options={[
          { value: "none", label: t("report.fertilityTestNone") },
          { value: "negative", label: t("report.fertilityTestNegative") },
          { value: "positive", label: t("report.fertilityTestPositive") },
        ]}
        onChange={(next) =>
          !disabled && onChange(next === "none" ? null : next)
        }
        ariaLabel={t("report.fertilityTest")}
        fullWidth
      />
    </div>
  );
}

/** The three segments, with "no test taken" spelled as a value so the control
 *  can be a plain single-choice switch rather than a switch with an escape
 *  hatch beside it. */
type FertilityTestChoice = FertilityTest | "none";

/**
 * The optional field below it: this morning's waking temperature.
 *
 * Optional in a way the two questions are not, and the control says so — it
 * opens on "nothing recorded" rather than on a plausible-looking default.
 * Nobody takes their temperature every day, and the model is built to cope
 * with that (see `forecastModel.ts`), so nagging for it would buy nothing.
 *
 * Two ways in, one value. The slider is the thumb-sized one: it spans the band
 * a waking temperature actually lives in, so the third of a degree the whole
 * signal consists of is worth a real amount of travel. The box is for the
 * mornings the exact reading matters, and it asks only for the digits that
 * carry information — the leading 3 (or 9, reading Fahrenheit) and the decimal
 * point are printed for you, so 6·5·0 is the whole gesture for 36.50.
 * `inputMode="numeric"` puts a keypad under those three taps.
 *
 * The slider's top stop is a fever: a reading worth keeping and a reading the
 * forecast cannot use. The box says it in the word rather than in the 38.00
 * the stop happens to store — a number in that field is one somebody measured,
 * and the stop is not that. What the screen does *not* do is explain the
 * second half; that the model leaves a fever out is a fact about the
 * derivation, and the Report screen is not where the derivation is discussed.
 */
function Temperature({
  unit,
  celsius,
  digits,
  disabled = false,
  onChange,
}: {
  unit: TemperatureUnit;
  celsius: number | null;
  digits: string;
  /** True while a span is selected. The control stays on screen — a field
   *  that vanishes reads as a field that was lost — but neither the box nor
   *  the slider accepts a value a span has no room to store. */
  disabled?: boolean;
  onChange: (celsius: number | null, digits: string) => void;
}) {
  const t = useT();
  const label = t("report.temperature");
  const fever = celsius !== null && isFever(celsius);
  const low = celsius !== null && isUnusuallyLow(celsius);
  // Whether the next digit starts a reading or continues one. A box that only
  // ever appended would be full after three digits and stuck; a box that
  // always restarted could not be corrected one digit at a time. Reaching for
  // the box is the line between them, which is also where the user draws it:
  // tapping in starts this morning's reading, and everything typed after that
  // belongs to it.
  const [fresh, setFresh] = useState(false);
  const commit = (next: string) => {
    setFresh(false);
    onChange(maskCelsius(next, unit), next);
  };
  // Leaving the box settles what is in it: the digits are re-derived from the
  // value that is actually stored, so a reading half typed reads back as the
  // two decimals it was stored with, one abandoned after the leading digit —
  // which is not a reading — reads back as the blank it amounts to, and a
  // fever reads back as the word. The value itself is left alone, because
  // settling the display is all this is: `maskOf` returns "" for a fever, and
  // running that back through the mask would clear a reading the user chose.
  const settle = () => {
    setFresh(false);
    onChange(celsius, maskOf(celsius, unit));
  };
  return (
    <div
      className={`flex flex-col gap-2 ${disabled ? "opacity-50" : ""}`}
      aria-disabled={disabled || undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg">
          <span className="text-muted">
            <ThermometerIcon className="h-4 w-4" />
          </span>
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs font-normal text-muted">
            {disabled
              ? t("report.temperatureRangeOff")
              : t("report.temperatureOptional")}
          </span>
        </span>
        {/* The whole number lives in the field — the leading digit is filled
            in on the first keystroke rather than printed beside the box, so
            what is on screen is always exactly what will be stored, and
            someone who types the 3 out of habit is not fighting it. */}
        <label
          data-flag={low ? "low" : undefined}
          className="temperature-box flex h-11 shrink-0 items-center gap-1 rounded-md border border-line bg-surface-3 px-2.5 focus-within:border-accent"
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={maskText(digits)}
            disabled={disabled}
            placeholder={
              fever
                ? t("report.temperatureFever")
                : t("report.temperaturePlaceholder")
            }
            aria-label={t("report.temperatureExact")}
            // The field is a keypad, not a text box: every edit is applied to
            // the digits by hand and the default one is cancelled. Tapping in
            // and typing three digits has to mean "this morning's reading"
            // wherever the caret happened to land, and a masked value edited
            // through the caret cannot promise that — insert a digit in the
            // middle of 36.50 and the number that comes out is a different
            // plausible reading rather than an obvious mistake.
            //
            // `beforeinput` rather than `keydown` because that is the event a
            // phone keyboard reliably fires; `onChange` is left as the net
            // underneath, so an insertion no browser let us cancel still ends
            // up as digits rather than as a desynced field.
            onFocus={() => setFresh(true)}
            // A tap as well as a focus: coming back to a box that is already
            // focused and already holding four digits would otherwise leave
            // nowhere for a new reading to go.
            onPointerDown={() => setFresh(true)}
            onBeforeInput={(e) => {
              const input = e as unknown as InputEvent;
              const type = input.inputType;
              if (type.startsWith("insert")) {
                e.preventDefault();
                const typed = (input.data ?? "").replace(/\D/g, "");
                if (typed === "") return;
                commit(maskDigits((fresh ? "" : digits) + typed, unit));
              } else if (type.startsWith("delete")) {
                e.preventDefault();
                commit(digits.slice(0, -1));
              }
            }}
            onChange={(e) => commit(maskDigits(e.currentTarget.value, unit))}
            onBlur={settle}
            // A fever is the one thing this box says in words, so the word is
            // set in the field's own type rather than in the placeholder's —
            // it is a recorded answer, not a prompt for one.
            className={`w-[3.25rem] bg-transparent text-right text-base text-fg-bright tabular-nums outline-none ${
              fever
                ? "placeholder:text-sm placeholder:font-semibold placeholder:text-fg-bright"
                : "placeholder:text-xs placeholder:text-muted"
            }`}
          />
          <span
            aria-hidden="true"
            className={`text-sm text-muted ${digits === "" ? "opacity-0" : ""}`}
          >
            {unit === "f" ? "°F" : "°C"}
          </span>
        </label>
      </div>
      {/* Index space, not degrees: the stops are "nothing recorded", the band
          in twentieths of a degree, and a fever at the far end. */}
      <input
        type="range"
        min={0}
        max={SLIDER_MAX_INDEX}
        step={1}
        value={sliderIndexOf(celsius)}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueTextFor(t, celsius, unit)}
        data-empty={celsius === null ? "true" : undefined}
        onInput={(e) => {
          const next = sliderCelsiusAt(Number(e.currentTarget.value));
          setFresh(false);
          onChange(next, maskOf(next, unit));
        }}
        className="temperature-slider"
      />
      {/* The two stops that are states rather than temperatures. Everything
          between them is a number, and the box is already showing it — so
          these are the only two the scale has to spell out. */}
      <div className="-mt-1 flex justify-between text-[0.65rem] text-muted">
        <span>{t("report.temperatureNone")}</span>
        <span>{t("report.temperatureFever")}</span>
      </div>
      {/* One line, and only when there is something to say: a reading nobody
          wakes up with is queried rather than rejected. A fever says nothing
          here — that it is recorded and that the model skips it is how the
          app works, not something the person holding the thermometer has to
          be told at 07:00. */}
      {low && (
        <p className="text-xs text-flag">{t("report.temperatureUnusual")}</p>
      )}
    </div>
  );
}

/** What a screen reader hears as the slider moves. The two ends are states
 *  rather than numbers, and reading them as 35.50 and 38.00 would lose exactly
 *  the thing that makes them different from the stops next to them. */
function valueTextFor(
  t: TFn,
  celsius: number | null,
  unit: TemperatureUnit,
): string {
  if (celsius === null) return t("report.temperatureNone");
  if (isFever(celsius)) return t("report.temperatureFever");
  return formatTemperature(celsius, unit);
}

/**
 * One of the four questions, as a single button: the glyph above its name, and
 * pressing it means it happened. Lit in the app's own red when it did, dimmed
 * when it did not.
 *
 * A toggle rather than the Yes/No pair this used to be. The objection to a
 * toggle is real — one left alone cannot say whether it was answered or
 * skipped, and this document's whole contract is that "no bleeding" and "no
 * report" are different claims (see `types.ts`). But it is Save that draws that
 * line here, not the control: nothing reaches the store until Save is pressed,
 * so a day saved with neither button lit is an explicit "I checked, nothing
 * happened", and a day never saved stays absent. The line under the date says
 * which of the two is on screen.
 *
 * What the pair buys for that is the whole report in one tap per question, on a
 * target a thumb finds without looking — which is the gesture the screen is
 * designed around. `aria-pressed` is what carries the answer to a screen
 * reader, so the unlit state is still an audible "no" rather than silence.
 */
function Answer({
  icon,
  label,
  value,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 transition-colors ${
        value
          ? // The accent is this app's red (see styles.css). `page-bg` for the
            // contents is what the framework's solid buttons use, so the mark
            // and the label stay legible on the fill in both themes.
            "border-accent bg-accent text-page-bg"
          : "border-line bg-surface-3 text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {icon}
      {/* `text-xs` and a tight leading are what let "Mood swings" wrap to two
          lines inside a quarter of a 375px screen without pushing the row
          taller than the icon it sits under. */}
      <span className="text-center text-xs leading-tight font-semibold">
        {label}
      </span>
    </button>
  );
}
