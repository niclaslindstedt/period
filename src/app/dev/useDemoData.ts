// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hook behind the developer "Demo data" toggle. When it is on, the document
// store loads a throwaway in-memory document — a year of invented reports (see
// `demoData.ts`) — instead of the real localStorage one, and the sync engine is
// paused so none of it can reach a connected cloud account. Turning it off
// restores the real document untouched, because demo data is never written
// back.
//
// The flag is deliberately IN-MEMORY ONLY — module scope, no localStorage
// write — so a page reload always drops back to the real backend. That makes
// reload the guaranteed escape hatch: demo data can never outlive the tab.
//
// State lives at module scope with a pub/sub layer so the toggle in Settings
// and the backend swap in `App` see the same value in the same render.
// Modelled on the sibling `contacts` app's `useDevSeed`.

import { useEffect, useState } from "react";

// The backend factory and the year of sample reports behind it are a dev-only
// luxury, so they ride in their own chunk: nothing on the entry path imports
// `demoBackend.ts` / `demoData.ts` statically, and the chunk is fetched only
// when the toggle actually turns on.
type DemoBackendModule = typeof import("./demoBackend.ts");
let backend: DemoBackendModule | null = null;

/** The loaded backend factory, or `null` while demo data has never been on.
 *  `App` reads this synchronously — `setDemoData` guarantees the chunk has
 *  landed before it flips `on` to true. */
export function demoBackendModule(): DemoBackendModule | null {
  return backend;
}

let on = false;

const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // A subscriber throwing must not break the dispatch loop.
    }
  }
}

// Monotonic token so a slow chunk load can't overwrite a newer choice: each
// call claims the sequence, and a stale async flip aborts.
let seq = 0;

/** Switch the in-memory demo document on or off. Nothing is persisted.
 *  Turning it on is asynchronous under the hood — the builder lives in its own
 *  chunk — so the flag flips once that chunk has landed and `App` can build the
 *  backend synchronously from that render on. */
export function setDemoData(next: boolean): void {
  const token = ++seq;
  if (on === next) return;
  if (!next) {
    on = false;
    notify();
    return;
  }
  void import("./demoBackend.ts").then((m) => {
    backend = m;
    // A later call (toggled away while loading) wins over this one.
    if (token !== seq) return;
    on = true;
    notify();
  });
}

/** The toggle, as the Settings screen reads and writes it. */
export type DemoDataToggle = {
  on: boolean;
  setOn: (next: boolean) => void;
};

export function useDemoData(): DemoDataToggle {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((v) => v + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  return { on, setOn: setDemoData };
}
