/**
 * CardVerse — the faces on the mahjong tiles.
 *
 * A real tile does not say "1筒". It carries a pattern, and the pattern is
 * how the tile is read across a table without anybody counting. Printing the
 * number instead is legible but it is not mahjong, so the suits are drawn:
 *
 *     筒子  dots      rings, in the traditional arrangement per number
 *     索子  bamboo    sticks, in the same arrangements; 1索 is the bird
 *     万子  characters  the Chinese numeral above 萬, which is how they read
 *
 * The layouts below are the ones on an ordinary set — 3筒 runs on a diagonal,
 * 5筒 has a red centre, 7筒 slants three across the top over a block of four.
 * These are conventions rather than rules, and nothing in the engine reads
 * them: this file is pure appearance and holds no game logic at all.
 */

(() => {
    'use strict';

    const CV = (window.CV = window.CV || {});

    /* Suit colours, kept close to a printed set. */
    const BLUE  = '#1d4f9c';
    const GREEN = '#1d7a45';
    const RED   = '#c62828';

    /**
     * Where the pips sit, on a 0–100 square, for each number. The same
     * arrangements serve dots and bamboo — on a real set they match.
     */
    const SPOTS = {
        1: [[50, 50]],
        2: [[50, 27], [50, 73]],
        3: [[24, 24], [50, 50], [76, 76]],
        4: [[29, 29], [71, 29], [29, 71], [71, 71]],
        5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
        6: [[30, 20], [70, 20], [30, 50], [70, 50], [30, 80], [70, 80]],
        7: [[22, 16], [50, 24], [78, 32], [30, 62], [70, 62], [30, 86], [70, 86]],
        8: [[30, 14], [70, 14], [30, 38], [70, 38], [30, 62], [70, 62], [30, 86], [70, 86]],
        9: [[21, 21], [50, 21], [79, 21], [21, 50], [50, 50], [79, 50], [21, 79], [50, 79], [79, 79]],
    };

    /**
     * How big one pip is, which has to shrink as the count grows.
     *
     * These are radii on the same 0–100 square, and they are **not** free
     * numbers: a ring is drawn `r` wide with a stroke straddling it, so a pip
     * actually occupies `r + width/2`. Two rows 29 apart therefore cannot
     * carry a radius of 13 with a 4.4 stroke — 15.2 either side of each
     * centre overlaps its neighbour, which is what turned 9筒 into a smudge.
     * Every entry below leaves at least three units of felt between pips.
     */
    const SIZE = { 1: 26, 2: 16, 3: 14, 4: 15, 5: 11, 6: 12, 7: 9, 8: 9, 9: 11 };

    /** The ring's stroke, thick enough to read small without closing the hole. */
    const STROKE = { 1: 7, 2: 4.6, 3: 4.2, 4: 4.2, 5: 3.4, 6: 3.6, 7: 3, 8: 3, 9: 3.2 };

    const svg = (body) =>
        `<svg class="tile-art" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;

    /**
     * 筒子 — rings.
     *
     * A real 筒 pip is a coin seen face on: a heavy outer ring, a pale field,
     * and a small solid centre. All three matter at this size — drop the
     * centre and the pip reads as an O, thin the ring and nine of them read
     * as a grey wash.
     *
     * The one is a single large ring with a red core, and the five has a red
     * centre pip; both are on every set worth the name.
     */
    function dots(n) {
        const r = SIZE[n];
        const w = STROKE[n];
        return svg(SPOTS[n].map(([x, y], i) => {
            const hot = n === 1 || (n === 5 && i === 2);
            const ink = hot ? RED : BLUE;
            return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffdf3" stroke="${ink}" stroke-width="${w}"/>`
                 + `<circle cx="${x}" cy="${y}" r="${Math.max(1.6, r * 0.3)}" fill="${ink}"/>`;
        }).join(''));
    }

    /**
     * 索子 — sticks. The one is the bird, which is the one tile on the set
     * that is a picture rather than a count, so it gets drawn as one.
     *
     * A stick is a bamboo segment: a rounded rod with a band across its waist
     * and a cap at each end. Without the band it is a green dash, and nine
     * green dashes are not a tile you can read across a table.
     */
    /**
     * Which sticks are red rather than green, per number.
     *
     * The convention on an ordinary set: the centre of 5索 and the slanted
     * top row of 7索. It is decoration, not a rule — nothing reads it — but
     * it is one of the things that makes a drawn tile look like a tile
     * instead of a diagram.
     */
    const RED_STICKS = { 5: [2], 7: [0, 1, 2] };

    function bamboo(n) {
        if (n === 1) return svg(bird());
        const r = SIZE[n];
        const h = r * 2.2;
        const w = Math.max(6, r * 0.85);
        const red = RED_STICKS[n] || [];
        return svg(SPOTS[n].map(([x, y], i) => {
            const top = y - h / 2;
            const cap = w * 1.15;
            const ink = red.includes(i) ? RED : GREEN;
            return `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" rx="${w / 2}"
                        fill="${ink}"/>`
                 + `<rect x="${x - cap / 2}" y="${y - h * 0.08}" width="${cap}" height="${h * 0.16}"
                        rx="${h * 0.05}" fill="#fffdf3" opacity=".92"/>`
                 + `<rect x="${x - w * 0.34}" y="${top + h * 0.1}" width="${w * 0.24}" height="${h * 0.26}"
                        rx="${w * 0.12}" fill="#fffdf3" opacity=".38"/>`;
        }).join(''));
    }

    /** A sparrow, in as few strokes as will still read as one. */
    function bird() {
        return `
            <path d="M50 14 C60 20 63 32 58 42 C70 46 78 58 74 72 C68 86 52 90 42 82
                     C32 74 32 60 40 52 C34 42 38 24 50 14 Z" fill="${GREEN}"/>
            <path d="M50 24 C56 30 56 40 50 46 C44 40 44 30 50 24 Z" fill="#fffdf3" opacity=".8"/>
            <circle cx="46" cy="30" r="3.4" fill="#fffdf3"/>
            <path d="M42 82 L34 92 M56 86 L60 94" stroke="${RED}" stroke-width="4"
                  stroke-linecap="round" fill="none"/>`;
    }

    /** 万子 — the numeral over 萬, the way the tile is actually printed. */
    const NUMERAL = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    function characters(n) {
        return `<span class="tile-wan"><b>${NUMERAL[n - 1]}</b><i>萬</i></span>`;
    }

    /** The face for a numbered tile, drawn. */
    function suitFace(suit, n) {
        if (suit === 'p') return dots(n);
        if (suit === 's') return bamboo(n);
        return characters(n);
    }

    CV.MJFaces = { suitFace, dots, bamboo, characters, NUMERAL };
})();
