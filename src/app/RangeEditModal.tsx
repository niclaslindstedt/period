// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import type { DayRange } from "@niclaslindstedt/oss-framework/calendar";
import {
  Button,
  CheckIcon,
  ConfirmDialog,
  Modal,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import {
  bulkEntries,
  daysInRange,
  loggedCount,
  rangeLength,
  type BulkAnswers,
} from "./bulk.ts";
import { formatDay } from "./format.ts";
import { useT } from "./i18n/index.ts";
import { dayCount } from "./labels.ts";
import { AnswerRow } from "./ReportFields.tsx";
import type { DocStore } from "./useDocStore.ts";

// A span of days, opened from the calendar — the batch half of correcting a
// report.
//
// The gesture that gets here is a press and hold on the first day and a tap on
// the last (see `daySelection.ts`), and the two things it can then do are the
// two things nobody wanted to do twenty times in a row:
//
//   - **Delete the reports in the span.** A fortnight logged against the wrong
//     month, a demo someone filed for real, a week of taps from a phone in a
//     pocket. One confirmation, one edit.
//   - **Write the same answers over the span.** "These six days were a period"
//     is one fact, and filing it was six identical visits to the Report screen.
//
// The write is the Report screen's own range save — the same `bulkEntries`, the
// same cap, the same guarantees (see `bulk.ts`). This screen adds no second way
// to write several days at once; it adds a second way to *reach* the one there
// is, from the month where you can see which days need it.
//
// **What a span cannot carry is not shown.** A waking temperature and an
// ovulation test are one morning's observation each, so they are absent here
// rather than present and disabled — on the Report screen they are disabled
// because they were on screen a moment ago and a field that vanishes reads as a
// field that was lost, and in a dialog that only ever edits a span there is no
// such moment. The readings already on the days covered survive the save
// untouched, and the line under the answers says so, because "I filed a period
// over that week" must not be a way to lose seven mornings of thermometer.
//
// **The answers open blank**, and Save writes all four to every day in the
// span. That is what a bulk report has always meant, and the dialog says it in
// words above the button rather than leaving it to be discovered afterwards: a
// span is one report filed on several days, not a patch applied to whatever
// each of them already said.

type Props = {
  range: DayRange;
  store: DocStore;
  onClose: () => void;
  onNotice: (message: string) => void;
};

export function RangeEditModal({ range, store, onClose, onNotice }: Props) {
  const t = useT();
  const days = rangeLength(range);
  const logged = loggedCount(store.data, range);
  const [answers, setAnswers] = useState<BulkAnswers>({
    bleeding: false,
    moodSwings: false,
    lust: false,
    sex: false,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    store.saveEntries(
      bulkEntries(store.data, range, answers, new Date().toISOString()),
    );
    onNotice(t("report.savedRange", { count: String(days) }));
    onClose();
  };

  const remove = () => {
    store.deleteEntries(daysInRange(range));
    setConfirmDelete(false);
    onNotice(t("report.clearedRange", { count: String(logged) }));
    onClose();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        labelledBy="range-editor-title"
        closeLabel={t("common.close")}
        centered
        size="max-w-sm"
      >
        <div className="flex flex-col gap-4 overflow-y-auto px-3 py-4">
          <div className="flex flex-col gap-0.5">
            <h2
              id="range-editor-title"
              className="text-lg leading-tight font-bold text-fg-bright"
            >
              {`${formatDay(range.start)} – ${formatDay(range.end)}`}
            </h2>
            {/* How many days, and how many of them already carry a report.
                Both numbers are load-bearing: the first is what Save writes,
                the second is what Delete removes. */}
            <p className="text-xs text-muted">
              {t("report.rangeLogged", {
                logged: String(logged),
                count: String(days),
              })}
            </p>
          </div>

          {/* Only the four answers. See the note at the top of the file for why
              the two measurements are not here at all. */}
          <AnswerRow
            answers={answers}
            onChange={(patch) => setAnswers((prev) => ({ ...prev, ...patch }))}
          />
          <p className="text-xs leading-snug text-muted">
            {t("calendar.rangeWrites", { count: String(days) })}
          </p>

          <div className="flex flex-col items-center gap-2">
            <Button
              variant="primary"
              className="w-full rounded-xl py-3 font-semibold"
              onClick={save}
            >
              <span className="flex items-center justify-center gap-2">
                <CheckIcon className="h-4 w-4" />
                {t("report.saveRange", { count: String(days) })}
              </span>
            </Button>
            {/* Nothing to delete is the common case on a span picked over an
                empty stretch of month, and a dead button there would be the
                only control in the dialog that did nothing. */}
            {logged > 0 && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted hover:text-danger"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                {t("calendar.deleteRange", { count: String(logged) })}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* The count is in the question rather than in the small print under it:
          this is the one gesture in the app that removes a month of reports,
          and the number is the whole of what there is to check before saying
          yes. */}
      <ConfirmDialog
        open={confirmDelete}
        title={t("calendar.deleteRangeConfirm", { count: String(logged) })}
        description={t("calendar.deleteRangeHint", {
          span: `${formatDay(range.start)} – ${formatDay(range.end)}`,
          days: dayCount(t, days),
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
