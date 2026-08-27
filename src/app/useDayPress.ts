// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, type RefObject } from "react";

import type { DayKey } from "@niclaslindstedt/oss-framework/calendar";

// Press and hold a day in the month grid to start selecting a span of them.
//
// The grid is the framework's (`MonthGrid`), and it offers exactly one gesture:
// a day was activated. That is the right seam for it to expose — a calendar
// grid has no business knowing what a long press means in one app — so the
// hold is added here, from the outside, by listening on the element the grid is
// mounted in.
//
// **How a day is found.** The cell is a button the framework renders and this
// app cannot put a handler on, so the day key is carried into it by the one
// thing the app *does* render inside the cell: `renderDay` (see
// `CalendarScreen.tsx`) drops a hidden `data-day` marker beside the day's
// coloured mark, and a press walks up to its cell and reads it back. That is a
// smaller claim on the framework's markup than parsing the cell's accessible
// label, which is a localised date string and would break the first time
// anybody changed the locale.
//
// **Pointer events rather than touch.** Unlike the swipe (see `useSwipeNav.ts`,
// which is deliberately fingers-only), a hold is worth having on a mouse too —
// it is the same gesture, and a desktop user pressing a day for half a second
// means the same thing by it. Keyboards cannot hold anything, which is why the
// hold is never the only way in: the screen also has a button that arms the
// same selection.
//
// **What must not happen.** A hold that fires and then also opens the day it
// fired on would undo itself, so the click that follows the release is
// swallowed. And the browser's own long-press behaviours — the text-selection
// callout, the context menu — are cancelled inside the grid: neither offers
// anything on a day cell, and both land squarely on top of the selection the
// user just started.

/** How long a press has to last. Long enough not to fire on a tap that
 *  lingered, short enough that a thumb held on a day gets an answer before it
 *  starts wondering. Around the platform conventions (Android ~500ms, iOS
 *  ~500ms for a callout), deliberately a hair under so the app's own gesture is
 *  the one that resolves first. */
const HOLD_MS = 450;

/** How far the pointer may drift before the press stops being a press. About a
 *  finger's own wobble; anything more is the start of a scroll or a swipe, and
 *  those belong to the page and the month respectively. */
const MAX_DRIFT = 10;

/** The day a press landed on, read back from the marker `renderDay` leaves in
 *  the cell. */
function dayAt(target: EventTarget | null): DayKey | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest('[role="gridcell"]');
  return cell?.querySelector("[data-day]")?.getAttribute("data-day") ?? null;
}

/**
 * Call `onHold(day)` when a day cell inside `ref` is pressed and held.
 *
 * The callback is read through a ref, so a screen may pass a fresh closure
 * every render without the listeners being torn down and rebuilt around the
 * gesture that is currently in flight.
 */
export function useDayPress(
  ref: RefObject<HTMLElement | null>,
  onHold: (day: DayKey) => void,
): void {
  const held = useRef(onHold);
  held.current = onHold;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let origin: { x: number; y: number } | null = null;
    // True from the moment a hold fires until the next press. It is what the
    // click listener below reads: the release of a hold still produces a click,
    // and letting it through would open the day the selection just anchored on.
    let fired = false;

    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      origin = null;
    };

    const down = (e: PointerEvent) => {
      cancel();
      fired = false;
      // The primary button only: a right-click is already a context menu, and
      // a middle-click is not a gesture this app has an opinion about.
      if (e.button !== 0) return;
      const day = dayAt(e.target);
      if (day === null) return;
      origin = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        origin = null;
        fired = true;
        // A half-second press with no answer feels like a press that failed.
        // The anchor and the hint line under the grid are the visible half of
        // the answer; on a phone that can, a tick of haptics is the other.
        navigator.vibrate?.(12);
        held.current(day);
      }, HOLD_MS);
    };

    const move = (e: PointerEvent) => {
      if (!origin) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (Math.hypot(dx, dy) > MAX_DRIFT) cancel();
    };

    // A capture listener, so it runs before the cell's own handler and can stop
    // the click reaching it. `fired` is left standing until the next press:
    // a hold that ends without a click (a pointercancel, a finger lifted off
    // the grid) has nothing to swallow and nothing to clean up.
    const click = (e: MouseEvent) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    };

    // Nothing on a day cell has a context menu worth opening, and on a phone
    // this is the menu that would land on top of the span being picked.
    const contextmenu = (e: MouseEvent) => {
      if (dayAt(e.target) !== null) e.preventDefault();
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", cancel);
    element.addEventListener("pointercancel", cancel);
    element.addEventListener("pointerleave", cancel);
    element.addEventListener("click", click, true);
    element.addEventListener("contextmenu", contextmenu);
    return () => {
      cancel();
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", cancel);
      element.removeEventListener("pointercancel", cancel);
      element.removeEventListener("pointerleave", cancel);
      element.removeEventListener("click", click, true);
      element.removeEventListener("contextmenu", contextmenu);
    };
  }, [ref]);
}
