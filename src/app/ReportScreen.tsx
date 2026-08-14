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
  SegmentedControl,
} from "@niclaslindstedt/oss-framework/components";

import { DropletIcon, WaveIcon } from "./icons.tsx";
import { MonthCalendar } from "./MonthCalendar.tsx";
import { formatDay, formatFullDay } from "./format.ts";
import { useT, type TFn } from "./i18n/index.ts";
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
        <Answer
          icon={<DropletIcon className="h-4 w-4" />}
          label={t("report.blood")}
          value={draft.bleeding}
          onChange={(bleeding) => setDraft((prev) => ({ ...prev, bleeding }))}
        />
        <Answer
          icon={<WaveIcon className="h-4 w-4" />}
          label={t("report.swings")}
          value={draft.moodSwings}
          onChange={(moodSwings) =>
            setDraft((prev) => ({ ...prev, moodSwings }))
          }
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

/** One yes/no question: a labelled row over a full-width two-option control.
 *
 *  Yes/No rather than a single on/off toggle on purpose. A toggle left alone
 *  cannot say whether it was answered or skipped, and this document's whole
 *  contract is that "no bleeding" and "no report" are different claims (see
 *  `types.ts`) — an explicit No is a report. */
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
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <span className="text-muted">{icon}</span>
        {label}
      </span>
      <SegmentedControl
        value={value ? "yes" : "no"}
        options={[
          { value: "no", label: t("common.no") },
          { value: "yes", label: t("common.yes") },
        ]}
        onChange={(next) => onChange(next === "yes")}
        ariaLabel={label}
        className="yes-no"
        fullWidth
      />
    </div>
  );
}
