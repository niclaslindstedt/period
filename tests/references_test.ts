// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The references registry, `docs/references.json`, held to the code that
// cites it. Every number the forecast takes from outside the reader's own
// history — the default cycle and luteal phase, the fertile window, the
// temperature rise and the rule that dates it, the windows each channel is
// read over, the statistics underneath — cites its source with a `[ref:<id>]`
// tag beside it, and the registry carries the full record: who, where, the
// DOI or URL, the words the number was taken from, and how strong the
// evidence is. OSS_SPEC.md §24 asks for the same, and `oss-spec validate`
// checks it too; this test is the one a contributor sees first.
//
// The rules are the framework's `auditReferences`: every tag in `src/` names
// an entry; every entry is cited somewhere; each entry's `usedBy` lists
// exactly the files that cite it; each entry carries enough to find the
// source again — plus this app's own fields, a line for the user and a part
// of the forecast to list it under. Below that, the list the About screen
// shows is pinned against the real entries.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditReferences,
  byline,
  byTopic,
  evidenceRank,
  publication,
  referenceList,
  sourceLink,
  unlistedTopics,
} from "@niclaslindstedt/oss-framework/references";

import {
  SUMMARY_LANGUAGES,
  TOPICS,
  type Registry,
} from "../src/app/references.ts";

const root = join(import.meta.dirname, "..");
const registry = JSON.parse(
  readFileSync(join(root, "docs", "references.json"), "utf8"),
) as Registry;

/** Every source file under `src/`, as repo-relative path → text. */
function sources(dir = join(root, "src")): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) Object.assign(out, sources(path));
    else if (/\.(ts|tsx)$/.test(name)) {
      out[relative(root, path)] = readFileSync(path, "utf8");
    }
  }
  return out;
}

describe("the references registry", () => {
  it("agrees with the [ref:…] tags in the code, and every entry is complete", () => {
    expect(
      auditReferences(registry, sources(), {
        languages: SUMMARY_LANGUAGES,
        topics: TOPICS,
      }),
    ).toEqual([]);
  });
});

describe("the references, as the About screen lists them", () => {
  const list = referenceList(registry);

  it("lists every entry once, strongest evidence first", () => {
    expect(list.map((r) => r.id).sort()).toEqual(
      Object.keys(registry.references).sort(),
    );
    const ranks = list.map((r) => evidenceRank(r.evidence));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // The RCOG guideline leads; the health services' pages come last.
    expect(list[0]!.id).toBe("rcog-2016");
    expect(list.at(-1)!.evidence).toBe("health-service");
  });

  it("groups by part of the forecast, with none left unlisted", () => {
    const groups = byTopic(list, TOPICS);
    expect(groups.map((g) => g.topic)).toEqual([
      "cycle",
      "fertility",
      "temperature",
      "mood",
    ]);
    expect(unlistedTopics(list, TOPICS)).toEqual([]);
    // The one dataset behind the most numbers is listed wherever it is used.
    const bull = (topic: string) =>
      groups
        .find((g) => g.topic === topic)!
        .refs.some((r) => r.id === "bull-2019");
    expect(["cycle", "fertility", "temperature"].every(bull)).toBe(true);
  });

  it("cites a paper by its authors and journal, and links its DOI", () => {
    const bull = list.find((r) => r.id === "bull-2019")!;
    expect(byline(bull)).toBe("Bull JR et al.");
    expect(publication(bull)).toBe("npj Digital Medicine 2:83");
    expect(sourceLink(bull)).toBe("https://doi.org/10.1038/s41746-019-0152-7");
  });

  it("cites a health service by its organization, and links its page", () => {
    const fever = list.find((r) => r.id === "1177-feber")!;
    expect(byline(fever)).toBe("1177 (Inera)");
    expect(sourceLink(fever)).toBe(fever.url);
    expect(fever.language).toBe("sv");
  });
});
