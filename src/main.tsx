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
