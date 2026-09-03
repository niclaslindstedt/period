// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { dayKeyOf } from "@niclaslindstedt/oss-framework/calendar";
import {
  SpinnerIcon,
  ToastViewport,
  createToastStore,
} from "@niclaslindstedt/oss-framework/components";
import { useSwipeNav } from "@niclaslindstedt/oss-framework/hooks";
import { LogViewer } from "@niclaslindstedt/oss-framework/logging";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  SyncDetailsModal,
  SyncStatus,
} from "@niclaslindstedt/oss-framework/sync";
import { useApplyTheme } from "@niclaslindstedt/oss-framework/theme";

import {
  BottomNav,
  initialTab,
  isNavTab,
  screenEnter,
  TABS,
  type NavTab,
  type ScreenEnter,
  type Tab,
} from "./app/BottomNav.tsx";
import { CalendarScreen } from "./app/CalendarScreen.tsx";
import { demoBackendModule, useDemoData } from "./app/dev/useDemoData.ts";
import { ForecastScreen } from "./app/ForecastScreen.tsx";
import { HistoryScreen } from "./app/HistoryScreen.tsx";
import { ReportScreen } from "./app/ReportScreen.tsx";
import { SettingsScreen } from "./app/SettingsScreen.tsx";
import { StatusScreen } from "./app/StatusScreen.tsx";
import { TopBar } from "./app/TopBar.tsx";
import { useT } from "./app/i18n/index.ts";
import { appearanceFor } from "./app/look.ts";
import { logStore } from "./app/log.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import {
  chartLook,
  cycleOptions,
  useAppSettings,
} from "./app/useAppSettings.ts";
import { localDocBackend, useDocStore } from "./app/useDocStore.ts";
import { useSyncEngine } from "./app/useSyncEngine.ts";
import { status } from "./output.ts";

// A local-first period tracker built from the framework's shared surface. The
// app owns the report store, the cycle derivation, and the six screens; the
// framework supplies the theme engine, the storage adapters behind sync, the
// charts, the calendar grid, and the PWA update lifecycle.
//
// Everything hangs off one document in localStorage. There is no server: cloud
// sync, when connected, is a copy of that same document in the user's own
// Dropbox or Drive.

// Module-scoped so the identity stays stable across renders (the framework's
// `useToasts` keys its subscription on the store object).
const toasts = createToastStore();

