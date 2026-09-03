/**
 * CardVerse — the logo, generated.
 *
 *     node tools/build-logo.mjs
 *
 * Writes every variant into `assets/logo/`. **Never hand-edit those files** —
 * edit the numbers below and re-run, or the variants drift apart and the
 * favicon stops matching the header.
 *
 * The idea: a fan of five cards, one per suit, with a mahjong tile standing
 * taller at the centre. The fan is the "every game" — cards *and* tiles,
 * which is the split the hub itself is built around; the arc is the "verse"
 * they sit in. It survives being shrunk because the silhouette is a fan
 * before it is any particular card.
 *
 * Suits are drawn as paths, not text, so the mark renders identically in
 * GitHub's SVG viewer, a browser tab and a Drive preview. The wordmark IS
 * text, deliberately — it resolves to the same system sans the app itself
 * uses, so the logo and the running app never disagree about their voice.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logo');

/* ---- palette (kept in step with css/global.css) ------------------------- */

const C = {
    ink:    '#131a21',   // badge, deepest
    ink2:   '#1f2a36',   // badge top, for the vertical lift
    gold:   '#f5b942',
    gold2:  '#c98a12',
    card:   '#ffffff',
    tile:   '#f4efe0',   // mahjong ivory
    red:    '#d0202e',
    black:  '#1a222c',
    jade:   '#1d6b3f',
    edge:   'rgba(0,0,0,.18)',
};

/* ---- suit paths, drawn in a 0..24 box ---------------------------------- */

const HEART = 'M12,22.2 C12,22.2 1.2,14.6 1.2,7.9 C1.2,4.1 4.2,1.6 7.4,1.6 '
            + 'C9.6,1.6 11.1,2.8 12,4.3 C12.9,2.8 14.4,1.6 16.6,1.6 '
            + 'C19.8,1.6 22.8,4.1 22.8,7.9 C22.8,14.6 12,22.2 12,22.2 Z';

const DIAMOND = 'M12,1.4 L22.2,12 L12,22.6 L1.8,12 Z';

/** A spade is a heart upside down with a stem — so it can literally be one. */
const STEM = 'M12,15.5 C12,18.6 11.2,21.2 8.7,23.2 L15.3,23.2 C12.8,21.2 12,18.6 12,15.5 Z';

const suit = (kind, fill) => {
    if (kind === 'heart')   return `<path d="${HEART}" fill="${fill}"/>`;
    if (kind === 'diamond') return `<path d="${DIAMOND}" fill="${fill}"/>`;
    if (kind === 'spade') {
        return `<g fill="${fill}">`
             + `<g transform="translate(0 23.6) scale(1 -1)"><path d="${HEART}"/></g>`
             + `<path d="${STEM}"/></g>`;
    }
    // Club: three circles and the same stem. Circles beat arcs here — an arc
    // sweep flag typo is invisible until it is enormous.
    return `<g fill="${fill}">`
         + `<circle cx="12" cy="6.6" r="5.1"/>`
         + `<circle cx="6.4" cy="14.6" r="5.1"/>`
         + `<circle cx="17.6" cy="14.6" r="5.1"/>`
         + `<path d="${STEM}"/></g>`;
};

/** 中 — the red dragon tile, built from rectangles so it stays crisp small. */
const tileGlyph = (fill) =>
    `<g fill="${fill}">`
    + `<path d="M6.5,5.2 h11 a1.6,1.6 0 0 1 1.6,1.6 v8.4 a1.6,1.6 0 0 1 -1.6,1.6 h-11 `
    + `a1.6,1.6 0 0 1 -1.6,-1.6 v-8.4 a1.6,1.6 0 0 1 1.6,-1.6 z `
    + `m1.9,3.1 v5.4 h7.2 v-5.4 z"/>`
    + `<rect x="10.7" y="1.6" width="2.6" height="20.8" rx="1"/>`
    + `</g>`;

/* ---- one card in the fan ----------------------------------------------- */

function card({ cx, cy, w, h, angle, pivot, fill, glyph, glyphScale = 1, lift = 0.19, edge = 1.6 }) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const g = 24 * glyphScale;                 // glyph box side
    const gx = cx - g / 2;

    // The glyph sits high on the card, not centred. In a fan each card covers
    // most of the one behind it, and a centred pip is exactly the part that
    // gets covered — so all you see is five white slivers. Lifting the pips
    // above the overlap line is what makes it read as five distinct suits.
    const gy = cy - h * lift - g / 2;

    return `
    <g transform="rotate(${angle.toFixed(2)} ${pivot[0]} ${pivot[1]})">
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="${(w * 0.15).toFixed(1)}"
            fill="${fill}" stroke="${C.ink}" stroke-width="${edge}" stroke-linejoin="round"/>
      <g transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)}) scale(${glyphScale})">${glyph}</g>
    </g>`;
}

/**
 * The fan. `n` cards, the middle one a mahjong tile when `tile` is on.
 * Angles are symmetric about vertical, so the mark is never lopsided.
 */
