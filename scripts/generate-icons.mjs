#!/usr/bin/env node
// Generate the PWA install icons and the social-preview image from the same
// geometry as public/icons/icon.svg — a droplet inside a cycle ring, drawn as
// a gradient mark on the app's dark surface (the line-art style shared with the
// sibling notes and contacts apps). Pure Node (zlib + a minimal PNG encoder),
// so the pipeline needs no native image dependencies. Rerun with
// `npm run icons` / `make icons` after changing the mark.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// The install tile's surface (the manifest's background/theme colour, see
// pwa-plugin.ts) and the mark's rose gradient — a distinct hue from the
// green-marked checklist and the blue-marked contacts app. Kept in lockstep
// with the <linearGradient> stops in public/icons/icon.svg.
const BG = [18, 16, 26]; // #12101a
const GRAD_TOP = [253, 164, 175]; // #fda4af
const GRAD_BOT = [225, 29, 72]; // #e11d48
// The gradient runs top-to-bottom over the mark's vertical extent (unit space),
// matching the userSpaceOnUse y1=0.25 / y2=0.76 span in the SVG.
const GRAD_Y0 = 0.25;
const GRAD_Y1 = 0.76;

// The stroke ink at unit-space height `y`, interpolated along the gradient.
function markInk(y) {
  const t = Math.max(0, Math.min(1, (y - GRAD_Y0) / (GRAD_Y1 - GRAD_Y0)));
  return [
    GRAD_TOP[0] + (GRAD_BOT[0] - GRAD_TOP[0]) * t,
    GRAD_TOP[1] + (GRAD_BOT[1] - GRAD_TOP[1]) * t,
    GRAD_TOP[2] + (GRAD_BOT[2] - GRAD_TOP[2]) * t,
  ];
}

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

// Half the stroke width in unit space (SVG stroke-width 8 on the 100 viewBox).
const STROKE_HALF = 0.04;

// Whether unit-space point (x, y) lands on the mark: a droplet sitting inside
// an open cycle ring. Mirrors the <path>/<circle> geometry in
// public/icons/icon.svg.
//
// The ring is broken at the top right — the gap is what makes it read as a
// cycle rather than a plain circle, and it is wide enough (45°) to survive
// being drawn 16 px across in a browser tab.
function inStroke(x, y) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const ring = Math.abs(Math.hypot(dx, dy) - 0.4);
  if (ring < STROKE_HALF) {
    // Angle measured clockwise from twelve o'clock, in turns.
    const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    if (turn < 0.02 || turn > 0.145) return true;
  }
  // The droplet: a disc with a tapering point above it. Filled rather than
  // stroked — an outline this small closes up into a blob anyway, and the
  // solid shape is what stays readable at favicon sizes.
  const R = 0.15;
  const CY = 0.58;
  const TIP = 0.3;
  if (Math.hypot(dx, y - CY) < R) return true;
  if (y >= TIP && y <= CY) {
    // Half-width grows from 0 at the tip to the disc's radius at its centre,
    // eased so the sides meet the disc tangentially instead of creasing.
    const t = (y - TIP) / (CY - TIP);
    if (Math.abs(dx) <= R * Math.pow(t, 1.4)) return true;
  }
  return false;
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
      // Stroke coverage in padded unit space, 3×3 supersampled for smooth
      // edges on the thin outline. The gradient ink is sampled at the pixel's
      // own height so the stroke shades top-to-bottom.
      let hit = 0;
      for (const oy of [1 / 6, 0.5, 5 / 6]) {
        for (const ox of [1 / 6, 0.5, 5 / 6]) {
          const sx = ((px + ox) / size - pad) / (1 - 2 * pad);
          const sy = ((py + oy) / size - pad) / (1 - 2 * pad);
          if (inStroke(sx, sy)) hit += 1 / 9;
        }
      }
      const [br, bg2, bb] = BG;
      const sy = ((py + 0.5) / size - pad) / (1 - 2 * pad);
      const [fr, fg2, fb] = markInk(sy);
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
  const INK = markInk(0.5);

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
        if (inStroke(sx, sy)) [cr, cg, cb] = markInk(sy).map(Math.round);
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
// install icons so the thin outline stays legible at 16 px. Lives at the public
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
