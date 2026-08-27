// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState, type ReactNode } from "react";

import {
  HeartIcon,
  SegmentedControl,
} from "@niclaslindstedt/oss-framework/components";

import type { BulkAnswers } from "./bulk.ts";
import {
  DropletIcon,
  RingsIcon,
  TestStripIcon,
  ThermometerIcon,
  WaveIcon,
} from "./icons.tsx";
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
import type { FertilityTest } from "./types.ts";

// The report itself, as controls: the four yes/no answers, the ovulation test
// and the waking temperature.
//
// It lives here rather than inside `ReportScreen.tsx` because there are now two
// ways into a report. The Report screen is where one is filed; the Calendar
// screen is where one is *corrected* — tap the day, change what is wrong, or
// delete it (see `DayEditModal.tsx`). Both are editing the same six fields, and
// a second copy of these controls is exactly how the two would come apart: a
// tri-state test on one and a toggle on the other, a temperature that accepts
// a fever in one place and rejects it in the other. One module, one set of
// rules about what a report can say.
//
// What is *not* here is the draft. Each caller holds its own — the screen keeps
// one for the day it is showing, the modal keeps one for the day it was opened
// on — because the two commit at different moments (a Save on the screen, a
// Save that also closes the dialog) and neither should be able to leave a
// half-typed reading sitting in the other.

/** The four yes/no answers, in one row.
 *
 *  Targets this size cost less height than four labelled rows would, which is
 *  what buys the two measurements their room on a 375×667 screen — and it is
 *  the whole of what a *span* can carry, so the range editor mounts this row on
 *  its own (see `RangeEditModal.tsx`). */
export function AnswerRow({
  answers,
  onChange,
}: {
  answers: BulkAnswers;
  onChange: (patch: Partial<BulkAnswers>) => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-4 gap-2">
      <Answer
        icon={<DropletIcon className="h-6 w-6" />}
        label={t("report.blood")}
        value={answers.bleeding}
        onChange={(bleeding) => onChange({ bleeding })}
      />
      <Answer
        icon={<WaveIcon className="h-6 w-6" />}
        label={t("report.swings")}
        value={answers.moodSwings}
        onChange={(moodSwings) => onChange({ moodSwings })}
      />
      <Answer
        icon={<HeartIcon className="h-6 w-6" />}
        label={t("report.lust")}
        value={answers.lust}
        onChange={(lust) => onChange({ lust })}
      />
      <Answer
        icon={<RingsIcon className="h-6 w-6" />}
        label={t("report.sex")}
        value={answers.sex}
        onChange={(sex) => onChange({ sex })}
      />
    </div>
  );
}

/** The whole report: the answers, the test, and the temperature.
 *
 *  `span` is true when the answers are about to be written to several days at
 *  once. The two measurements then stay on screen and stop accepting a value,
 *  because each is one morning's observation and a span has nowhere to put one
 *  — see `bulk.ts` for what a span save does with the readings already on the
 *  days it covers (it keeps them). */
export function ReportFields({
  answers,
  onAnswers,
  fertilityTest,
  onFertilityTest,
  temperature,
  digits,
  onTemperature,
  temperatureUnit,
  span = false,
}: {
  answers: BulkAnswers;
  onAnswers: (patch: Partial<BulkAnswers>) => void;
  fertilityTest: FertilityTest | null;
  onFertilityTest: (next: FertilityTest | null) => void;
  temperature: number | null;
  digits: string;
  onTemperature: (celsius: number | null, digits: string) => void;
  temperatureUnit: TemperatureUnit;
  span?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <AnswerRow answers={answers} onChange={onAnswers} />
      <FertilityTestField
        // Blank over a span, on the same reasoning as the temperature: the
        // control is not showing a value there, so showing one would read as
        // the value about to be written to all of them.
        value={span ? null : fertilityTest}
        disabled={span}
        onChange={onFertilityTest}
      />
      <Temperature
        unit={temperatureUnit}
        // Blank rather than the span's first day's reading: over a span this
        // control is not showing a value, so showing one would read as the
        // value about to be written to all of them.
        celsius={span ? null : temperature}
        digits={span ? "" : digits}
        disabled={span}
        onChange={onTemperature}
      />
    </div>
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
          className="temperature-box flex h-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface-3 px-2.5 focus-within:border-accent"
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
