// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEAM: where the app asks its host whether it can offer a document store
// of its own.
//
// A browser cannot reach a device's iCloud container — there is no such API —
// so on the website this seam is simply never filled and iCloud is absent from
// the storage picker entirely. The app-store build's WebView host fills it in
// (`native/src/icloudBridge.ts`), and so could any other host that one day
// wanted to.
//
// That phrasing is the important part. Nothing here asks whether the app is
// running natively, on which platform, or in which build — it asks whether a
// DOCUMENT-STORE HOST is present, which is a question about capability and
// not about identity. A second host offering the same five methods would light
// the same backend up with no change here, and the wrapper stays free to
// disappear without leaving a native-shaped hole in the app.
//
// What the app keeps either way is the DOMAIN. A host moves bytes: a file in,
// a file out. What is in them and how two devices' edits reconcile are
// `migrations.ts` and `merge.ts`'s, exactly as they are for Dropbox — which is
// why the host is adapted into the framework's `FileStore` below and then
// never spoken to again.

import { useCallback, useEffect, useState } from "react";

import {
  AuthError,
  createFileStoreAdapter,
  type StorageAdapter,
} from "@niclaslindstedt/oss-framework/storage";

import { logStore } from "./log.ts";

/** Whether a host's store can be used right now.
 *
 *  The three are three different things for the app to say. `signed-out` is
 *  the reader's to fix — a phone with no iCloud account — and the backend is
 *  still offered, because hiding it would leave them nothing to act on.
 *  `unavailable` is the build's: no store here at all, which is what the
 *  website and an Android build both answer, and what keeps the backend out
 *  of the picker. */
export type CloudHostStatus = "ready" | "signed-out" | "unavailable";

/** One file in the host's store, with the opaque token that changes when its
 *  bytes do. Mirrors the framework's `FileEntry`. */
export type CloudHostEntry = { path: string; rev?: string };

/** What a host's method resolves to.
 *
 *  A failure is DATA rather than a rejection because a host may live on the
 *  other side of a message channel, where an exception cannot cross. `kind` is
 *  what this module turns back into the right framework error. */
export type CloudHostResult =
  | { ok: true; value: unknown }
  | { ok: false; kind: "auth" | "offline" | "error"; message: string };

/** What a host has to provide to light a backend up.
 *
 *  Five methods, all async, and deliberately the four the framework's
 *  `FileStore` already speaks plus a `status` the picker reads before it
 *  offers the backend at all. A host that offered anything richer — a merge,
 *  a revision history, a notion of what a day is — would be a host holding a
 *  second copy of this app's domain. */
export type CloudHost = {
  /** Bumped only for a breaking change to the methods below; a host
   *  announcing a version this build does not know is ignored entirely rather
   *  than called with the wrong shape. */
  readonly version: 1;
  /** Which store this is. Validated against the backends the app knows, so an
   *  unrecognised host is ignored rather than offered under a name nothing
   *  can print. */
  readonly provider: string;
  /** Whether the store can be used. Must never prompt: the app calls it on
   *  every launch. */
  status(): Promise<CloudHostResult>;
  /** Every file in the store, with its current revision. */
  list(): Promise<CloudHostResult>;
  /** One file's text, or `null` when it does not exist. */
  read(path: string): Promise<CloudHostResult>;
  /** Create or overwrite one file. */
  write(path: string, text: string): Promise<CloudHostResult>;
  /** Delete one file. A missing file is already gone, not a failure. */
  remove(path: string): Promise<CloudHostResult>;
};

/** The event a host fires once it has installed itself. The injected script
 *  can run after the app has mounted, so the app cannot simply read `window`
 *  once and conclude there is no host. Must match `HOST_EVENT` in
 *  `native/src/icloudBridge.ts`. */
export const CLOUD_HOST_EVENT = "cycle:cloud-host";

/** Where a host installs itself. Must match `HOST_PROPERTY` in
 *  `native/src/icloudBridge.ts` — a mismatch is not an error, it is a backend
 *  that never appears in the picker. */
export const CLOUD_HOST_PROPERTY = "__cycleCloudHost";

/** The one provider this build knows how to name. */
export const ICLOUD_PROVIDER = "icloud";

type HostWindow = Window & { [CLOUD_HOST_PROPERTY]?: unknown };

/** The installed host, or null. Validates the shape rather than trusting it:
 *  the value arrives from code outside this bundle. */
export function getCloudHost(): CloudHost | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as HostWindow)[CLOUD_HOST_PROPERTY];
  if (typeof candidate !== "object" || candidate === null) return null;
  const host = candidate as Partial<CloudHost>;
  if (host.version !== 1) return null;
  if (host.provider !== ICLOUD_PROVIDER) return null;
  if (
    typeof host.status !== "function" ||
    typeof host.list !== "function" ||
    typeof host.read !== "function" ||
    typeof host.write !== "function" ||
    typeof host.remove !== "function"
  ) {
    return null;
  }
  return host as CloudHost;
}

/** Narrow a host's `status()` answer. Anything unrecognised is `unavailable`
 *  — the answer that hides the backend, which is the safe end to fail at: a
 *  host whose status could not be read is a host the app should not be
 *  handing anybody's reports to. */
