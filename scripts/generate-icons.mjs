#!/usr/bin/env node
// Generate the PWA install icons and the social-preview image from the same
// geometry as public/icons/icon.svg — a ring open at the top with an arrowhead
// carrying it back round, drawn in flat green on the app's dark surface. Pure
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
// pwa-plugin.ts) and the mark's ink — flat green, the same treatment as the
// sibling checklist and notes apps, so the three read as one family on a home
// screen. Kept in lockstep with the fill/stroke colours in
// public/icons/icon.svg.
//
// Flat is the whole treatment: one ink, painted at full strength wherever the
// mark covers a pixel and not at all where it doesn't. The only intermediate
// values in the output are antialiasing along an edge. No gradient, no bevel,
// no drop shadow — a home screen already lights icons its own way, and a mark
// carrying its own fake light reads as muddy next to one that doesn't.
const BG = [18, 16, 26]; // #12101a
const INK = [62, 240, 127]; // #3ef07f

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

// The other .ico, and it exists because a resource compiler is not a browser.
//
// `encodeIco` above packs PNG-compressed entries, which every current browser
// and Windows itself read happily. The Windows RESOURCE COMPILER does not:
// `tauri-build` embeds `icons/icon.ico` into the executable through `llvm-rc`
// (or `rc.exe`), and those parse the classic DIB entry rather than a PNG one —
// so the desktop shell's icon is packed the old way instead.
//
// A DIB entry is a `BITMAPINFOHEADER` whose height is DOUBLED, because the
// format still describes two stacked bitmaps: the bottom-up BGRA colour one,
// and a 1-bit AND mask. The mask is all zeroes (every pixel opaque as far as
// it is concerned) and the alpha channel does the real work, which is what
// every 32-bit icon since Windows XP does. Its rows are still padded to four
// bytes, and a parser that reads the header will read them.
function dibEntry(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight — colour + mask
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Bottom-up: the last row of the image is the first row of the DIB.
    const from = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const at = from + x * 4;
      const to = (y * size + x) * 4;
      pixels[to] = rgba[at + 2]; // B
      pixels[to + 1] = rgba[at + 1]; // G
      pixels[to + 2] = rgba[at]; // R
      pixels[to + 3] = rgba[at + 3]; // A
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
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

/** The ring. It is sized to fill the tile rather than to sit politely in the
 *  middle of it: outer radius `R + STROKE_HALF` = 0.375, so the mark spans
 *  three quarters of the box it is drawn in. That is what makes the tile read
 *  as *green* at thumbnail size — a thinner ring on the same dark surface
 *  averages out to a dark square long before it gets small enough to be a
 *  favicon.
 *
 *  `CY` sits below dead centre on purpose: the arrowhead overhangs the top of
 *  the ring, so a circle centred on 0.5 would hang the finished mark high in
 *  the tile. The offset puts the *mark's* bounding box back in the middle,
 *  which is what the eye reads. Recompute it when the head changes size: it is
 *  half the head's overhang past the ring's top. */
const CX = 0.5;
const CY = 0.511;
const R = 0.3;
/** Half the stroke width (SVG stroke-width 15 on the 100 viewBox). */
const STROKE_HALF = 0.075;
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
const HEAD_LEN = 0.26;
const HEAD_HALF_WIDTH = 0.17;

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
// The default is deliberately tight — the mark is drawn to fill its tile, and
// the padding an install icon needs is the launcher's margin, not a second one
// on top of it.
function renderIconRgba(size, { pad = 0.08, radius = 0.2 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = radius * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      // Rounded-rect background coverage, as the signed distance from the
      // pixel's centre to the tile's edge: negative inside, positive outside,
      // so half a pixel either side of zero is the antialiased rim. The
      // `min(max(qx, qy), 0)` term is what makes it hold up in the middle of
      // the tile as well as at a corner — without it the interior distance
      // collapses to −r, which is fine while the corners are round and puts
      // the *whole* square tile on 50% alpha the moment `radius` is 0.
      const half = size / 2;
      const qx = Math.abs(px + 0.5 - half) - (half - r);
      const qy = Math.abs(py + 0.5 - half) - (half - r);
      const outside =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
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
  return rgba;
}

/** The same mark, encoded as a PNG. The desktop `.ico` below needs the raw
 *  pixels instead. */
function renderIcon(size, options) {
  return encodePng(size, size, renderIconRgba(size, options));
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
  // The maskable safe zone is the centre circle of 80% diameter, i.e. radius
  // 0.4. The mark's furthest ink from centre — the arrowhead's outer corner —
  // sits at radius 0.462 of the padded square, so this inset puts it at 0.351
  // and the launcher can crop to any shape it likes without clipping the head.
  renderIcon(512, { pad: 0.12, radius: 0 }),
);
writeFileSync(
  join(iconsDir, "apple-touch-icon-180.png"),
  renderIcon(180, { pad: 0.1, radius: 0 }),
);
writeFileSync(join(root, "public", "og.png"), renderOg());

// favicon.ico — the browser-tab fallback for engines that ignore the SVG
// favicon (Safari, search crawlers) and for the implicit /favicon.ico request.
// Packs the mark at the three classic tab sizes; a hair less padding than the
// install icons, because a tab favicon is drawn small and unrounded and every
// pixel spent on margin is one not spent on the ring. Lives at the public
// root so it deploys as `<base>favicon.ico` (see pwa-plugin.ts link tag).
writeFileSync(
  join(root, "public", "favicon.ico"),
  encodeIco(
    [16, 32, 48].map((size) => ({
      size,
      data: renderIcon(size, { pad: 0.06 }),
    })),
  ),
);

// The native wrapper's assets (native/assets), cut from the same mark so the
// app on a home screen and the PWA on a home screen are one product rather
// than two that resemble each other.
//   icon          — iOS wants a square, fully opaque icon and applies its own
//                   mask, so the tile is not pre-rounded.
//   adaptive-icon — Android masks the foreground to whatever shape the
//                   launcher uses, so the mark is inset to the safe zone and
//                   the tile runs to the edges (app.config.js paints the same
//                   ink behind it).
//   splash-icon   — the launch screen's mark, so this one keeps its rounded
//                   corners.
const nativeAssets = join(root, "native", "assets");
mkdirSync(nativeAssets, { recursive: true });
writeFileSync(join(nativeAssets, "icon.png"), renderIcon(1024, { radius: 0 }));
writeFileSync(
  join(nativeAssets, "adaptive-icon.png"),
  renderIcon(1024, { pad: 0.18, radius: 0 }),
);
writeFileSync(join(nativeAssets, "splash-icon.png"), renderIcon(512));

console.log(
  "icons: wrote pwa-192/512/512-maskable, apple-touch-180, og.png, favicon.ico, " +
    "native icon/adaptive-icon/splash-icon",
);

// The DESKTOP SHELL's icons (tauri/src-tauri/icons/), from the same geometry
// and the same ink as everything above — so the app in the dock, the tile on
// the home screen and the favicon in the tab are one mark rather than three
// that resemble each other.
//
// Two things make this a separate set rather than a reference to `public/`:
//
//   - **Tauri refuses a paletted PNG at COMPILE time**, inside
//     `generate_context!`, with `icon … is not RGBA`. These are RGBA (colour
//     type 6, see `encodePng`), so that is satisfied by construction here —
//     but it is why the sizes are re-rendered rather than symlinked to
//     whichever file happened to be the right shape.
//   - **`tauri-build` refuses a MISSING `icon.ico` outright** on a Windows
//     target ("required for generating a Windows Resource file"), and it must
//     be the DIB flavour a resource compiler can read — see `encodeIcoDib`.
//
// `radius: 0` throughout: every desktop draws its own mask over an app icon
// (macOS its squircle, Windows its square), so a tile that rounded its own
// corners first would sit inside a second rounding.
const tauriIconsDir = join(root, "tauri", "src-tauri", "icons");
mkdirSync(tauriIconsDir, { recursive: true });
const TAURI_SIZES = [32, 128, 256, 512];
for (const size of TAURI_SIZES) {
  writeFileSync(
    join(tauriIconsDir, `${size}x${size}.png`),
    renderIcon(size, { pad: 0.12, radius: 0 }),
  );
}
// Windows' own ladder: 16 and 32 are the ones actually drawn (the title bar,
// the taskbar, Explorer's small views), 48 is the shell's medium icon, and 256
// is what a large-icon view scales from. The three small ones are bitmaps and
// 256 is a PNG, which is the layout every Windows icon has worn since Vista —
// a 256 bitmap would be a quarter-megabyte of uncompressed BGRA in a file the
// repository carries, for the one size the format was extended to compress.
writeFileSync(
  join(tauriIconsDir, "icon.ico"),
  encodeIco([
    ...[16, 32, 48].map((size) => ({
      size,
      data: dibEntry(size, renderIconRgba(size, { pad: 0.08, radius: 0 })),
    })),
    { size: 256, data: renderIcon(256, { pad: 0.08, radius: 0 }) },
  ]),
);
console.log(`icons: wrote ${TAURI_SIZES.length} desktop icons + icon.ico`);
