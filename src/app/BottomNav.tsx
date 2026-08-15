// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ReactNode } from "react";

import { CogIcon } from "@niclaslindstedt/oss-framework/components";

import { ChartIcon, DropletIcon, ForecastIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";

// The app's navigation: four tabs pinned to the bottom of the screen.
//
// Deliberately not the framework's `Sidebar`, which the sibling apps use. Those
// hold hundreds of items in folders and need somewhere to put them; this app
// has exactly four destinations and is used one-handed, standing up, for
// fifteen seconds. Four thumb-reachable targets beat a drawer that has to be
// opened first.
//
// The bar is the last thing above the screen edge and clears the iOS home
// indicator with a flat 10px (see `styles.css`) rather than the full
// `env(safe-area-inset-bottom)` — the indicator floats over the bar happily,
// and the inset spent a tab's worth of height on empty surface.

export type Tab = "report" | "forecast" | "history" | "settings";

export const TABS: Tab[] = ["report", "forecast", "history", "settings"];

const ICONS: Record<Tab, (props: { className?: string }) => ReactNode> = {
  report: DropletIcon,
  forecast: ForecastIcon,
  history: ChartIcon,
  settings: CogIcon,
};

export function BottomNav({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  const t = useT();
  return (
    <nav
      aria-label={t("app.name")}
      className="app-bottom-nav shrink-0 border-t border-line bg-surface-3"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
          const Icon = ICONS[tab];
          const on = tab === active;
          return (
            <li key={tab} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(tab)}
                aria-current={on ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2 text-[0.7rem] transition-colors ${
                  on ? "text-accent" : "text-muted hover:text-fg"
                }`}
              >
                <Icon className="h-5 w-5" />
                {t(`nav.${tab}` as const)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
