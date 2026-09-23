// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The seam a host fills to offer the app a document store of its own
// (`src/app/cloudHost.ts`). Everything here is the validation side: the value
// arrives from code outside this bundle, so what matters is that a malformed
// host is refused rather than handed somebody's reports.

import { describe, expect, it } from "vitest";

import { AuthError } from "@niclaslindstedt/oss-framework/storage";

import {
  CLOUD_HOST_EVENT,
  CLOUD_HOST_PROPERTY,
  ICLOUD_PROVIDER,
  createCloudHostAdapter,
  getCloudHost,
  parseHostEntries,
  parseHostStatus,
  type CloudHost,
  type CloudHostResult,
} from "../src/app/cloudHost.ts";

/** A host that satisfies the contract, so each test can spoil one thing. */
function host(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const answer = () => Promise.resolve({ ok: true, value: null });
  return {
    version: 1,
    provider: ICLOUD_PROVIDER,
    status: answer,
    list: answer,
    read: answer,
    write: answer,
    remove: answer,
    ...overrides,
  };
}

/** Install a candidate on `window` for the duration of one read. */
function withWindow<T>(value: unknown, run: () => T): T {
  const globals = globalThis as { window?: unknown };
  const had = "window" in globals;
  const previous = globals.window;
  globals.window = { [CLOUD_HOST_PROPERTY]: value };
  try {
    return run();
  } finally {
    if (had) globals.window = previous;
    else delete globals.window;
  }
}

describe("getCloudHost", () => {
  it("finds a host that satisfies the whole contract", () => {
    expect(withWindow(host(), getCloudHost)).not.toBeNull();
  });

  it("is null with no window at all — the tests' own environment", () => {
    expect(getCloudHost()).toBeNull();
  });

  it("is null when nothing installed itself", () => {
    expect(withWindow(undefined, getCloudHost)).toBeNull();
  });

  it("refuses a host announcing a version this build does not know", () => {
    expect(withWindow(host({ version: 2 }), getCloudHost)).toBeNull();
  });

  it("refuses a provider the app cannot name", () => {
    expect(withWindow(host({ provider: "dropbox" }), getCloudHost)).toBeNull();
  });

  it("refuses a host missing any one of the five methods", () => {
    for (const method of ["status", "list", "read", "write", "remove"]) {
      expect(
        withWindow(host({ [method]: undefined }), getCloudHost),
        `a host with no ${method}() is not a store`,
      ).toBeNull();
    }
  });
});

describe("parseHostStatus", () => {
  it("passes the two answers that mean the backend can be offered", () => {
    expect(parseHostStatus({ ok: true, value: "ready" })).toBe("ready");
    expect(parseHostStatus({ ok: true, value: "signed-out" })).toBe(
      "signed-out",
    );
  });

  it("fails to unavailable, which is the end that hides the backend", () => {
    // A store whose status could not be read is not one to hand a document
    // to, so every one of these is the same answer.
    expect(parseHostStatus({ ok: true, value: "yes" })).toBe("unavailable");
    expect(parseHostStatus({ ok: false, kind: "error", message: "" })).toBe(
      "unavailable",
    );
    expect(parseHostStatus({ value: "ready" })).toBe("unavailable");
    expect(parseHostStatus(null)).toBe("unavailable");
    expect(parseHostStatus("ready")).toBe("unavailable");
  });
});

describe("parseHostEntries", () => {
  it("keeps a path with its revision, and a path without one", () => {
    expect(
      parseHostEntries([
        { path: "cycle.json", rev: "1700000000000000:412" },
        { path: "other.json" },
      ]),
    ).toEqual([
      { path: "cycle.json", rev: "1700000000000000:412" },
      { path: "other.json" },
    ]);
  });

  it("drops one malformed entry rather than the whole listing", () => {
    // The framework reads one file out of this list. A stray entry from a
    // host must not cost it that file.
    expect(
      parseHostEntries([
        null,
        { path: "" },
        { rev: "x" },
        { path: "cycle.json", rev: 7 },
        "cycle.json",
      ]),
    ).toEqual([{ path: "cycle.json" }]);
  });

  it("is empty for anything that is not a list", () => {
    expect(parseHostEntries(undefined)).toEqual([]);
    expect(parseHostEntries({ path: "cycle.json" })).toEqual([]);
  });
});

