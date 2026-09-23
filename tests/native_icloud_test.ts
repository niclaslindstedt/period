// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WRAPPER'S HALF OF THE iCLOUD SEAM, pinned against the app's.
//
// `native/src/icloudBridge.ts` installs a document-store host into the page,
// and `src/app/cloudHost.ts` looks for one. Between them sit three strings —
// the property, the event, and the provider's name — and a mismatch in any of
// them fails SILENTLY: the backend simply never appears in the storage
// picker, on a device where the reader can see nothing wrong. So they are
// pinned here, from both sides.
//
// This test also guards the import discipline that lets it exist at all. A
// root `npm ci` does not install `native/`'s dependencies, so anything
// reachable from here that imports `expo` (or `react-native`) passes on a
// fully-installed machine and fails only in CI. A **type-only** import is
// still an import. `tsc` cannot guard it locally, so the two files' import
// lines are read instead — crudely, and on purpose, because that fails where
// it helps.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CLOUD_HOST_EVENT,
  CLOUD_HOST_PROPERTY,
  ICLOUD_PROVIDER,
  getCloudHost,
  parseHostEntries,
  parseHostStatus,
} from "../src/app/cloudHost.ts";
import {
  CLOUD_PROVIDER,
  CLOUD_REQUEST_TYPE,
  CLOUD_SCRIPT,
  isCloudRequest,
  resolveScript,
} from "../native/src/icloudBridge.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

describe("the three strings the two halves share", () => {
  it("installs the host where the app looks for it", () => {
    expect(CLOUD_SCRIPT).toContain(`window.${CLOUD_HOST_PROPERTY} =`);
  });

  it("announces itself with the event the app listens for", () => {
    expect(CLOUD_SCRIPT).toContain(JSON.stringify(CLOUD_HOST_EVENT));
  });

  it("names the provider the app knows how to name", () => {
    expect(CLOUD_PROVIDER).toBe(ICLOUD_PROVIDER);
    expect(CLOUD_SCRIPT).toContain(JSON.stringify(CLOUD_PROVIDER));
  });

  it("offers exactly the five methods the app requires of a host", () => {
    // The app validates all five before it will use a host, so a script that
    // installed four would be a host `getCloudHost` throws away.
    for (const method of ["status", "list", "read", "write", "remove"]) {
      expect(CLOUD_SCRIPT, `the script must define ${method}`).toContain(
        `${method}: function`,
      );
    }
  });
});

describe("isCloudRequest", () => {
  const base = { type: CLOUD_REQUEST_TYPE, id: "s1" };

  it("takes the two calls that need nothing else", () => {
    expect(isCloudRequest({ ...base, method: "status" })).toBe(true);
    expect(isCloudRequest({ ...base, method: "list" })).toBe(true);
  });

  it("requires a file name of the three that address one", () => {
    for (const method of ["read", "remove", "write"]) {
      expect(isCloudRequest({ ...base, method })).toBe(false);
      expect(isCloudRequest({ ...base, method, path: "" })).toBe(false);
    }
    expect(
      isCloudRequest({ ...base, method: "read", path: "cycle.json" }),
    ).toBe(true);
  });

  it("requires bytes of a write, and an empty document is bytes", () => {
    expect(
      isCloudRequest({ ...base, method: "write", path: "cycle.json" }),
    ).toBe(false);
    expect(
      isCloudRequest({
        ...base,
        method: "write",
        path: "cycle.json",
        text: "",
      }),
    ).toBe(true);
  });

  it("refuses anything that is not one of ours", () => {
    expect(isCloudRequest({ ...base, method: "delete" })).toBe(false);
    expect(isCloudRequest({ type: "other", id: "s1", method: "list" })).toBe(
      false,
    );
    expect(isCloudRequest({ ...base, id: "", method: "list" })).toBe(false);
    expect(isCloudRequest(null)).toBe(false);
    expect(isCloudRequest("list")).toBe(false);
  });
});

/** Run one resolve script against a stand-in `window` and give back what it
 *  handed the waiting promise — plus anything it did that it should not have.
 *  Evaluating it is the only honest check: the payload is spliced into source
 *  text, so whether the escaping holds is a question about what that text
 *  DOES, not about what it contains. */
function settle(script: string): {
  id?: string;
  result?: unknown;
  ran: number;
} {
  let id: string | undefined;
  let result: unknown;
  let ran = 0;
  const stand = {
    __cycleCloudResolve: (answerId: string, answer: unknown) => {
      id = answerId;
      result = answer;
    },
    // What a successful injection would reach for. It is never called on a
    // script that escaped its payload properly.
    breakOut: () => {
      ran += 1;
    },
  } as Record<string, unknown>;
  new Function("window", "JSON", script)(stand, JSON);
  return { id, result, ran };
}

