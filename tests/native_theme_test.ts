// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WRAPPER'S THEME REPORTER, and the status-bar style it drives.
//
// On iOS the page runs under the status bar, so the bar's clock and icons
// must contrast with the PAGE's background, not follow the phone's light or
// dark setting. The page reports its `--page-bg` through the injected
// reporter; `barStyleFor` turns that colour into a style. Both halves are
// pinned here: the message the reporter sends (and that it splices nothing
// unescaped into the script), and the luminance decision.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AFTER_LOAD_SCRIPT,
  REPORT_TYPE,
  barStyleFor,
  isThemeReport,
} from "../native/src/injected.ts";

const native = join(dirname(fileURLToPath(import.meta.url)), "..", "native");

/** Run the reporter against a stub page, and collect what it posts. */
function runReporter(pageBg: string): unknown[] {
  const posted: unknown[] = [];
  const window: Record<string, unknown> = {
    ReactNativeWebView: {
      postMessage: (raw: string) => posted.push(JSON.parse(raw)),
    },
    matchMedia: () => ({ addEventListener: () => {} }),
  };
  const vars: Record<string, string> = { "--page-bg": pageBg };
  const document = {
    documentElement: {},
    hidden: false,
    addEventListener: () => {},
  };
  const run = new Function(
    "window",
    "document",
    "getComputedStyle",
    "MutationObserver",
    "setTimeout",
    "clearTimeout",
    AFTER_LOAD_SCRIPT,
  );
  run(
    window,
    document,
    () => ({ getPropertyValue: (name: string) => vars[name] ?? "" }),
    class {
      observe() {}
    },
    () => 0,
    () => {},
  );
  return posted;
}

describe("the theme reporter", () => {
  it("posts the page background under its namespaced type", () => {
    const [message] = runReporter(" #1d2021 ");
    expect(message).toMatchObject({
      type: REPORT_TYPE,
      theme: { background: "#1d2021" },
    });
    expect(isThemeReport(message)).toBe(true);
  });

  it("splices the type in as a JSON string literal", () => {
    expect(AFTER_LOAD_SCRIPT).toContain(`type: ${JSON.stringify(REPORT_TYPE)}`);
  });

  it("installs once however often it is injected", () => {
    expect(AFTER_LOAD_SCRIPT).toMatch(
      /if \(window\.__\w+NativeReporter\) return;/,
    );
  });

  it("is not mistaken for other traffic, nor other traffic for it", () => {
    expect(isThemeReport({ type: "other", theme: {} })).toBe(false);
    expect(isThemeReport({ type: REPORT_TYPE })).toBe(false);
    expect(isThemeReport(null)).toBe(false);
  });

  it("imports nothing, since the root tests load it without native/'s dependencies", () => {
    const source = readFileSync(join(native, "src", "injected.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
  });
});

describe("barStyleFor", () => {
  it("draws light icons over a dark page", () => {
    for (const bg of [
      "#1d2021",
      "#002b36",
      "#010409",
      "rgb(22, 22, 30)",
      "#000",
    ]) {
      expect(barStyleFor(bg)).toBe("light");
    }
  });

  it("draws dark icons over a light page", () => {
    for (const bg of [
      "#ffffff",
      "#f6f8fa",
      "#eee8d5",
      "rgba(250, 244, 237, 1)",
      "#FFF",
    ]) {
      expect(barStyleFor(bg)).toBe("dark");
    }
  });

  it("keeps today's behaviour before any report, or on a colour it cannot read", () => {
    expect(barStyleFor(null)).toBe("auto");
    expect(barStyleFor("")).toBe("auto");
    expect(barStyleFor("oklch(0.2 0 0)")).toBe("auto");
    expect(barStyleFor("#12345")).toBe("auto");
  });

  it("is decided in the wrapper from the colour, never from the system scheme", () => {
    const app = readFileSync(join(native, "App.tsx"), "utf8");
    expect(app).not.toMatch(/useColorScheme|Appearance/);
    expect(app).toContain("<StatusBar style={barStyleFor(reported)} />");
  });
});
