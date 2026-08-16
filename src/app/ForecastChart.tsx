// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useMemo, useState } from "react";

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";
import {
  areaPath,
  bandScale,
  barPath,
  linePath,
  linearScale,
  type PathPoint,
} from "@niclaslindstedt/oss-framework/charts";
import { useMeasuredSize } from "@niclaslindstedt/oss-framework/hooks";

import { formatDay, formatShortDay, probabilityPercent } from "./format.ts";
import type { ForecastDay, ProbabilisticForecast } from "./forecastModel.ts";
import { useT } from "./i18n/index.ts";

// The picture of the forecast: how likely each day is to be the one the next
// period starts, with the credible bands drawn behind it.
//
// The design follows from what the data *is*. The model's answer is a discrete
// probability per calendar day, so the honest marks are one column per day
// (`bars`) or the density they trace (`curve`) — never a smooth line implying
// resolution the model does not have between days.
//
// The bands are the other half. A forecast without them is a date pretending
// to be a fact; with them, the same chart says "the 9th, and here is how much
// of a guess that is". They are three nested shades of the one accent hue
// rather than three colours, because 50 → 80 → 95% is a *magnitude* — more
// uncertainty, not a different category — and a single hue at rising opacity
// is the encoding that survives any kind of colour blindness, printing, and
// forced-colours mode.
//
// Everything else is deliberately recessive: a hairline baseline, four date
// ticks, muted ink for the annotations, and exactly one direct label (the day
// the screen names). The numbers for every other day live in the tooltip,
// where they cost nothing until asked for.

/** How the distribution is drawn. Columns are the truthful default — the model
 *  really does produce one number per day — and the curve is for readers who
 *  find a shape easier to take in than a comb. */
export type ChartMark = "bars" | "curve";

/** Which question the y-axis answers: "how likely is *this* day?" or "how
 *  likely is it to have started *by* this day?". The second is the same
 *  distribution's cumulative form, and it is the one that answers "will I be
 *  clear by Friday?" without any mental arithmetic. */
export type ChartView = "daily" | "cumulative";

export type ChartLook = {
  mark: ChartMark;
  view: ChartView;
  /** Draw the 50 / 80 / 95% credible bands behind the marks. */
  showBands: boolean;
  /** Overlay the cycle-history-only curve, so the effect of the symptom
   *  evidence and the ruled-out days is visible rather than asserted. */
  showPrior: boolean;
};

export const DEFAULT_CHART_LOOK: ChartLook = {
  mark: "bars",
  view: "daily",
  showBands: true,
  showPrior: false,
};

type Props = {
  forecast: ProbabilisticForecast;
  today: DayKey;
  look: ChartLook;
  height?: number;
};

const PAD = { top: 22, right: 8, bottom: 26, left: 8 };
const DEFAULT_HEIGHT = 190;
/** Fallback width for the first paint, before the container has been measured.
 *  Roughly a phone's content width, so the first frame is never wildly wrong. */
const FALLBACK_WIDTH = 340;

/** Days below this share of the probability are dropped from the drawn window
 *  unless a band covers them — a 0.2% tail adds a centimetre of flat chart. */
const VISIBLE_THRESHOLD = 0.004;

/** Opacity of each credible band, widest first. They are painted over one
 *  another, so the shades compound into a light → dark ramp: the 50% region
 *  carries all three coats, the 95% tails only one. */
const BAND_OPACITY: Record<number, number> = {
  0.95: 0.09,
  0.8: 0.12,
  0.5: 0.17,
};

/**
 * What a band's swatch should look like in the legend.
 *
 * Not its own opacity — its *compounded* one, because that is what is on the
 * chart. A 50% swatch painted at 0.17 next to a region painted at 0.34 is a
 * legend that quietly disagrees with the picture. The whole set is then scaled
 * up by a constant, since 0.09 of an accent in a 16-pixel swatch is invisible;
 * the ratios, which are what carry the ordering, survive the scaling.
 */
const LEGEND_BOOST = 2.4;

function legendOpacity(mass: number): number {
  // Every band at least as wide as this one is painted underneath it.
  const coats = Object.entries(BAND_OPACITY)
    .filter(([m]) => Number(m) >= mass)
    .map(([, opacity]) => opacity);
  const compounded = 1 - coats.reduce((rest, o) => rest * (1 - o), 1);
  return Math.min(1, compounded * LEGEND_BOOST);
}

