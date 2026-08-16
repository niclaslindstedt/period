// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AuthError,
  ConflictError,
  RateLimitError,
  completeDropboxAuth,
  createDropboxAdapter,
  createGdriveAdapter,
  describeStorageError,
  hasPendingDropboxAuth,
  isOfflineError,
  localCacheKey,
  startDropboxAuth,
  startGdriveAuth,
  withLocalCache,
  type StorageAdapter,
} from "@niclaslindstedt/oss-framework/storage";
import type {
  ConnectionProbeResult,
  SaveStatus,
  SyncLocation,
} from "@niclaslindstedt/oss-framework/sync";

import { logStore } from "./log.ts";
import { mergeDocs } from "./merge.ts";
import { parseDoc, serializeDoc } from "./migrations.ts";
import type { PeriodStore } from "./usePeriodStore.ts";

// The app's sync engine — the state machine the framework's `SyncStatus` glyph
// and `SyncDetailsModal` command centre paint over. The local document
// (localStorage, written by `usePeriodStore`) is always the working copy; when
// a cloud backend is connected the engine pushes the serialized document there
// (debounced on the store's edit counter) and pulls the backend's copy on
// mount. Dropbox and Google Drive both ride the framework's storage adapters,
// so the code below is provider-agnostic past the two `create*Adapter` calls.
//
// Reconciliation is a per-day merge (see `merge.ts`), not a "pick a side"
// prompt: each report carries its own `updatedAt`, so two devices that logged
// different days between syncs both keep their reports without anyone being
// asked to choose. The cost is that a *deleted* day comes back if the other
// device still holds it — see `docs/sync.md`.

const syncLog = logStore.createLogger("sync");

export type SyncBackendId = "local" | "dropbox" | "gdrive";

const BACKEND_KEY = "period:sync:backend";
const DROPBOX_TOKENS_KEY = "period:sync:dropbox";
const GDRIVE_TOKEN_KEY = "period:sync:gdrive";

/** How long after the last edit a push is sent. Long enough to coalesce a
 *  burst of taps on the report screen into one request. */
const SAVE_DEBOUNCE_MS = 1200;

/** The document's file name on a cloud backend. */
const CLOUD_FILE_NAME = "period.json";

// OAuth app identities, injected at build time. Without them the matching
// backend is hidden rather than offered and then failing at connect time.
export const DROPBOX_APP_KEY: string =
  (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) ?? "";
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

// Dropbox fixes the app-folder name from the app's own configuration (an
// "App folder"-scoped app lives under `Apps/<name>/`), so it isn't always
// "Period". Inject the real name at build time so the displayed location
// points at the folder that actually exists.
export const DROPBOX_APP_FOLDER: string =
  (import.meta.env.VITE_DROPBOX_APP_FOLDER as string | undefined)?.trim() ||
  "Period";

// Google Drive's folder, unlike Dropbox's, is created by us — this is the
// folder made in the user's My Drive.
export const GDRIVE_APP_FOLDER: string =
  (import.meta.env.VITE_GDRIVE_APP_FOLDER as string | undefined)?.trim() ||
  "Period";

export const PROVIDER_NAMES: Record<SyncBackendId, string> = {
  local: "This device",
  dropbox: "Dropbox",
  gdrive: "Google Drive",
};

/** Which cloud providers this build can offer — a provider with no client id
 *  configured is hidden from the picker entirely. */
export const AVAILABLE_BACKENDS: SyncBackendId[] = [
  "local",
  ...(DROPBOX_APP_KEY ? (["dropbox"] as const) : []),
  ...(GOOGLE_CLIENT_ID ? (["gdrive"] as const) : []),
];

type DropboxTokens = { accessToken: string; refreshToken: string | null };

function readBackend(): SyncBackendId {
  try {
    const raw = localStorage.getItem(BACKEND_KEY);
    return raw === "dropbox" || raw === "gdrive" ? raw : "local";
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
  if (backend === "gdrive") return `${GDRIVE_APP_FOLDER}/${CLOUD_FILE_NAME}`;
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
  store: PeriodStore,
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
  const [gdriveToken, setGdriveToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GDRIVE_TOKEN_KEY);
    } catch {
      return null;
    }
  });

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
        key: localCacheKey("dropbox", "period"),
      });
    }
    if (backend === "gdrive" && gdriveToken) {
      const cloud = createGdriveAdapter(gdriveToken, {
        appFolderName: GDRIVE_APP_FOLDER,
        fileName: CLOUD_FILE_NAME,
        logger: logStore.createLogger("gdrive"),
      });
      return withLocalCache(cloud, {
        storage: localStorage,
        key: localCacheKey("gdrive", "period"),
      });
    }
    return null;
  }, [backend, dropboxTokens, gdriveToken]);

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

  // Complete a Dropbox OAuth redirect: trade the `?code=` for tokens, persist
  // them, and adopt the backend. Runs once on boot when a flow is mid-flight.
  useEffect(() => {
    if (!DROPBOX_APP_KEY || !hasPendingDropboxAuth()) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    void (async () => {
      try {
        const result = await completeDropboxAuth(DROPBOX_APP_KEY, code);
        const tokens: DropboxTokens = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken ?? null,
        };
        writeDropboxTokens(tokens);
        setDropboxTokens(tokens);
        localStorage.setItem(BACKEND_KEY, "dropbox");
        setBackendState("dropbox");
        syncLog.info("dropbox: connected");
      } catch (err) {
        syncLog.error(`dropbox: connect failed — ${describeStorageError(err)}`);
      } finally {
        // Drop the `?code=` from the address bar either way.
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, []);

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

  const connect = useCallback(async (next: SyncBackendId): Promise<void> => {
    if (next === "local") {
      localStorage.setItem(BACKEND_KEY, "local");
      setBackendState("local");
      return;
    }
    if (next === "dropbox") {
      if (!DROPBOX_APP_KEY) throw new Error("Dropbox is not configured");
      // Redirects away; `completeDropboxAuth` picks the flow up on return.
      await startDropboxAuth(DROPBOX_APP_KEY, syncLog);
      return;
    }
    if (!GOOGLE_CLIENT_ID) throw new Error("Google Drive is not configured");
    const token = await startGdriveAuth(GOOGLE_CLIENT_ID, syncLog);
    localStorage.setItem(GDRIVE_TOKEN_KEY, token);
    localStorage.setItem(BACKEND_KEY, "gdrive");
    setGdriveToken(token);
    setBackendState("gdrive");
    syncLog.info("gdrive: connected");
  }, []);

  const disconnect = useCallback((): void => {
    // Only the credentials go: the document stays on this device, and the copy
    // already in the cloud is left exactly where it is.
    writeDropboxTokens(null);
    localStorage.removeItem(GDRIVE_TOKEN_KEY);
    localStorage.setItem(BACKEND_KEY, "local");
    setDropboxTokens(null);
    setGdriveToken(null);
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
    connect,
    disconnect,
    saveNow,
    reload,
    reconnect,
    checkConnection,
  };
}
