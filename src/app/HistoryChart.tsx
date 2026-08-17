// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, useState } from "react";

import {
  areaPath,
  bandScale,
  barPath,
  linePath,
  linearScale,
  type PathPoint,
} from "@niclaslindstedt/oss-framework/charts";
import { useMeasuredSize } from "@niclaslindstedt/oss-framework/hooks";

import { useT } from "./i18n/index.ts";

// The History screen's chart, drawn the way the Forecast screen draws its own.
//
// The two screens used to disagree about what a chart is: Forecast hand-builds
// its plot from the framework's primitives — a hairline baseline, four date
// ticks, a pinned readout, one accent hue — while History used the framework's
// finished `LineChart`/`BarChart`, with their own axes, dots and tooltips. Two
// grammars for the same kind of picture, one screen apart. This component is
// the History side of the truce: the same recessive frame, the same rounded
// columns, the same cursor-and-readout interaction, applied to the three
// series History shows.
//
// What it deliberately does not have is a dot per datum. A comb of markers
// along a line only crowds it — the ticks below say where the series runs, and
// the point under the pointer is called out by the cursor rule and spelled out
// in the readout above, exactly as on the Forecast chart. The one exception is
// a reading with a gap on both sides, which would otherwise vanish entirely:
// it gets a short round-capped stroke, a mark for "measured, alone", not a
// decoration on a line that exists anyway.

/** How a series is drawn: one rounded column per point, or the line they
 *  trace. The Forecast chart's two marks, with the same names. */
export type HistoryMark = "bars" | "curve";

type Props = {
  /** One number per point, `null` where nothing was measured. Gaps stay gaps —
   *  joining across a fortnight nobody measured draws a trend nobody
   *  measured. */
  values: (number | null)[];
  /** One label per point, for the ticks and the readout. */
  labels: string[];
  mark: HistoryMark;
  /** Whether y runs from zero. Counts and shares are heights and start at
   *  nothing; an absolute reading like a temperature hugs its own range,
   *  because against an axis from zero a third-of-a-degree step is a flat
   *  line. A non-zero-based curve carries no area fill for the same honesty:
   *  the paper under it would not mean anything. */
  zeroBased?: boolean;
  height?: number;
  ariaLabel: string;
  desc: string;
  /** The readout's rendering of one value, unit and all. */
  formatValue: (value: number) => string;
  /** An optional muted second phrase per point (a sample size, a span). */
  details?: (string | undefined)[];
};

const PAD = { top: 14, right: 8, bottom: 26, left: 8 };
const DEFAULT_HEIGHT = 170;
/** Fallback width for the first paint, before the container has been measured.
 *  Roughly a phone's content width, so the first frame is never wildly wrong. */
const FALLBACK_WIDTH = 340;

