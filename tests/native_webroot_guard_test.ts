// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The check `native/scripts/bundle-web.mjs` runs over the phone app's webroot
// before zipping it: the site ships inside the binary, so it carries no
// service worker, and a store app carries no trace of the source.

import { describe, expect, it } from "vitest";

import {
  FORBIDDEN,
  webrootProblems,
} from "../native/scripts/webroot-guard.mjs";

const text = (s: string) => new TextEncoder().encode(s);

describe("the phone app's webroot guard", () => {
  it("passes a shell-edition webroot", () => {
    expect(
      webrootProblems({
        "index.html": text("<!doctype html><title>Cycle</title>"),
        "assets/index-abc123.js": text("console.log('app')"),
        "manifest.webmanifest": text("{}"),
      }),
    ).toEqual([]);
  });

  it("refuses a service worker", () => {
    const problems = webrootProblems({
      "index.html": text("<!doctype html>"),
      "sw.js": text("self.addEventListener('install', () => {})"),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^sw\.js: a service worker/);
  });

  it("refuses a link back to the source", () => {
    const problems = webrootProblems({
      "index.html": text(`<a href="https://github.com/${FORBIDDEN}/period">`),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("index.html");
    expect(problems[0]).toContain("no link to the source");
  });

  it("reports both at once", () => {
    const problems = webrootProblems({
      "sw.js": text(`// ${FORBIDDEN.toUpperCase()}`),
    });
    expect(problems).toHaveLength(2);
  });
});
