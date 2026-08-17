// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ReactNode } from "react";

import { CogIcon, PlusIcon } from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import type { Tab } from "./BottomNav.tsx";

// The bar across the top: the app's mark, the sync glyph, and the two things
// you *do* rather than places you go.
//
// The left half is the install icon — the same `icons/icon.svg` the tab
// favicon and the home-screen tile are drawn from, not a second lockup traced
// to match. It replaced the wordmark, which spent the row's most valuable slot
// spelling out the one thing nobody standing in this app is unsure of. The
// mark is the app's face everywhere else it appears (the tab, the home screen,
// the install prompt, the sibling apps' family resemblance), so putting it
// here is what closes that loop: the thing you tapped is the thing at the top
// of what opened.
//
// An `<img>` at the real asset rather than an inlined copy of the geometry,
// because the mark has exactly one definition and a hand-traced duplicate is a
// thing that drifts. It is a precached public asset, so it is there offline,
// and it is loaded from `BASE_URL` so a deploy under a subpath resolves it.
// The accessible name stays the app's name via `alt` — a screen reader still
// reads "Cycle", and the `<h1>` is still the page's heading.
//
// It is the sibling `notes` bar's geometry — a bordered row at `px-4 py-3` with
// the app's identity on the left and the action cluster on the right, gapped at
// `0.5rem` — because these are the same app family and a header that lands at a
// different height on each of them reads as three unrelated apps rather than
// one set. The mark is 28px, which is `notes`' `text-lg` wordmark's line height
// and a notch under the 36px action buttons, so the row's height is set by the
// same thing it always was. What is this app's rather than borrowed is
// the surface: `notes` floats a translucent header over its own scroller, and
// here the bar is a solid `surface-3` sibling of the bottom nav it bookends, so
// the two frame the screen in the same material.
//
// The top-up of `padding-top` comes from the stylesheet (`.app-header`), which
// takes the larger of the row's own padding and the status-bar inset — so an
// installed PWA paints edge to edge and the rule under the bar still tucks
// straight under the Dynamic Island.
//
// Why these two and not tabs. The bottom bar is a row of *destinations*, and a
// row of destinations should have an order that means something left to right —
// which is what lets a swipe move along it (see `useSwipeNav.ts`). Filing
// today's report and changing a setting are neither of those: you go, you do the
// thing, you come back. So they are buttons, and pressing one a second time
// comes back rather than stranding you on a screen with no tab lit.
//
// The `+` is deliberately the loudest thing on screen and the last thing before
// the right edge, where a right thumb lands. Filing a report is what the app is
// *for*; every other screen is a readout of the reports. It wears the filled
// accent the Save button and the four answers wear, and inverts to an outline
// while the Report screen is showing — the same "filled means happening,
// outlined means expected" grammar the calendar's marks use.

type Props = {
  /** The screen on display, so the button that leads to it can say so. */
  active: Tab;
  /** Show one of the two action screens — or, when it is already showing, go
   *  back to where you were. */
  onOpen: (tab: "report" | "settings") => void;
  /** The cloud glyph, when there is a cloud. Absent on the local backend,
   *  which has nothing to sync against. */
  syncSlot?: ReactNode;
};

export function TopBar({ active, onOpen, syncSlot }: Props) {
  const t = useT();
  const onReport = active === "report";
  const onSettings = active === "settings";
  return (
    <header className="app-header flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 pb-3">
      {/* Sized to the row the buttons already set (h-9), one notch down so the
          mark sits inside their line rather than defining a taller one — the
          header's height is unchanged by carrying it. `width`/`height` are on
          the element as well as in the classes so the row does not reflow in
          the moment before the SVG has loaded. */}
      <h1 className="flex min-w-0 items-center">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon.svg`}
          alt={t("app.name")}
          width={28}
          height={28}
          draggable={false}
          className="h-7 w-7 shrink-0 select-none"
        />
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        {syncSlot}
        <button
          type="button"
          onClick={() => onOpen("settings")}
          aria-label={t("nav.settings")}
          aria-current={onSettings ? "page" : undefined}
          title={t("nav.settings")}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
            onSettings
              ? "bg-accent/15 text-accent"
              : "text-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <CogIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => onOpen("report")}
          aria-label={t("nav.newReport")}
          aria-current={onReport ? "page" : undefined}
          title={t("nav.newReport")}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
            onReport
              ? "border-accent text-accent"
              : // `page-bg` for the glyph is what the framework's solid buttons
                // use, so the mark stays legible on the fill in both themes.
                "border-accent bg-accent text-page-bg hover:bg-accent/90"
          }`}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
