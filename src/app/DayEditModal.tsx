// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";
import {
  Button,
  CheckIcon,
  ConfirmDialog,
  Modal,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import { formatFullDay } from "./format.ts";
import { useT } from "./i18n/index.ts";
import { dayHeadline } from "./labels.ts";
import { ReportFields } from "./ReportFields.tsx";
import { maskOf, type TemperatureUnit } from "./temperature.ts";
import { blankEntry, type DayEntry } from "./types.ts";
import type { DocStore } from "./useDocStore.ts";

// One day's report, opened from the calendar — the screen where a report gets
// **corrected** rather than filed.
//
// The Report screen answers "what happened today?". This answers "that day is
// wrong": you are looking at a month, the mark on the 8th says bleeding and
// there wasn't any, and the shortest path to fixing it is pressing the 8th.
// Getting there through the Report screen meant opening a date picker and
// finding a day you were already pointing at.
//
// It is the same six fields, from the same module (`ReportFields.tsx`), because
// it is the same report — a correction that could only change some of what a
// report says would be a second, weaker kind of report.
//
// **Deleting is the reason this exists.** A report that should never have been
// filed — the wrong day, a phone in a pocket, a test day that was really a
// negative — used to be reachable only by picking that day on the Report screen
// and finding the Clear link. Here it is a bin in the dialog's own header,
// beside the day it throws away, behind a confirmation — because removing a
// bleeding day silently moves every number the app shows. It sits at the top
// rather than under the form because the form scrolls on a short screen, and a
// delete you have to scroll to find is a delete nobody finds; putting it there
// also keeps it off the thumb's path to Save, which is the tap it must never be
// mistaken for.
//
// **Both edits close the dialog and say what they did.** That is the opposite
// of the Report screen, where Save confirms on the button and stays put — and
// the difference is what is behind the two. There, the day you saved is still
// on screen. Here, the dialog is covering the calendar, so the confirmation has
// to survive the dialog going away: the toast is read against the month it
// changed, with the day's mark already repainted underneath it.
//
// A day is only openable up to today (see `daySelection.ts`), so this dialog
// never has to explain what a report about tomorrow would mean.

type Props = {
  day: DayKey;
  store: DocStore;
  today: DayKey;
  temperatureUnit: TemperatureUnit;
  onClose: () => void;
  onNotice: (message: string) => void;
};

export function DayEditModal({
  day,
  store,
  today,
  temperatureUnit,
  onClose,
  onNotice,
}: Props) {
  const t = useT();
  const stored = store.data.entries[day] ?? null;
  // Seeded once, at mount. The dialog is mounted per day it opens on (see
  // `CalendarScreen.tsx`), so there is no day to re-seed for — and a cloud pull
  // landing mid-edit must not renumber a field under the person typing in it.
  const [draft, setDraft] = useState<DayEntry>(
    () => stored ?? blankEntry(day, new Date().toISOString()),
  );
  const [digits, setDigits] = useState(() =>
    maskOf(stored?.temperature ?? null, temperatureUnit),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    store.saveEntry({
      ...draft,
      date: day,
      updatedAt: new Date().toISOString(),
    });
    onNotice(t("calendar.saved"));
    onClose();
  };

  const remove = () => {
    store.deleteEntry(day);
    setConfirmDelete(false);
    onNotice(t("report.cleared"));
    onClose();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        labelledBy="day-editor-title"
        closeLabel={t("common.close")}
        centered
        size="max-w-sm"
      >
        {/* The dialog is capped at 85svh by the framework and the report is
            taller than that on a short phone in landscape, so the fields
            scroll inside it and the two buttons stay where the thumb left
            them. */}
        <div className="flex flex-col gap-4 overflow-y-auto px-3 py-4">
          {/* The heading and the bin share the row: the title says which day
              this is, and the button beside it throws that day away. */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2
                id="day-editor-title"
                className="text-lg leading-tight font-bold text-fg-bright"
              >
                {dayHeadline(t, day, today)}
              </h2>
              <p className="text-xs text-muted">{formatFullDay(day)}</p>
              {/* The same line the Report screen carries under its date, and
                  for the same reason: "I checked in, nothing happened" and "I
                  never logged this day" are different claims, and only this
                  line tells them apart on a day whose answers are all no. */}
              <p className="mt-1 text-xs text-muted">
                {stored ? t("report.logged") : t("report.empty")}
              </p>
            </div>
            {/* Only where there is something to remove. On a day with no report
                the bin would be a button that does nothing, sitting over a form
                whose whole purpose is to create the thing it deletes. */}
            {stored !== null && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={t("calendar.deleteDay")}
                title={t("calendar.deleteDay")}
                // Danger ink at rest rather than muted-until-hovered: a phone
                // has no hover, so a bin that only colours on a pointer reads
                // as disabled on the device this app is used on. It is the
                // top bar's 36px square, so the two headers in the app put a
                // button in the same place at the same size.
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/15"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          <ReportFields
            answers={draft}
            onAnswers={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            fertilityTest={draft.fertilityTest}
            onFertilityTest={(fertilityTest) =>
              setDraft((prev) => ({ ...prev, fertilityTest }))
            }
            temperature={draft.temperature}
            digits={digits}
            onTemperature={(temperature, next) => {
              setDraft((prev) => ({ ...prev, temperature }));
              setDigits(next);
            }}
            temperatureUnit={temperatureUnit}
          />

          <Button
            variant="primary"
            className="w-full rounded-xl py-3 font-semibold"
            onClick={save}
          >
            <span className="flex items-center justify-center gap-2">
              <CheckIcon className="h-4 w-4" />
              {stored ? t("report.saveExisting") : t("report.saveNew")}
            </span>
          </Button>
        </div>
      </Modal>

      {/* The verification. Deleting a report is not an edit that can be
          eyeballed afterwards — the day goes back to being a day nobody logged,
          and every cycle length drawn through it moves — so the second tap is
          asked for in a dialog of its own rather than saved by an undo that
          would have to survive a sync. */}
      <ConfirmDialog
        open={confirmDelete}
        title={t("calendar.deleteDayConfirm")}
        description={t("calendar.deleteDayHint", {
          day: formatFullDay(day),
        })}
        confirmLabel={t("common.delete")}
        tone="danger"
        labels={{ cancel: t("common.cancel"), close: t("common.close") }}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