export function ForecastChart({
  forecast,
  today,
  look,
  height = DEFAULT_HEIGHT,
}: Props) {
  const t = useT();
  const { ref, size } = useMeasuredSize<HTMLDivElement>();
  const width = Math.max(240, Math.round(size?.width ?? FALLBACK_WIDTH));

  // The day under the pointer (or the keyboard cursor), as an index into the
  // drawn window. Null when nothing is being pointed at.
  const [cursor, setCursor] = useState<number | null>(null);

  const visible = useMemo(() => visibleDays(forecast), [forecast]);

  const plot = {
    left: PAD.left,
    top: PAD.top,
    width: Math.max(1, width - PAD.left - PAD.right),
    height: Math.max(1, height - PAD.top - PAD.bottom),
  };
  const baseline = plot.top + plot.height;

  const bands = bandScale(visible.length, [plot.left, plot.left + plot.width], {
    paddingInner: look.mark === "bars" ? 0.28 : 0,
  });
  const step = visible.length > 0 ? plot.width / visible.length : plot.width;

  const valueOf = useCallback(
    (day: ForecastDay) =>
      look.view === "cumulative" ? day.cumulative : day.probability,
    [look.view],
  );
  const priorValueOf = useCallback(
    (day: ForecastDay, index: number) =>
      look.view === "cumulative"
        ? visible
            .slice(0, index + 1)
            .reduce((sum, d) => sum + d.priorProbability, 0)
        : day.priorProbability,
    [look.view, visible],
  );

  const peak = Math.max(
    ...visible.map((d, i) =>
      Math.max(valueOf(d), look.showPrior ? priorValueOf(d, i) : 0),
    ),
    Number.MIN_VALUE,
  );
  const y = linearScale(
    [0, look.view === "cumulative" ? 1 : peak * 1.18],
    [baseline, plot.top],
  );

  // Band centres, used by both the curve and every annotation.
  const centreOf = (i: number) => bands.position(i) + bands.bandwidth / 2;
  const indexOf = (day: DayKey) => visible.findIndex((d) => d.day === day);

  const todayIndex = indexOf(today);
  const expectedIndex = indexOf(forecast.expectedDay);
  const active = cursor !== null ? visible[cursor] : undefined;

  const points: PathPoint[] = visible.map((d, i) => [
    centreOf(i),
    y(valueOf(d)),
  ]);
  const priorPoints: PathPoint[] = visible.map((d, i) => [
    centreOf(i),
    y(priorValueOf(d, i)),
  ]);

  const describe = t("forecast.chart.description", {
    from: formatShortDay(visible[0]?.day ?? forecast.expectedDay),
    to: formatShortDay(
      visible[visible.length - 1]?.day ?? forecast.expectedDay,
    ),
    day: formatDay(forecast.expectedDay),
  });

  /** Map a pointer x (in client pixels) onto a day index. */
  const trackPointer = (e: {
    currentTarget: SVGRectElement;
    clientX: number;
  }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = box.width > 0 ? width / box.width : 1;
    const local = (e.clientX - box.left) * scale - plot.left;
    const index = Math.floor(local / step);
    setCursor(Math.min(visible.length - 1, Math.max(0, index)));
  };

  return (
    <div ref={ref as React.Ref<HTMLDivElement>}>
      {/* The readout sits *above* the plot rather than floating over it. A
          card following the pointer would cover the peak — the one part of the
          chart worth looking at — and on a touch screen it would sit under the
          finger that summoned it. Pinned here it never occludes, never needs
          edge-clamping, and the row is never wasted: with nothing under the
          pointer it reads out the day the forecast names. */}
      <Readout
        day={active ?? visible[expectedIndex] ?? visible[0]!}
        hovering={active !== undefined}
        showPrior={look.showPrior}
        priorValue={priorValueOf(
          active ?? visible[expectedIndex] ?? visible[0]!,
          active ? cursor! : Math.max(0, expectedIndex),
        )}
      />
      <div
        tabIndex={0}
        role="group"
        aria-label={t("forecast.chart.keyboardHint")}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const delta = e.key === "ArrowRight" ? 1 : -1;
          setCursor((prev) => {
            const next = (prev ?? expectedIndex) + delta;
            return Math.min(visible.length - 1, Math.max(0, next));
          });
        }}
        onBlur={() => setCursor(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("forecast.chart.title")}
          className="block touch-pan-y select-none"
        >
          <desc>{describe}</desc>

          {look.showBands &&
            forecast.intervals.map((interval) => {
              const from = indexOf(interval.start);
              const to = indexOf(interval.end);
              if (from < 0 || to < 0) return null;
              const x0 = bands.position(from);
              const x1 = bands.position(to) + bands.bandwidth;
              return (
                <rect
                  key={interval.mass}
                  className="forecast-band"
                  x={x0}
                  y={plot.top}
                  width={Math.max(1, x1 - x0)}
                  height={plot.height}
                  rx={3}
                  fill="var(--color-accent)"
                  opacity={BAND_OPACITY[interval.mass] ?? 0.1}
                  style={{ animationDelay: `${(1 - interval.mass) * 260}ms` }}
                />
              );
            })}

          {/* The 50% reference on the cumulative view: where "more likely than
              not, it has started" crosses. */}
          {look.view === "cumulative" && (
            <line
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={y(0.5)}
              y2={y(0.5)}
              stroke="var(--color-line)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}

          {/* Cycle history alone, before the symptom evidence and the
              ruled-out days moved it. Dashed as well as muted, so it is not
              telling its story with colour only. */}
          {look.showPrior && (
            <path
              className="forecast-marker"
              d={linePath(priorPoints, { curve: "monotone" })}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
              opacity={0.85}
              style={{ animationDelay: "260ms" }}
            />
          )}

          {look.mark === "bars"
            ? visible.map((day, i) => {
                const top = y(valueOf(day));
                const barHeight = Math.max(0, baseline - top);
                if (barHeight <= 0) return null;
                return (
                  <path
                    key={day.day}
                    className="forecast-bar"
                    d={barPath(
                      bands.position(i),
                      top,
                      bands.bandwidth,
                      barHeight,
                      4,
                      "top",
                    )}
                    fill="var(--color-accent)"
                    opacity={cursor === null || cursor === i ? 0.9 : 0.45}
                    style={{
                      animationDelay: `${i * 14}ms`,
                      transition: "opacity 120ms ease-out",
                    }}
                  />
                );
              })
            : [
                <path
                  key="area"
                  className="forecast-area"
                  d={areaPath(points, baseline, { curve: "monotone" })}
                  fill="var(--color-accent)"
                  opacity={0.22}
                />,
                <path
                  key="line"
                  className="forecast-area"
                  d={linePath(points, { curve: "monotone" })}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />,
              ]}

          {/* Days already logged without bleeding: they carry no probability,
              so without a mark of their own they would read as "no data". */}
          {visible.map((day, i) =>
            day.excluded ? (
              <line
                key={`x-${day.day}`}
                className="forecast-marker"
                x1={bands.position(i)}
                x2={bands.position(i) + bands.bandwidth}
                y1={baseline}
                y2={baseline}
                stroke="var(--color-muted)"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.6}
                style={{ animationDelay: "300ms" }}
              />
            ) : null,
          )}

          <line
            x1={plot.left}
            x2={plot.left + plot.width}
            y1={baseline}
            y2={baseline}
            stroke="var(--color-line)"
            strokeWidth={1}
          />

          {todayIndex >= 0 && (
            <g className="forecast-marker" style={{ animationDelay: "340ms" }}>
              <line
                x1={centreOf(todayIndex)}
                x2={centreOf(todayIndex)}
                y1={plot.top - 6}
                y2={baseline}
                stroke="var(--color-muted)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={centreOf(todayIndex)}
                y={plot.top - 10}
                textAnchor="middle"
                className="fill-muted text-[10px]"
              >
                {t("common.today")}
              </text>
            </g>
          )}

          {/* The one direct label: the day the copy above the chart names.
              Labelling every column would bury it. */}
          {expectedIndex >= 0 && (
            <g className="forecast-marker" style={{ animationDelay: "380ms" }}>
              <circle
                cx={centreOf(expectedIndex)}
                cy={y(valueOf(visible[expectedIndex]!))}
                r={4.5}
                fill="var(--color-accent)"
                stroke="var(--color-page-bg)"
                strokeWidth={2}
              />
              <text
                x={centreOf(expectedIndex)}
                y={Math.max(11, y(valueOf(visible[expectedIndex]!)) - 9)}
                textAnchor="middle"
                className="fill-fg-bright text-[10px] font-bold"
              >
                {formatShortDay(forecast.expectedDay)}
              </text>
            </g>
          )}

          {tickIndices(visible.length).map((i) => (
            <text
              key={`tick-${i}`}
              x={centreOf(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted text-[10px]"
            >
              {formatShortDay(visible[i]!.day)}
            </text>
          ))}

          {cursor !== null && visible[cursor] && (
            <line
              className="forecast-cursor"
              x1={centreOf(cursor)}
              x2={centreOf(cursor)}
              y1={plot.top - 6}
              y2={baseline}
              stroke="var(--color-fg-bright)"
              strokeWidth={1}
              opacity={0.55}
            />
          )}

          {/* One transparent hit area over the whole plot: a 20px-wide day
              column is far too small a target for a fingertip. */}
          <rect
            x={plot.left}
            y={plot.top - 8}
            width={plot.width}
            height={plot.height + 8}
            fill="transparent"
            onPointerMove={trackPointer}
            onPointerDown={trackPointer}
            onPointerLeave={() => setCursor(null)}
          />
        </svg>
      </div>

      <Legend look={look} hasExcluded={visible.some((d) => d.excluded)} />
    </div>
  );
}

/** The days worth drawing: everything carrying real probability, plus every
 *  day the 95% band covers so the widest band is never clipped. */
function visibleDays(forecast: ProbabilisticForecast): ForecastDay[] {
  const widest = forecast.intervals.reduce(
    (a, b) => (a.mass >= b.mass ? a : b),
    forecast.intervals[0]!,
  );
  const kept = forecast.days.filter(
    (d) =>
      d.probability >= VISIBLE_THRESHOLD ||
      d.priorProbability >= VISIBLE_THRESHOLD ||
      (d.day >= widest.start && d.day <= widest.end),
  );
  // A degenerate history could leave nothing above the threshold; drawing the
  // whole distribution is a better failure than drawing an empty box.
  return kept.length > 0 ? kept : [...forecast.days];
}

/** Four evenly spaced tick positions, or every day when there are few. */
function tickIndices(count: number): number[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  const wanted = 4;
  const stride = (count - 1) / (wanted - 1);
  return Array.from({ length: wanted }, (_, i) => Math.round(i * stride));
}

/**
 * The row above the plot: what is known about one day.
 *
 * Two fixed lines, so the chart below never shifts as the pointer moves. It is
 * a live region, which is what makes the keyboard cursor useful to a screen
 * reader — arrowing across the days reads each one out.
 */
function Readout({
  day,
  hovering,
  showPrior,
  priorValue,
}: {
  day: ForecastDay;
  hovering: boolean;
  showPrior: boolean;
  priorValue: number;
}) {
  const t = useT();
  // The cumulative reading walks all the way to the far end of the window,
  // which is exactly where a rounded percentage would print "100%" for a day
  // the model only thinks is very likely — see `probabilityPercent`. This
  // readout used to carry a decimal below ten percent; it doesn't now, for the
  // same reason nothing else does. A day whose share rounds to nothing is a
  // day the chart is already drawing as a bar you can barely see.
  const percent = probabilityPercent;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-1 flex min-h-9 flex-wrap items-baseline gap-x-2 gap-y-0.5"
    >
      <span
        className={`text-sm font-bold ${
          hovering ? "text-fg-bright" : "text-accent"
        }`}
      >
        {formatShortDay(day.day)}
      </span>
      {day.excluded ? (
        <span className="text-xs text-muted">
          {t("forecast.chart.ruledOut")}
        </span>
      ) : (
        <>
          <span className="text-xs text-fg">
            {t("forecast.chart.startsOn", {
              percent: percent(day.probability),
            })}
          </span>
          <span className="text-xs text-muted">
            {t("forecast.chart.startedBy", {
              percent: percent(day.cumulative),
            })}
          </span>
        </>
      )}
      {showPrior && !day.excluded && (
        <span className="text-xs text-muted">
          {t("forecast.chart.priorAt", { percent: percent(priorValue) })}
        </span>
      )}
    </div>
  );
}

/** Identity is never carried by colour alone: each band's share is spelled
 *  out, and the history-only line is named as well as dashed. */
function Legend({
  look,
  hasExcluded,
}: {
  look: ChartLook;
  hasExcluded: boolean;
}) {
  const t = useT();
  return (
    <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      {look.showBands &&
        [0.5, 0.8, 0.95].map((mass) => (
          <li key={mass} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-4 rounded-xs border border-line"
              style={{
                backgroundColor: "var(--color-accent)",
                opacity: legendOpacity(mass),
              }}
            />
            {t("forecast.chart.bandLabel", { percent: String(mass * 100) })}
          </li>
        ))}
      {look.showPrior && (
        <li className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-muted" />
          {t("forecast.chart.historyOnly")}
        </li>
      )}
      {hasExcluded && (
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-muted/70" />
          {t("forecast.chart.ruledOutLegend")}
        </li>
      )}
    </ul>
  );
}
