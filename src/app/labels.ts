// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Domain value → translated label, in one place. Every screen that shows a
// cycle phase reads it from here, so a wording change lands everywhere at once
// and the catalog keys stay mechanically derivable from the union type.

import type { CyclePhase } from "./cycle.ts";
import type { TFn } from "./i18n/index.ts";

export function phaseLabel(t: TFn, phase: CyclePhase): string {
  return t(`history.phase.${phase}` as const);
}
