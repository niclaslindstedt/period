// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, type ReactNode } from "react";

import {
  BottomNav as NavBar,
  CalendarIcon,
  HeartIcon,
  stepDirection,
} from "@niclaslindstedt/oss-framework/components";

import { ChartIcon, ForecastIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import type { AppData } from "./types.ts";

// The app's navigation: four tabs pinned to the bottom of the screen.
//
// Deliberately not the framework's `Sidebar`, which the sibling apps use. Those
// hold hundreds of items in folders and need somewhere to put them; this app
// has a handful of destinations and is used one-handed, standing up, for
// fifteen seconds. Thumb-reachable targets beat a drawer that has to be opened
// first.
//
// The order is the order of the questions: what am I *now* (Status), when is
// that on a calendar (Calendar), when is the next one and how sure (Forecast),
// and what does it all add up to (History). Status leads because it is the
// reason the app was opened.
//
// The bar used to carry six, and the two that left are the two that are not
// *places*: filing today's report and changing a setting are things you do and
// then leave, not views you navigate between, and they now sit on the top bar
// (see `TopBar.tsx`). What that buys is a bar of four destinations you can
// swipe between (see `useSwipeNav.ts`) — an order that means something
// left-to-right, which six could not claim while two of its tabs were actions.
// Four also gives each tab about 93px on a 375px phone rather than 62, so the
// labels are no longer the constraint they were.
//
// The bar is the last thing above the screen edge and clears the iOS home
// indicator with a flat 10px on every platform (see `styles.css`) rather than
// the full `env(safe-area-inset-bottom)`: the indicator floats over the bar
// happily, and the inset spent a tab's worth of height on empty surface.

/** Every screen the shell can show. */
export type Tab =
  "status" | "report" | "calendar" | "forecast" | "history" | "settings";

/** The screens that are *destinations* — the ones the bottom bar carries and
 *  a swipe moves between. Report and Settings are reached from the top bar
 *  instead, because they are things you do rather than places you are. */
export type NavTab = "status" | "calendar" | "forecast" | "history";

export const TABS: NavTab[] = ["status", "calendar", "forecast", "history"];

/** Whether a screen is one of the bar's destinations — which is also the
 *  question "can a swipe move from here?". */
export function isNavTab(tab: Tab): tab is NavTab {
  return (TABS as Tab[]).includes(tab);
}

/** Which way an arriving screen travels: `forward` in from the right,
 *  `back` in from the left, or `none` for a change with no direction to it. */
export type ScreenEnter = "forward" | "back" | "none";

/**
 * How a move from one screen to another should animate.
 *
 * The bar's order is the app's only left-to-right claim, and a swipe already
 * moves along it — so the screens have to arrive from the side the gesture
 * came from, or the motion contradicts the finger that asked for it. The same
 * order answers a tap on a tab, because a tap two tabs to the right is the
 * same move as two swipes and should not look like a different one.
 *
 * `none` for everything else, and that is a claim rather than a fallback:
 * Report and Settings are not on the bar (see `TopBar.tsx`), they have no
 * neighbours, and sliding them in from a side would invent a position for
 * them the rest of the app then has to keep pretending is there. They cross
 * fade instead — a change of screen without a direction, which is exactly
 * what pressing a top-bar button is.
 */
export function screenEnter(from: Tab, to: Tab): ScreenEnter {
  // The framework's `stepDirection` is exactly this rule over an ordered
  // axis, and it already returns "none" for a screen that is not on the axis
  // — which is the Report / Settings case, unchanged.
  return stepDirection(TABS, from as NavTab, to as NavTab);
}

/**
 * Which tab the app opens on, given the document it booted with.
 *
 * Status normally, because it answers the question the app was picked up to
 * answer. But every word on it is derived from reports, and on a document with
 * none there is nothing to derive: the screen can only say it doesn't know
 * yet. So a document with no reports opens on Report instead — the one screen
 * that is useful before there is any history, and the only thing that turns an
 * empty install into a working one.
 *
 * "No reports" is exactly that: a day answered entirely `no` is a report, and
 * it moves the app off this branch, because "I checked and nothing happened"
 * is a claim the derivation reads.
 *
 * Decided once, from the document present on the first render — `useDocStore`
 * reads localStorage synchronously, so that document is the real one. Reports
 * that arrive later from a cloud adopt or a backup restore do not move the
 * tab: by then someone may be part-way through filling the report in, and
 * pulling the screen out from under a half-answered day costs more than the
 * hop to Status is worth.
 */
export function initialTab(data: AppData): Tab {
  return Object.keys(data.entries).length === 0 ? "report" : "status";
}

const ICONS: Record<NavTab, (props: { className?: string }) => ReactNode> = {
  status: HeartIcon,
  calendar: CalendarIcon,
  forecast: ForecastIcon,
  history: ChartIcon,
};

export function BottomNav({
  active,
  onSelect,
}: {
  /** The screen on display, which may be one the bar does not carry — no tab
   *  is then current, and the top bar's own button is lit instead. */
  active: Tab;
  onSelect: (tab: NavTab) => void;
}) {
  const t = useT();
  // The framework's bar takes its destinations as data; this app supplies the
  // vocabulary — which screens are places, what they are called, and what
  // each one's glyph is. The markup, the current-page marking and the layout
  // are the framework's.
  const items = useMemo(
    () =>
      TABS.map((tab) => ({
        id: tab,
        label: t(`nav.${tab}` as const),
        icon: ICONS[tab],
      })),
    [t],
  );
  return (
    <NavBar
      items={items}
      active={active}
      onSelect={onSelect}
      label={t("app.name")}
      className="app-bottom-nav"
    />
  );
}
