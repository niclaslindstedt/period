// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The backup export, both ways out: a download in a browser, and the share
// sheet in the phone app through the save-file bridge
// (`native/src/saveFileBridge.ts`) against the framework's `saveFile`.
//
// Like the auth-session seam, every failure here is silent: a name that
// drifts leaves the page downloading into a WebView that drops the click, on
// a build nobody can run without Xcode. So the injected descriptor is RUN
// against a stand-in window, and the message the page posts is read back
// through the wrapper's own guard.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAVE_FILE_MESSAGE,
  SAVE_FILE_RESULT_EVENT as FRAMEWORK_RESULT_EVENT,
} from "@niclaslindstedt/oss-framework/files";
import {
  NATIVE_SHELL_PROPERTY,
  isNativeShell,
  nativeShellCan,
} from "@niclaslindstedt/oss-framework/pwa";

import { backupFileName, saveBackup } from "../src/app/backup.ts";
import { normalizeDoc } from "../src/app/migrations.ts";
import { blankEntry, emptyDoc, type AppData } from "../src/app/types.ts";
import {
  SAVE_FILE_DESCRIPTOR,
  SAVE_FILE_RESULT_EVENT,
  SAVE_FILE_TYPE,
  bareName,
  isSaveFileRequest,
  saveFileResultScript,
} from "../native/src/saveFileBridge.ts";

const TODAY = "2026-09-28";

const DOC: AppData = {
  ...emptyDoc(),
  entries: {
    "2026-09-20": {
      ...blankEntry("2026-09-20", "2026-09-20T08:00:00.000Z"),
      bleeding: true,
      temperature: 36.6,
    },
  },
};

type Listener = (event: { detail: unknown }) => void;

type FakeWindow = Record<string, unknown> & {
  posted: string[];
  listeners: Map<string, Set<Listener>>;
};

/** A stand-in for the page's `window`: records what it posts to the shell
 *  and delivers the events the wrapper dispatches back. */
function fakeWindow(bridge: boolean): FakeWindow {
  const win: FakeWindow = { posted: [], listeners: new Map() };
  if (bridge) {
    win.ReactNativeWebView = {
      postMessage: (data: string) => win.posted.push(data),
    };
  }
  win.addEventListener = (type: string, fn: Listener) => {
    if (!win.listeners.has(type)) win.listeners.set(type, new Set());
    win.listeners.get(type)!.add(fn);
  };
  win.removeEventListener = (type: string, fn: Listener) => {
    win.listeners.get(type)?.delete(fn);
  };
  win.dispatchEvent = (event: { type: string; detail: unknown }) => {
    for (const fn of win.listeners.get(event.type) ?? []) fn(event);
    return true;
  };
  return win;
}

/** Run an injected script against `win`, the way `injectJavaScript` would. */
function run(script: string, win: FakeWindow): void {
  class FakeCustomEvent {
    readonly detail: unknown;
    constructor(
      readonly type: string,
      init?: { detail?: unknown },
    ) {
      this.detail = init?.detail;
    }
  }
  new Function("window", "CustomEvent", script)(win, FakeCustomEvent);
}

/** A stand-in `document` that records the anchor a download clicks. */
function fakeDocument() {
  const clicked: { href: string; download: string }[] = [];
  const doc = {
    clicked,
    body: { appendChild: () => undefined },
    createElement: () => {
      const a = {
        href: "",
        download: "",
        rel: "",
        click: () => clicked.push({ href: a.href, download: a.download }),
        remove: () => undefined,
      };
      return a;
    },
  };
  return doc;
}

function decode(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the backup's name", () => {
  it("is dated, so a folder of backups sorts itself", () => {
    expect(backupFileName(TODAY)).toBe("cycle-backup-2026-09-28.json");
  });
});

describe("exporting in a browser", () => {
  it("downloads the backup, and posts nothing", async () => {
    const win = fakeWindow(false);
    const doc = fakeDocument();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:backup",
      revokeObjectURL: () => undefined,
    });

    await expect(saveBackup(DOC, TODAY)).resolves.toBe("downloaded");
    expect(doc.clicked).toEqual([
      { href: "blob:backup", download: "cycle-backup-2026-09-28.json" },
    ]);
    expect(win.posted).toEqual([]);
  });

  it("downloads when the page has a bridge but the shell lists no save-file", async () => {
    // A shell that listens to its page (the theme reporter) but has not
    // implemented the contract keeps the web behaviour.
    const win = fakeWindow(true);
    const doc = fakeDocument();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:backup",
      revokeObjectURL: () => undefined,
    });

    await expect(saveBackup(DOC, TODAY)).resolves.toBe("downloaded");
    expect(win.posted).toEqual([]);
  });
});