describe("the strings a host has to match", () => {
  it("pins the property and the event", () => {
    // Neither fails loudly on a mismatch — the backend simply never appears
    // in the picker, on a device where the reader can see nothing wrong. The
    // other half of each pair is in `native/src/icloudBridge.ts`, which
    // `native_icloud_test.ts` reads.
    expect(CLOUD_HOST_PROPERTY).toBe("__cycleCloudHost");
    expect(CLOUD_HOST_EVENT).toBe("cycle:cloud-host");
    expect(ICLOUD_PROVIDER).toBe("icloud");
  });
});

describe("createCloudHostAdapter", () => {
  /** A host whose every method gives the same answer, so one test can pin
   *  what that answer becomes on the way out. */
  function answering(result: unknown): CloudHost {
    const give = () => Promise.resolve(result as CloudHostResult);
    return {
      version: 1,
      provider: ICLOUD_PROVIDER,
      status: give,
      list: give,
      read: give,
      write: give,
      remove: give,
    };
  }

  const adapterFor = (result: unknown) =>
    createCloudHostAdapter(answering(result), {
      label: "iCloud Drive",
      fileName: "cycle.json",
    });

  it("reads the document the host hands over, with its revision", async () => {
    let asked: string | null = null;
    const host = answering(null);
    const adapter = createCloudHostAdapter(
      {
        ...host,
        list: () =>
          Promise.resolve({
            ok: true,
            value: [{ path: "cycle.json", rev: "17:412" }],
          }),
        read: (path: string) => {
          asked = path;
          return Promise.resolve({ ok: true, value: '{"version":2}' });
        },
      },
      { label: "iCloud Drive", fileName: "cycle.json" },
    );
    await expect(adapter.load()).resolves.toEqual({
      text: '{"version":2}',
      revision: "17:412",
    });
    expect(asked).toBe("cycle.json");
  });

  it("says nothing is stored yet rather than inventing a document", async () => {
    // The container exists and is empty — a first run. `null`, not `""`: an
    // empty string is a document, and the engine would merge it as one.
    await expect(
      adapterFor({ ok: true, value: null }).load(),
    ).resolves.toBeNull();
  });

  it("turns a signed-out host into the error that offers Reconnect", async () => {
    await expect(
      adapterFor({ ok: false, kind: "auth", message: "signed out" }).load(),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("turns an unreachable store into the error that keeps the local copy", async () => {
    // A TypeError is what the framework's `isOfflineError` recognises, and
    // recognising it is what stops an unreachable container being mistaken
    // for an empty one and pushed over.
    await expect(
      adapterFor({
        ok: false,
        kind: "offline",
        message: "not downloaded",
      }).load(),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("refuses an answer it cannot read, rather than passing it on", async () => {
    // Falling through here would hand the merge an `undefined` and, one push
    // later, an empty file where somebody's reports were.
    for (const answer of [null, undefined, "ok", { value: "{}" }]) {
      await expect(adapterFor(answer).load()).rejects.toBeInstanceOf(Error);
    }
  });

  it("can probe, and can be asked for the revision without the body", async () => {
    // Both are what the sync details' "Check connection" and the conflict
    // check read; a backend without them parks in whatever state it is in.
    const adapter = adapterFor({ ok: true, value: [] });
    expect(adapter.capabilities.has("probe")).toBe(true);
    expect(adapter.capabilities.has("getRevision")).toBe(true);
    await expect(adapter.probe?.()).resolves.toBe(true);
  });

  it("reports an unreachable store as unreachable rather than throwing", async () => {
    const adapter = adapterFor({
      ok: false,
      kind: "offline",
      message: "not downloaded",
    });
    await expect(adapter.probe?.()).resolves.toBe(false);
  });
});
