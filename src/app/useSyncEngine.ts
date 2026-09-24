// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AuthError,
  ConflictError,
  RateLimitError,
  completeDropboxAuth,
  connectDropboxAuthSession,
  connectDropboxLoopback,
  createDropboxAdapter,
  describeStorageError,
  getAuthSessionHost,
  hasPendingDropboxAuth,
  isAuthCancelled,
  isDesktopShellOrigin,
  isOfflineError,
  localCacheKey,
  startDropboxAuth,
  withLocalCache,
  type DropboxAuthResult,
  type StorageAdapter,
} from "@niclaslindstedt/oss-framework/storage";
import type {
  ConnectionProbeResult,
  SaveStatus,
  SyncLocation,
} from "@niclaslindstedt/oss-framework/sync";

import {
  createCloudHostAdapter,
  getCloudHost,
  useCloudHost,
  type CloudHost,
} from "./cloudHost.ts";
import { logStore } from "./log.ts";
import { mergeDocs } from "./merge.ts";
import { parseDoc, serializeDoc } from "./migrations.ts";
import type { DocStore } from "./useDocStore.ts";

// The app's sync engine — the state machine the framework's `SyncStatus` glyph
// and `SyncDetailsModal` command centre paint over. The local document
// (localStorage, written by `useDocStore`) is always the working copy; when
// a cloud backend is connected the engine pushes the serialized document there
// (debounced on the store's edit counter) and pulls the backend's copy on
// mount. Dropbox rides the framework's storage adapters, so the code below is
// provider-agnostic past the one `createDropboxAdapter` call.
//
// Reconciliation is a per-day merge (see `merge.ts`), not a "pick a side"
// prompt: each report carries its own `updatedAt`, so two devices that logged
// different days between syncs both keep their reports without anyone being
// asked to choose. The cost is that a *deleted* day comes back if the other
// device still holds it — see `docs/sync.md`.
//
// iCloud is the second cloud backend and the one with no OAuth at all: it is a
// folder the operating system keeps in step, offered by whichever host the
// app happens to be running in (`cloudHost.ts`). Nothing here asks whether
// that host exists because the app is native — it asks whether a document
// store was offered, which is why `available` is a reading rather than a
// constant.

const syncLog = logStore.createLogger("sync");

export type SyncBackendId = "local" | "icloud" | "dropbox";

const BACKEND_KEY = "cycle:sync:backend";
const DROPBOX_TOKENS_KEY = "cycle:sync:dropbox";
// Dropbox is gone as a backend. The key stays named so a token a device
// may still hold is cleared rather than left sitting in storage.
const RETIRED_GDRIVE_TOKEN_KEY = "cycle:sync:gdrive";

/** How long after the last edit a push is sent. Long enough to coalesce a
 *  burst of taps on the report screen into one request. */
const SAVE_DEBOUNCE_MS = 1200;

/** The document's file name on a cloud backend. */
const CLOUD_FILE_NAME = "cycle.json";

// OAuth app identities, injected at build time. Without them the matching
// backend is hidden rather than offered and then failing at connect time.
export const DROPBOX_APP_KEY: string =
  (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) ?? "";

// Dropbox fixes the app-folder name from the app's own configuration (an
// "App folder"-scoped app lives under `Apps/<name>/`), so it isn't always
// `cycle`. Inject the real name at build time so the displayed location
// points at the folder that actually exists.
//
// Both defaults followed the app's rename, from `Cycle` to `cycle`. That
// is a *location* moving and not just a label, so it is worth being plain
// about what it costs: a build looks in exactly one folder, so an install that
// synced to the old one finds nothing in the new one and reads as an empty
// account until the old file is moved across by hand. Nothing is deleted —
// `Apps/Cycle/cycle.json` and `Cycle/cycle.json` stay exactly where they are —
// and the document merges per day on the way back in (see `merge.ts`), so
// moving the file into the new folder restores the history rather than
// duplicating it.
//
// A deploy that would rather not move can pin the old name with
// `VITE_DROPBOX_APP_FOLDER`; on Dropbox the folder
// is the OAuth app's own configuration anyway, so the variable is how the two
// are kept honest with each other regardless.
//
// Lowercase and hyphenated, unlike the app's own display name: this is a path
// segment. It is the one place the name has to survive a filesystem, a URL and
// somebody typing it, and `cycle` does all three without a space in it.
export const DROPBOX_APP_FOLDER: string =
  (import.meta.env.VITE_DROPBOX_APP_FOLDER as string | undefined)?.trim() ||
  "cycle";

