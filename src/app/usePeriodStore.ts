// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

import { parseDoc, serializeDoc } from "./migrations.ts";
import { emptyDoc, type AppData, type DayEntry } from "./types.ts";
import * as output from "../output.ts";

// The app's data store. Holds the document in state, persists it to
// localStorage, and exposes the two edits the app can make — save a day's
// report, clear a day's report. This is the framework's "store stays in the
// app" seam: the framework owns the storage adapters and the UI kit, this hook
// owns where the document lives and what an edit means.
//
// The local copy is always the working copy. Cloud sync (see `useSyncEngine`)
// reads and writes *around* this hook rather than through it, so losing the
// network never costs an edit.

const DOC_KEY = "period:doc";

/** The document storage seam. The store never touches `localStorage` directly
 *  — it reads and writes through a `DocBackend`, so a test (or a future
 *  demo-data mode) can take over storage without the store changing. */
export type DocBackend = {
  readonly id: string;
  /** The current document, or an empty one when nothing is stored. */
  load(): AppData;
  /** Persist the document. A best-effort sink — it must not throw. */
  save(doc: AppData): void;
};

/**
 * The real backend: one JSON document in localStorage, run through the
 * migration pipeline on the way in and out.
 *
 * Both directions are *non-destructive*. A document that exists but this build
 * can't read — most often one a NEWER build already upgraded, then read by a
 * stale (service-worker-cached) build mid-update — is left on disk untouched
 * rather than replaced with a blank starter, so it comes back on its own once
 * the update finishes.
 */
export const localDocBackend: DocBackend = {
  id: "local",
  load() {
    let raw: string | null;
    try {
      raw = localStorage.getItem(DOC_KEY);
    } catch {
      // Storage unavailable (private mode, quota policy) — boot empty.
      return emptyDoc();
    }
    if (!raw) return emptyDoc();
    try {
      return parseDoc(raw);
    } catch (err) {
      // Bytes exist but can't be parsed. Keep the original on disk — the
      // caller must NOT persist the empty document we return here over it (see
      // the persist guard below) — and quarantine a copy so it stays
      // recoverable even if a later edit does overwrite the live key.
      output.error(
        `Couldn't read the reports saved on this device — ${
          err instanceof Error ? err.message : String(err)
        }. The stored copy is left untouched and should reappear once the app finishes updating.`,
      );
      try {
        localStorage.setItem(`${DOC_KEY}:unreadable`, raw);
      } catch {
        // No room to quarantine — the live key is still left intact.
      }
      return emptyDoc();
    }
  },
  save(doc) {
    try {
      localStorage.setItem(DOC_KEY, serializeDoc(doc));
    } catch (err) {
      output.error(
        `Couldn't save to this device — ${
          err instanceof Error ? err.message : String(err)
        }.`,
      );
    }
  },
};

export type PeriodStore = {
  data: AppData;
  /** Upsert a day's report. A report with both answers no is still a report —
   *  "I checked in, nothing happened" is a claim, and only `deleteEntry`
   *  retracts it. */
  saveEntry: (entry: DayEntry) => void;
  /** Remove a day's report. */
  deleteEntry: (day: DayKey) => void;
  /** Replace the whole document — used by the cloud adopt path and by the
   *  Settings import flow. */
  replaceAll: (doc: AppData) => void;
  /** Monotonic counter bumped on every edit. The sync engine debounces on it
   *  rather than deep-comparing the document. */
  editCount: number;
  /** True once the first load has been applied — the persist guard below
   *  refuses to write before it, so a slow read can never be overwritten by
   *  the empty document that preceded it. */
  loaded: boolean;
};

export function usePeriodStore(
  backend: DocBackend = localDocBackend,
): PeriodStore {
  // Read synchronously on the first render: localStorage can answer before the
  // first paint, so there is no empty-state flash to design around.
  const [data, setData] = useState<AppData>(() => backend.load());
  const [editCount, setEditCount] = useState(0);
  const loadedRef = useRef(true);

  // A backend swap (only tests do this today) adopts the new backend's
  // document rather than writing this one over it.
  useEffect(() => {
    loadedRef.current = false;
    setData(backend.load());
    loadedRef.current = true;
  }, [backend]);

  // Write-through on every change. Guarded on `loadedRef` so the document is
  // only ever persisted after a load has been applied.
  useEffect(() => {
    if (!loadedRef.current) return;
    backend.save(data);
  }, [backend, data]);

  const saveEntry = useCallback((entry: DayEntry) => {
    setData((prev) => {
      return {
        ...prev,
        entries: { ...prev.entries, [entry.date]: entry },
      };
    });
    setEditCount((n) => n + 1);
  }, []);

  const deleteEntry = useCallback((day: DayKey) => {
    setData((prev) => {
      if (!prev.entries[day]) return prev;
      const entries = { ...prev.entries };
      delete entries[day];
      return { ...prev, entries };
    });
    setEditCount((n) => n + 1);
  }, []);

  const replaceAll = useCallback((doc: AppData) => {
    setData(doc);
    setEditCount((n) => n + 1);
  }, []);

  return useMemo(
    () => ({
      data,
      saveEntry,
      deleteEntry,
      replaceAll,
      editCount,
      loaded: loadedRef.current,
    }),
    [data, saveEntry, deleteEntry, replaceAll, editCount],
  );
}
