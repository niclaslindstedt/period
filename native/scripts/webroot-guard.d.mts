// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Types for `webroot-guard.mjs`, which the root tests import.

/** The handle no file in a store app may name. */
export const FORBIDDEN: string;

/** Why a webroot must not ship, one line per problem; empty when it may. */
export function webrootProblems(files: Record<string, Uint8Array>): string[];
