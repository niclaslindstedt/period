// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Reconciling two copies of the document — the phone's and the cloud's.
//
// The data model makes this unusually easy: reports are keyed by day and each
// carries the timestamp of its last edit, so two copies merge day by day with
// the later edit winning. No user has to be asked which side to keep, which is
// the whole point — someone who logged Tuesday on their phone and Wednesday on
// their tablet should end up with both, not a dialog.
//
// The known cost: a *deleted* day is an absence, not a tombstone, so a day
// deleted on one device comes back from the other until that device syncs the
// deletion... which it never can, because it has nothing to say. Reports are
// added far more often than they're deleted, so the trade is worth it — but it
// is a real limitation, and `docs/sync.md` says so out loud.
//
// Pure and total: same inputs, same output, no clock, no storage.

import { DOC_VERSION, type AppData, type DayEntry } from "./types.ts";

/** Whichever of two reports for the same day was edited last. Ties keep the
 *  first argument, so `mergeDocs(a, b)` and `mergeDocs(b, a)` agree on
 *  content whenever the timestamps differ, and are stable when they don't. */
function newer(a: DayEntry, b: DayEntry): DayEntry {
  return b.updatedAt > a.updatedAt ? b : a;
}

/** Merge two documents day by day, last edit winning. */
export function mergeDocs(local: AppData, remote: AppData): AppData {
  const entries: AppData["entries"] = { ...local.entries };
  for (const [day, remoteEntry] of Object.entries(remote.entries)) {
    const localEntry = entries[day];
    entries[day] = localEntry ? newer(localEntry, remoteEntry) : remoteEntry;
  }
  return { version: DOC_VERSION, entries };
}
