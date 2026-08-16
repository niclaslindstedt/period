#!/usr/bin/env node
// Generate the PWA install icons and the social-preview image from the same
// geometry as public/icons/icon.svg — a ring open at the top with an arrowhead
// carrying it back round, drawn in flat mint on the app's dark surface. Pure
// Node (zlib + a minimal PNG encoder), so the pipeline needs no native image
// dependencies. Rerun with `npm run icons` / `make icons` after changing the
// mark.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// The install tile's surface (the manifest's background/theme colour, see
// pwa-plugin.ts) and the mark's ink — flat mint, the same treatment as the
// sibling checklist and notes apps, so the three read as one family on a home
// screen. Kept in lockstep with the fill/stroke colours in
// public/icons/icon.svg.
const BG = [18, 16, 26]; // #12101a
const INK = [110, 231, 165]; // #6ee7a5

// --- minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Pack already-encoded PNG blobs into a single ICONDIR (a .ico file). PNG-
// compressed entries are honoured by every current browser and by Windows
// since Vista, so one .ico carrying 16/32/48 px PNGs is the whole legacy-
// favicon story — the raster fallback for tabs that don't render the SVG mark.
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // resource type: icon
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = header.length + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const e = dir.subarray(i * 16);
    e[0] = size >= 256 ? 0 : size; // width  (0 encodes 256)
    e[1] = size >= 256 ? 0 : size; // height (0 encodes 256)
    e[2] = 0; // palette size (0 for a true-colour PNG entry)
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8); // bytes in this entry
    e.writeUInt32LE(offset, 12); // byte offset from the file start
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark ----------------------------------------------------------------

// The mark: a ring open at the top, with an arrowhead carrying it back round —
// a cycle, drawn as the one shape that says "this comes round again" without
// saying anything else. The app is named for the cycle rather than for one
// phase of it, and the mark follows: what it draws is the return, not the
// bleeding.
//
// Unlike the traced curve it replaces, this shape is analytic, so `inStroke`
// below is the definition rather than a sampling of one: a pixel is on the
// mark if it lies within half a stroke of the ring (at an angle outside the
// gap), or within half a stroke of either arc end (the round caps), or inside
// the arrowhead triangle. That is what an SVG renderer does with
// public/icons/icon.svg too, which is why the .ico and the .svg agree.
//
// Everything below is unit space — the 100 viewBox divided by 100 — and is
// mirrored into public/icons/icon.svg by hand.

/** The ring. `CY` sits below dead centre on purpose: the arrowhead overhangs
 *  the top of the ring, so a circle centred on 0.5 would hang the finished
 *  mark high in the tile. The offset puts the *mark's* bounding box back in
 *  the middle, which is what the eye reads. */
const CX = 0.5;
const CY = 0.524;
const R = 0.23;
/** Half the stroke width (SVG stroke-width 11 on the 100 viewBox). */
const STROKE_HALF = 0.055;
/** The gap the arrowhead points into: 90° centred on straight up, in degrees
 *  measured counter-clockwise from due east. The arc is every other angle.
 *  A quarter of the ring is a lot to give away, and it is the 16 px favicon
 *  that asks for it — at that size a tighter gap closes up under rounding and
 *  the mark stops reading as a ring that goes somewhere. */
const GAP_FROM = 45;
const GAP_TO = 135;

