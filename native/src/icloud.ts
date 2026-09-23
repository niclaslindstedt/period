// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ANSWERING THE PAGE'S STORE REQUESTS — the native half of the iCloud
// backend, and the thing this wrapper adds to the web app.
//
// That is deliberate, and it is what makes this an app. App Store guideline
// 4.2 rejects a build that is a viewer for a website, so the wrapper has to do
// things the browser cannot: it serves the cycle log from inside the
// download (works with no network at all), and — here — it keeps the document
// in the reader's own iCloud, which no browser can do because no browser can
// reach a device's ubiquity container.
//
// What this module is NOT allowed to do is decide anything about the cycle
// log. It moves bytes: a file in, a file out. What a day's report holds, what
// the next cycle is predicted to be and how two devices' edits reconcile are
// all the web app's (`src/app/cycle.ts`, `forecastModel.ts`, `merge.ts`) — a
// Swift copy of any of that is exactly the drift `AGENTS.md` forbids.
//
// Every answer leaves here as DATA rather than as a rejection. The only
// channel back into the page is an injected script, and an exception thrown
// there is swallowed by the WebView instead of reaching the promise — so a
// failure is a `{ ok: false, kind }` the page turns back into the right
// framework error.

import type { CloudRequest } from "./icloudBridge";
import type { CloudResult } from "./icloudWire";
import {
  ICloudStore,
  SIGNED_OUT_MARKER,
  UNAVAILABLE_MARKER,
} from "../modules/icloud-store";

/**
 * Answer one request from the page.
 *
 * Resolves rather than throws, always: the caller injects the result straight
 * back into the WebView, and there is nowhere for an exception to go.
 */
export async function answerCloudRequest(
  request: CloudRequest,
): Promise<CloudResult> {
  // A build without the native module — Expo Go, Android, a platform where
  // autolinking missed it. `status` answers honestly so the page never offers
  // the backend; anything else is a request that should not have been made.
  if (!ICloudStore) {
    if (request.method === "status") return { ok: true, value: "unavailable" };
    return {
      ok: false,
      kind: "error",
      message: "This build has no iCloud store.",
    };
  }

  try {
    switch (request.method) {
      case "status":
        return { ok: true, value: await ICloudStore.status() };
      case "list":
        return { ok: true, value: await ICloudStore.list() };
      case "read":
        return { ok: true, value: await ICloudStore.read(request.path!) };
      case "write":
        await ICloudStore.write(request.path!, request.text!);
        return { ok: true, value: null };
      case "remove":
        await ICloudStore.remove(request.path!);
        return { ok: true, value: null };
    }
  } catch (error) {
    return failure(error);
  }
}

/**
 * Turn a thrown native error into the answer the page routes on.
 *
 * The three kinds are three different things for the app to say, so getting
 * them apart matters more than the wording:
 *
 *   • `auth` — iCloud is signed out. The reader fixes it in iOS Settings, and
 *     the app offers to reconnect rather than parking in an error.
 *   • `offline` — the container is there but the bytes are not, which is what
 *     a phone with no connection looks like. The app keeps the copy on this
 *     device and says so, instead of treating an unreachable container as an
 *     empty one and pushing over what is in it.
 *   • `error` — everything else, which the app shows and stops on.
 */
function failure(error: unknown): CloudResult {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  if (message.includes(SIGNED_OUT_MARKER)) {
    return { ok: false, kind: "auth", message: strip(message) };
  }
  if (message.includes(UNAVAILABLE_MARKER)) {
    return { ok: false, kind: "offline", message: strip(message) };
  }
  return { ok: false, kind: "error", message };
}

/** The message without the marker the routing above read off it. The marker
 *  is plumbing; what the reader sees is the sentence after it. */
function strip(message: string): string {
  return message
    .replace(SIGNED_OUT_MARKER, "")
    .replace(UNAVAILABLE_MARKER, "")
    .trim();
}