describe("the injected descriptor", () => {
  it("advertises save-file where the framework looks", () => {
    const win = fakeWindow(true);
    run(SAVE_FILE_DESCRIPTOR, win);
    expect(NATIVE_SHELL_PROPERTY).toBe("__ossShell");
    expect(win.__ossShell).toEqual({ version: 1, capabilities: ["save-file"] });
  });

  it("merges into a descriptor another contract set, and only once", () => {
    const win = fakeWindow(true);
    win.__ossShell = { version: 1, capabilities: ["other"] };
    run(SAVE_FILE_DESCRIPTOR, win);
    run(SAVE_FILE_DESCRIPTOR, win);
    expect(win.__ossShell).toEqual({
      version: 1,
      capabilities: ["other", "save-file"],
    });
  });

  it("is what the framework reads the capability from", () => {
    const win = fakeWindow(true);
    vi.stubGlobal("window", win);
    expect(nativeShellCan("save-file")).toBe(false);
    run(SAVE_FILE_DESCRIPTOR, win);
    expect(isNativeShell()).toBe(true);
    expect(nativeShellCan("save-file")).toBe(true);
  });
});

describe("exporting in the phone app", () => {
  /** A window as the wrapper leaves it: bridge present, descriptor injected. */
  function shellWindow(): FakeWindow {
    const win = fakeWindow(true);
    run(SAVE_FILE_DESCRIPTOR, win);
    vi.stubGlobal("window", win);
    // No `document`: a download attempt would throw.
    return win;
  }

  it("uses the framework's names", () => {
    expect(SAVE_FILE_TYPE).toBe(SAVE_FILE_MESSAGE);
    expect(SAVE_FILE_RESULT_EVENT).toBe(FRAMEWORK_RESULT_EVENT);
  });

  it("posts the backup to the shell, and settles when the sheet closes", async () => {
    const win = shellWindow();
    const pending = saveBackup(DOC, TODAY);
    await vi.waitFor(() => expect(win.posted).toHaveLength(1));

    const request: unknown = JSON.parse(win.posted[0]!);
    expect(isSaveFileRequest(request)).toBe(true);
    if (!isSaveFileRequest(request)) return;
    expect(request.version).toBe(1);
    expect(request.filename).toBe("cycle-backup-2026-09-28.json");
    // Bare — the charset parameter is the page's to drop.
    expect(request.mimeType).toBe("application/json");
    // The bytes are the backup: the same document back through a restore.
    const restored = normalizeDoc(JSON.parse(decode(request.base64)));
    expect(restored).toEqual(DOC);
    expect(restored.entries["2026-09-20"]?.bleeding).toBe(true);

    run(saveFileResultScript(request.id, true), win);
    await expect(pending).resolves.toBe("shared");
  });

  it("rejects with the shell's error when the file could not be shared", async () => {
    const win = shellWindow();
    const pending = saveBackup(DOC, TODAY);
    await vi.waitFor(() => expect(win.posted).toHaveLength(1));
    const { id } = JSON.parse(win.posted[0]!) as { id: string };

    run(
      saveFileResultScript(
        id,
        false,
        "Sharing is not available on this device.",
      ),
      win,
    );
    await expect(pending).rejects.toThrow("Sharing is not available");
  });

  it("ignores an answer meant for another export", async () => {
    const win = shellWindow();
    const pending = saveBackup(DOC, TODAY);
    await vi.waitFor(() => expect(win.posted).toHaveLength(1));
    const { id } = JSON.parse(win.posted[0]!) as { id: string };

    let settled = false;
    void pending.then(() => (settled = true));
    run(saveFileResultScript("someone-else", true), win);
    await Promise.resolve();
    expect(settled).toBe(false);

    run(saveFileResultScript(id, true), win);
    await expect(pending).resolves.toBe("shared");
  });
});

describe("the wrapper's guard and names", () => {
  it("accepts only the save-file message", () => {
    const ok = {
      type: SAVE_FILE_TYPE,
      version: 1,
      id: "a",
      filename: "x.json",
      mimeType: "application/json",
      base64: "",
    };
    expect(isSaveFileRequest(ok)).toBe(true);
    expect(isSaveFileRequest({ ...ok, type: "cycle-native/theme" })).toBe(
      false,
    );
    expect(isSaveFileRequest({ ...ok, base64: undefined })).toBe(false);
    expect(isSaveFileRequest(null)).toBe(false);
  });

  it("never trusts the page's file name", () => {
    expect(bareName("cycle-backup-2026-09-28.json")).toBe(
      "cycle-backup-2026-09-28.json",
    );
    expect(bareName("../../etc/passwd")).toBe("passwd");
    expect(bareName("a\\b.json")).toBe("b.json");
    expect(bareName("..")).toBe("file");
    expect(bareName("dir/")).toBe("file");
  });
});
