// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it, vi } from "vitest";

import {
  addDays,
  dayKeyOf,
  daysBetween,
  type DayKey,
} from "@niclaslindstedt/oss-framework/calendar";

import {
  DEFAULT_CYCLE_OPTIONS,
  cycleStats,
  forecast,
  upcomingStarts,
} from "../src/app/cycle.ts";
import { dayStatus } from "../src/app/dayStatus.ts";
import { createDemoBackend } from "../src/app/dev/demoBackend.ts";
import {
  CURRENT_CYCLE_DAY,
  DEMO_DAYS,
  TEMPERATURE_DAYS,
  buildDemoData,
} from "../src/app/dev/demoData.ts";
import { probabilisticForecast } from "../src/app/forecastModel.ts";
import { parseDoc, serializeDoc } from "../src/app/migrations.ts";
import { inUnit, isFever, parseTemperature } from "../src/app/temperature.ts";
import { DOC_VERSION, sortedEntries } from "../src/app/types.ts";

// The demo document is the live demo and what the App Store screenshots are
// taken of, so it is held to what those frames claim: an ordinary, healthy
// year — cycles of 26 to 31 days, periods of four to six, a mood that turns
// before each period, a waking temperature on most mornings since spring —
// and nothing alarming, intimate or clinical. Every number a frame shows is
// read here through the app's own derivation, never restated. And because the
// document is placed from the moment it opens, the frames' premises are
// asserted for every day of a year as "now".

/** The day the store's status bars were captured, at their 9:41. */
const NOW = new Date(2026, 8, 26, 9, 41);

/** Whether a day is one of the `count` days before `onset`. */
function within(day: DayKey, onset: DayKey, count: number): boolean {
  const lead = daysBetween(day, onset);
  return lead >= 1 && lead <= count;
}

/** Every day of a year as "now", at 9:41. */
function yearOfMornings(): Date[] {
  return Array.from({ length: 366 }, (_, i) => new Date(2026, 0, 1 + i, 9, 41));
}

