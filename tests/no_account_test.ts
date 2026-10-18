// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// No build says "no account", in any language (the owner's decision): the copy
// says what is true instead — nothing to sign up for, no sign-in. This reads
// what ships as text — the page shell, the catalogs and the components' own
// strings, and the feature docs — with the comments left out (they talk to the
// code's readers, not the app's) and the lines joined, so a phrase broken
// across two still reads as one.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

const NO_ACCOUNT =
  /\bno\s+accounts?\b|\binget\s+konto\b|\butan\s+(?:något\s+)?konto\b/i;

function* sources(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(?:tsx?|md|html)$/.test(entry.name)) yield path;
  }
}

/** A file's text as it ships: no comments, one line. */
function shipped(path: string): string {
  const text = readFileSync(path, "utf8");
  const bare = /\.(?:md|html)$/.test(path)
    ? text.replace(/<!--[\s\S]*?-->/g, "")
    : text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
  return bare.replace(/\s+/g, " ");
}

describe("the sign-up wording", () => {
  it("says no account nowhere the app ships text", () => {
    const files = [
      join(root, "index.html"),
      ...sources(join(root, "src")),
      ...sources(join(root, "docs", "features")),
    ];
    const saying = files
      .filter((path) => NO_ACCOUNT.test(shipped(path)))
      .map((path) => relative(root, path));
    expect(saying).toEqual([]);
  });
});