describe("resolveScript", () => {
  it("carries the document back as data, not as code", () => {
    // A day's note is arbitrary user text, and text is what breaks out of
    // a JavaScript literal. The payload below closes the literal and calls
    // something if it is spliced in rather than parsed.
    const nasty = '");window.breakOut();//';
    const settled = settle(resolveScript("s1", { ok: true, value: nasty }));
    expect(settled.ran).toBe(0);
    expect(settled.result).toEqual({ ok: true, value: nasty });
  });

  it("survives the two separators JSON leaves alone", () => {
    // U+2028 and U+2029 come through `JSON.stringify` unescaped and are
    // newlines to an older JavaScript parser — which ends the statement
    // early, so the promise is never settled at all.
    const text = "a\u2028b\u2029c";
    const script = resolveScript("s1", { ok: true, value: text });
    expect(script).not.toContain("\u2028");
    expect(script).not.toContain("\u2029");
    expect(settle(script).result).toEqual({ ok: true, value: text });
  });

  it("round-trips a failure the app can route on", () => {
    const settled = settle(
      resolveScript("s7", {
        ok: false,
        kind: "auth",
        message: "no iCloud account is signed in on this device.",
      }),
    );
    expect(settled.id).toBe("s7");
    expect(settled.result).toMatchObject({ ok: false, kind: "auth" });
  });

  it("settles nothing when the page has no pending call left", () => {
    // The app is torn down mid-request and the script lands on a page that
    // has reloaded. Doing nothing is the answer; throwing inside an injected
    // script is swallowed by the WebView and helps no one.
    expect(() =>
      new Function(
        "window",
        "JSON",
        resolveScript("s1", { ok: true, value: null }),
      )({}, JSON),
    ).not.toThrow();
  });
});

describe("the host the script installs", () => {
  it("is one the app accepts", () => {
    // The nearest thing to an end-to-end check this suite can run: build the
    // page-side host by evaluating the injected script against a stand-in
    // `window`, then hand it to the app's own validation.
    const globals = globalThis as { window?: unknown };
    const had = "window" in globals;
    const previous = globals.window;
    const stand = {
      ReactNativeWebView: { postMessage: () => {} },
      dispatchEvent: () => true,
    } as Record<string, unknown>;
    globals.window = stand;
    try {
      new Function("window", "Promise", CLOUD_SCRIPT)(stand, Promise);
      expect(getCloudHost()).not.toBeNull();
    } finally {
      if (had) globals.window = previous;
      else delete globals.window;
    }
  });

  it("answers `status` without a bridge rather than hanging", async () => {
    // A host whose channel has gone must still say something, or the app sits
    // on a pending promise with no store and no way to say so.
    const stand = { dispatchEvent: () => true } as Record<string, unknown>;
    new Function("window", "Promise", CLOUD_SCRIPT)(stand, Promise);
    const host = stand[CLOUD_HOST_PROPERTY] as {
      status(): Promise<unknown>;
    };
    expect(parseHostStatus(await host.status())).toBe("unavailable");
  });
});

describe("what the root type-check may reach", () => {
  const forbidden = ["expo", "react-native", "expo-"];

  it("keeps the wire shapes free of every import", () => {
    // Not "free of expo" — free of imports, full stop. The file exists to be
    // the one thing `icloudBridge.ts` may reach for, and the only way to keep
    // that true is for it to reach for nothing.
    const source = read("native/src/icloudWire.ts");
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("keeps the bridge off the wrapper's own dependencies", () => {
    const source = read("native/src/icloudBridge.ts");
    for (const line of source.split("\n")) {
      if (!/^\s*import\s/.test(line)) continue;
      for (const name of forbidden) {
        expect(
          line,
          `${line.trim()} is not reachable from the root suite`,
        ).not.toContain(`"${name}`);
      }
    }
  });

  it("leaves the module that does reach for expo out of that graph", () => {
    // `icloud.ts` is allowed its imports; what matters is that nothing this
    // test touches imports IT.
    expect(read("native/src/icloud.ts")).toContain("../modules/icloud-store");
    expect(read("native/src/icloudBridge.ts")).not.toContain('./icloud"');
  });
});

describe("the entries a host lists", () => {
  it("is the shape the wrapper's own module documents", () => {
    // `list()` on the native side returns `{ path, rev }` per file; this is
    // the app agreeing that is what it reads.
    expect(
      parseHostEntries([{ path: "cycle.json", rev: "1700000000000000:412" }]),
    ).toEqual([{ path: "cycle.json", rev: "1700000000000000:412" }]);
  });
});