export function HistoryChart({
  values,
  labels,
  mark,
  zeroBased = true,
  height = DEFAULT_HEIGHT,
  ariaLabel,
  desc,
  formatValue,
  details,
}: Props) {
  const t = useT();
  const { ref, size } = useMeasuredSize<HTMLDivElement>();
  const width = Math.max(240, Math.round(size?.width ?? FALLBACK_WIDTH));

  // The point under the pointer (or the keyboard cursor). Null when nothing
  // is being pointed at, in which case the readout falls back to the most
  // recent measured point — the one a reader opening the screen is asking
  // about.
  const [cursor, setCursor] = useState<number | null>(null);

  const plot = {
    left: PAD.left,
    top: PAD.top,
    width: Math.max(1, width - PAD.left - PAD.right),
    height: Math.max(1, height - PAD.top - PAD.bottom),
  };
  const baseline = plot.top + plot.height;

  const bands = bandScale(values.length, [plot.left, plot.left + plot.width], {
    paddingInner: mark === "bars" ? 0.28 : 0,
  });
  const step = values.length > 0 ? plot.width / values.length : plot.width;
  const centreOf = (i: number) => bands.position(i) + bands.bandwidth / 2;

  const measured = values.filter((v): v is number => v !== null);
  const max = Math.max(...measured, Number.MIN_VALUE);
  const min = Math.min(...measured, Number.MAX_VALUE);
  // Data-hugging axes keep a margin so the extremes never sit on the frame;
  // a flat series (every value equal) still gets a band to sit inside.
  const margin = Math.max((max - min) * 0.18, Math.abs(max) * 0.02, 0.05);
  const y = linearScale(
    zeroBased ? [0, max * 1.15] : [min - margin, max + margin],
    [baseline, plot.top],
  );

  // Consecutive runs of measured points, so the curve breaks at every gap.
  const segments = useMemo(() => {
    const runs: { index: number; value: number }[][] = [];
    let run: { index: number; value: number }[] = [];
    values.forEach((value, index) => {
      if (value === null) {
        if (run.length > 0) runs.push(run);
        run = [];
      } else {
        run.push({ index, value });
      }
    });
    if (run.length > 0) runs.push(run);
    return runs;
  }, [values]);

  const defaultIndex = (() => {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== null) return i;
    }
    return 0;
  })();
  const activeIndex = cursor ?? defaultIndex;
  const activeValue = values[activeIndex] ?? null;

  /** Map a pointer x (in client pixels) onto a point index. */
  const trackPointer = (e: {
    currentTarget: SVGRectElement;
    clientX: number;
  }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = box.width > 0 ? width / box.width : 1;
    const local = (e.clientX - box.left) * scale - plot.left;
    const index = Math.floor(local / step);
    setCursor(Math.min(values.length - 1, Math.max(0, index)));
  };

  return (
    <div ref={ref as React.Ref<HTMLDivElement>}>
      {/* The readout is pinned above the plot rather than floating over it,
          for the Forecast chart's reasons: a card following the pointer covers
          the shape, and on a touch screen it sits under the finger that
          summoned it. */}
      <div
        role="status"
        aria-live="polite"
        className="mb-1 flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-0.5"
      >
        <span
          className={`text-sm font-bold ${
            cursor !== null ? "text-fg-bright" : "text-accent"
          }`}
        >
          {labels[activeIndex]}
        </span>
        {activeValue === null ? (
          <span className="text-xs text-muted">{t("history.chart.gap")}</span>
        ) : (
          <span className="text-xs text-fg">{formatValue(activeValue)}</span>
        )}
        {details?.[activeIndex] && (
          <span className="text-xs text-muted">{details[activeIndex]}</span>
        )}
      </div>
      {/* `data-swipe-ignore`: dragging sideways across the plot reads a point
          out of it, which is the same motion the shell uses to change tabs —
          so the chart claims its own horizontal axis and the swipe stays off
          it. See `useSwipeNav.ts`. */}
      <div
        tabIndex={0}
        role="group"
        data-swipe-ignore
        aria-label={t("history.chart.keyboardHint")}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const delta = e.key === "ArrowRight" ? 1 : -1;
          setCursor((prev) => {
            const next = (prev ?? defaultIndex) + delta;
            return Math.min(values.length - 1, Math.max(0, next));
          });
        }}
        onBlur={() => setCursor(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="block touch-pan-y select-none"
        >
          <desc>{desc}</desc>

          {mark === "bars"
            ? values.map((value, i) => {
                if (value === null) return null;
                const top = y(value);
                const barHeight = Math.max(0, baseline - top);
                if (barHeight <= 0) return null;
                return (
                  <path
                    key={i}
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
            : segments.map((run) => {
                // A reading with a gap on both sides has no line to sit on: a
                // short round-capped stroke marks it, the same vocabulary the
                // Forecast chart uses for its ruled-out days.
                if (run.length === 1) {
                  const { index, value } = run[0]!;
                  const reach = Math.max(2.5, bands.bandwidth / 2);
                  return (
                    <line
                      key={`lone-${index}`}
                      className="forecast-marker"
                      x1={centreOf(index) - reach}
                      x2={centreOf(index) + reach}
                      y1={y(value)}
                      y2={y(value)}
                      stroke="var(--color-accent)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  );
                }
                const points: PathPoint[] = run.map((p) => [
                  centreOf(p.index),
                  y(p.value),
                ]);
                return [
                  zeroBased && (
                    <path
                      key={`area-${run[0]!.index}`}
                      className="forecast-area"
                      d={areaPath(points, baseline, { curve: "monotone" })}
                      fill="var(--color-accent)"
                      opacity={0.22}
                    />
                  ),
                  <path
                    key={`line-${run[0]!.index}`}
                    className="forecast-area"
                    d={linePath(points, { curve: "monotone" })}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />,
                ];
              })}

          <line
            x1={plot.left}
            x2={plot.left + plot.width}
            y1={baseline}
            y2={baseline}
            stroke="var(--color-line)"
            strokeWidth={1}
          />

          {tickIndices(values.length).map((i) => (
            <text
              key={`tick-${i}`}
              x={centreOf(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted text-[10px]"
            >
              {labels[i]}
            </text>
          ))}

          {cursor !== null && (
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

          {/* One transparent hit area over the whole plot: a day-wide column
              is far too small a target for a fingertip. */}
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
    </div>
  );
}

/** Four evenly spaced tick positions, or every point when there are few —
 *  the Forecast chart's rule, because the two charts share a reader. */
function tickIndices(count: number): number[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  const wanted = 4;
  const stride = (count - 1) / (wanted - 1);
  return Array.from({ length: wanted }, (_, i) => Math.round(i * stride));
}
