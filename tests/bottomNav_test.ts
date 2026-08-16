// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which tab the app opens on. The rendering is not tested (no DOM in this
// suite), but the choice is: an empty install that opens on a screen with
// nothing to say is the whole reason this branch exists.

import { describe, expect, it } from "vitest";

import { initialTab } from "../src/app/BottomNav.tsx";
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