function fan({ cx, cy, w, h, spread, radius, n = 5, edge = 1.6, glyph = 0.66 }) {
    const pivot = [cx, cy + radius];
    const order = n === 5
        ? ['spade', 'heart', 'tile', 'diamond', 'club']
        : ['spade', 'tile', 'heart'];
    const colour = { spade: C.black, club: C.black, heart: C.red, diamond: C.red };

    // Draw outward-in so the centre tile lands on top of its neighbours.
    const mid = (n - 1) / 2;
    return order
        .map((kind, i) => ({ kind, i }))
        .sort((a, b) => Math.abs(b.i - mid) - Math.abs(a.i - mid))
        .map(({ kind, i }) => {
            const angle = (i - mid) * spread;
            const isTile = kind === 'tile';
            const cw = isTile ? w * 0.96 : w;
            return card({
                cx, cy: isTile ? cy - h * 0.05 : cy,
                w: cw,
                h: isTile ? h * 1.16 : h,
                angle, pivot, edge,
                fill: isTile ? C.tile : C.card,
                glyph: isTile ? tileGlyph(C.red) : suit(kind, colour[kind]),
                // The tile's 中 is a taller glyph and sits nearer the middle;
                // the suits ride high where the fan does not cover them.
                glyphScale: cw / 24 * (isTile ? glyph * 0.92 : glyph),
                lift: isTile ? 0.10 : 0.20,
            });
        }).join('');
}

/* ---- pieces ------------------------------------------------------------- */

const defs = `
  <defs>
    <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink2}"/><stop offset="1" stop-color="${C.ink}"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.gold2}"/>
    </linearGradient>
  </defs>`;

const badge = (s) => `
  <rect x="1.5" y="1.5" width="${s - 3}" height="${s - 3}" rx="${s * 0.22}" fill="url(#badge)"/>
  <rect x="1.5" y="1.5" width="${s - 3}" height="${s - 3}" rx="${s * 0.22}"
        fill="none" stroke="url(#ring)" stroke-width="3"/>`;

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const wordmark = ({ x, y, size, anchor = 'start', slogan = true, light = true }) => `
  <text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="800"
        letter-spacing="${(size * 0.11).toFixed(2)}" text-anchor="${anchor}"
        fill="${light ? '#ffffff' : C.ink}">CARDVERSE</text>
  ${slogan ? `<text x="${x}" y="${(y + size * 0.78).toFixed(1)}" font-family="${FONT}"
        font-size="${(size * 0.30).toFixed(2)}" font-weight="600"
        letter-spacing="${(size * 0.055).toFixed(2)}" text-anchor="${anchor}"
        fill="${C.gold}">ONE WORLD. EVERY GAME.</text>` : ''}`;

const svg = (w, h, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="CardVerse">${defs}${body}\n</svg>\n`;

/* ---- variants ----------------------------------------------------------- */

/** Square badge, five cards — app icon, tab, anywhere square. */
const mark = svg(128, 128,
    badge(128) + fan({ cx: 64, cy: 62, w: 30, h: 52, spread: 18, radius: 58 }));

/**
 * Favicon. Three cards, no tile glyph subtleties, fatter shapes — at 16px the
 * five-card fan turns to mush, so this one is redrawn rather than scaled.
 */
const icon = svg(64, 64,
    badge(64) + fan({ cx: 32, cy: 30, w: 20, h: 30, spread: 24, radius: 26, n: 3, edge: 2.2, glyph: 0.78 }));

/** Just the fan, no badge — for placing on a coloured surface. */
const glyphOnly = svg(128, 112,
    fan({ cx: 64, cy: 54, w: 30, h: 52, spread: 18, radius: 58 }));

/** Stacked lockup — splash screens, the README hero. */
const logo = svg(320, 300,
    `<rect width="320" height="300" rx="24" fill="${C.ink}"/>`
    + `<g transform="translate(96 26)">${badge(128)}${fan({ cx: 64, cy: 62, w: 30, h: 52, spread: 18, radius: 58 })}</g>`
    + wordmark({ x: 160, y: 218, size: 36, anchor: 'middle' }));

/** Horizontal lockup — social preview, wide headers. */
const wide = svg(640, 200,
    `<rect width="640" height="200" rx="20" fill="${C.ink}"/>`
    + `<g transform="translate(44 36)">${badge(128)}${fan({ cx: 64, cy: 62, w: 30, h: 52, spread: 18, radius: 58 })}</g>`
    + wordmark({ x: 208, y: 104, size: 44 }));

/** The same, transparent — for pasting onto anything. */
const wideTrim = svg(640, 200,
    `<g transform="translate(44 36)">${badge(128)}${fan({ cx: 64, cy: 62, w: 30, h: 52, spread: 18, radius: 58 })}</g>`
    + wordmark({ x: 208, y: 104, size: 44 }));

/* ---- write -------------------------------------------------------------- */

mkdirSync(OUT, { recursive: true });

const files = {
    'cardverse-mark.svg': mark,
    'cardverse-icon.svg': icon,
    'cardverse-glyph.svg': glyphOnly,
    'cardverse-logo.svg': logo,
    'cardverse-wide.svg': wide,
    'cardverse-wide-trim.svg': wideTrim,
};

for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(OUT, name), body, 'utf8');
    console.log(`  ${name.padEnd(26)} ${String(body.length).padStart(5)} bytes`);
}

/**
 * The favicon goes inline in index.html as a data URI, so the tab icon needs
 * no network request and cannot 404. Printed here to be pasted in; keep it on
 * one line.
 */
const faviconHref = 'data:image/svg+xml,' + encodeURIComponent(icon.replace(/\n\s*/g, ' ')).replace(/'/g, '%27');
writeFileSync(join(OUT, 'favicon-datauri.txt'), faviconHref, 'utf8');
console.log(`\n  favicon data URI → assets/logo/favicon-datauri.txt (${faviconHref.length} chars)`);
