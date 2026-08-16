// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { BarChart } from "@niclaslindstedt/oss-framework/charts";

import type { BinaryProfile, TemperatureProfile } from "./forecastModel.ts";
import { useT } from "./i18n/index.ts";
import type { TemperatureUnit } from "./temperature.ts";

// The patterns the multivariate model learned, drawn.
//
// These are the "show your working" charts. The forecast claims that mood
// swings, lust, sex, fertility tests and waking temperature say something about
// when a period is coming; these are the evidence for that claim, read straight
// out of the reader's own reports. A flat chart means the model is not using
// that channel, which is exactly what the panel around it says in words — and a
// reader who can see the flatness does not have to take that on trust.
//
// They all run right to left: the x axis counts *down* to the period, so the
// day it starts is at the right-hand end, where a reader's eye already expects
// "now". The framework's `BarChart` handles the marks, the axis and the
// tooltips, so these are only about orientation, labelling and units.

/**
 * How often a yes/no channel came back yes at each lag before an onset.
 *
 * One component for every binary channel, because they are the same chart of a
 * different answer — and because a reader who has read the mood one has already
 * learned how to read the rest. The title and description are passed in rather
 * than switched on inside, so the chart never has to know which channel it is
 * drawing.
 */
export function BinaryProfileChart({
  profile,
  title,
  desc,
}: {
  profile: BinaryProfile;
  title: string;
  desc: string;
}) {
  const t = useT();
  // Reversed so the longest lag is leftmost and the onset day is at the right.
  const values = [...profile.rate].reverse().map((r) => r * 100);
  const labels = Array.from({ length: profile.window }, (_, i) =>
    String(profile.window - 1 - i),
  );

  return (
    <>
      <BarChart
        series={[{ values }]}
        labels={labels}
        height={130}
        ariaLabel={title}
        desc={desc}
        formatValue={(v) => `${Math.round(v)}%`}
      />
      <p className="text-[11px] text-muted">
        {t("forecast.binaryProfile.axisLag")}
      </p>
    </>
  );
}

/**
 * How far the waking temperature sat above the follicular baseline at each lag.
 *
 * Plotted as a rise above the baseline, not as an absolute reading, for two
 * reasons. Against an axis running from 36 to 37 the whole biphasic shift is a
 * third of a degree and the chart is a flat line. And zero on this axis means
 * something precise — "no different from the rest of the cycle" — so the height
 * of a bar *is* the claim the panel makes underneath it, rather than a number
 * the reader has to subtract two labels to recover.
 */
export function TemperatureProfileChart({
  profile,
  unit,
}: {
  profile: TemperatureProfile;
  unit: TemperatureUnit;
}) {
  const t = useT();
  // A *difference* converts by the ratio alone — never through the +32 offset.
  const scale = unit === "f" ? 9 / 5 : 1;
  const values = [...profile.mean]
    .reverse()
    .map((m) => (m - profile.baselineMean) * scale);
  const labels = Array.from({ length: profile.window }, (_, i) =>
    String(profile.window - 1 - i),
  );

  return (
    <>
      <BarChart
        series={[{ values }]}
        labels={labels}
        height={130}
        ariaLabel={t("forecast.temperatureProfile.title")}
        desc={t("forecast.temperatureProfile.chartDesc")}
        formatValue={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}°`}
      />
      <p className="text-[11px] text-muted">
        {t("forecast.temperatureProfile.axis")}
      </p>
    </>
  );
}
