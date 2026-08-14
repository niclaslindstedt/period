// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { BarChart } from "@niclaslindstedt/oss-framework/charts";

import type { SymptomProfile, TemperatureProfile } from "./forecastModel.ts";
import { useT } from "./i18n/index.ts";
import type { TemperatureUnit } from "./temperature.ts";

// The two patterns the multivariate model learned, drawn.
//
// These are the "show your working" charts. The forecast claims that mood
// swings and waking temperature say something about when a period is coming;
// these are the evidence for that claim, read straight out of the reader's own
// reports. A flat pair of charts means the model is not using them, which is
// exactly what the panel around them says in words — and a reader who can see
// the flatness does not have to take that on trust.
//
// Both run right to left: the x axis counts *down* to the period, so the day it
// starts is at the right-hand end, where a reader's eye already expects "now".
// The framework's `BarChart` handles the marks, the axis and the tooltips, so
// these are only about orientation, labelling and units.

/** How often mood swings were reported at each lag before an onset. */
export function MoodProfileChart({ profile }: { profile: SymptomProfile }) {
  const t = useT();
  // Reversed so lag 13 is leftmost and the onset day is at the right.
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
        ariaLabel={t("forecast.moodProfile.title")}
        desc={t("forecast.moodProfile.chartDesc")}
        formatValue={(v) => `${Math.round(v)}%`}
      />
      <p className="text-[11px] text-muted">
        {t("forecast.moodProfile.axisLag")}
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