export function App() {
  const t = useT();
  const { settings, update } = useAppSettings();
  useApplyTheme(useMemo(() => appearanceFor(settings.theme), [settings.theme]));

  // Today, as a calendar day. Recomputed on focus rather than on a timer:
  // the only way the answer changes while the app is open is midnight passing
  // — and the app being open at midnight then returned to is exactly when the
  // stale value would be wrong.
  const [today, setToday] = useState(() => dayKeyOf(new Date()));
  useEffect(() => {
    const refresh = () => setToday(dayKeyOf(new Date()));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Developer "Demo data" takeover: while the toggle is on, an in-memory
  // backend seeded with a year of invented reports replaces the real
  // localStorage one for the session. Nothing on disk is touched, the sync
  // engine is paused so none of it can reach a connected cloud account, and a
  // reload restores the real document (see `useDemoData`).
  const demo = useDemoData();
  const backend = useMemo(() => {
    // Non-null whenever the toggle is on: `setDemoData` only flips it once the
    // dev chunk has loaded.
    const module = demoBackendModule();
    if (demo.on && module) return module.createDemoBackend();
    return localDocBackend;
  }, [demo.on]);
  const store = useDocStore(backend);
  const sync = useSyncEngine(store, demo.on);
  const options = useMemo(() => cycleOptions(settings), [settings]);
  const look = useMemo(() => chartLook(settings), [settings]);

  // Status is where the app opens: it answers the question the app was picked
  // up to answer, and every other tab is a follow-up to it. On a document with
  // no reports in it there is nothing to answer with, so a first run opens on
  // Report instead (see `initialTab`). Decided once, from the document this
  // render started with — the store reads localStorage synchronously, so it is
  // the real one and not a placeholder.
  const [tab, setTab] = useState<Tab>(() => initialTab(store.data));
  // Where the bottom nav was left. Report and Settings are things you do and
  // then leave, so pressing their button a second time — or swiping off them —
  // puts you back where you were rather than on whichever screen happens to be
  // first. Status is the fallback for a first run, which opens on Report with
  // no nav tab behind it.
  const [home, setHome] = useState<NavTab>("status");
  // Which way the screen now arriving came from, so the shell can move it in
  // from the side the bar says it lives on (see `screenEnter` and the
  // `.app-screen` rules in styles.css). Set wherever the tab is, rather than
  // derived afterwards from a remembered previous value: every change goes
  // through one of the two functions below, and both of them know both ends of
  // the move at the moment they make it.
  const [enter, setEnter] = useState<ScreenEnter>("none");
  const show = useCallback(
    (next: Tab) => {
      setEnter(screenEnter(tab, next));
      if (isNavTab(next)) setHome(next);
      setTab(next);
    },
    [tab],
  );
  const toggle = useCallback(
    (next: "report" | "settings") => {
      const target = tab === next ? home : next;
      setEnter(screenEnter(tab, target));
      setTab(target);
    },
    [tab, home],
  );

  // A swipe moves one tab along the bar, and stops at its ends: the bar is a
  // row with a first and a last, and wrapping from History back to Status would
  // be the one motion on screen that does not match a thing you can see. From
  // Report or Settings — which are not on the bar — it goes back to the tab
  // they were opened from, since that is the only left-to-right neighbour
  // either of them has.
  const main = useRef<HTMLElement>(null);
  const swipe = useCallback(
    (direction: 1 | -1) => {
      if (!isNavTab(tab)) {
        setEnter(screenEnter(tab, home));
        setTab(home);
        return;
      }
      const next = TABS[TABS.indexOf(tab) + direction];
      if (next !== undefined) show(next);
    },
    [tab, home, show],
  );
  useSwipeNav(main, swipe);

  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  // Applying an update (skip-waiting → the new worker takes control → the page
  // reloads) has a visible gap. Flip a flag on the tap so the toast shows a
  // spinner instead of a dead button until the reload lands.
  const [reloading, setReloading] = useState(false);

  // Console capture follows the setting; the buffer itself is always on, so a
  // failure that happened before the toggle was found is still in the log.
  useEffect(() => {
    logStore.setCaptureEnabled(settings.captureLogs);
  }, [settings.captureLogs]);

  const notice = useCallback((message: string) => {
    toasts.clear();
    toasts.push({ message, kind: "success", durationMs: 2500 });
  }, []);

  // A refused write. The Report screen confirms a save on its own button and
  // never raises a toast for one, precisely so that the toast is left free to
  // mean this: the document did not reach the disk, the screen looks exactly
  // as it does on success, and the only honest thing to do is say so. It gets
  // longer on screen than a confirmation would, because it is asking for
  // something to be done about it.
  useEffect(() => {
    if (store.writeFailures === 0) return;
    toasts.clear();
    toasts.push({
      message: t("report.saveFailed"),
      kind: "danger",
      durationMs: 8000,
    });
  }, [store.writeFailures, t]);

  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });
  useEffect(() => {
    if (pwa.needRefresh) status(`Update ready: ${pwa.incomingVersion ?? "?"}`);
  }, [pwa.needRefresh, pwa.incomingVersion]);

  return (
    <div className="flex h-full flex-col bg-page text-fg">
      {/* The bar carries the two screens that are actions rather than
          destinations — filing a report and changing a setting — plus the sync
          glyph and the app's mark and name (see `TopBar.tsx`). It used to be an
          empty rule under the status bar, on the argument that a title repeats
          what the icon you just tapped already said; the row now has buttons in
          it and has to have height regardless, and an empty left half is worse
          than the lockup. */}
      <TopBar
        active={tab}
        onOpen={toggle}
        syncSlot={
          sync.backend !== "local" ? (
            <SyncStatus
              providerName={sync.providerName}
              status={sync.status}
              dirty={sync.dirty}
              offline={sync.offline}
              onOpenDetails={() => setSyncDetailsOpen(true)}
              labels={{ syncedTo: (name) => t("sync.syncedTo", { name }) }}
            />
          ) : undefined
        }
      />

      {/* `relative` is load-bearing, not decoration. Absolutely-positioned
          descendants resolve against the nearest positioned ancestor, and
          without one they resolve against the document — so the visually
          hidden inputs the form controls carry (`sr-only`, which is
          `position: absolute`) sat at their laid-out offsets *outside* this
          scroller and stretched the page itself to the height of the settings
          list. The result was a second scrollbar that moved the whole shell,
          bottom nav included, off the top of the screen. Positioning the
          scroller brings them back inside it. */}
      {/* The scroller is also what a swipe is measured across (see
          `useSwipeNav.ts`): the gesture belongs to the screen being paged, not
          to the bars that stay put either side of it. */}
      {/* `overflow-x-hidden` is what makes the arriving screen's slide safe:
          it starts a couple of rem off to one side, and without a clip here
          that offset would be page width the scroller offered sideways for a
          fifth of a second. Hidden rather than `clip` because the swipe walks
          up from the touch target looking for a sideways *scroller* to yield
          to (`auto`/`scroll`), and this is deliberately not one. */}
      <main
        ref={main}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {/* `min-h-full` + `flex` so a screen can ask for the leftover height
            — the Report screen centres its card in it rather than stranding
            three controls at the top of an empty phone.

            `key={tab}` is what restarts the animation: the CSS class alone
            would only re-fire when the direction *changed*, so two swipes the
            same way would animate once. A new key is a new element, and a new
            element always runs its animation. The screens below are mounted
            per tab anyway, so this costs nothing beyond the wrapper. */}
        <div
          key={tab}
          data-enter={enter}
          className="app-screen mx-auto flex min-h-full max-w-2xl flex-col"
        >
          {tab === "status" && (
            <StatusScreen
              data={store.data}
              today={today}
              options={options}
              showFertileWindow={settings.showFertileWindow}
              model={settings.forecastModel}
            />
          )}
          {tab === "report" && (
            <ReportScreen
              store={store}
              today={today}
              weekStartsOn={settings.weekStartsOn}
              temperatureUnit={settings.temperatureUnit}
              cloudBacked={sync.backend !== "local"}
              onNotice={notice}
            />
          )}
          {tab === "calendar" && (
            <CalendarScreen
              store={store}
              today={today}
              options={options}
              showFertileWindow={settings.showFertileWindow}
              weekStartsOn={settings.weekStartsOn}
              model={settings.forecastModel}
              temperatureUnit={settings.temperatureUnit}
              onNotice={notice}
            />
          )}
          {tab === "forecast" && (
            <ForecastScreen
              data={store.data}
              today={today}
              options={options}
              showFertileWindow={settings.showFertileWindow}
              detail={settings.forecastDetail}
              model={settings.forecastModel}
              look={look}
              temperatureUnit={settings.temperatureUnit}
              onLookChange={(next) => {
                if (next.mark !== undefined) update("chartMark", next.mark);
                if (next.view !== undefined) update("chartView", next.view);
                if (next.showBands !== undefined) {
                  update("chartBands", next.showBands);
                }
                if (next.showPrior !== undefined) {
                  update("chartComparePrior", next.showPrior);
                }
              }}
            />
          )}
          {tab === "history" && (
            <HistoryScreen
              data={store.data}
              options={options}
              temperatureUnit={settings.temperatureUnit}
            />
          )}
          {tab === "settings" && (
            <SettingsScreen
              settings={settings}
              update={update}
              store={store}
              sync={sync}
              demoData={demo}
              onNotice={notice}
            />
          )}
        </div>
      </main>

      {/* The update prompt, moved out of the viewport's bottom corner and
          anchored to the *bar* instead. The framework fixes it to the bottom of
          the screen, which is a sound default for an app whose navigation is a
          sidebar — but this app's navigation is the strip along that same edge
          (see `BottomNav.tsx`), so a build landing while the app was open put a
          card squarely over the four tabs and left it there until someone found
          the dismiss button. The prompt is not urgent enough to cost anyone
          their navigation: an update waits perfectly happily one screen up.

          A zero-height positioned slot in the flow rather than an offset typed
          into the card, because the bar's height is its labels' — one line of
          type at whatever size the platform renders it — and a number here
          would be wrong on the first phone that disagreed. The slot sits
          between the scroller and the bar, so `bottom: 0` in it *is* the bar's
          top edge; `styles.css` re-points the framework's card at it. Nothing
          in the slot is in flow, so it takes no height off the page. */}
      <div className="app-update-slot relative z-[60]">
        {/* Applying an update reloads the page, which takes a visible moment;
            the spinner banner replaces the prompt so the wait reads as progress
            rather than a stuck button. Same box as the card it stands in for —
            same inset, same width, same corner — because it is the same card in
            its next state, and a shape that changed on the tap would read as
            one panel being swapped for another. */}
        {pwa.needRefresh && reloading ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-x-3 bottom-3 mx-auto flex max-w-md items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-fg shadow-md"
          >
            <SpinnerIcon className="h-5 w-5 animate-spin text-accent" />
            <span className="text-sm font-medium">{t("update.reload")}</span>
          </div>
        ) : (
          <UpdateToast
            needRefresh={pwa.needRefresh}
            incomingVersion={pwa.incomingVersion}
            onReload={() => {
              setReloading(true);
              pwa.reload();
            }}
            onDismiss={() => pwa.dismiss()}
            labels={{
              ready: t("update.available"),
              action: t("update.reload"),
              dismiss: t("common.close"),
            }}
          />
        )}
      </div>

      <BottomNav active={tab} onSelect={show} />

      <SyncDetailsModal
        open={syncDetailsOpen}
        providerName={sync.providerName}
        backendKind="cloud"
        location={sync.location}
        status={sync.status}
        statusDetail={sync.statusDetail}
        dirty={sync.dirty}
        offline={sync.offline}
        onSaveNow={sync.saveNow}
        onReload={() => void sync.reload()}
        onReconnect={sync.reconnect}
        onCheckConnection={sync.checkConnection}
        logPanel={settings.devMode ? <LogViewer store={logStore} /> : undefined}
        onClose={() => setSyncDetailsOpen(false)}
      />

      {/* Top, not the framework's default bottom. Every toast this app raises
          is the answer to a tap on the Report screen's Save button, and at the
          bottom of the screen the card lands squarely on the bottom nav — it
          covers the four tabs for two and a half seconds, right where the
          thumb already is. The header it covers instead is a title and a sync
          glyph, neither of which anyone is reaching for.

          `app-toasts` is the hook the stylesheet re-tints these cards through
          (see styles.css). It is on the viewport rather than the card because
          the card is the framework's to render — this app only says that
          inside *its* viewport, a toast wears the app's red. */}
      <ToastViewport
        store={toasts}
        labels={{ dismiss: t("common.close") }}
        className="app-toasts pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      />
    </div>
  );
}
