// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which tab the app opens on, and which of the screens the bar actually
// carries. The rendering is not tested (no DOM in this suite), but both of
// those are choices rather than markup: an empty install that opens on a screen
// with nothing to say is the whole reason the first branch exists, and the
// second is what a swipe moves along.

import { describe, expect, it } from "vitest";

import {
  initialTab,
  isNavTab,
  screenEnter,
  TABS,
} from "../src/app/BottomNav.tsx";
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

describe("which way a screen arrives from", () => {
  // The motion is the bar's order made visible, so the thing worth pinning is
  // that it agrees with the order — a screen that slid the wrong way would
  // contradict the swipe that asked for it.

  it("moves forward down the bar and back up it", () => {
    expect(screenEnter("status", "calendar")).toBe("forward");
    expect(screenEnter("calendar", "history")).toBe("forward");
    expect(screenEnter("history", "status")).toBe("back");
    expect(screenEnter("forecast", "calendar")).toBe("back");
  });

  it("agrees with the order for every pair on the bar", () => {
    TABS.forEach((from, i) => {
      TABS.forEach((to, j) => {
        const expected = i === j ? "none" : j > i ? "forward" : "back";
        expect(screenEnter(from, to)).toBe(expected);
      });
    });
  });

  it("claims no direction for the screens the bar does not carry", () => {
    // Report and Settings are top-bar actions with no neighbours, so there is
    // no side for them to come in from.
    for (const tab of TABS) {
      expect(screenEnter(tab, "report")).toBe("none");
      expect(screenEnter("report", tab)).toBe("none");
      expect(screenEnter(tab, "settings")).toBe("none");
      expect(screenEnter("settings", tab)).toBe("none");
    }
    expect(screenEnter("report", "settings")).toBe("none");
  });

  it("claims no direction for a screen replacing itself", () => {
    for (const tab of TABS) expect(screenEnter(tab, tab)).toBe("none");
  });
});
