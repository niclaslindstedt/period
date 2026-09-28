// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SAVE-FILE BRIDGE: how an export leaves the app on a phone.
//
// On the website a backup is a download — an anchor clicked at a `blob:` URL.
// Inside the WebView that click goes nowhere: the WebView offers the `blob:`
// URL to the wrapper as a navigation, and there is nothing to open it with.
// So the wrapper offers the page a CAPABILITY instead: it lists `save-file` in
// `window.__ossShell`, and the framework's `saveFile` (in
// `@niclaslindstedt/oss-framework/files`) then posts the file's bytes here
// rather than downloading them. `saveFile.ts` writes them to a temporary file
// and opens the share sheet — Files, Mail, AirDrop, whatever the phone offers.
// A browser has no descriptor and keeps its download. The page never asks
// what it is running inside.
//
// The contract (message and result shapes) is the framework's, documented in
// its `docs/native-shell.md`; the names are spelled again here because the
// wrapper does not depend on the framework, and `tests/native_save_file_test.ts`
// pins the two sides against each other.
//
// Like `authSessionBridge.ts`, this file holds the STRING the page runs
// (dependency-free, ES5-ish — nothing in it is transpiled) and the pure
// narrowing and settling helpers, and no Expo import — so the root test suite
// can load it without `native/`'s dependency tree. The effect is `saveFile.ts`.

/** The message the page posts. */
export const SAVE_FILE_TYPE = "oss-framework/save-file";

/** The event that settles the page's promise. */
export const SAVE_FILE_RESULT_EVENT = "oss-framework/save-file-result";

/** Injected before the page loads: adds `save-file` to the shell descriptor,
 *  merging into one another contract may already have set. */
export const SAVE_FILE_DESCRIPTOR = `(function () {
  var shell = window.__ossShell || { version: 1, capabilities: [] };
  if (!shell.capabilities) shell.capabilities = [];
  if (shell.capabilities.indexOf("save-file") < 0) shell.capabilities.push("save-file");
  window.__ossShell = shell;
})(); true;`;

export type SaveFileRequest = {
  type: string;
  version: number;
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
};

export function isSaveFileRequest(value: unknown): value is SaveFileRequest {
  const m = value as Partial<SaveFileRequest> | null;
  return (
    typeof m === "object" &&
    m !== null &&
    m.type === SAVE_FILE_TYPE &&
    typeof m.version === "number" &&
    typeof m.id === "string" &&
    typeof m.filename === "string" &&
    typeof m.mimeType === "string" &&
    typeof m.base64 === "string"
  );
}

/** iOS picks share targets by UTI, not MIME type. Cycle exports JSON only;
 *  extend as exports need. */
export const UTI: Record<string, string> = {
  "application/json": "public.json",
  "text/plain": "public.plain-text",
};

/** Never trust the page's name: its last path component, or `file`. */
export function bareName(name: string): string {
  const last = name.split(/[\\/]/).pop()?.trim() ?? "";
  return last === "" || last === "." || last === ".." ? "file" : last;
}

/** The script that settles the page's promise. */
export function saveFileResultScript(
  id: string,
  ok: boolean,
  error?: string,
): string {
  const detail = ok ? { id, ok } : { id, ok, error };
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(
    SAVE_FILE_RESULT_EVENT,
  )}, { detail: ${JSON.stringify(detail)} })); true;`;
}
