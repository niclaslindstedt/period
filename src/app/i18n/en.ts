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
    status: "Status",
    report: "Report",
    calendar: "Calendar",
    forecast: "Forecast",
    history: "History",
    settings: "Settings",
  },

  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    yes: "Yes",
    no: "No",
    today: "Today",
    yesterday: "Yesterday",
    days: "{count} days",
    day: "1 day",
    none: "None",
    notEnoughData: "Not enough data yet",
  },

  report: {
    title: "Daily report",
    forDay: "Report for",
    pickDate: "Pick a date",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    // The picker's two modes, and the copy that walks through the second one.
    // A range is picked with two taps, so the hint has to say which tap the
    // next one is — a grid that looks identical before and after the first tap
    // is a grid nobody can tell the state of.
    modeDay: "One day",
    modeRange: "Range",
    modeLabel: "How many days",
    rangeStartHint: "Tap the first day — up to {count} at a time",
    rangeEndHint: "Now tap the last day",
    rangeSpan: "{count} days",
    rangeLogged: "{logged} of {count} days logged",
    blood: "Blood",
    swings: "Mood swings",
    // The two ovulatory yes/no answers. Kept to one word each because they sit
    // in a row of four on a 375px screen — and because the shortest honest
    // label is the one that reads fastest at 23:50.
    lust: "Lust",
    sex: "Sex",
    // The ovulation test. "Fertility test" is what the box in the chemist says;
    // the three options are the three states a strip can be in, and "None" is
    // the one it is in on most days.
    fertilityTest: "Fertility test",
    fertilityTestOptional: "Optional",
    fertilityTestRangeOff: "One day only",
    fertilityTestNone: "None",
    fertilityTestNegative: "Negative",
    fertilityTestPositive: "Positive",
    temperature: "Waking temperature",
    temperatureOptional: "Optional",
    // A waking temperature is one morning's measurement, so a span can't carry
    // one. The control says so in place of "Optional" rather than vanishing —
    // a field that disappears reads as a field that was lost.
    temperatureRangeOff: "One day only",
    temperatureExact: "Exact waking temperature",
    temperaturePlaceholder: "—",
    temperatureNone: "None",
    temperatureFever: "Fever",
    temperatureUnusual: "Unusually low for a waking temperature — check it?",
    saveNew: "Save report",
    saveExisting: "Update report",
    saveRange: "Save {count} days",
    clear: "Clear this day",
    clearRange: "Clear these days",
    saved: "Report saved",
    savedRange: "Saved to {count} days",
    cleared: "Report cleared",
    clearedRange: "Cleared {count} days",
    logged: "Logged",
    empty: "Nothing logged yet",
  },

  // The first screen: what today is, and how sure that is. Every word here is
  // a call the posterior in `forecastModel.ts` actually supports — none of it
  // may sound more certain than the percentage sitting beside it.
  status: {
    title: "Status",
    today: "Today",
    week: "This week",
    // The calls a day can carry. `noPeriod` stands in for `notFertile` when
    // the fertile window is turned off — someone who opted out of a fertility
    // estimate must not be shown one phrased as its negative.
    kind: {
      period: "Period",
      predictedPeriod: "Period likely",
      fertile: "Fertile",
      notFertile: "Not fertile",
      noPeriod: "No period expected",
      unknown: "No prediction yet",
    },
    certainty: "About {percent} statistically secure",
    certaintyHint:
      "The chance your own reports put on this — not a certainty, and it grows as you log more cycles.",
    fromYourReport: "From your own report for today.",
    noHistory: "Log a few bleeding days and your status appears here.",
  },

  // The month view. The colours are the app's whole vocabulary for a day, so
  // the legend's wording is the definition of each one.
  calendar: {
    title: "Calendar",
    noHistory:
      "Only the days you have logged are coloured so far. Once a period is in, the predicted and fertile days fill in around them.",
    legend: {
      period: "Reported bleeding",
      predicted: "Predicted period",
      fertile: "Fertile window",
      reported: "Reported, no bleeding",
    },
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
    disclaimer:
      "An estimate from your own reports — not medical advice, and not contraception.",

    // How much of the forecast is on screen. Both settings show the same
    // prediction from the same model — "simple" hides the workings, it does
    // not simplify the arithmetic, and the copy must never suggest otherwise.
    detail: {
      simple: "Simple",
      advanced: "Advanced",
    },

    // Which reports the model is allowed to read.
    evidence: {
      cycles: "Cycles",
      cyclesAndReports: "Cycles + reports",
      needsMore:
        "Not enough reported days yet to learn your patterns, so this matches the cycles-only forecast.",
      usingMood: "Reading your mood swings",
      usingTemperature: "Reading your temperatures",
      usingBoth: "Reading your mood swings and temperatures",
    },

    likelyBetween: "Most likely {start} — {end}",
    chanceWithinWeek: "{percent} chance it starts within a week",
    plusMinus: "±{days} days",

    chart: {
      title: "When the next period is likely to start",
      description:
        "Probability that the next period starts on each day from {from} to {to}. Most likely {day}.",
      keyboardHint:
        "Forecast chart. Use the left and right arrow keys to read each day.",
      startsOn: "{percent} chance it starts this day",
      startedBy: "{percent} chance it has started by then",
      priorAt: "{percent} from cycle history alone",
      ruledOut: "Ruled out — you reported no bleeding",
      ruledOutLegend: "Ruled out",
      bandLabel: "{percent}% likely",
      historyOnly: "Cycle history only",
      look: "Chart",
      marksBars: "Columns",
      marksCurve: "Curve",
      viewDaily: "Per day",
      viewCumulative: "By day",
      bands: "Bands",
      compare: "Compare",
    },

    // The advanced panel. Every label here names a real quantity the model
    // computed — nothing is rounded up into a reassuring adjective.
    model: {
      title: "The model",
      how: "Cycle lengths are modelled as log-normal with a conjugate Normal-Inverse-Gamma prior, so the prediction is a Student-t over the days ahead. Days you reported without bleeding are removed and the rest rescaled.",
      howReports:
        "On top of that, each candidate day is weighed by how well this cycle's reports — mood swings, lust, sex, fertility tests and temperatures — fit the pattern your own history shows at that distance from a period. Every one of them is discounted before it is applied, and the total is capped, so they shift the date rather than decide it.",
      typicalLength: "Typical cycle",
      spread: "Predictive spread",
      effectiveSample: "Effective sample",
      effectiveSampleValue: "{value} of {total} cycles",
      effectiveSampleHint:
        "Older cycles count for less, halving every six, so a change in your pattern shows up within a season.",
      degreesOfFreedom: "Degrees of freedom",
      degreesOfFreedomHint:
        "Grows with your history. It is what makes an early forecast honestly wide rather than falsely precise.",
      intervals: "Credible intervals",
      intervalRow: "{percent}%",
      intervalRange: "{start} — {end}",
      intervalWidth: "{count} days wide",
    },

    // The learned yes/no profiles. One set of shared lines — the axis, the
    // baseline, the sample size, the "too thin to use yet" note — because every
    // one of these charts is the same chart of a different answer, and a reader
    // who has understood one has understood all of them.
    binaryProfile: {
      axisLag: "Days before a period",
      baseline: "Rest of the cycle: {percent}",
      sample:
        "From {window} reported days before a period and {baseline} elsewhere.",
      thin: "Log a few more days and this fills in. Until it does, these reports do not move the forecast.",
    },

    // The mood-swing profile the multivariate model learned.
    moodProfile: {
      title: "Your mood pattern",
      chartDesc:
        "How often you reported mood swings at each number of days before a period started.",
    },

    // The two ovulatory yes/no patterns. Their peak sits about a luteal phase
    // before a period rather than up against it, which is the whole reason they
    // are worth reading alongside the mood one.
    lustProfile: {
      title: "Your lust pattern",
      chartDesc:
        "How often you reported raised sex drive at each number of days before a period started.",
    },
    sexProfile: {
      title: "Your sex pattern",
      chartDesc:
        "How often you reported sex at each number of days before a period started.",
      // Said once, under the chart that most invites the wrong reading. A flat
      // chart here is a fact about a life, not a failure to log enough.
      confounded:
        "A flat chart here just means your reports do not follow your cycle — the model then leaves them out rather than reading something into them.",
    },

    // The ovulation-test channel. Constructed rather than learned, so the copy
    // has to say what it rests on: a positive strip is dated evidence, and the
    // number it implies is a lead, not a pattern.
    fertilityTestProfile: {
      title: "Your fertility tests",
      chartDesc:
        "How likely a fertility test is to read positive at each number of days before a period started.",
      lead: "A positive test points at a period about {count} days later.",
      leadLearned:
        "A positive test points at a period about {count} days later — from your own {positives} positive tests and the luteal phase in Settings.",
      counts: "{window} tests taken in the {days} days before a period.",
      none: "No fertility tests logged yet. One positive strip dates ovulation to within a day, which is the sharpest single thing you can tell this forecast.",
    },

    // The temperature profile — the biphasic shift, learned from the reports.
    temperatureProfile: {
      title: "Your temperature pattern",
      chartDesc:
        "How far your waking temperature sat above the rest of the cycle, at each number of days before a period started.",
      axis: "Days before a period · above the rest of your cycle",
      shift: "Rises {amount} after ovulation",
      shiftNone: "No clear shift across the cycle yet",
      sample:
        "From {window} readings before a period and {baseline} elsewhere.",
      thin: "Take a few more morning readings and this fills in. Until it does, your temperatures do not move the forecast.",
      none: "No temperatures reported yet. Adding them is the single biggest thing you can do for this forecast — the rise after ovulation is what pins down when the next period is due.",
    },

    // What this cycle's own reports did to the date.
    shift: {
      earlier: "This cycle's reports moved the forecast {count} days earlier.",
      earlierOne: "This cycle's reports moved the forecast a day earlier.",
      later: "This cycle's reports moved the forecast {count} days later.",
      laterOne: "This cycle's reports moved the forecast a day later.",
      none: "This cycle's reports agree with the cycle history.",
    },

    // The backtest: the model scored against the cycles it did not see.
    accuracy: {
      title: "Track record",
      how: "Each of your past cycles re-predicted from only the cycles before it, a few days ahead — the same test a new cycle will face.",
      meanError: "Average miss",
      meanErrorValue: "{days} days",
      baseline: "Plain average would miss",
      coverage: "{percent}% of {count} cycles",
      coverage80: "80% band held",
      coverage95: "95% band held",
      coverageHint:
        "A band that holds about as often as it claims is a band worth reading.",
      needsMore:
        "Log a few more cycles and this fills in — five are needed before a track record means anything.",
    },

    // The cycle lengths the fit was made from.
    observations: {
      title: "Cycles used",
      row: "{length} days",
      weight: "weight {value}",
      imputed: "split from a longer gap",
      imputedHint:
        "A gap close to a whole number of cycles is read as one you did not log, and counted at half weight.",
    },
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
      "Share of the days you reported in each phase that had mood swings.",
    temperatureChart: "Waking temperature",
    temperatureChartDesc:
      "Your recent waking temperatures. Gaps are mornings with no reading, and fevers, which say nothing about a cycle.",
    temperatureReadings:
      "{count} readings, in {unit}. Gaps are days you skipped.",
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
    temperatureUnit: "Temperature unit",
    celsius: "Celsius",
    fahrenheit: "Fahrenheit",
    temperatureUnitHint:
      "How readings are shown and typed. Your reports are stored the same way either way, so changing this never rewrites a day.",
    forecast: "Forecast",
    forecastDetail: "Detail",
    forecastDetailHint:
      "Advanced adds the model's parameters, the patterns it learned from your reports, and how well it has done on your past cycles. The prediction itself is the same.",
    forecastModel: "Based on",
    forecastModelHint:
      "Cycles + reports also reads this cycle's mood swings, lust, sex, fertility tests and temperatures. Each falls back to cycles alone until there is enough history to learn that pattern.",
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
    devModeHint:
      "Shows the demo document, the log capture switch, the sync log, and the raw document size.",
    demoData: "Demo data",
    demoDataHint:
      "Swap your reports for a year of invented ones — a full cycle history, mood swings before each period, and six months of waking temperatures and ovulation tests. It lives in memory only: nothing is saved, nothing is synced, and reloading the page brings your own reports back.",
    demoDataOn: "Showing demo reports — reload to get yours back",
    demoDataOff: "Back to your own reports",
    captureLogs: "Capture console output",
    captureLogsHint: "Records diagnostic lines so the log below can show them.",
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