describe("buildDemoData", () => {
  it("returns a fresh, deterministic document each call", () => {
    const a = buildDemoData(NOW);
    const b = buildDemoData(new Date(NOW));
    expect(a).toEqual(b);
    // Not the same object: edits must not mutate a shared template.
    expect(a).not.toBe(b);
    expect(a.entries).not.toBe(b.entries);
  });

  it("is placed from the moment it opens, not on fixed dates", () => {
    const now = buildDemoData(NOW);
    const later = buildDemoData(new Date(2027, 2, 14, 9, 41));
    const shift = daysBetween(dayKeyOf(NOW), "2027-03-14");
    for (const entry of sortedEntries(now)) {
      const moved = later.entries[addDays(entry.date, shift)];
      expect({ ...moved!, date: "", updatedAt: "" }).toEqual({
        ...entry,
        date: "",
        updatedAt: "",
      });
    }
  });

  it("logs every day of the past year and nothing from today on", () => {
    const today = dayKeyOf(NOW);
    const doc = buildDemoData(NOW);
    const entries = sortedEntries(doc);
    expect(doc.version).toBe(DOC_VERSION);
    expect(entries.length).toBe(DEMO_DAYS);
    expect(entries[0]!.date).toBe(addDays(today, -DEMO_DAYS));
    // Today is unlogged — the Report screen opens on it.
    expect(entries[entries.length - 1]!.date).toBe(addDays(today, -1));
    for (const entry of entries) {
      // Filed on the evening of its own day, as local wall-clock time.
      const filed = new Date(entry.updatedAt);
      expect(dayKeyOf(filed)).toBe(entry.date);
      expect(filed.getHours()).toBeGreaterThanOrEqual(21);
      expect(filed.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it("survives the document pipeline unchanged", () => {
    const doc = buildDemoData(NOW);
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });

  it("is an ordinary, healthy year of cycles", () => {
    const stats = cycleStats(buildDemoData(NOW));
    // Thirteen periods in the window, so twelve observed cycle lengths.
    expect(stats.periods.length).toBe(13);
    expect(stats.cycleLengths.length).toBe(12);
    expect(Math.min(...stats.cycleLengths)).toBe(26);
    expect(Math.max(...stats.cycleLengths)).toBe(31);
    expect(stats.averageCycle).toBe(28);
    for (const period of stats.periods.slice(1)) {
      const days = daysBetween(period.start, period.end) + 1;
      expect(days).toBeGreaterThanOrEqual(4);
      expect(days).toBeLessThanOrEqual(6);
    }
    expect(stats.averagePeriodLength).toBe(5);
  });

  it("says nothing intimate, clinical or alarming", () => {
    for (const entry of sortedEntries(buildDemoData(NOW))) {
      expect(entry.lust).toBe(false);
      expect(entry.sex).toBe(false);
      expect(entry.fertilityTest).toBeNull();
      if (entry.temperature !== null) {
        expect(isFever(entry.temperature)).toBe(false);
      }
    }
  });

  it("turns the mood in the days before a period, and rarely otherwise", () => {
    const doc = buildDemoData(NOW);
    const starts = cycleStats(doc).periods.map((p) => p.start);
    const near = { swings: 0, days: 0 };
    const rest = { swings: 0, days: 0 };
    for (const entry of sortedEntries(doc)) {
      const bucket = starts.some((s) => within(entry.date, s, 5)) ? near : rest;
      bucket.days += 1;
      if (entry.moodSwings) bucket.swings += 1;
    }
    expect(near.swings / near.days).toBeGreaterThan(0.45);
    expect(near.swings / near.days).toBeLessThan(0.7);
    expect(rest.swings / rest.days).toBeLessThan(0.04);
  });

  it("takes a waking temperature on most mornings since spring, in °F", () => {
    const today = dayKeyOf(NOW);
    const entries = sortedEntries(buildDemoData(NOW));
    const recent = entries.filter(
      (e) => daysBetween(e.date, today) <= TEMPERATURE_DAYS,
    );
    const older = entries.filter(
      (e) => daysBetween(e.date, today) > TEMPERATURE_DAYS,
    );
    expect(older.every((e) => e.temperature === null)).toBe(true);
    const taken = recent.filter((e) => e.temperature !== null);
    expect(taken.length / recent.length).toBeGreaterThan(0.78);
    expect(taken.length / recent.length).toBeLessThan(0.9);
    for (const entry of taken) {
      // Reads back as the two-decimal Fahrenheit reading that was "typed".
      const shown = inUnit(entry.temperature!, "f").toFixed(2);
      expect(parseTemperature(shown, "f")).toBe(entry.temperature);
      expect(Number(shown)).toBeGreaterThan(96.8);
      expect(Number(shown)).toBeLessThan(98.3);
    }
  });
});

describe("the store frames, on every day of a year", () => {
  it("forecast: day 24, the next period days away, a steady pattern", () => {
    for (const now of yearOfMornings()) {
      const doc = buildDemoData(now);
      const today = dayKeyOf(now);
      const f = forecast(doc, today);
      const p = probabilisticForecast(doc, today)!;
      expect(f.cycleDay).toBe(CURRENT_CYCLE_DAY);
      expect(p.confidence).toBe("high");
      expect(p.daysUntilExpected).toBeGreaterThanOrEqual(4);
      expect(p.daysUntilExpected).toBeLessThanOrEqual(6);
      // The Periods card (the plain average, `upcomingStarts`) opens on the
      // day the headline names (the posterior median), so one screen never
      // quotes two dates for the same period.
      expect(upcomingStarts(f, 1)[0]!.start).toBe(p.expectedDay);
      const eighty = p.intervals.find((i) => i.mass === 0.8)!;
      expect(eighty.widthDays).toBeLessThanOrEqual(6);
      expect(daysBetween(today, eighty.start)).toBeGreaterThan(0);
      // The temperature rise of this cycle has been caught, about a week ago
      // (the sentence on the temperature frame).
      const shift = p.thermalShift!.detectedDay!;
      expect(daysBetween(shift, today)).toBeGreaterThanOrEqual(5);
      expect(daysBetween(shift, today)).toBeLessThanOrEqual(9);
      // History: a year of it — and its average cycle is the forecast's
      // "typically N days", so two frames never quote two numbers.
      const stats = cycleStats(doc);
      expect(stats.cycleLengths.length).toBe(12);
      expect(Math.round(p.params.typicalLength)).toBe(stats.averageCycle);
    }
  }, 120_000);

  it("calendar: the month holds a period, a fertile window and a forecast", () => {
    for (const now of yearOfMornings().filter((_, i) => i % 7 === 0)) {
      const doc = buildDemoData(now);
      const today = dayKeyOf(now);
      const p = probabilisticForecast(doc, today);
      const kinds = new Set<string>();
      for (let d = -CURRENT_CYCLE_DAY + 1; d <= 7; d++) {
        const s = dayStatus(addDays(today, d), {
          data: doc,
          forecast: p,
          options: DEFAULT_CYCLE_OPTIONS,
          showFertileWindow: true,
        });
        kinds.add(`${s.kind}${s.observed ? ":observed" : ""}`);
      }
      expect(kinds).toContain("period:observed");
      expect(kinds).toContain("fertile");
      expect(kinds).toContain("predictedPeriod");
    }
  }, 60_000);
});

describe("createDemoBackend", () => {
  it("seeds in memory and round-trips edits without touching disk", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const backend = createDemoBackend();
      expect(backend.id).toBe("demo");
      const first = backend.load();
      expect(first).toEqual(buildDemoData(NOW));
      // Loading again returns the same (cached) document, so the demo does
      // not rebuild under a session that runs past midnight.
      expect(backend.load()).toBe(first);
      const edited = { ...first, entries: {} };
      backend.save(edited);
      expect(backend.load()).toBe(edited);
      // A second backend is a fresh, unedited sample.
      expect(Object.keys(createDemoBackend().load().entries).length).toBe(
        DEMO_DAYS,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("VITE_SEED=demo", () => {
  it("boots the demo backend before the app mounts, and only then", async () => {
    vi.resetModules();
    const plain = await import("../src/app/dev/useDemoData.ts");
    expect(plain.DEMO).toBe(false);
    expect(plain.demoBackendModule()).toBeNull();

    vi.stubEnv("VITE_SEED", "demo");
    vi.resetModules();
    try {
      const seeded = await import("../src/app/dev/useDemoData.ts");
      expect(seeded.DEMO).toBe(true);
      await seeded.bootDemo();
      expect(seeded.demoBackendModule()).not.toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
