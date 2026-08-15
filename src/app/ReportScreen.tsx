// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState, type ReactNode } from "react";

import {
  addDays,
  type DayKey,
  type WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  Button,
  CalendarIcon,
  Modal,
} from "@niclaslindstedt/oss-framework/components";

import { DropletIcon, ThermometerIcon, WaveIcon } from "./icons.tsx";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { formatDay, formatFullDay } from "./format.ts";
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
import { blankEntry, type DayEntry } from "./types.ts";
import type { PeriodStore } from "./usePeriodStore.ts";

// The screen the app opens on: one day, two questions, one Save — and the
// whole of it on one phone screen, without scrolling, on the smallest phone
// worth designing for.
//
// It is short on purpose. Every field that used to be here (how heavy the
// bleeding was, which moods, how far the mood moved on a 0–3 scale, a note) was
// asked every evening and read by nothing: the forecast is built from bleeding
// days alone. `bleeding` is the one answer the derivation needs, and
// `moodSwings` is the one pattern worth plotting against it.
//
// The layout is centred rather than top-aligned. With three controls there is
// more screen than content, and putting the card under the thumb — instead of
// stranding it at the top above 300px of nothing — is what the space is for.
//
// The day is picked from the card itself: tapping the date opens the month
// grid. The old week strip cost a row of chevrons and seven buttons at the top
// of the screen to save one tap on the six days a year anyone back-fills.
//
// The draft is held locally and only reaches the store on Save. That keeps a
// half-finished report from moving the forecast under the user mid-edit, and
// makes "I opened the wrong day" a no-op rather than an edit to undo.

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
  const [day, setDay] = useState<DayKey>(today);
  const [pickerOpen, setPickerOpen] = useState(false);
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
    store.saveEntry({
      ...draft,
      date: day,
      updatedAt: new Date().toISOString(),
    });
    onSaved(t("report.saved"));
  };

  const clear = () => {
    store.deleteEntry(day);
    setDraft(blankEntry(day, new Date().toISOString()));
    setTemperatureDigits("");
    onSaved(t("report.cleared"));
  };

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 px-4 py-4">
      <div className="flex flex-col items-center gap-1.5">
        {/* The date is the picker. Tapping it opens the month grid — there is
            no separate control, because the date is the only thing anyone
            would be pressing it for. */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={t("report.pickDate")}
          className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-line bg-surface-3 px-4 py-3 transition-colors hover:border-accent/60 hover:bg-surface-2"
        >
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-muted uppercase">
            <CalendarIcon className="h-3.5 w-3.5" />
            {t("report.forDay")}
          </span>
          <span className="text-xl leading-tight font-bold text-fg-bright">
            {headlineFor(t, day, today)}
          </span>
          <span className="text-xs text-muted">{formatFullDay(day)}</span>
        </button>
        {/* Whether this day already carries a report — the answer to "did I
            log today?", which is most of why the app gets opened at all. */}
        <p className="text-xs text-muted">
          {stored ? t("report.logged") : t("report.empty")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* The two questions, side by side. Two targets this size cost less
            height than two labelled rows did, which is what buys the
            temperature control its room on a 375×667 screen. */}
        <div className="grid grid-cols-2 gap-3">
          <Answer
            icon={<DropletIcon className="h-8 w-8" />}
            label={t("report.blood")}
            value={draft.bleeding}
            onChange={(bleeding) => setDraft((prev) => ({ ...prev, bleeding }))}
          />
          <Answer
            icon={<WaveIcon className="h-8 w-8" />}
            label={t("report.swings")}
            value={draft.moodSwings}
            onChange={(moodSwings) =>
              setDraft((prev) => ({ ...prev, moodSwings }))
            }
          />
        </div>
        <Temperature
          unit={temperatureUnit}
          celsius={draft.temperature}
          digits={temperatureDigits}
          onChange={(temperature, digits) => {
            setDraft((prev) => ({ ...prev, temperature }));
            setTemperatureDigits(digits);
          }}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button variant="primary" className="w-full" onClick={save}>
          {stored ? t("report.saveExisting") : t("report.saveNew")}
        </Button>
        {/* Clearing is rarer than saving and destructive, so it reads as a
            link under the button rather than a second button beside it. */}
        {stored && (
          <button
            type="button"
            onClick={clear}
            className="px-2 py-1 text-xs text-muted hover:text-danger"
          >
            {t("report.clear")}
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
        <div className="p-4">
          <h2
            id="date-picker-title"
            className="mb-3 text-sm font-bold text-fg-bright"
          >
            {t("report.pickDate")}
          </h2>
          <MonthCalendar
            anchor={day}
            selected={day}
            max={today}
            weekStartsOn={weekStartsOn}
            onSelect={(key) => {
              setDay(key);
              setPickerOpen(false);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}

/** The big line on the date card. "Today" and "Yesterday" carry more than a
 *  date does — they are the two days almost every report is filed for — and
 *  the exact date is spelled out underneath either way. */
function headlineFor(t: TFn, day: DayKey, today: DayKey): string {
  if (day === today) return t("common.today");
  if (day === addDays(today, -1)) return t("common.yesterday");
  return formatDay(day);
}

/**
 * The optional third field: this morning's waking temperature.
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
 * The slider's top stop is a fever. It is a reading worth keeping and a
 * reading the forecast cannot use, and the control is the honest place to say
 * both. The box says it in the word rather than in the 38.00 the stop happens
 * to store (see `readsAsFever`) — a number in that field is one somebody
 * measured, and the stop is not that.
 */
function Temperature({
  unit,
  celsius,
  digits,
  onChange,
}: {
  unit: TemperatureUnit;
  celsius: number | null;
  digits: string;
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg">
          <span className="text-muted">
            <ThermometerIcon className="h-4 w-4" />
          </span>
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs font-normal text-muted">
            {t("report.temperatureOptional")}
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
      {/* One line, and only when there is something to say. A fever is
          recorded and explained; a reading nobody wakes up with is queried
          rather than rejected. */}
      {(fever || low) && (
        <p className={`text-xs ${low ? "text-flag" : "text-muted"}`}>
          {t(low ? "report.temperatureUnusual" : "report.temperatureFeverHint")}
        </p>
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
 * One of the two questions, as a single button: the glyph large, its name
 * underneath, and pressing it means it happened. Lit in the app's own red when
 * it did, dimmed when it did not.
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
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 transition-colors ${
        value
          ? // The accent is this app's red (see styles.css). `page-bg` for the
            // contents is what the framework's solid buttons use, so the mark
            // and the label stay legible on the fill in both themes.
            "border-accent bg-accent text-page-bg"
          : "border-line bg-surface-3 text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {icon}
      <span className="text-center text-sm leading-tight font-semibold">
        {label}
      </span>
    </button>
  );
}
