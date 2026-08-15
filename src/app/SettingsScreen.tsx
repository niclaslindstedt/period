// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import type { WeekStart } from "@niclaslindstedt/oss-framework/calendar";
import {
  Button,
  ConfirmDialog,
  LabeledInput,
  SegmentedControl,
  Section,
  ToggleRow,
  CogIcon,
  DatabaseIcon,
  CloudIcon,
  InfoIcon,
  PaletteIcon,
  ScrollTextIcon,
} from "@niclaslindstedt/oss-framework/components";
import { LogViewer } from "@niclaslindstedt/oss-framework/logging";

import { descendingLogStore, logStore } from "./log.ts";
import { downloadBackup, readBackupFile } from "./backup.ts";
import { useT } from "./i18n/index.ts";
import { mergeDocs } from "./merge.ts";
import { serializeDoc } from "./migrations.ts";
import type { ForecastModelKind } from "./forecastModel.ts";
import type { TemperatureUnit } from "./temperature.ts";
import { emptyDoc } from "./types.ts";
import type { AppSettings, ThemeChoice } from "./useAppSettings.ts";
import type { PeriodStore } from "./usePeriodStore.ts";
import {
  AVAILABLE_BACKENDS,
  PROVIDER_NAMES,
  type SyncBackendId,
  type SyncEngine,
} from "./useSyncEngine.ts";

// One scrolling page rather than the tabbed dialog the sibling apps use: this
// app has four groups of settings, and paging between four tabs to find one
// toggle costs more than scrolling past it.
//
// The screen owns no state of its own beyond the confirm dialog — every knob
// reads and writes the caller's settings store, so what is on screen is always
// what is persisted.

type Props = {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  store: PeriodStore;
  sync: SyncEngine;
  onNotice: (message: string) => void;
};

