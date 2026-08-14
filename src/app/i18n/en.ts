// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The English catalog — the app's single source of user-facing copy, and (as
// the fallback language) the source of the compile-time message-key type. Add
// a string here first; `t()` won't type-check against a key this file doesn't
// carry.
//
// `{name}`-style placeholders interpolate at call time. Keep the surrounding
// sentence in the catalog rather than concatenating fragments at the call
// site: a translator needs the whole sentence to move its words around.

export const en = {
  app: {
    name: "Period",
    tagline: "Your cycle, on your device",
  },

  nav: {
    report: "Report",
    forecast: "Forecast",
    history: "History",
    settings: "Settings",
  },

  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    today: "Today",
    yesterday: "Yesterday",
    days: "{count} days",
    day: "1 day",
    none: "None",
    notEnoughData: "Not enough data yet",
  },

  bleeding: {
    label: "Bleeding",
    none: "None",
    spotting: "Spotting",
    light: "Light",
    medium: "Medium",
    heavy: "Heavy",
  },

  mood: {
    label: "Mood",
    hint: "Tap everything that fits. Nothing is also an answer.",
    calm: "Calm",
    happy: "Happy",
    energetic: "Energetic",
    irritable: "Irritable",
    anxious: "Anxious",
    sad: "Sad",
    angry: "Angry",
    tearful: "Tearful",
    tired: "Tired",
  },

  swing: {
    label: "Mood swings",
    hint: "How much your mood moved across the day.",
    level0: "Steady",
    level1: "Mild",
    level2: "Noticeable",
    level3: "Strong",
  },

  report: {
    title: "Daily report",
    noteLabel: "Note",
    notePlaceholder: "Anything else worth remembering?",
    pickDate: "Pick a date",
    prevWeek: "Previous week",
    nextWeek: "Next week",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    saveNew: "Save report",
    saveExisting: "Update report",
    clear: "Clear this day",
    saved: "Report saved",
    cleared: "Report cleared",
    logged: "Logged",
    empty: "Nothing logged yet",
  },

  forecast: {
    title: "Forecast",
    cycleDay: "Cycle day {day}",
    noHistory: "Log a few bleeding days and the forecast appears here.",
    nextPeriod: "Next period",
    inDays: "in {count} days",
    tomorrow: "tomorrow",
    todayIs: "expected today",
    overdue: "{count} days late",
    fertileWindow: "Fertile window",
    ovulation: "Ovulation around {date}",
    basedOn: "Based on {count} tracked cycles, typically {length} days.",
    basedOnDefault:
      "Using a {length}-day cycle until enough of your own is tracked.",
    confidence: {
      none: "No prediction yet",
      low: "Rough estimate",
      medium: "Fair estimate",
      high: "Steady pattern",
    },
    legend: {
      logged: "Logged bleeding",
      predicted: "Predicted period",
      fertile: "Fertile window",
    },
    disclaimer:
      "An estimate from your own reports — not medical advice, and not contraception.",
  },

  history: {
    title: "History",
    averageCycle: "Average cycle",
    averagePeriod: "Average period",
    cyclesTracked: "Cycles tracked",
    daysLogged: "Days logged",
    cycleLengthChart: "Cycle length",
    cycleLengthChartDesc:
      "Days between the start of each period, oldest cycle first.",
    swingChart: "Mood swings by cycle phase",
    swingChartDesc:
      "Average reported mood-swing level in each phase of the cycle.",
    phase: {
      menstrual: "Menstrual",
      follicular: "Follicular",
      fertile: "Fertile",
      luteal: "Luteal",
    },
    periods: "Periods",
    periodRow: "{start} — {end}",
    periodLength: "{count} days",
    cycleGap: "{count}-day cycle",
    topMoods: "Most reported moods",
    empty: "Once you have logged a period or two, the numbers show up here.",
  },

  settings: {
    title: "Settings",
    appearance: "Appearance",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    calendar: "Calendar",
    weekStart: "Week starts on",
    monday: "Monday",
    sunday: "Sunday",
    cycle: "Cycle",
    defaultCycleLength: "Default cycle length (days)",
    defaultPeriodLength: "Default period length (days)",
    lutealPhaseLength: "Luteal phase (days)",
    cycleHint:
      "Used until your own history says otherwise. The luteal phase sets how far before the next period ovulation is estimated.",
    showFertileWindow: "Show the fertile window",
    showFertileWindowHint:
      "Turn off to keep the app to periods only — no fertility estimate.",
    sync: "Sync",
    syncHint:
      "Reports live on this device. Connect a cloud account to keep a copy and read it on your other devices.",
    backend: "Where the copy lives",
    connect: "Connect",
    disconnect: "Disconnect",
    connected: "Connected to {name}",
    localOnly: "This device only",
    saveNow: "Save now",
    reload: "Reload from cloud",
    data: "Your data",
    export: "Export a backup",
    exportHint: "Downloads every report as a JSON file.",
    import: "Restore from a backup",
    importHint:
      "Merges the file's reports into what is already here — the newer report wins for any day both hold.",
    imported: "Restored {count} reports",
    importFailed: "That file could not be read as a backup.",
    deleteAll: "Delete everything",
    deleteAllHint:
      "Removes every report from this device. This cannot be undone.",
    deleteAllConfirm: "Delete every report on this device?",
    deleted: "All reports deleted",
    developer: "Developer",
    devMode: "Developer mode",
    devModeHint: "Shows the sync log and the raw document size.",
    captureLogs: "Capture console output",
    logs: "Logs",
    documentSize: "Document size",
    about: "About",
    version: "Version",
    build: "Build",
    sourceCode: "Source code",
    privacy:
      "Everything stays on this device unless you connect a cloud account yourself. There is no server, no account, and no analytics.",
  },

  sync: {
    detailsTitle: "Sync",
    syncedTo: "Synced to {name}",
  },

  update: {
    available: "A new version is ready",
    reload: "Reload",
  },
} as const;

export type Catalog = typeof en;
