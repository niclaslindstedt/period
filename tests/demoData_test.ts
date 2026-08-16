// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { addDays, daysBetween } from "@niclaslindstedt/oss-framework/calendar";

import { cycleStats, forecast } from "../src/app/cycle.ts";
import { createDemoBackend } from "../src/app/dev/demoBackend.ts";
import { DEMO_DAYS, buildDemoData } from "../src/app/dev/demoData.ts";
import { parseDoc, serializeDoc } from "../src/app/migrations.ts";
import { isFever } from "../src/app/temperature.ts";
import { DOC_VERSION, sortedEntries } from "../src/app/types.ts";

// The demo document is not a fixture — it is a claim about what a year of real
// reports looks like, and every screen in the app is judged on it. These tests
// pin the claim: that it is deterministic, that it is anchored to whatever day
// it is built for rather than to dates that will age, and that the patterns it
// is *supposed* to carry (a premenstrual week, a biphasic temperature curve, a
// positive strip before each ovulation, two feverish mornings, and no
// pregnancy) are actually in the numbers.

const TODAY = "2026-08-16";

/** Whether a day is one of the `count` days before `onset`. */
function within(day: string, onset: string, count: number): boolean {
  const lead = daysBetween(day, onset);
  return lead >= 1 && lead <= count;
}