export const PROVIDER_NAMES: Record<SyncBackendId, string> = {
  icloud: "iCloud Drive",
  local: "This device",
  dropbox: "Dropbox",
};

/** Which backends this build can offer without asking anything of its host —
 *  a cloud provider with no client id configured is hidden from the picker
 *  entirely. iCloud is not here: whether it can be offered is a question
 *  about the host, answered per render by `useCloudHost` (see `available`). */
export const AVAILABLE_BACKENDS: SyncBackendId[] = [
  "local",
  ...(DROPBOX_APP_KEY ? (["dropbox"] as const) : []),
];

/** The document's folder on a host-offered store, as the reader would find it
 *  in the Files app: the app's own iCloud folder, named after the app. */
const ICLOUD_FOLDER = "iCloud Drive/Cycle";

type DropboxTokens = { accessToken: string; refreshToken: string | null };

function readBackend(): SyncBackendId {
  try {
    const raw = localStorage.getItem(BACKEND_KEY);
    return raw === "dropbox" || raw === "icloud" ? raw : "local";
  } catch {
    return "local";
  }
}

function readDropboxTokens(): DropboxTokens | null {
  try {
    const raw = localStorage.getItem(DROPBOX_TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DropboxTokens;
    return typeof parsed.accessToken === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeDropboxTokens(tokens: DropboxTokens | null): void {
  if (tokens) localStorage.setItem(DROPBOX_TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(DROPBOX_TOKENS_KEY);
}

/** The document's human-readable location on the active backend. */
function backendPath(backend: SyncBackendId): string {
  if (backend === "dropbox") {
    return `Apps/${DROPBOX_APP_FOLDER}/${CLOUD_FILE_NAME}`;
  }
  if (backend === "icloud") return `${ICLOUD_FOLDER}/${CLOUD_FILE_NAME}`;
  return "On this device only";
}

export type SyncEngine = {
  backend: SyncBackendId;
  providerName: string;
  /** True when a cloud backend is selected *and* holds credentials. */
  connected: boolean;
  status: SaveStatus;
  statusDetail: string | null;
  /** Local edits the backend hasn't got yet. */
  dirty: boolean;
  /** The backend is unreachable and we're on the on-device copy. */
  offline: boolean;
  location: SyncLocation;
  /** Which backends the picker may offer right now. A reading rather than a
   *  constant because iCloud depends on the host the app is running in — see
   *  `cloudHost.ts`. */
  available: SyncBackendId[];
  /** Start the connect flow for a cloud provider, or drop back to local-only. */
  connect: (backend: SyncBackendId) => Promise<void>;
  disconnect: () => void;
  /** Flush queued edits now. */
  saveNow: () => void;
  /** Re-read the backend's copy and merge it in. */
  reload: () => Promise<void>;
  /** Re-issue the backend grant after the session lapsed. */
  reconnect: () => Promise<void>;
  /** Actively re-probe reachability, for the "Check connection" button. */
  checkConnection: () => Promise<ConnectionProbeResult>;
};

export function useSyncEngine(
  store: DocStore,
  // Suspend every read and write against the backend. Set while the developer
  // "Demo data" backend has taken over storage, so a year of invented reports
  // is never pushed up to — or merged with — a connected cloud copy. Demo data
  // stays entirely in memory (see `dev/useDemoData.ts`).
  paused = false,
): SyncEngine {
  const [backend, setBackendState] = useState<SyncBackendId>(readBackend);
  const [dropboxTokens, setDropboxTokens] = useState<DropboxTokens | null>(
    readDropboxTokens,
  );
  // The document store this app's host offers, if any. Null on the website,
  // null on a platform with no iCloud, and null until the host has answered —
  // so the picker gains the option when there is something behind it and not
  // a moment before.
  const cloudHost: CloudHost | null = useCloudHost();

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [dirty, setDirty] = useState(false);

  // The backend revision the next push is based on. Until the mount pull has
  // resolved it, a push would carry an unknown base revision — which the
  // adapter rejects as a conflict once a document exists — so pushes are held
  // behind `baselineReady`. The edit is safe in the local copy meanwhile.
  const baseRevision = useRef<string | undefined>(undefined);
  const [baselineReady, setBaselineReady] = useState(false);
  // The edit counter the backend has already seen. Compared against the live
  // one to decide whether anything still needs pushing.
  const pushedEdit = useRef(0);
  const dataRef = useRef(store.data);
  dataRef.current = store.data;

  // The storage adapter for the active cloud backend, wrapped so the cloud
  // copy stays readable offline (`withLocalCache`).
  const adapter: StorageAdapter | null = useMemo(() => {
    if (backend === "dropbox" && dropboxTokens) {
      const auth = {
        accessToken: dropboxTokens.accessToken,
        refreshToken: dropboxTokens.refreshToken,
        onAccessTokenRefreshed: (accessToken: string) => {
          const next = { ...dropboxTokens, accessToken };
          writeDropboxTokens(next);
          setDropboxTokens(next);
        },
      };
      const cloud = createDropboxAdapter(auth, {
        appKey: DROPBOX_APP_KEY || undefined,
        fileName: CLOUD_FILE_NAME,
        logger: logStore.createLogger("dropbox"),
      });
      return withLocalCache(cloud, {
        storage: localStorage,
        key: localCacheKey("dropbox", "cycle"),
      });
    }
    if (backend === "icloud" && cloudHost) {
      // No credentials and no OAuth: the container belongs to the device's
      // iCloud account, so "connecting" is choosing it and nothing else.
      const cloud = createCloudHostAdapter(cloudHost, {
        label: PROVIDER_NAMES.icloud,
        fileName: CLOUD_FILE_NAME,
        saveDebounceMs: SAVE_DEBOUNCE_MS,
      });
      return withLocalCache(cloud, {
        storage: localStorage,
        key: localCacheKey("icloud", "cycle"),
      });
    }
    return null;
  }, [backend, cloudHost, dropboxTokens]);

  const connected = adapter !== null;

  // Turn a thrown error into the matching surface state. Every failure path
  // funnels through here so the glyph, the command centre, and the log always
  // agree on what went wrong.
  const reportFailure = useCallback((err: unknown, what: string): void => {
    const detail = describeStorageError(err);
    syncLog.error(`${what} failed — ${detail}`);
    setStatusDetail(detail);
    if (err instanceof AuthError) {
      setStatus("auth-error");
      return;
    }
    if (err instanceof RateLimitError) {
      setStatus("throttled");
      return;
    }
    if (isOfflineError(err)) {
      setOffline(true);
      setStatus("idle");
      return;
    }
    setStatus("error");
  }, []);

  /** Adopt a remote snapshot into the local document by merging it day by day,
   *  and report whether the merge left anything the remote doesn't have. */
  const adoptRemote = useCallback(
    (text: string): boolean => {
      const remote = parseDoc(text);
      const merged = mergeDocs(dataRef.current, remote);
      const mergedText = serializeDoc(merged);
      if (mergedText !== serializeDoc(dataRef.current)) {
        store.replaceAll(merged);
      }
      return mergedText !== serializeDoc(remote);
    },
    [store],
  );

  const push = useCallback(
    async (editAtSend: number): Promise<void> => {
      if (!adapter || paused) return;
      setStatus("saving");
      try {
        const snapshot = await adapter.save(
          serializeDoc(dataRef.current),
          baseRevision.current,
        );
        baseRevision.current = snapshot.revision;
        pushedEdit.current = editAtSend;
        setStatus("saved");
        setStatusDetail(null);
        setOffline(false);
        setDirty(false);
        syncLog.info("pushed document");
      } catch (err) {
        if (err instanceof ConflictError) {
          // The backend moved on. Merge its copy in and let the debounce fire
          // again with the merged document on the newer base revision — the
          // merge is per-day, so neither side's reports are dropped.
          syncLog.warn("conflict — merging the backend's copy");
          baseRevision.current = err.remote.revision;
          adoptRemote(err.remote.text);
          setStatus("idle");
          setStatusDetail(null);
          return;
        }
        reportFailure(err, "save");
      }
    },
    [adapter, adoptRemote, paused, reportFailure],
  );

  const pull = useCallback(async (): Promise<void> => {
    if (!adapter || paused) return;
    try {
      const snapshot = await adapter.load();
      baseRevision.current = snapshot?.revision;
      setOffline(Boolean(snapshot?.offline));
      if (snapshot) {
        const localAhead = adoptRemote(snapshot.text);
        // The merge produced something the backend doesn't hold yet (this
        // device logged days it never saw) — mark it for the next push.
        if (localAhead) setDirty(true);
        syncLog.info("pulled document");
      } else {
        // Nothing stored yet: this device's copy is the first one up.
        setDirty(true);
      }
      setStatusDetail(null);
    } catch (err) {
      reportFailure(err, "load");
    } finally {
      setBaselineReady(true);
    }
  }, [adapter, adoptRemote, paused, reportFailure]);

  // Persist a finished sign-in's tokens and adopt the backend — the one ending
  // both connect flows share (the redirect's, below, and the desktop's).
  const adoptDropbox = useCallback((result: DropboxAuthResult) => {
    const tokens: DropboxTokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? null,
    };
    writeDropboxTokens(tokens);
    setDropboxTokens(tokens);
    localStorage.setItem(BACKEND_KEY, "dropbox");
    setBackendState("dropbox");
    syncLog.info("dropbox: connected");
  }, []);

  // Complete a Dropbox OAuth redirect: trade the `?code=` for tokens, persist
  // them, and adopt the backend. Runs once on boot when a flow is mid-flight.
  useEffect(() => {
    if (!DROPBOX_APP_KEY || !hasPendingDropboxAuth()) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    void (async () => {
      try {
        adoptDropbox(await completeDropboxAuth(DROPBOX_APP_KEY, code));
      } catch (err) {
        syncLog.error(`dropbox: connect failed — ${describeStorageError(err)}`);
      } finally {
        // Drop the `?code=` from the address bar either way.
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, [adoptDropbox]);

  // Baseline read whenever the active adapter changes (connect, reconnect,
  // provider switch).
  useEffect(() => {
    setBaselineReady(false);
    if (!adapter) {
      setStatus("idle");
      setStatusDetail(null);
      setDirty(false);
      setOffline(false);
      return;
    }
    // Demo data has taken over storage: hold the baseline read, which also
    // holds every push behind it. The credentials and the cloud copy are left
    // exactly as they were, and turning the toggle off re-runs this effect.
    if (paused) return;
    void pull();
  }, [adapter, paused, pull]);

  // Local edits mark the document dirty regardless of backend, so switching
  // one on later still pushes what's already here.
  useEffect(() => {
    if (store.editCount === pushedEdit.current) return;
    setDirty(true);
  }, [store.editCount]);

  // Debounced auto-push. Held while there's no connected backend, before the
  // baseline read resolves, or while a blocking fault stands in the way — the
  // edit is already safe in localStorage, so waiting costs nothing.
  useEffect(() => {
    if (!adapter || paused || !baselineReady || !dirty) return;
    if (status === "saving" || status === "auth-error") return;
    const editAtSend = store.editCount;
    const timer = setTimeout(() => void push(editAtSend), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [adapter, paused, baselineReady, dirty, status, store.editCount, push]);

  const connect = useCallback(
    async (next: SyncBackendId): Promise<void> => {
      if (next === "local") {
        localStorage.setItem(BACKEND_KEY, "local");
        setBackendState("local");
        return;
      }
      if (next === "icloud") {
        // Nothing to authorise and nothing to store but the choice. A host that
        // has gone away between the picker being drawn and the press landing is
        // the one failure worth naming, because the alternative is a backend
        // that silently never syncs.
        if (!getCloudHost()) throw new Error("iCloud is not available here");
        localStorage.setItem(BACKEND_KEY, "icloud");
        setBackendState("icloud");
        syncLog.info("icloud: connected");
        return;
      }
      if (!DROPBOX_APP_KEY) throw new Error("Dropbox is not configured");
      // In the phone app the redirect would land in the system browser, not
      // in the app, so a host that offers an authentication session is asked
      // for one: consent in a sheet over the app, the redirect handed back,
      // and the connection made here, in place. Asked for as a capability,
      // never as a platform. Closing the sheet is not an error.
      const authSession = getAuthSessionHost();
      if (authSession) {
        try {
          adoptDropbox(
            await connectDropboxAuthSession(
              DROPBOX_APP_KEY,
              authSession,
              undefined,
              syncLog,
            ),
          );
        } catch (err) {
          if (!isAuthCancelled(err)) throw err;
          syncLog.info("dropbox: sign-in cancelled");
        }
        return;
      }
      // In the desktop app the redirect has nowhere to land (its origin is a
      // private scheme), so the sign-in runs in the user's browser and the
      // shell's loopback listener hands the result back — in place, no reload.
      if (isDesktopShellOrigin()) {
        adoptDropbox(
          await connectDropboxLoopback(DROPBOX_APP_KEY, undefined, syncLog),
        );
        return;
      }
      // Redirects away; `completeDropboxAuth` picks the flow up on return.
      await startDropboxAuth(DROPBOX_APP_KEY, syncLog);
    },
    [adoptDropbox],
  );

  const disconnect = useCallback((): void => {
    // Only the credentials go: the document stays on this device, and the copy
    // already in the cloud is left exactly where it is.
    writeDropboxTokens(null);
    localStorage.removeItem(RETIRED_GDRIVE_TOKEN_KEY);
    localStorage.setItem(BACKEND_KEY, "local");
    setDropboxTokens(null);
    setBackendState("local");
    syncLog.info("disconnected — reports stay on this device");
  }, []);

  const saveNow = useCallback((): void => {
    if (!adapter || !baselineReady) return;
    void push(store.editCount);
  }, [adapter, baselineReady, push, store.editCount]);

  const reload = useCallback(async (): Promise<void> => {
    await pull();
  }, [pull]);

  const reconnect = useCallback(async (): Promise<void> => {
    await connect(backend);
  }, [backend, connect]);

  const checkConnection =
    useCallback(async (): Promise<ConnectionProbeResult> => {
      if (!adapter?.probe) return offline ? "offline" : "online";
      try {
        const reachable = await adapter.probe();
        if (reachable) {
          setOffline(false);
          setStatusDetail(null);
          // Recovering means re-reading, then flushing whatever queued up.
          await pull();
          return "online";
        }
        setOffline(true);
        return "offline";
      } catch (err) {
        if (err instanceof AuthError) {
          setStatus("auth-error");
          setStatusDetail(describeStorageError(err));
          return "auth-error";
        }
        setOffline(true);
        return "offline";
      }
    }, [adapter, offline, pull]);

  return {
    backend,
    providerName: PROVIDER_NAMES[backend],
    connected,
    status,
    statusDetail,
    dirty,
    offline,
    location: { path: backendPath(backend) },
    // The stored choice is always offered even when its host has gone —
    // a segmented control whose value is not one of its options draws as
    // nothing selected, which would read as "your reports are nowhere".
    available:
      cloudHost || backend === "icloud"
        ? ["local", "icloud", ...AVAILABLE_BACKENDS.slice(1)]
        : AVAILABLE_BACKENDS,
    connect,
    disconnect,
    saveNow,
    reload,
    reconnect,
    checkConnection,
  };
}
