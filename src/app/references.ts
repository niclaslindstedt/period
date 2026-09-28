// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The references: every published source the forecast's numbers rest on, as
// the app reads them.
//
// The registry itself is `docs/references.json`: one entry
// per source, keyed by the id the code cites as `[ref:<id>]` beside the
// number, rule or algorithm it supports — the default cycle and luteal phase,
// the fertile window, the temperature rise and the rule that dates it, the
// windows the evidence channels are read over, and the statistics underneath.
// The machinery over the file — the shape, the evidence ranking, the audit
// that holds it to the tags, the lazy loader and the card — is the
// framework's `references` module, shared with the sibling apps. What is left
// here is what makes it this app's: the parts of the forecast a source is
// listed under, and the registry loaded in a chunk of its own when the About
// screen opens.

import {
  useReferences as useRegistry,
  type Reference as AnyReference,
  type Registry as AnyRegistry,
} from "@niclaslindstedt/oss-framework/references";

/** What a source is listed under on the About screen: the cycle itself, then
 *  the evidence the forecast reads — ovulation, waking temperature, mood. */
export const TOPICS = ["cycle", "fertility", "temperature", "mood"] as const;
export type Topic = (typeof TOPICS)[number];

/** One source, listed under the parts of the forecast it serves. */
export type Reference = AnyReference<Topic>;

/** `docs/references.json`, as stored. */
export type Registry = AnyRegistry<Topic>;

/** The languages every entry's `summary` is written in — the app's own. */
export const SUMMARY_LANGUAGES = ["en"] as const;

// Module level, so the framework's cache knows it on every mount. Bundled
// with the app, never fetched from anywhere else.
const loadRegistry = () =>
  import("../../docs/references.json").then(
    // The JSON's inferred type widens the vocabularies to `string`;
    // `tests/references_test.ts` is what holds the file to `Registry`.
    (m) => m.default as unknown as Registry,
  );

/** Every reference, strongest evidence first, or `null` until the chunk has
 *  landed. */
export function useReferences(): Reference[] | null {
  return useRegistry(loadRegistry);
}
