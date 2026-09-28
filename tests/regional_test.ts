// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  FALLBACK_REGIONAL,
  regionOf,
  regionalDefaults,
} from "../src/app/regional.ts";
import { defaultSettings, parseSettings } from "../src/app/useAppSettings.ts";

// A fresh install starts the week and reads a thermometer the way the device's
// region does; anyone who has opened the app before keeps what they had.

describe("regionalDefaults", () => {
  it("gives a US device a Sunday week and °F", () => {
    expect(regionalDefaults(["en-US"])).toEqual({
      weekStartsOn: 0,
      temperatureUnit: "f",
    });
    expect(regionalDefaults(["es-US", "en"])).toEqual({
      weekStartsOn: 0,
      temperatureUnit: "f",
    });
  });

  it("keeps Monday and °C in the Nordics, English interface or not", () => {
    for (const tag of ["sv-SE", "en-SE", "nb-NO", "da-DK", "fi-FI", "is-IS"]) {
      expect(regionalDefaults([tag])).toEqual({
        weekStartsOn: 1,
        temperatureUnit: "c",
      });
    }
  });

  it("lets the first tag with a region decide", () => {
    expect(regionalDefaults(["en", "sv-SE", "en-US"])).toEqual({
      weekStartsOn: 1,
      temperatureUnit: "c",
    });
    expect(regionalDefaults(["en", "en-US", "sv-SE"]).temperatureUnit).toBe(
      "f",
    );
  });

  it("does not read a bare language as American", () => {
    expect(regionalDefaults(["en"])).toEqual(FALLBACK_REGIONAL);
    expect(regionalDefaults([])).toEqual(FALLBACK_REGIONAL);
    expect(regionalDefaults(["", "  "])).toEqual(FALLBACK_REGIONAL);
  });

  it("starts the week on Sunday in Canada but keeps °C there", () => {
    expect(regionalDefaults(["en-CA"])).toEqual({
      weekStartsOn: 0,
      temperatureUnit: "c",
    });
  });

  it("reads the region out of longer and underscored tags", () => {
    expect(regionOf("zh-Hant-TW")).toBe("TW");
    expect(regionOf("en_us")).toBe("US");
    expect(regionOf("en")).toBeNull();
  });
});

describe("settings: the device's defaults, and a stored choice over them", () => {
  const us = defaultSettings({ weekStartsOn: 0, temperatureUnit: "f" });
  const se = defaultSettings({ weekStartsOn: 1, temperatureUnit: "c" });

  it("starts a US install on Sunday and °F", () => {
    expect(us.weekStartsOn).toBe(0);
    expect(us.temperatureUnit).toBe("f");
    expect(se.weekStartsOn).toBe(1);
    expect(se.temperatureUnit).toBe("c");
  });

  it("keeps an existing user's Monday and °C on a US device", () => {
    const stored = JSON.stringify({ ...se, theme: "dark" });
    const read = parseSettings(stored, us);
    expect(read.weekStartsOn).toBe(1);
    expect(read.temperatureUnit).toBe("c");
    expect(read.theme).toBe("dark");
  });

  it("keeps an existing user's Sunday and °F on a Swedish device", () => {
    const read = parseSettings(JSON.stringify(us), se);
    expect(read.weekStartsOn).toBe(0);
    expect(read.temperatureUnit).toBe("f");
  });

  it("falls back to the device only for a key the blob lacks or garbles", () => {
    expect(parseSettings(JSON.stringify({ theme: "light" }), us)).toMatchObject(
      { weekStartsOn: 0, temperatureUnit: "f" },
    );
    expect(
      parseSettings(
        JSON.stringify({ weekStartsOn: "x", temperatureUnit: "k" }),
        us,
      ),
    ).toMatchObject({ weekStartsOn: 0, temperatureUnit: "f" });
    expect(parseSettings("[]", us)).toEqual(us);
  });
});
