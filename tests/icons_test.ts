// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's icon has no alpha channel: the App Store refuses an app icon
// that carries one, even when every pixel is opaque. `scripts/generate-icons.mjs`
// writes it as an RGB PNG; this pins the committed file, so a regeneration
// that brings the channel back fails here rather than at upload.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ICON = join(import.meta.dirname, "..", "native", "assets", "icon.png");

/** The chunk types of a PNG, in order. */
function chunkTypes(png: Buffer): string[] {
  const types: string[] = [];
  let pos = 8;
  while (pos + 8 <= png.length) {
    const length = png.readUInt32BE(pos);
    types.push(png.toString("ascii", pos + 4, pos + 8));
    pos += 12 + length;
  }
  return types;
}

describe("the phone app's icon", () => {
  const png = readFileSync(ICON);

  it("is a 1024-pixel square PNG", () => {
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
  });

  it("is RGB, with no alpha channel and no transparent colour", () => {
    expect(png[25]).toBe(2); // colour type: truecolour, no alpha
    expect(chunkTypes(png)).not.toContain("tRNS");
  });
});