describe("buildDemoData", () => {
  it("returns a fresh, deterministic document each call", () => {
    const a = buildDemoData(TODAY);
    const b = buildDemoData(TODAY);
    // Same content…
    expect(a).toEqual(b);
    // …but not the same object: edits must not mutate a shared template.
    expect(a).not.toBe(b);
    expect(a.entries).not.toBe(b.entries);
  });

  it("is anchored to the day it is built for, not to fixed dates", () => {
    const now = buildDemoData(TODAY);
    // The same document built a year later must be the same document, moved.
    // Fifty-two whole weeks rather than 365 days so the weekdays line up too:
    // the sex channel leans on them on purpose (a weekend is not a hormone),
    // so it is the one field that genuinely moves with the calendar.
    const shift = 52 * 7;
    const later = buildDemoData(addDays(TODAY, shift));
    expect(Object.keys(later.entries).length).toBe(
      Object.keys(now.entries).length,
    );
    for (const entry of sortedEntries(now)) {
      const shifted = later.entries[addDays(entry.date, shift)];
      expect(shifted).toBeDefined();
      expect({ ...shifted!, date: "", updatedAt: "" }).toEqual({
        ...entry,
        date: "",
        updatedAt: "",
      });
    }
  });

  it("logs every day of the past year and nothing from today on", () => {
    const doc = buildDemoData(TODAY);
    const entries = sortedEntries(doc);
    expect(doc.version).toBe(DOC_VERSION);
    expect(entries.length).toBe(DEMO_DAYS);
    expect(entries[0]!.date).toBe(addDays(TODAY, -DEMO_DAYS));
    // Today is deliberately unlogged — the Report screen opens on it.
    expect(entries[entries.length - 1]!.date).toBe(addDays(TODAY, -1));
    expect(doc.entries[TODAY]).toBeUndefined();
    // Every report was filed on its own day, in the past.
    for (const entry of entries) {
      expect(entry.updatedAt.slice(0, 10)).toBe(entry.date);
    }
  });

  it("survives the document pipeline unchanged", () => {
    // The demo skips `parseDoc` in the app (the backend hands back an object,
    // not bytes), so this is the check that it is nonetheless a document this
    // build would accept from a backup or a cloud copy.
    const doc = buildDemoData(TODAY);
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });

  it("derives a full year of ordinary cycles", () => {
    const stats = cycleStats(buildDemoData(TODAY));
    // Twelve periods in the window, so eleven observed cycle lengths.
    expect(stats.periods.length).toBe(12);
    expect(stats.cycleLengths.length).toBe(11);
    for (const length of stats.cycleLengths) {
      expect(length).toBeGreaterThanOrEqual(26);
      expect(length).toBeLessThanOrEqual(32);
    }
    expect(stats.medianCycle).toBe(29);
    expect(stats.averagePeriodLength).toBeGreaterThanOrEqual(4);
    expect(stats.averagePeriodLength).toBeLessThanOrEqual(6);
    // A year of history is what "high" is for.
    expect(stats.confidence).toBe("high");
  });

  it("she is not pregnant — no cycle runs long", () => {
    const stats = cycleStats(buildDemoData(TODAY));
    const starts = stats.periods.map((p) => p.start);
    for (let i = 1; i < starts.length; i++) {
      expect(daysBetween(starts[i - 1]!, starts[i]!)).toBeLessThanOrEqual(32);
    }
    // And the current cycle is still running normally, not overdue by months.
    const f = forecast(buildDemoData(TODAY), TODAY);
    expect(f.cycleDay).toBe(27);
    expect(f.daysUntilNext).toBe(3);
  });

  it("turns her mood in the week before a period", () => {
    const doc = buildDemoData(TODAY);
    const starts = cycleStats(doc).periods.map((p) => p.start);
    let premenstrual = { swings: 0, days: 0 };
    let rest = { swings: 0, days: 0 };
    for (const entry of sortedEntries(doc)) {
      const near = starts.some((start) => within(entry.date, start, 7));
      const bucket = near ? premenstrual : rest;
      bucket.days += 1;
      if (entry.moodSwings) bucket.swings += 1;
    }
    expect(premenstrual.days).toBeGreaterThan(70);
    const premenstrualShare = premenstrual.swings / premenstrual.days;
    const restShare = rest.swings / rest.days;
    // Most of the premenstrual week, and hardly ever otherwise.
    expect(premenstrualShare).toBeGreaterThan(0.5);
    expect(restShare).toBeLessThan(0.15);
  });

  it("takes a temperature on about nine mornings in ten, for six months", () => {
    const entries = sortedEntries(buildDemoData(TODAY));
    const recent = entries.filter(
      (e) =>
        daysBetween(e.date, TODAY) <= 183 && daysBetween(e.date, TODAY) > 0,
    );
    const older = entries.filter((e) => daysBetween(e.date, TODAY) > 183);
    // Nothing before she started trying…
    expect(older.every((e) => e.temperature === null)).toBe(true);
    expect(older.length).toBeGreaterThan(150);
    // …and most mornings since, but not all of them.
    const taken = recent.filter((e) => e.temperature !== null);
    const coverage = taken.length / recent.length;
    expect(coverage).toBeGreaterThan(0.85);
    expect(coverage).toBeLessThan(0.95);
  });

  it("draws a biphasic temperature curve", () => {
    const doc = buildDemoData(TODAY);
    const starts = cycleStats(doc).periods.map((p) => p.start);
    const luteal: number[] = [];
    const follicular: number[] = [];
    for (const entry of sortedEntries(doc)) {
      if (entry.temperature === null || isFever(entry.temperature)) continue;
      // The luteal phase is the fortnight before an onset; the follicular one
      // is what is left, minus the days either side of ovulation.
      if (starts.some((start) => within(entry.date, start, 12))) {
        luteal.push(entry.temperature);
      } else if (starts.some((start) => within(entry.date, start, 20))) {
        continue;
      } else {
        follicular.push(entry.temperature);
      }
    }
    expect(luteal.length).toBeGreaterThan(40);
    expect(follicular.length).toBeGreaterThan(40);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const shift = mean(luteal) - mean(follicular);
    // The post-ovulatory step is about a third of a degree — the signal the
    // whole temperature channel exists to read.
    expect(shift).toBeGreaterThan(0.2);
    expect(shift).toBeLessThan(0.45);
    // Every reading is a plausible waking temperature to two decimals.
    for (const value of [...luteal, ...follicular]) {
      expect(value).toBeGreaterThan(35.8);
      expect(value).toBeLessThan(37.5);
      expect(Math.round(value * 100)).toBeCloseTo(value * 100, 6);
    }
  });

  it("records exactly two feverish mornings, on consecutive days", () => {
    const entries = sortedEntries(buildDemoData(TODAY));
    const fever = entries.filter(
      (e) => e.temperature !== null && isFever(e.temperature),
    );
    expect(fever.length).toBe(2);
    expect(daysBetween(fever[0]!.date, fever[1]!.date)).toBe(1);
    // The first morning is the slider's fever stop, the second a real reading
    // on the way back down.
    expect(fever[0]!.temperature).toBe(38);
    expect(fever[1]!.temperature).toBeLessThan(38);
    expect(fever[1]!.temperature).toBeGreaterThan(37.5);
  });

  it("catches the LH surge once per cycle she tested in", () => {
    const doc = buildDemoData(TODAY);
    const entries = sortedEntries(doc);
    const starts = cycleStats(doc).periods.map((p) => p.start);
    const tested = entries.filter((e) => e.fertilityTest !== null);
    // Strips belong to the trying-to-conceive months only.
    for (const entry of tested) {
      expect(daysBetween(entry.date, TODAY)).toBeLessThanOrEqual(183);
    }
    const positives = entries.filter((e) => e.fertilityTest === "positive");
    // Six months of cycles, one cycle's worth of strips missing.
    expect(positives.length).toBeGreaterThanOrEqual(4);
    expect(positives.length).toBeLessThanOrEqual(6);
    // Never two positives in one cycle.
    const days = positives.map((e) => e.date);
    for (let i = 1; i < days.length; i++) {
      expect(daysBetween(days[i - 1]!, days[i]!)).toBeGreaterThan(20);
    }
    // A surge sits a luteal phase (plus the day to ovulation) before the next
    // period — the completed cycles can be checked against a real onset.
    for (const entry of positives) {
      const onset = starts.find((start) => start > entry.date);
      if (!onset) continue;
      const lead = daysBetween(entry.date, onset);
      expect(lead).toBeGreaterThanOrEqual(14);
      expect(lead).toBeLessThanOrEqual(16);
    }
    // Most tests are negative — that is what testing daily until the surge
    // looks like, and "no test" and "a negative test" stay different claims.
    expect(tested.length).toBeGreaterThan(positives.length * 3);
  });

  it("answers the two ovulatory questions around ovulation", () => {
    const doc = buildDemoData(TODAY);
    const starts = cycleStats(doc).periods.map((p) => p.start);
    let fertile = { lust: 0, days: 0 };
    let rest = { lust: 0, days: 0 };
    for (const entry of sortedEntries(doc)) {
      // Ovulation is a fortnight before an onset; the fertile days are the
      // handful before it.
      const near = starts.some((start) => {
        const lead = daysBetween(entry.date, start);
        return lead >= 13 && lead <= 18;
      });
      const bucket = near ? fertile : rest;
      bucket.days += 1;
      if (entry.lust) bucket.lust += 1;
    }
    expect(fertile.lust / fertile.days).toBeGreaterThan(
      2 * (rest.lust / rest.days),
    );
  });
});

describe("createDemoBackend", () => {
  it("seeds in memory and round-trips edits without touching disk", () => {
    const backend = createDemoBackend();
    expect(backend.id).toBe("demo");

    const first = backend.load();
    expect(Object.keys(first.entries).length).toBe(DEMO_DAYS);
    // Loading again returns the same (now cached) document, so the demo does
    // not rebuild under a session that runs past midnight.
    expect(backend.load()).toBe(first);

    // Saving replaces the in-memory copy; the next load reflects the edit.
    const edited = { ...first, entries: {} };
    backend.save(edited);
    expect(backend.load()).toBe(edited);

    // A second backend is a fresh, unedited sample.
    expect(Object.keys(createDemoBackend().load().entries).length).toBe(
      DEMO_DAYS,
    );
  });
});
