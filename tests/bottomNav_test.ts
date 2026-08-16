// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which tab the app opens on, and which of the screens the bar actually
// carries. The rendering is not tested (no DOM in this suite), but both of
// those are choices rather than markup: an empty install that opens on a screen
// with nothing to say is the whole reason the first branch exists, and the
// second is what a swipe moves along.

import { describe, expect, it } from "vitest";

import { initialTab, isNavTab, TABS } from "../src/app/BottomNav.tsx";
import { blankEntry, emptyDoc, type AppData } from "../src/app/types.ts";

function docWith(entries: AppData["entries"]): AppData {
  return { ...emptyDoc(), entries };
}

describe("initialTab", () => {
  it("opens on Report when nothing has been reported yet", () => {
    expect(initialTab(emptyDoc())).toBe("report");
  });

  it("opens on Status once a day has been reported", () => {
    const doc = docWith({
      "2024-03-04": {
        ...blankEntry("2024-03-04", "2024-03-04T21:00:00.000Z"),
        bleeding: true,
      },
    });
    expect(initialTab(doc)).toBe("status");
  });

  it("counts a day answered entirely no as a report", () => {
    const doc = docWith({
      "2024-03-04": blankEntry("2024-03-04", "2024-03-04T21:00:00.000Z"),
    });
    expect(initialTab(doc)).toBe("status");
  });
});

describe("the bar's destinations", () => {
  it("carries the four places and neither of the two actions", () => {
    expect(TABS).toEqual(["status", "calendar", "forecast", "history"]);
    expect(isNavTab("report")).toBe(false);
    expect(isNavTab("settings")).toBe(false);
    for (const tab of TABS) expect(isNavTab(tab)).toBe(true);
  });

  it("opens on a screen the bar cannot light up, which is allowed", () => {
    // A first run lands on Report, which is not a destination — the top bar's
    // own button is what shows as current there.
    expect(isNavTab(initialTab(emptyDoc()))).toBe(false);
  });
});
