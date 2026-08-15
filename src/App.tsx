// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useState } from "react";

import { dayKeyOf } from "@niclaslindstedt/oss-framework/calendar";
import {
  SpinnerIcon,
  ToastViewport,
  createToastStore,
} from "@niclaslindstedt/oss-framework/components";
import { LogViewer } from "@niclaslindstedt/oss-framework/logging";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  SyncDetailsModal,
  SyncStatus,
} from "@niclaslindstedt/oss-framework/sync";
import { useApplyTheme } from "@niclaslindstedt/oss-framework/theme";

import { BottomNav, type Tab } from "./app/BottomNav.tsx";
import { CalendarScreen } from "./app/CalendarScreen.tsx";
import { ForecastScreen } from "./app/ForecastScreen.tsx";
import { HistoryScreen } from "./app/HistoryScreen.tsx";
import { ReportScreen } from "./app/ReportScreen.tsx";
import { SettingsScreen } from "./app/SettingsScreen.tsx";
import { StatusScreen } from "./app/StatusScreen.tsx";
import { useT } from "./app/i18n/index.ts";
import { appearanceFor } from "./app/look.ts";
import { descendingLogStore, logStore } from "./app/log.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import {
  chartLook,
  cycleOptions,
  useAppSettings,
} from "./app/useAppSettings.ts";
import { usePeriodStore } from "./app/usePeriodStore.ts";
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

  const store = usePeriodStore();
  const sync = useSyncEngine(store);
  const options = useMemo(() => cycleOptions(settings), [settings]);
  const look = useMemo(() => chartLook(settings), [settings]);

  // Status is where the app opens: it answers the question the app was picked
  // up to answer, and every other tab is a follow-up to it.
  const [tab, setTab] = useState<Tab>("status");
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
      {/* The status bar's worth of inset, a rule, and nothing else. The app's
          name used to sit here as a visible title, which is a row of chrome
          repeating what the icon the user just tapped already said — on a
          phone that is a tab's worth of height spent on no information. The
          heading survives as `sr-only` so the document still has one for a
          screen reader and a crawler.

          `padding-top` is the raw `env(safe-area-inset-top)` (see
          `styles.css`), so the rule lands immediately under the status bar /
          Dynamic Island rather than a loose half-rem below it. The bar only
          takes height beyond the inset when the sync glyph is actually there
          to occupy it. */}
      <header className="app-header relative flex shrink-0 items-center justify-end border-b border-line bg-surface-3 px-3">
        <h1 className="sr-only">{t("app.name")}</h1>
        {sync.backend !== "local" && (
          <div className="py-1.5">
            <SyncStatus
              providerName={sync.providerName}
              status={sync.status}
              dirty={sync.dirty}
              offline={sync.offline}
              onOpenDetails={() => setSyncDetailsOpen(true)}
              labels={{ syncedTo: (name) => t("sync.syncedTo", { name }) }}
            />
          </div>
        )}
      </header>

      {/* `relative` is load-bearing, not decoration. Absolutely-positioned
          descendants resolve against the nearest positioned ancestor, and
          without one they resolve against the document — so the visually
          hidden inputs the form controls carry (`sr-only`, which is
          `position: absolute`) sat at their laid-out offsets *outside* this
          scroller and stretched the page itself to the height of the settings
          list. The result was a second scrollbar that moved the whole shell,
          bottom nav included, off the top of the screen. Positioning the
          scroller brings them back inside it. */}
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        {/* `min-h-full` + `flex` so a screen can ask for the leftover height
            — the Report screen centres its card in it rather than stranding
            three controls at the top of an empty phone. */}
        <div className="mx-auto flex min-h-full max-w-2xl flex-col">
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
              onSaved={notice}
            />
          )}
          {tab === "calendar" && (
            <CalendarScreen
              data={store.data}
              today={today}
              options={options}
              showFertileWindow={settings.showFertileWindow}
              weekStartsOn={settings.weekStartsOn}
              model={settings.forecastModel}
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
              onDetailChange={(next) => update("forecastDetail", next)}
              onModelChange={(next) => update("forecastModel", next)}
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
              onNotice={notice}
            />
          )}
        </div>
      </main>

      <BottomNav active={tab} onSelect={setTab} />

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
        logPanel={
          settings.devMode ? (
            <LogViewer store={descendingLogStore} />
          ) : undefined
        }
        onClose={() => setSyncDetailsOpen(false)}
      />

      {/* Applying an update reloads the page, which takes a visible moment;
          the spinner banner replaces the prompt so the wait reads as progress
          rather than a stuck button. */}
      {pwa.needRefresh && reloading ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 bottom-[4.25rem] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-fg shadow-md"
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
