// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two settings a fresh install takes from the device rather than from this
// app: the day a week starts on, and the unit a waking temperature is read in.
// Someone in the United States expects a Sunday-first calendar and a
// thermometer in °F; someone in Sweden expects Monday and °C. Both are
// settings, so this only decides where a new install *starts* — the stored
// choice of anyone who has opened the app before always wins (see
// `useAppSettings.ts`, where a stored value is read over these).
//
// Pure: the device's preferred languages are a parameter, so the tests pin
// real tags without a mocked `navigator`.

import type { WeekStart } from "@niclaslindstedt/oss-framework/calendar";

import type { TemperatureUnit } from "./temperature.ts";

export type RegionalDefaults = {
  weekStartsOn: WeekStart;
  temperatureUnit: TemperatureUnit;
};

/** Where nothing on the device names a region: the app's long-standing
 *  defaults, Monday and °C. */
export const FALLBACK_REGIONAL: RegionalDefaults = {
  weekStartsOn: 1,
  temperatureUnit: "c",
};

/** The places a thermometer reads in Fahrenheit: the United States and its
 *  territories, and the handful of countries that kept the scale. */
const FAHRENHEIT_REGIONS = new Set([
  "US",
  "AS",
  "GU",
  "MP",
  "PR",
  "UM",
  "VI",
  "BS",
  "BZ",
  "KY",
  "LR",
  "PW",
  "FM",
  "MH",
]);

/**
 * Regions whose calendars start the week on Sunday: the United States and its
 * territories, and the larger Sunday-first markets beside it. Everywhere else
 * starts on Monday, which is what the app has always done.
 *
 * A table rather than `Intl.Locale#getWeekInfo`, on purpose: that is missing
 * from older WebKit, and where it exists its CLDR data moves between releases
 * (it currently puts Iceland on Sunday, which no Icelandic calendar does). A
 * default that changes under someone with an OS update is worse than a short
 * list that says exactly what it covers.
 */
const SUNDAY_REGIONS = new Set([
  "US",
  "AS",
  "GU",
  "MP",
  "PR",
  "UM",
  "VI",
  "CA",
  "MX",
  "BR",
  "JP",
  "KR",
  "TW",
  "HK",
  "IL",
  "PH",
  "IN",
  "ZA",
]);

/** The region subtag of a BCP 47 tag ("en-US" → "US", "zh-Hant-TW" → "TW"),
 *  or null when the tag names only a language. */
export function regionOf(tag: string): string | null {
  const parts = tag.trim().replace(/_/g, "-").split("-").slice(1);
  const region = parts.find((p) => /^[A-Za-z]{2}$/.test(p));
  return region ? region.toUpperCase() : null;
}

/**
 * The week start and temperature unit a device's preferred languages ask for,
 * most-preferred first (`navigator.languages`).
 *
 * The first tag that names a region decides both, because the region is what
 * carries the convention — "en-US" and "es-US" both want Sunday and °F, while
 * "en-SE" (an English phone in Sweden) wants Monday and °C. A tag with no
 * region ("en") says nothing about either and is passed over rather than read
 * as American, and a device that names no region at all keeps the fallback.
 */
export function regionalDefaults(tags: readonly string[]): RegionalDefaults {
  for (const tag of tags) {
    if (typeof tag !== "string" || !tag.trim()) continue;
    const region = regionOf(tag);
    if (!region) continue;
    return {
      weekStartsOn: SUNDAY_REGIONS.has(region) ? 0 : 1,
      temperatureUnit: FAHRENHEIT_REGIONS.has(region) ? "f" : "c",
    };
  }
  return FALLBACK_REGIONAL;
}

/** The device's preferred languages, most-preferred first; empty where there
 *  is no `navigator` (the tests, a build step). */
export function deviceLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}
