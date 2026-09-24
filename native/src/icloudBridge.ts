// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE iCLOUD BRIDGE: how the page reaches the user's own iCloud container.
//
// The web app never learns it is running inside this wrapper. What it does is
// look for a DOCUMENT-STORE HOST on `window` — a capability, not an identity —
// and this is the script that installs one (see `src/app/cloudHost.ts` for the
// other side of the contract). A browser has no such host, so on the website
// the picker offers Dropbox and iCloud is simply not there.
//
// `react-native-webview` gives us one message channel in each direction: the
// page posts strings out, and the app injects scripts in. That is enough for
// request/response as long as each call carries an id, so this module is:
//
//   • a script that defines `window.__cycleCloudHost`, whose five methods post
//     a request out and return a promise;
//   • `isCloudRequest`, which narrows an inbound message; and
//   • `resolveScript`, which builds the one line of JavaScript that settles
//     the promise back in the page.
//
// Like `injected.ts`, this file exports STRINGS. Keep the page-side code
// dependency-free and ES5-ish — it runs in the WebView, not in Metro's
// bundle, so nothing in it is transpiled or polyfilled.

// From `icloudWire.ts`, NOT from `icloud.ts`: this module is pure and is
// exercised by the root test suite, which runs against an install that has no
// `expo` in it. Importing the types from their reader — even as a type-only
// import — puts expo back in the root's type graph and turns CI red on a
// machine where it passes.
import type { CloudMethod, CloudResult } from "./icloudWire";
import { escapeForScript } from "./scriptText";

export type { CloudMethod, CloudResult };

/** The message the page posts to ask for something. Namespaced like the theme
 *  report so the two are never confused. */
export const CLOUD_REQUEST_TYPE = "cycle-native/cloud-request";

/** Which store this host speaks for. The page validates it against the
 *  backends it knows, so a second host — a Files-app folder, say — would slot
 *  in by declaring its own name rather than by changing `src/`. */
export const CLOUD_PROVIDER = "icloud";

export type CloudRequest = {
  type: string;
  /** Correlates the answer with the promise waiting for it. */
  id: string;
  method: CloudMethod;
  /** The file, for `read` / `write` / `remove`. Relative to the store's root. */
  path?: string;
  /** The bytes, for `write`. */
  text?: string;
};

/** The event the page-side seam listens for. Must match `CLOUD_HOST_EVENT` in
 *  `src/app/cloudHost.ts` — a mismatch is not an error, it is a backend that
 *  never appears in the picker. */
const HOST_EVENT = "cycle:cloud-host";

/** Where the host installs itself. Must match `cloudHost.ts`'s
 *  `HOST_PROPERTY`, and for the same reason. */
const HOST_PROPERTY = "__cycleCloudHost";

/** The callback the app settles a pending promise through. Must match
 *  `resolveScript` below, and nothing in `src/` reads it. */
const RESOLVE_PROPERTY = "__cycleCloudResolve";

/**
 * The script that installs the host.
 *
 * Injected after the page has loaded, and it announces itself with an event
 * because it can land either side of the app's first render — the seam reads
 * `window` once on mount and then listens, so an announcement is what covers
 * the race in the direction where this script is late.
 *
 * A pending call is settled by `resolveScript` below. Nothing here times out:
 * a request that never comes back leaves a promise pending, which the sync
 * engine shows as "saving" rather than as a wrong answer — and the only way
 * one goes unanswered is the app being torn down mid-call, at which point
 * there is no engine left to tell.
 */
export const CLOUD_SCRIPT = `(function () {
  if (window.${HOST_PROPERTY}) return;

  var pending = {};
  var next = 0;

  function call(method, path, text) {
    return new Promise(function (resolve, reject) {
      var id = "s" + (next += 1);
      pending[id] = { resolve: resolve, reject: reject };
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: ${JSON.stringify(CLOUD_REQUEST_TYPE)},
          id: id,
          method: method,
          path: path,
          text: text
        }));
      } catch (e) {
        delete pending[id];
        // The bridge is gone. Answer the way an absent store would rather
        // than hang: the app falls back to the copy on this device.
        if (method === "status") resolve({ ok: true, value: "unavailable" });
        else reject(new Error("The iCloud bridge is unavailable."));
      }
    });
  }

  // Called by the app, through injectJavaScript, with the answer.
  window.${RESOLVE_PROPERTY} = function (id, result) {
    var entry = pending[id];
    if (!entry) return;
    delete pending[id];
    entry.resolve(result);
  };

  window.${HOST_PROPERTY} = {
    version: 1,
    provider: ${JSON.stringify(CLOUD_PROVIDER)},
    status: function () { return call("status"); },
    list: function () { return call("list"); },
    read: function (path) { return call("read", path); },
    write: function (path, text) { return call("write", path, text); },
    remove: function (path) { return call("remove", path); }
  };

  try {
    window.dispatchEvent(new Event(${JSON.stringify(HOST_EVENT)}));
  } catch (e) {
    // Very old WebViews: the app's own mount-time read still finds the host,
    // it just does not get told about it.
  }
})(); true;`;

/** Narrow an arbitrary parsed `postMessage` body to a store request. */
export function isCloudRequest(value: unknown): value is CloudRequest {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<CloudRequest>;
  if (message.type !== CLOUD_REQUEST_TYPE) return false;
  if (typeof message.id !== "string" || message.id === "") return false;
  if (
    message.method !== "status" &&
    message.method !== "list" &&
    message.method !== "read" &&
    message.method !== "write" &&
    message.method !== "remove"
  ) {
    return false;
  }
  // A path is required by everything but `status` and `list`, and `write`
  // needs bytes as well. Checking here keeps `icloud.ts` free of the
  // question — it is handed a request it can act on or nothing at all.
  if (message.method === "read" || message.method === "remove") {
    return typeof message.path === "string" && message.path !== "";
  }
  if (message.method === "write") {
    return (
      typeof message.path === "string" &&
      message.path !== "" &&
      typeof message.text === "string"
    );
  }
  return true;
}

/**
 * The line of JavaScript that settles one pending call.
 *
 * The answer is embedded as a JSON *string* and parsed in the page rather than
 * spliced in as a JavaScript literal, because the payload is the user's own
 * document: a day's note is arbitrary user text, and text is exactly what
 * breaks out of a literal. `JSON.stringify` of the JSON text handles the
 * quoting; the two line separators below are the characters it does NOT escape
 * and which an older JavaScript parser treats as newlines, so they are escaped
 * by hand.
 */
export function resolveScript(id: string, result: CloudResult): string {
  const payload = escapeForScript(JSON.stringify({ id, result }));
  return `(function () {
    try {
      var answer = JSON.parse(${payload});
      if (window.${RESOLVE_PROPERTY}) {
        window.${RESOLVE_PROPERTY}(answer.id, answer.result);
      }
    } catch (e) {}
  })(); true;`;
}
