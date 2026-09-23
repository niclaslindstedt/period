// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE iCLOUD DOCUMENT STORE, JavaScript side.
//
// A small, file-shaped API over the app's own iCloud ubiquity container:
// list, read, write, remove. That is deliberately the same four operations
// the web app's storage layer already speaks (the framework's `FileStore`),
// so the page's sync engine drives iCloud with the code path it already uses
// for a folder — see `src/app/cloudHost.ts`.
//
// APPLE ONLY. There is no iCloud on Android and no pretending otherwise: the
// module declares `platforms: ["apple"]` and this resolves to `null`
// everywhere else, which the wrapper reports as "no store" and the page reads
// as "do not offer this backend".
//
// Loaded OPTIONALLY. A build without the native side — Expo Go, a bare
// `expo start`, a platform where autolinking did not pick it up — gets `null`
// and the app runs with the copy on this device rather than crashing at
// import.

import { requireOptionalNativeModule } from "expo";

/**
 * The iCloud container the documents live in.
 *
 * Apple requires the `iCloud.` prefix, and changing this after release
 * strands every document already synced under the old identifier — the app
 * would come back to an empty container and the user's reports would appear to
 * be gone (they are not; they are in the old container, and unreachable). It
 * is pinned in three places that must agree: here, `app.config.js` (all three
 * iCloud entitlements), and `ios/ICloudStoreModule.swift`.
 */
export const ICLOUD_CONTAINER = "iCloud.se.agilator.cycle";

/**
 * The subdirectory inside the container the documents sit in.
 *
 * `Documents` rather than the container root on purpose: iCloud publishes
 * that folder to the Files app, so the user can see — and copy, and delete —
 * the file holding their own reports. A cycle log that syncs to a place its
 * owner cannot open would be a worse answer than not syncing at all.
 */
export const ICLOUD_DIRECTORY = "Documents";

/** How a failure names itself. The Swift side prefixes its message with one
 *  of these so the JavaScript side can route it without depending on how
 *  ExpoModulesCore derives an error code. Mirrored in
 *  `ios/ICloudStoreModule.swift` and read in `../../src/icloud.ts`. */
export const SIGNED_OUT_MARKER = "signed-out:";
export const UNAVAILABLE_MARKER = "unavailable:";

/** One file in the store. `rev` changes when the bytes do — it is the
 *  modification date and the size, and nothing reads it but the framework's
 *  conflict check. */
export type ICloudEntry = { path: string; rev?: string };

/** Whether the store can be used at all.
 *
 *  `signed-out` is the reader's to fix (iOS Settings → their name → iCloud);
 *  `unavailable` is the developer's (the entitlements did not make it into
 *  the build). The page prints them differently for exactly that reason. */
export type ICloudStatus = "ready" | "signed-out" | "unavailable";

export type ICloudStoreNativeModule = {
  /** Whether the container resolves and iCloud is signed in. Never prompts. */
  status(): Promise<ICloudStatus>;
  /** Every file in the store's directory, with its current revision. */
  list(): Promise<ICloudEntry[]>;
  /** One file's text, or `null` when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Create or overwrite one file. */
  write(path: string, text: string): Promise<void>;
  /** Delete one file. A missing file is already gone, not an error. */
  remove(path: string): Promise<void>;
};

/** The native module, or `null` in a build (or on a platform) without it. */
export const ICloudStore =
  requireOptionalNativeModule<ICloudStoreNativeModule>("ICloudStore");

export default ICloudStore;