export function SettingsScreen({
  settings,
  update,
  store,
  sync,
  onNotice,
}: Props) {
  const t = useT();
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const importBackup = async (file: File) => {
    try {
      const doc = await readBackupFile(file);
      const before = Object.keys(store.data.entries).length;
      // The same merge the cloud path uses — a restore adds to what is here
      // rather than replacing it, so restoring an old backup onto a live phone
      // can't silently drop this month.
      const merged = mergeDocs(store.data, doc);
      store.replaceAll(merged);
      onNotice(
        t("settings.imported", {
          count: String(Object.keys(merged.entries).length - before),
        }),
      );
    } catch {
      onNotice(t("settings.importFailed"));
    }
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <Section
        title={t("settings.appearance")}
        icon={<PaletteIcon className="h-3.5 w-3.5" />}
      >
        <SegmentedControl<ThemeChoice>
          value={settings.theme}
          options={[
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
            { value: "system", label: t("settings.themeSystem") },
          ]}
          onChange={(theme) => update("theme", theme)}
          ariaLabel={t("settings.theme")}
          fullWidth
        />
      </Section>

      <Section
        title={t("settings.calendar")}
        icon={<CogIcon className="h-3.5 w-3.5" />}
      >
        <SegmentedControl
          value={String(settings.weekStartsOn)}
          options={[
            { value: "1", label: t("settings.monday") },
            { value: "0", label: t("settings.sunday") },
          ]}
          onChange={(next) => update("weekStartsOn", Number(next) as WeekStart)}
          ariaLabel={t("settings.weekStart")}
          fullWidth
        />
      </Section>

      <Section
        title={t("settings.cycle")}
        icon={<CogIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-xs text-muted">{t("settings.cycleHint")}</p>
        <LabeledInput
          label={t("settings.defaultCycleLength")}
          value={String(settings.defaultCycleLength)}
          type="number"
          inputMode="numeric"
          min={15}
          max={60}
          onCommit={(next) =>
            update("defaultCycleLength", clamp(next, 15, 60, 28))
          }
        />
        <LabeledInput
          label={t("settings.defaultPeriodLength")}
          value={String(settings.defaultPeriodLength)}
          type="number"
          inputMode="numeric"
          min={1}
          max={15}
          onCommit={(next) =>
            update("defaultPeriodLength", clamp(next, 1, 15, 5))
          }
        />
        <LabeledInput
          label={t("settings.lutealPhaseLength")}
          value={String(settings.lutealPhaseLength)}
          type="number"
          inputMode="numeric"
          min={8}
          max={20}
          onCommit={(next) =>
            update("lutealPhaseLength", clamp(next, 8, 20, 14))
          }
        />
        <ToggleRow
          label={t("settings.showFertileWindow")}
          hint={t("settings.showFertileWindowHint")}
          checked={settings.showFertileWindow}
          onChange={(next) => update("showFertileWindow", next)}
        />
      </Section>

      <Section
        title={t("settings.forecast")}
        icon={<CogIcon className="h-3.5 w-3.5" />}
      >
        {/* The same two controls live on the Forecast screen itself, next to
            what they change. They are repeated here because Settings is where
            people look for them, and a preference that only exists in one
            place is a preference half the users never find. */}
        <Labelled label={t("settings.forecastDetail")}>
          <SegmentedControl
            value={settings.forecastDetail}
            options={[
              { value: "simple", label: t("forecast.detail.simple") },
              { value: "advanced", label: t("forecast.detail.advanced") },
            ]}
            onChange={(next) =>
              update("forecastDetail", next as "simple" | "advanced")
            }
            ariaLabel={t("settings.forecastDetail")}
            fullWidth
          />
        </Labelled>
        <p className="text-xs text-muted">{t("settings.forecastDetailHint")}</p>

        <Labelled label={t("settings.forecastModel")}>
          <SegmentedControl
            value={settings.forecastModel}
            options={[
              { value: "univariate", label: t("forecast.evidence.cycles") },
              {
                value: "multivariate",
                label: t("forecast.evidence.cyclesAndReports"),
              },
            ]}
            onChange={(next) =>
              update("forecastModel", next as ForecastModelKind)
            }
            ariaLabel={t("settings.forecastModel")}
            fullWidth
          />
        </Labelled>
        <p className="text-xs text-muted">{t("settings.forecastModelHint")}</p>

        <Labelled label={t("settings.temperatureUnit")}>
          <SegmentedControl
            value={settings.temperatureUnit}
            options={[
              { value: "c", label: t("settings.celsius") },
              { value: "f", label: t("settings.fahrenheit") },
            ]}
            onChange={(next) =>
              update("temperatureUnit", next as TemperatureUnit)
            }
            ariaLabel={t("settings.temperatureUnit")}
            fullWidth
          />
        </Labelled>
        <p className="text-xs text-muted">
          {t("settings.temperatureUnitHint")}
        </p>
      </Section>

      <Section
        title={t("settings.sync")}
        icon={<CloudIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-xs text-muted">{t("settings.syncHint")}</p>
        <SegmentedControl<SyncBackendId>
          value={sync.backend}
          options={AVAILABLE_BACKENDS.map((id) => ({
            value: id,
            label: PROVIDER_NAMES[id],
          }))}
          onChange={(next) => {
            if (next === sync.backend) return;
            if (next === "local") {
              sync.disconnect();
              return;
            }
            setBusy(true);
            void sync
              .connect(next)
              .catch((err: unknown) =>
                onNotice(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setBusy(false));
          }}
          ariaLabel={t("settings.backend")}
          fullWidth
        />
        <p className="text-xs text-muted">
          {sync.connected
            ? t("settings.connected", { name: sync.providerName })
            : t("settings.localOnly")}
          {" · "}
          {sync.location.path}
        </p>
        {sync.connected && (
          <div className="flex gap-2">
            <Button onClick={sync.saveNow} disabled={busy || !sync.dirty}>
              {t("settings.saveNow")}
            </Button>
            <Button onClick={() => void sync.reload()} disabled={busy}>
              {t("settings.reload")}
            </Button>
            <Button variant="danger" onClick={sync.disconnect}>
              {t("settings.disconnect")}
            </Button>
          </div>
        )}
      </Section>

      <Section
        title={t("settings.data")}
        icon={<DatabaseIcon className="h-3.5 w-3.5" />}
      >
        <div className="flex flex-col gap-1">
          <Button onClick={() => downloadBackup(store.data)}>
            {t("settings.export")}
          </Button>
          <p className="text-xs text-muted">{t("settings.exportHint")}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="inline-flex">
            {/* A styled `<input type="file">`: the visually hidden input keeps
                the native picker (and its keyboard behaviour) while the label
                supplies the framework button look. */}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                const file = input.files?.[0];
                if (file) void importBackup(file);
                // Clear the value so re-picking the same file fires again.
                input.value = "";
              }}
            />
            <span className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2">
              {t("settings.import")}
            </span>
          </label>
          <p className="text-xs text-muted">{t("settings.importHint")}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="danger" onClick={() => setConfirmClear(true)}>
            {t("settings.deleteAll")}
          </Button>
          <p className="text-xs text-muted">{t("settings.deleteAllHint")}</p>
        </div>
      </Section>

      <Section
        title={t("settings.developer")}
        icon={<ScrollTextIcon className="h-3.5 w-3.5" />}
      >
        <ToggleRow
          label={t("settings.devMode")}
          hint={t("settings.devModeHint")}
          checked={settings.devMode}
          onChange={(next) => update("devMode", next)}
        />
        <ToggleRow
          label={t("settings.captureLogs")}
          checked={settings.captureLogs}
          onChange={(next) => {
            update("captureLogs", next);
            logStore.setCaptureEnabled(next);
          }}
        />
        {settings.devMode && (
          <>
            <p className="text-xs text-muted">
              {t("settings.documentSize")}:{" "}
              {serializeDoc(store.data).length.toLocaleString()} bytes
            </p>
            {/* The viewer draws its own rows edge to edge — it is built to
                sit in a modal that supplies the inset. In a settings card it
                has to bring one, or the filter row and every log line print
                against the border. */}
            <div className="max-h-64 overflow-auto rounded-md border border-line p-2">
              <LogViewer store={descendingLogStore} />
            </div>
          </>
        )}
      </Section>

      <Section
        title={t("settings.about")}
        icon={<InfoIcon className="h-3.5 w-3.5" />}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{t("settings.version")}</dt>
          <dd className="text-fg">{__APP_VERSION__}</dd>
          <dt className="text-muted">{t("settings.build")}</dt>
          <dd className="text-fg">{__BUILD_LABEL__}</dd>
          <dt className="text-muted">{t("settings.sourceCode")}</dt>
          <dd>
            <a
              className="text-link hover:underline"
              href="https://github.com/niclaslindstedt/period"
              target="_blank"
              rel="noreferrer"
            >
              github.com/niclaslindstedt/period
            </a>
          </dd>
        </dl>
        <p className="text-xs leading-snug text-muted">
          {t("settings.privacy")}
        </p>
      </Section>

      <ConfirmDialog
        open={confirmClear}
        title={t("settings.deleteAllConfirm")}
        description={t("settings.deleteAllHint")}
        confirmLabel={t("common.delete")}
        tone="danger"
        labels={{ cancel: t("common.cancel"), close: t("common.close") }}
        onConfirm={() => {
          store.replaceAll(emptyDoc());
          setConfirmClear(false);
          onNotice(t("settings.deleted"));
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

/** A label above a control, matching the spacing the framework's own labelled
 *  inputs use so a segmented control sits in the same rhythm as a text field. */
function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg">{label}</span>
      {children}
    </div>
  );
}

/** Read a settings number field, holding the previous value when the text
 *  isn't a number in range. A settings field is not a place to accept "abc"
 *  and let the forecast divide by NaN. */
function clamp(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
