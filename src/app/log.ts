// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  createLogStore,
  type LogStore,
} from "@niclaslindstedt/oss-framework/logging";

// A single in-app log buffer, built on the framework's logging module. The
// Settings → Logs panel renders it live through the framework's `LogViewer`;
// the sync engine and the storage adapters write their diagnostics into it.
// There is no server to ship logs to and nowhere else to look, so "what did
// the app just do?" has to be answerable on-device.
export const logStore = createLogStore({ logsKey: "period:logs" });
logStore.setEnabled(true);
logStore.setCaptureEnabled(true);

export const log = logStore.createLogger("app");

/**
 * A read-only *view* over a store that hands its buffer back newest-first.
 *
 * The framework's `LogViewer` renders entries in whatever order the store
 * returns them, and a store's buffer is append-ordered (oldest first). Wrapping
 * the store flips that for one viewer without touching the shared buffer. When
 * a sync just failed, the line that explains it is the one you want on top.
 */
export function newestFirst(store: LogStore): LogStore {
  return {
    createLogger: (scope) => store.createLogger(scope),
    getLogs: () => store.getLogs().reverse(),
    clearLogs: () => store.clearLogs(),
    subscribeToLogs: (cb) => store.subscribeToLogs(cb),
    setCaptureEnabled: (enabled) => store.setCaptureEnabled(enabled),
    isCaptureEnabled: () => store.isCaptureEnabled(),
    setEnabled: (enabled) => store.setEnabled(enabled),
    isEnabled: () => store.isEnabled(),
  };
}

/** The sync command centre's log panel reads the same buffer, newest-first.
 *  Module-scoped so the identity stays stable across renders (the framework's
 *  `useLogs` keys its subscription on the store object). */
export const descendingLogStore = newestFirst(logStore);
