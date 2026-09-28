// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's top bar says the store listing's name, the
// same name as under its icon; every other build says "Cycle". The name is
// configuration (APP_DISPLAY_NAME), never committed, so these pin the plumbing
// rather than the listing: the wrapper's bundle step hands the variable to the
// web build, and the web build reads it only when it is the phone's.

import { describe, expect, it } from "vitest";

import { webBuildEnv } from "../native/scripts/web-build-env.mjs";
import { PROJECT_NAME, resolveAppName } from "../src/app/appName.ts";

const LISTING = "Store Listing Name";

describe("the phone bundle's build environment", () => {
  it("passes the listing name through to the web build", () => {
    const env = webBuildEnv({ APP_DISPLAY_NAME: ` ${LISTING} ` }, "production");
    expect(env.APP_DISPLAY_NAME).toBe(LISTING);
    expect(env.VITE_EMBEDDED_BUILD).toBe("on");
  });

  it("falls back to the project's own name in a plain checkout", () => {
    expect(webBuildEnv({}, "preview").APP_DISPLAY_NAME).toBe(PROJECT_NAME);
    expect(
      webBuildEnv({ APP_DISPLAY_NAME: "  " }, "development").APP_DISPLAY_NAME,
    ).toBe(PROJECT_NAME);
  });

  it("refuses a production bundle with no listing name", () => {
    expect(() => webBuildEnv({}, "production")).toThrow(/APP_DISPLAY_NAME/);
  });

  it("keeps the rest of the caller's environment", () => {
    const env = webBuildEnv({ VITE_DROPBOX_APP_KEY: "k" }, "preview");
    expect(env.VITE_DROPBOX_APP_KEY).toBe("k");
  });
});

describe("resolveAppName", () => {
  it("is the listing name in the phone build", () => {
    expect(
      resolveAppName(webBuildEnv({ APP_DISPLAY_NAME: LISTING }, "production")),
    ).toBe(LISTING);
  });

  it("is the project name in a local phone build", () => {
    expect(resolveAppName(webBuildEnv({}, "preview"))).toBe("Cycle");
  });

  it("is the project name on the website and the desktop app", () => {
    expect(resolveAppName({ APP_DISPLAY_NAME: LISTING })).toBe("Cycle");
    expect(
      resolveAppName({
        VITE_EMBEDDED_BUILD: "on",
        VITE_SHELL_BUILD: "on",
        APP_DISPLAY_NAME: LISTING,
      }),
    ).toBe("Cycle");
  });
});