/** The unit-space point at angle `deg` and radius `r`. */
function at(deg, r) {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

/** The arc's two ends. Travel round the ring is clockwise, which means it
 *  *starts* at `GAP_FROM` and *ends* at `GAP_TO` — so the plain round cap is
 *  the one at `GAP_FROM`, and the head goes on the other. */
const CAP_END = at(GAP_FROM, R);

/** The arrowhead's length from its base and its half-width. Both are generous
 *  for the size the mark is drawn at, because this is the one detail that has
 *  to survive being resampled to 16 px: a head scaled to look right at 512 px
 *  resolves to a blunt stub there, and the mark reads as a power symbol. */
const HEAD_LEN = 0.24;
const HEAD_HALF_WIDTH = 0.13;

/** The head's three corners: an isoceles triangle on the tangent at the arc's
 *  finishing end, and centred on the stroke, so it flares by the same amount
 *  either side of the line it finishes. That tangent points up and to the
 *  right, into the gap — which is what makes the eye close the circle the way
 *  the arrow travels. */
const HEAD = (() => {
  const a = (GAP_TO * Math.PI) / 180;
  const t = [Math.sin(a), Math.cos(a)]; // the clockwise tangent, screen coords
  const n = [-t[1], t[0]];
  const base = at(GAP_TO, R);
  return [
    [base[0] + HEAD_LEN * t[0], base[1] + HEAD_LEN * t[1]],
    [base[0] + HEAD_HALF_WIDTH * n[0], base[1] + HEAD_HALF_WIDTH * n[1]],
    [base[0] - HEAD_HALF_WIDTH * n[0], base[1] - HEAD_HALF_WIDTH * n[1]],
  ];
})();

/** Whether unit-space point (x, y) lands on the mark. Mirrors the two <path>
 *  elements in public/icons/icon.svg. */
function inStroke(x, y) {
  // The ring band, at every angle the gap does not claim.
  const dx = x - CX;
  const dy = CY - y; // flip so the angle reads counter-clockwise from east
  if (Math.abs(Math.hypot(dx, dy) - R) < STROKE_HALF) {
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    if (deg <= GAP_FROM || deg >= GAP_TO) return true;
  }
  // The round cap finishing the arc where it starts. The other end needs none
  // — the head is set flush on it and swallows it whole.
  if (Math.hypot(x - CAP_END[0], y - CAP_END[1]) < STROKE_HALF) return true;
  // The arrowhead: inside iff the point falls on the same side of all three
  // edges, which is sign-agnostic and so needs no winding convention.
  const [a, b, c] = HEAD;
  const side = (p, q) =>
    (q[0] - p[0]) * (y - p[1]) - (x - p[0]) * (q[1] - p[1]);
  const s1 = side(a, b);
  const s2 = side(b, c);
  const s3 = side(c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

// Render size×size RGBA. `pad` insets the mark (maskable icons need a safe
// zone); `radius` rounds the background corners (0 = square, for maskable).
function renderIcon(size, { pad = 0.12, radius = 0.2 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = radius * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      // Rounded-rect background coverage.
      const dx = Math.max(r - px, px - (size - 1 - r), 0);
      const dy = Math.max(r - py, py - (size - 1 - r), 0);
      const outside = Math.hypot(dx, dy) - r;
      const bgAlpha = Math.max(0, Math.min(1, 0.5 - outside));
      // Mark coverage in padded unit space, 3×3 supersampled so the ring's
      // curve and the arrowhead's edges stay smooth at every size.
      let hit = 0;
      for (const oy of [1 / 6, 0.5, 5 / 6]) {
        for (const ox of [1 / 6, 0.5, 5 / 6]) {
          const sx = ((px + ox) / size - pad) / (1 - 2 * pad);
          const sy = ((py + oy) / size - pad) / (1 - 2 * pad);
          if (inStroke(sx, sy)) hit += 1 / 9;
        }
      }
      const [br, bg2, bb] = BG;
      const [fr, fg2, fb] = INK;
      rgba[i] = Math.round(br + (fr - br) * hit);
      rgba[i + 1] = Math.round(bg2 + (fg2 - bg2) * hit);
      rgba[i + 2] = Math.round(bb + (fb - bb) * hit);
      rgba[i + 3] = Math.round(bgAlpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

// The 1200×630 Open Graph card: the mark on the left, a month of day cells on
// the right with a run of them filled — the app's whole idea in one glance.
function renderOg() {
  const w = 1200;
  const h = 630;
  const rgba = Buffer.alloc(w * h * 4);
  const markSize = 440;
  const markX = 110;
  const markY = (h - markSize) / 2;

  // A 7×4 grid of day cells. The filled run is a period; the ringed cells are
  // the predicted next one, matching the Forecast screen's calendar legend.
  const CELL = 44;
  const GAP = 14;
  const gridX = 660;
  const gridY = 170;
  const bleeding = new Set([8, 9, 10, 11, 12]);
  const predicted = new Set([22, 23, 24, 25, 26]);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      let [cr, cg, cb] = BG;

      if (
        px >= markX &&
        px < markX + markSize &&
        py >= markY &&
        py < markY + markSize
      ) {
        const sx = (px - markX) / markSize;
        const sy = (py - markY) / markSize;
        if (inStroke(sx, sy)) [cr, cg, cb] = INK;
      }

      const col = Math.floor((px - gridX) / (CELL + GAP));
      const row = Math.floor((py - gridY) / (CELL + GAP));
      if (col >= 0 && col < 7 && row >= 0 && row < 4) {
        const cx = gridX + col * (CELL + GAP) + CELL / 2;
        const cy = gridY + row * (CELL + GAP) + CELL / 2;
        const r = Math.hypot(px - cx, py - cy);
        const index = row * 7 + col;
        const alpha = bleeding.has(index)
          ? r <= CELL / 2
            ? 1
            : 0
          : predicted.has(index)
            ? r <= CELL / 2 && r >= CELL / 2 - 4
              ? 0.8
              : 0
            : r <= CELL / 2
              ? 0.14
              : 0;
        if (alpha > 0) {
          cr = Math.round(BG[0] + (INK[0] - BG[0]) * alpha);
          cg = Math.round(BG[1] + (INK[1] - BG[1]) * alpha);
          cb = Math.round(BG[2] + (INK[2] - BG[2]) * alpha);
        }
      }

      rgba[i] = cr;
      rgba[i + 1] = cg;
      rgba[i + 2] = cb;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(w, h, rgba);
}

writeFileSync(join(iconsDir, "pwa-192.png"), renderIcon(192));
writeFileSync(join(iconsDir, "pwa-512.png"), renderIcon(512));
writeFileSync(
  join(iconsDir, "pwa-512-maskable.png"),
  renderIcon(512, { pad: 0.22, radius: 0 }),
);
writeFileSync(
  join(iconsDir, "apple-touch-icon-180.png"),
  renderIcon(180, { pad: 0.12, radius: 0 }),
);
writeFileSync(join(root, "public", "og.png"), renderOg());

// favicon.ico — the browser-tab fallback for engines that ignore the SVG
// favicon (Safari, search crawlers) and for the implicit /favicon.ico request.
// Packs the mark at the three classic tab sizes; a hair less padding than the
// install icons so the ring's gap stays legible at 16 px. Lives at the public
// root so it deploys as `<base>favicon.ico` (see pwa-plugin.ts link tag).
writeFileSync(
  join(root, "public", "favicon.ico"),
  encodeIco(
    [16, 32, 48].map((size) => ({
      size,
      data: renderIcon(size, { pad: 0.08 }),
    })),
  ),
);
console.log(
  "icons: wrote pwa-192/512/512-maskable, apple-touch-180, og.png, favicon.ico",
);
