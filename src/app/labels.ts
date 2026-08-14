// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Domain value → translated label, in one place. Every screen that shows a
// bleeding level, a mood, a swing level, or a cycle phase reads it from here,
// so a wording change lands everywhere at once and the catalog keys stay
// mechanically derivable from the union types.

import type { CyclePhase } from "./cycle.ts";
import type { TFn } from "./i18n/index.ts";
import type { BleedingLevel, MoodId, MoodSwing } from "./types.ts";

export function bleedingLabel(t: TFn, level: BleedingLevel): string {
  return t(`bleeding.${level}` as const);
}

export function moodLabel(t: TFn, mood: MoodId): string {
  return t(`mood.${mood}` as const);
}

export function swingLabel(t: TFn, swing: MoodSwing): string {
  return t(`swing.level${swing}` as const);
}

export function phaseLabel(t: TFn, phase: CyclePhase): string {
  return t(`history.phase.${phase}` as const);
}
