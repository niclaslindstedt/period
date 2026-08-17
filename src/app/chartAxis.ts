// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

// Where a chart's gridlines go. Arithmetic over a domain and nothing else —
// no pixels, no components, no clock — which is why it sits here rather than
// inside `HistoryChart.tsx`: the part of an axis that can be wrong quietly is
// the part with the divisions in it, and this way a test can pin it.

/** A chosen scale: the values to rule and label, and how many decimals a label
 *  may print. */
export type Ticks = {
  values: number[];
  decimals: number;
};

/**
 * Gridline values for a domain, at a step a person would have picked.
 *
 * The rounding is the point. An axis stepped by the domain divided by four
 * prints 36.27, 36.51, 36.75 — arithmetically correct and useless to read a
 * height against. The steps considered are 1, 2 and 5 times a power of ten and
 * nothing else, which is what makes the labels land on the numbers a reader
 * would have chosen: 36.5, 37.0, 37.5.
 *
 * The densest of those that fits in `max` lines wins, so a wide domain doesn't
 * get a stripe every twenty pixels and a narrow one still gets more than its
 * ends. `decimals` is the winning step's own precision — a tick never prints a
 * digit finer than the interval it marks. Only ticks inside the domain are
 * returned: a label above the top of the plot is a number the chart does not
 * draw.
 */
export function niceTicks(lo: number, hi: number, max: number): Ticks {
  const span = hi - lo;
  // A degenerate domain (no readings at all, or every reading identical) has
  // no scale worth labelling — better a bare plot than an axis of one number
  // repeated, or a loop looking for a step that divides nothing.
  if (!Number.isFinite(span) || span <= 0) return { values: [], decimals: 0 };

  // From well under the span up to well over it. The last candidates span the
  // whole domain several times over and so cannot yield more than one line,
  // which is what guarantees the search ends.
  const from = Math.floor(Math.log10(span)) - 1;
  for (let exponent = from; exponent <= from + 5; exponent++) {
    for (const mantissa of [1, 2, 5]) {
      const step = mantissa * 10 ** exponent;
      // The epsilons are against floating point, not against the data: a tick
      // landing exactly on an end must not be dropped because the division
      // left it a billionth outside.
      const first = Math.ceil(lo / step - 1e-9);
      const last = Math.floor(hi / step + 1e-9);
      if (last - first + 1 > max) continue;
      const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
      const values: number[] = [];
      for (let i = first; i <= last; i++) {
        // Multiplying an index by a fractional step is where 36.5 becomes
        // 36.500000000000004; the step's own precision is exactly the digits
        // that survive the rounding.
        values.push(Number((i * step).toFixed(decimals)));
      }
      return { values, decimals };
    }
  }
  return { values: [], decimals: 0 };
}
