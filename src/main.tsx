// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { render } from "preact";

// The UI family (Inter) is imported statically so it ships in the main bundle
// and precaches for offline first paint. The framework's other font families
// load on demand only if something asks for them, which this app never does —
// there is no font picker to ask.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-ext-700.css";

// The wordmark's family, and the one thing in the app that is not Inter (see
// `TopBar.tsx`). Bold only, in the two Latin subsets, because the *only* text
// set in it is two words in the top bar — a mono stack of weights for a
// four-word lockup would be bytes precached for nothing.
//
// Self-hosted like Inter, from the `@fontsource` package already in the tree:
// the mark has to look the same on every phone, and the system mono stack is a
// different typeface on each one. A webfont host would have been the cheap way
// to get one family everywhere and is exactly the request this app does not
// make — see the network rule in CLAUDE.md. `@fontsource` is bundled at build
// time and served from our own origin, so it costs a request to nobody.
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";

import "./styles.css";
import { App } from "./App.tsx";
import { LanguageRoot } from "./app/i18n/index.ts";

// In dev no worker registers (`usePwaUpdate` runs disabled), but a worker
// installed by a previous `vite preview` on this origin would keep serving
// stale bytes — unregister any so the dev server always wins. The production
// registration is owned by the framework's `usePwaUpdate` in `App.tsx`,
// against the worker `pwa-plugin.ts` emits.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((reg) => void reg.unregister()));
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

// Preact's own `render` mounts straight into the container — there is no root
// object to create. `StrictMode` is gone with it: Preact has no
// double-invoking dev mode, so `preact/compat` only aliases it to a plain
// `Fragment` and wrapping the tree in it would imply a check that never runs.
render(
  <LanguageRoot>
    <App />
  </LanguageRoot>,
  root,
);
