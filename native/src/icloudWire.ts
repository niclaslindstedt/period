// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT CROSSES THE iCLOUD BRIDGE — the shapes, and nothing that can reach a
// container.
//
// This module exists to stay IMPORT-FREE, and that is its whole job. The root
// `tsc` type-checks `tests/`, `tests/native_icloud_test.ts` imports
// `icloudBridge.ts`, and a root `npm ci` does not install `native/`'s own
// dependencies — so anything reachable from that test which imports `expo`
// turns a fully-installed machine green and CI red. (Same trap as
// `native/tsconfig.json` not extending Expo's base; see `AGENTS.md`.)
//
// So `icloudBridge.ts` — pure, and exercised from the root suite — takes its
// types from here, and only `icloud.ts` reaches for the native module.
//
// The shapes below MIRROR `src/app/cloudHost.ts`'s rather than importing
// them: `native/` is a separate npm project and reaching across would make
// the wrapper's typecheck depend on the web app's module resolution.
// `tests/native_icloud_test.ts` is what keeps the two honest.

/** The five things the page may ask a document store for. Mirrors the
 *  framework's `FileStore`, plus a `status` the picker reads before it offers
 *  the backend at all. */
export type CloudMethod = "status" | "list" | "read" | "write" | "remove";

/** Mirrors `CloudHostStatus` in `src/app/cloudHost.ts`.
 *
 *  `signed-out` and `unavailable` are different answers to different
 *  questions: the first is a phone with no iCloud account (the reader can fix
 *  it in Settings), the second is a build where the container does not resolve
 *  at all (the developer can fix it, the reader cannot). */
export type CloudStatus = "ready" | "signed-out" | "unavailable";

/** One file in the store, with the opaque token that changes when its bytes
 *  do. Mirrors the framework's `FileEntry`. */
export type CloudEntry = { path: string; rev?: string };

/** What a call resolves to. A failure is DATA rather than a rejection,
 *  because the only channel back into the page is an injected script and an
 *  exception thrown there would be swallowed by the WebView rather than
 *  reaching the promise. `kind` is what the page turns back into the right
 *  framework error: `auth` routes to Reconnect, `offline` parks in the
 *  offline state and keeps the local copy, `error` is everything else. */
export type CloudResult =
  | { ok: true; value: CloudStatus | CloudEntry[] | string | null }
  | { ok: false; kind: "auth" | "offline" | "error"; message: string };
