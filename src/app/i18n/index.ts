// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's i18n runtime, built once from the framework's `createI18n` factory
// over the app's own catalog. The app owns the strings; the framework owns the
// machinery that loads, caches, resolves, and re-renders against them —
// including the first-paint gate `LanguageRoot` provides.
//
// English is the only language today. The runtime is here from the start
// anyway: retro-fitting `t()` across finished screens is the expensive version
// of this, and adding a second catalog is now one `loaders` entry plus one
// translated file.

import { createI18n } from "@niclaslindstedt/oss-framework/i18n";

import { en, type Catalog } from "./en.ts";

export type Lang = "en";
export type { Catalog };

export const i18n = createI18n<Lang, Catalog>({
  fallbackLang: "en",
  fallbackCatalog: en,
  toBcp47: () => "en-GB",
  storageKey: "period:language",
  eventName: "period:language",
});

export const { LanguageRoot, useT, useLang, setLanguage, supportedLangs } =
  i18n;

/** The translate function `useT()` returns — a message key (optionally with
 *  interpolation params) to a resolved string. Handy where copy is composed
 *  outside a component. */
export type TFn = ReturnType<typeof useT>;
