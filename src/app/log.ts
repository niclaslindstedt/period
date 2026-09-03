// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { createLogStore } from "@niclaslindstedt/oss-framework/logging";

// A single in-app log buffer, built on the framework's logging module. The
// Settings → Logs panel renders it live through the framework's `LogViewer`;
// the sync engine and the storage adapters write their diagnostics into it.
// There is no server to ship logs to and nowhere else to look, so "what did
// the app just do?" has to be answerable on-device.
export const logStore = createLogStore({ logsKey: "cycle:logs" });
logStore.setEnabled(true);
logStore.setCaptureEnabled(true);

export const log = logStore.createLogger("app");

// The Settings → Logs panel and the sync command centre both render this
// buffer through the framework's `LogViewer`, which orders newest-first by
// default — when a sync just failed, the line that explains it is the one you
// want on top. This app used to wrap the store to flip its order for the
// viewer; since framework 3.0.0 the viewer owns that (`order`), so the wrapper
// is gone and the shared buffer stays plain append-ordered.
