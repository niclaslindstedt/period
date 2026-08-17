// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer demo-data storage backend. This is how "Demo data" works:
// instead of a special case inside the store, an in-memory backend *takes over*
// document storage while the toggle is on — the same seam a test uses, and the
// same shape the sibling `contacts` app puts its demo book behind.
//
// The document is built on first load and kept in a closure; edits made during
// the session round-trip through it, so saving a report, clearing one, and
// watching the forecast move all behave exactly as they do against the real
// backend. Nothing is ever written to localStorage. The backend is discarded
// when the toggle flips off or the page reloads, at which point `App` feeds the
// real `localDocBackend` back and the untouched document on disk reloads.

import { dayKeyOf } from "@niclaslindstedt/oss-framework/calendar";

import type { AppData } from "../types.ts";
import type { DocBackend } from "../useDocStore.ts";
import { buildDemoData } from "./demoData.ts";

/**
 * Build a fresh in-memory demo backend. A new one is created each time the
 * toggle is turned on, so every enable starts from a pristine sample.
 *
 * The clock is read here rather than in `buildDemoData`, which stays a pure
 * function of the day it is given: the demo document is anchored to the day it
 * was seeded on, so a session that runs past midnight keeps the reports the
 * user has been looking at instead of silently rebuilding under them.
 */
export function createDemoBackend(): DocBackend {
  let doc: AppData | null = null;
  return {
    id: "demo",
    load() {
      doc ??= buildDemoData(dayKeyOf(new Date()));
      return doc;
    },
    save(next) {
      // In-memory only — the whole point is that the real document is never
      // touched. It cannot fail, so demo reports confirm exactly as real ones
      // do.
      doc = next;
      return true;
    },
  };
}