export function parseHostStatus(result: unknown): CloudHostStatus {
  if (typeof result !== "object" || result === null) return "unavailable";
  const envelope = result as Partial<CloudHostResult>;
  if (envelope.ok !== true) return "unavailable";
  const value = (envelope as { value?: unknown }).value;
  return value === "ready" || value === "signed-out" ? value : "unavailable";
}

/** Narrow a host's `list()` answer. A malformed entry is dropped one at a
 *  time rather than failing the whole listing — the framework only reads the
 *  one file the app wrote, so a stray entry must not cost it that. */
export function parseHostEntries(value: unknown): CloudHostEntry[] {
  if (!Array.isArray(value)) return [];
  const out: CloudHostEntry[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as { path?: unknown; rev?: unknown };
    if (typeof entry.path !== "string" || entry.path === "") continue;
    out.push(
      typeof entry.rev === "string"
        ? { path: entry.path, rev: entry.rev }
        : { path: entry.path },
    );
  }
  return out;
}

/**
 * The host, as state — null until one is installed and has reported a store
 * this build can use.
 *
 * Two reads rather than one, because a host is not the same as a usable
 * store: the wrapper installs its host on every platform, and on Android (or
 * in a build where the native module did not link) that host answers
 * `unavailable`. Offering the backend on the strength of the host's presence
 * alone would put a storage option in the picker that cannot hold anything.
 *
 * Re-read when the page is shown again, because the answer can change while
 * the app is away: signing into iCloud happens in the system's Settings, not
 * in here.
 */
export function useCloudHost(): CloudHost | null {
  const [host, setHost] = useState<CloudHost | null>(null);

  const probe = useCallback(() => {
    // Re-read on announcement rather than trusting what the event carries:
    // `getCloudHost` is the one validation, and an event is not a reason to
    // skip it.
    const candidate = getCloudHost();
    if (!candidate) {
      setHost(null);
      return;
    }
    void candidate
      .status()
      .then((result) => {
        setHost(parseHostStatus(result) === "unavailable" ? null : candidate);
      })
      .catch(() => setHost(null));
  }, []);

  useEffect(() => {
    window.addEventListener(CLOUD_HOST_EVENT, probe);
    document.addEventListener("visibilitychange", probe);
    // …and once now, in case the host installed itself between this
    // component's first render and this effect.
    probe();
    return () => {
      window.removeEventListener(CLOUD_HOST_EVENT, probe);
      document.removeEventListener("visibilitychange", probe);
    };
  }, [probe]);

  return host;
}

/**
 * Unwrap one host answer, or throw the error the sync engine routes on.
 *
 * The three kinds map onto the three things the engine can do about a
 * failure, and the mapping is the only reason this function exists:
 *
 *   • `auth` → the framework's `AuthError`, which the engine turns into a
 *     Reconnect rather than a generic retry that would fail the same way.
 *   • `offline` → a `TypeError`, which is what the framework's
 *     `isOfflineError` recognises (it is the shape `fetch` rejects with when
 *     a request cannot complete). That is what keeps the local copy in play
 *     and stops an unreachable store being mistaken for an empty one.
 *   • `error` → a plain `Error`, which the engine shows and stops on.
 */
function unwrap(result: CloudHostResult): unknown {
  // The envelope comes from outside this bundle, so it is narrowed rather
  // than trusted — an answer this module cannot read is a failure, never a
  // document. Falling through to `result.value` would hand the merge an
  // `undefined` and, one push later, an empty file where somebody's reports
  // were.
  if (typeof result !== "object" || result === null) {
    throw new Error("The document store answered with nothing readable.");
  }
  if (result.ok === true) return result.value;
  const message =
    typeof (result as { message?: unknown }).message === "string"
      ? result.message
      : "The document store failed without saying why.";
  if (result.kind === "auth") throw new AuthError(message);
  if (result.kind === "offline") throw new TypeError(message);
  throw new Error(message);
}

/**
 * A host, as the storage adapter the sync engine already knows how to drive.
 *
 * The framework's `createFileStoreAdapter` does all of it — the revision
 * check, the conflict, the retry curve — so what is left here is the four
 * calls and the unwrapping. Its `id` is `folder` because that is what this
 * is: a directory of files the operating system keeps in step, which is the
 * one shape the framework has for "somewhere on disk that is not this
 * browser". The id is never shown; `label` is.
 */
export function createCloudHostAdapter(
  host: CloudHost,
  options: { label: string; fileName: string; saveDebounceMs?: number },
): StorageAdapter {
  return createFileStoreAdapter(
    {
      list: async () => parseHostEntries(unwrap(await host.list())),
      read: async (path) => {
        const value = unwrap(await host.read(path));
        return typeof value === "string" ? value : null;
      },
      write: async (path, text) => {
        unwrap(await host.write(path, text));
      },
      remove: async (path) => {
        unwrap(await host.remove(path));
      },
    },
    {
      id: "folder",
      label: options.label,
      fileName: options.fileName,
      saveDebounceMs: options.saveDebounceMs,
      logger: logStore.createLogger("icloud"),
      // No retry curve. The framework's default re-runs an operation that
      // failed with a network error, and a host's `offline` is not a dropped
      // request — it is iCloud saying the bytes are not here yet, which three
      // more tries a second apart will not change. The engine's own offline
      // handling is the right answer, and it is already behind this.
      retryDelaysMs: [],
    },
  );
}
