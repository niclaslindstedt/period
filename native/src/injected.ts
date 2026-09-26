// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCRIPT THE WRAPPER INJECTS TO WATCH THE PAGE'S CHROME.
//
// The web app is shipped unchanged — nothing in `src/` knows it is running
// inside a native shell, and that is the whole point of a thin wrapper. So
// the one thing native needs from the page is read from the *outside*, by this
// script, over `window.ReactNativeWebView.postMessage`: the RESOLVED THEME
// COLOURS, so the status bar and the safe-area bands match whichever theme
// the reader picked instead of being guessed at.
//
// Nothing else crosses this way. The wrapper does not copy the document out of
// `localStorage` and has no use for it: the iCloud backend is driven from
// inside the page (see `icloudBridge.ts`), which means the day's spans go
// straight from the app's own sync engine to the user's own container without
// this script ever seeing them.
//
// It also unregisters the service worker (see `SW_TEARDOWN`).
//
// This file exports STRINGS, not behaviour: `react-native-webview` takes the
// script as source text. Keep it dependency-free ES5-ish — it runs in the
// page, not in Metro's bundle, so nothing here is transpiled or polyfilled.

/** The message channel. Namespaced so a stray `postMessage` from the page (or
 *  from a future framework feature) is never mistaken for a report. */
export const REPORT_TYPE = "cycle-native/theme";

/** How long a burst of theme reads is allowed to settle before a report goes
 *  out. The theme engine repaints a handful of times while a preset is being
 *  picked, and the status bar has no use for the intermediate frames. */
const REPORT_DEBOUNCE_MS = 200;

/**
 * Take the service worker out of the picture, once, at startup.
 *
 * The wrapper serves the app off local disk, so the worker's offline cache
 * buys nothing here — and it actively hurts: the origin is a fixed
 * `http://localhost:<port>`, so a worker registered by version N of the app
 * keeps answering from its precache after a store update has already unpacked
 * version N+1 into the webroot. The visible symptom is an App Store update
 * that changes nothing until the app is deleted and reinstalled.
 *
 * Everything is guarded: an older WebView with no `caches` or no
 * `serviceWorker` simply skips it.
 */
const SW_TEARDOWN = `
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister(); });
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) { caches.delete(key); });
      }).catch(function () {});
    }
  } catch (e) {}
`;

/**
 * The script injected BEFORE the page loads.
 *
 * Only the service-worker teardown goes here, and it has to: a worker that has
 * already claimed the page is answering fetches by the time the document
 * fires `load`, so unregistering it after the fact leaves this launch on the
 * stale bundle. Reporting waits for the page, since there is no theme to read
 * until the app has mounted.
 */
export const BEFORE_LOAD_SCRIPT = `(function () {${SW_TEARDOWN}})(); true;`;

/**
 * The script injected once the page has loaded.
 *
 * Reports immediately and then whenever the resolved theme could have moved:
 * the reader picked a theme in Settings (a class or attribute on `<html>`),
 * the device switched between light and dark under "follow the device", or
 * the app came back to the foreground having done so while away.
 */
export const AFTER_LOAD_SCRIPT = `(function () {
  if (window.__cycleNativeReporter) return;
  window.__cycleNativeReporter = true;

  function colours() {
    try {
      var style = getComputedStyle(document.documentElement);
      var read = function (name) { return (style.getPropertyValue(name) || "").trim(); };
      return {
        background: read("--page-bg"),
        foreground: read("--fg"),
        muted: read("--muted"),
        accent: read("--accent")
      };
    } catch (e) { return {}; }
  }

  var last = "";
  function report() {
    try {
      if (!window.ReactNativeWebView) return;
      var theme = colours();
      var signature = JSON.stringify(theme);
      if (signature === last) return;
      last = signature;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: ${JSON.stringify(REPORT_TYPE)},
        theme: theme
      }));
    } catch (e) {}
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; report(); }, ${REPORT_DEBOUNCE_MS});
  }

  // The theme engine paints by setting a class and a data attribute on
  // <html>, so watching those two is watching the theme itself — no polling,
  // and no knowledge of which attribute the framework happens to use.
  try {
    var observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });
  } catch (e) {}

  try {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media.addEventListener) media.addEventListener("change", schedule);
    else if (media.addListener) media.addListener(schedule);
  } catch (e) {}

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) schedule();
  });

  // The theme engine paints on the frame after mount, so the very first read
  // can land on an unstyled document. Report now and once again shortly after.
  report();
  setTimeout(report, 400);
})(); true;`;

/** Narrow an arbitrary parsed `postMessage` body to a theme report. */
export function isThemeReport(value: unknown): value is {
  type: string;
  theme: Record<string, string>;
} {
  const message = value as { type?: unknown; theme?: unknown } | null;
  return (
    typeof message === "object" &&
    message !== null &&
    message.type === REPORT_TYPE &&
    typeof message.theme === "object" &&
    message.theme !== null
  );
}

/** What the status bar draws its clock and icons in: `"light"` over a dark
 *  page, `"dark"` over a light one, `"auto"` while there is nothing to go on. */
export type BarStyle = "light" | "dark" | "auto";

/**
 * The status-bar style for the page background the reporter sent.
 *
 * Decided from the colour itself, never from the phone's light/dark setting:
 * the page paints under the status bar, and a reader can pick a dark theme on
 * a phone in light mode (or the other way round), where the system's choice
 * draws dark icons on a dark page. The threshold is perceived luminance
 * (Rec. 601 luma) at one half.
 *
 * `null` — no report yet — and a colour this cannot read (only hex and
 * `rgb()`/`rgba()` are) keep `"auto"`, the behaviour before the page speaks.
 */
export function barStyleFor(background: string | null): BarStyle {
  const rgb = background === null ? null : parseColour(background.trim());
  if (!rgb) return "auto";
  const [r, g, b] = rgb;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.5 ? "light" : "dark";
}

/** Red, green and blue (0–255) from `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 *  `rgb(…)` or `rgba(…)`; `null` for anything else. */
function parseColour(value: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    const digits = hex[1]!;
    const wide =
      digits.length <= 4
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return [0, 2, 4].map((at) => parseInt(wide.slice(at, at + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/i.exec(value);
  if (!fn) return null;
  const parts = fn[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) =>
      part.endsWith("%") ? (parseFloat(part) * 255) / 100 : parseFloat(part),
    );
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as [number, number, number];
}
