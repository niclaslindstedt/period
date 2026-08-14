// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useMemo, useState } from "react";

import {
  addDays,
  startOfWeek,
  type DayKey,
  type WeekStart,
} from "@niclaslindstedt/oss-framework/calendar";
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Modal,
  SegmentedControl,
  Section,
  type SegmentOption,
} from "@niclaslindstedt/oss-framework/components";

import { DropletIcon, MoodIcon, WaveIcon } from "./icons.tsx";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { bleedingLabel, moodLabel, swingLabel } from "./labels.ts";
import { formatFullDay, formatWeekday } from "./format.ts";
import { useT } from "./i18n/index.ts";
import {
  BLEEDING_LEVELS,
  MOODS,
  MOOD_SWINGS,
  blankEntry,
  type BleedingLevel,
  type DayEntry,
  type MoodId,
  type MoodSwing,
} from "./types.ts";
import type { PeriodStore } from "./usePeriodStore.ts";

// The screen the app opens on: one day, four questions, one Save. Everything
// else in the app is derived from what is entered here, so it is deliberately
// the shortest screen — a week strip to land on the right day, bleeding, mood,
// how much the mood moved, and a note.
//
// The draft is held locally and only reaches the store on Save. That keeps a
// half-finished report from moving the forecast under the user mid-edit, and
// makes "I opened the wrong day" a no-op rather than an edit to undo.

type Props = {
  store: PeriodStore;
  today: DayKey;
  weekStartsOn: WeekStart;
  onSaved: (message: string) => void;
};

export function ReportScreen({ store, today, weekStartsOn, onSaved }: Props) {
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
  useEffect(() => {
    setDraft(
      store.data.entries[day] ?? blankEntry(day, new Date().toISOString()),
    );
  }, [day, store.data.entries]);

  // The week the selected day sits in, so the strip stays put while tapping
  // across it rather than re-centring under the finger.
  const weekStart = startOfWeek(day, weekStartsOn);
  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const bleedingOptions: SegmentOption<BleedingLevel>[] = BLEEDING_LEVELS.map(
    (level) => ({ value: level, label: bleedingLabel(t, level) }),
  );
  const swingOptions: SegmentOption<string>[] = MOOD_SWINGS.map((level) => ({
    value: String(level),
    label: swingLabel(t, level),
  }));

  const toggleMood = (mood: MoodId) =>
    setDraft((prev) => ({
      ...prev,
      // Kept in roster order rather than tap order so the stored document is
      // byte-identical however the moods were tapped (see `migrations.ts`).
      moods: prev.moods.includes(mood)
        ? prev.moods.filter((m) => m !== mood)
        : MOODS.filter((m) => m === mood || prev.moods.includes(m)),
    }));

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
    onSaved(t("report.cleared"));
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {/* Week strip. Each day says whether it holds a report, so a gap in the
          week is visible without opening every day in turn. */}
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setDay(addDays(day, -7))}
          aria-label={t("report.prevWeek")}
          className="flex w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {week.map((key) => {
            const entry = store.data.entries[key];
            const selected = key === day;
            const isToday = key === today;
            const future = key > today;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDay(key)}
                disabled={future}
                aria-current={selected ? "date" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-xs transition-colors ${
                  selected
                    ? "border-accent bg-accent/15 text-fg-bright"
                    : "border-line text-muted hover:bg-surface-2"
                } ${future ? "opacity-40" : ""}`}
              >
                <span className="text-[0.65rem] uppercase">
                  {formatWeekday(key)}
                </span>
                <span className={isToday ? "font-bold text-accent" : ""}>
                  {Number(key.slice(8))}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    entry ? "bg-accent" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setDay(addDays(day, 7))}
          disabled={addDays(day, 7) > addDays(today, 6)}
          aria-label={t("report.nextWeek")}
          className="flex w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-base font-bold text-fg-bright">
          {day === today ? t("common.today") : formatFullDay(day)}
        </h1>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="text-xs text-link hover:underline"
        >
          {t("report.pickDate")}
        </button>
      </div>

      <Section
        title={t("bleeding.label")}
        icon={<DropletIcon className="h-3.5 w-3.5" />}
      >
        {/* `bleeding-scale` tightens the five options so the track fits a
            phone — see styles.css. */}
        <SegmentedControl
          value={draft.bleeding}
          options={bleedingOptions}
          onChange={(bleeding) => setDraft((prev) => ({ ...prev, bleeding }))}
          ariaLabel={t("bleeding.label")}
          className="bleeding-scale"
          fullWidth
        />
      </Section>

      <Section
        title={t("mood.label")}
        icon={<MoodIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-xs text-muted">{t("mood.hint")}</p>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((mood) => {
            const on = draft.moods.includes(mood);
            return (
              <button
                key={mood}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMood(mood)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  on
                    ? "border-accent bg-accent/15 text-fg-bright"
                    : "border-line text-muted hover:bg-surface-2"
                }`}
              >
                {moodLabel(t, mood)}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title={t("swing.label")}
        icon={<WaveIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-xs text-muted">{t("swing.hint")}</p>
        <SegmentedControl
          value={String(draft.swing)}
          options={swingOptions}
          onChange={(next) =>
            setDraft((prev) => ({
              ...prev,
              swing: Number(next) as MoodSwing,
            }))
          }
          ariaLabel={t("swing.label")}
          fullWidth
        />
      </Section>

      <Section title={t("report.noteLabel")}>
        <textarea
          // Keyed on the day so switching days replaces the draft text rather
          // than carrying the previous day's note across.
          key={day}
          rows={3}
          value={draft.note ?? ""}
          placeholder={t("report.notePlaceholder")}
          onChange={(e) =>
            setDraft((prev) => ({
              ...prev,
              note: (e.target as HTMLTextAreaElement).value,
            }))
          }
          className="w-full min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
        />
      </Section>

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={save}>
          {stored ? t("report.saveExisting") : t("report.saveNew")}
        </Button>
        {stored && (
          <Button variant="danger" onClick={clear}>
            {t("report.clear")}
          </Button>
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
