// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, type RefObject } from "react";

// Swipe left and right to move along the bottom nav.
//
// The bar is a row of four destinations in a fixed order, which means the
// screens have a left and a right — and on a phone, a thumb already dragging
// the page up and down is the cheapest possible way to say "the next one". It
// is an addition to the tabs rather than a replacement: the bar stays the
// visible map, and this is the shortcut for someone who has learned it.
//
// Touch events rather than pointer events, deliberately. This gesture is for
// fingers; a mouse has the tabs, a trackpad's two-finger swipe is the browser's
// back gesture, and claiming horizontal pointer drags would fight the chart's
// crosshair on desktop for no gain.
//
// ## What it must not steal
//
// A horizontal drag is not always a page gesture, and getting this wrong is
// worse than not having the feature — a temperature slider that jumps to the
// next screen instead of moving is a broken control. So the gesture bails at
// `touchstart`, before anything has moved, on:
//
//   - a range input — the whole of the temperature control is a horizontal drag;
//   - anything inside a dialog — the date picker's month grid lives in one;
//   - the forecast chart, which reads a day out of a horizontal drag of its own
//     (it marks itself with `data-swipe-ignore`);
//   - anything that scrolls horizontally, found by walking up from the target.
//     A wide table or a scrolling chart owns its own axis, and the walk is what
//     keeps this rule from having to be re-declared every time one is added.
//
// And it bails during the gesture on a second finger (a pinch is not a swipe)
// and on a drag that is mostly vertical (the page scrolls far more often than
// it swipes, so the diagonal has to resolve in scrolling's favour).

/** How far the finger must travel before it counts, in CSS pixels. About a
 *  centimetre: far enough that it cannot be a tap that slid, short enough for a
 *  thumb pivoting from the bottom corner of a 375px screen. */
const MIN_DISTANCE = 60;

/** How much of the travel has to be horizontal. A swipe at 45° is ambiguous
 *  and the page is what a finger is usually doing, so the horizontal leg has
 *  to be the clearly longer one. */
const MAX_OFF_AXIS_RATIO = 0.6;

/** Controls that own the horizontal axis where they are. */
const IGNORED = 'input[type="range"], [role="dialog"], [data-swipe-ignore]';

/** Whether anything between `target` and `root` scrolls sideways — in which
 *  case the finger is scrolling it, not paging the app. */
function scrollsHorizontally(target: Element, root: Element): boolean {
  let node: Element | null = target;
  while (node && node !== root.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Fire `onSwipe(1)` on a swipe from right to left and `onSwipe(-1)` on one from
 * left to right — the direction the *content* moves, so a leftward swipe brings
 * the next screen in from the right, as a row of pages does everywhere else.
 */
export function useSwipeNav(
  ref: RefObject<HTMLElement | null>,
  onSwipe: (direction: 1 | -1) => void,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // The gesture in progress, or null when there is nothing to finish —
    // which is also how a bail is expressed: forget the start, and the end
    // has nothing to act on.
    let from: { x: number; y: number } | null = null;

    const start = (e: TouchEvent) => {
      from = null;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      const target = touch.target;
      if (!(target instanceof Element)) return;
      if (target.closest(IGNORED)) return;
      if (scrollsHorizontally(target, element)) return;
      from = { x: touch.clientX, y: touch.clientY };
    };

    // A second finger means a pinch or a two-finger scroll, neither of which
    // should end as a page change.
    const move = (e: TouchEvent) => {
      if (e.touches.length > 1) from = null;
    };

    const end = (e: TouchEvent) => {
      const origin = from;
      from = null;
      if (!origin) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) < MIN_DISTANCE) return;
      if (Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS_RATIO) return;
      onSwipe(dx < 0 ? 1 : -1);
    };

    // Passive throughout: nothing here calls `preventDefault`, and saying so
    // keeps the scroller off the main thread's critical path.
    const options = { passive: true } as const;
    element.addEventListener("touchstart", start, options);
    element.addEventListener("touchmove", move, options);
    element.addEventListener("touchend", end, options);
    element.addEventListener("touchcancel", end, options);
    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [ref, onSwipe]);
}
