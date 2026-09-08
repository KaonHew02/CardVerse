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

    /* ---- 字牌 ---------------------------------------------------------------
     *
     * 中 and 发 are characters and stay characters. 白 is not one: on a real
     * set the white dragon carries no character at all — it is a blank face
     * inside a drawn blue frame, which is where the name 白板, the white
     * board, comes from. Printing 白 on it captions the tile instead of being
     * it, and at a glance it then reads as just another honour.
     */
    function whiteDragon() {
        return svg(`
            <rect x="13" y="9" width="74" height="82" rx="7"
                  fill="none" stroke="${BLUE}" stroke-width="7"/>
            <rect x="25" y="21" width="50" height="58" rx="4"
                  fill="none" stroke="${BLUE}" stroke-width="2.4" opacity=".7"/>`);
    }

    /* ---- 花牌 ---------------------------------------------------------------
     *
     * "花8" is a label, not a tile. A set's eight flowers are two suits of
     * four — the seasons 春夏秋冬 and the four gentlemen 梅兰菊竹, plum,
     * orchid, chrysanthemum and bamboo — each numbered 1 to 4 in red with the
     * plant drawn underneath. That numbering is why the eighth flower reads
     * as 竹 4 and not as an eight: nobody at a table calls it the eighth
     * flower, and a player holding one had no way to find out what it was.
     */
    const FLOWER_GLYPH = ['春', '夏', '秋', '冬', '梅', '兰', '菊', '竹'];
    const INK = '#1f2a35';

    const f = (n) => Math.round(n * 10) / 10;

    /**
     * A bloom: petals set round a pale centre.
     *
     * `petals` and `thin` are what tell one flower from another at this size
     * — five fat petals read as plum, fourteen narrow ones as chrysanthemum.
     * Nothing else about the two drawings differs.
     */
    function bloom(cx, cy, r, ink, petals = 5, thin = 0.44) {
        const out = [];
        for (let i = 0; i < petals; i++) {
            const deg = -90 + (i * 360) / petals;
            const a = (deg * Math.PI) / 180;
            const px = cx + Math.cos(a) * r * 0.6;
            const py = cy + Math.sin(a) * r * 0.6;
            out.push(`<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(r * 0.5)}" ry="${f(r * thin)}"
                        fill="${ink}" transform="rotate(${f(deg)} ${f(px)} ${f(py)})"/>`);
        }
        return out.join('')
            + `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.28)}" fill="#fffdf3"/>`
            + `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.13)}" fill="${ink}"/>`;
    }

    /** One curved blade, anchored where it joins the stem. */
    function leaf(x, y, len, deg, ink = GREEN, curve = 0.3) {
        const w = f(len * curve);
        return `<path d="M0 0 C ${f(len * 0.34)} ${-w}, ${f(len * 0.7)} ${f(-w * 0.85)}, ${len} 0
                         C ${f(len * 0.7)} ${f(w * 0.5)}, ${f(len * 0.34)} ${f(w * 0.55)}, 0 0 Z"
                 fill="${ink}" transform="translate(${x} ${y}) rotate(${deg})"/>`;
    }

    const stem = (x1, y1, x2, y2, w = 3.2, ink = GREEN) =>
        `<path d="M${x1} ${y1} Q ${f((x1 + x2) / 2 - 7)} ${f((y1 + y2) / 2)} ${x2} ${y2}"
               stroke="${ink}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

    /** Winter grass — three blades off the floor of the tile. */
    const grass = () =>
        stem(20, 98, 40, 44, 2.6) + stem(50, 98, 66, 40, 2.6) + stem(74, 98, 84, 52, 2.6);

    /** A bamboo stalk: a rod banded at its nodes, the way 索子 is drawn. */
    function stalk(x, top, bottom, w) {
        const h = bottom - top;
        return `<rect x="${f(x - w / 2)}" y="${top}" width="${w}" height="${f(h)}" rx="${f(w / 2)}"
                      fill="${GREEN}"/>`
             + [0.32, 0.64].map((k) =>
                 `<rect x="${f(x - w * 0.62)}" y="${f(top + h * k)}" width="${f(w * 1.24)}"
                        height="3" rx="1.5" fill="#fffdf3" opacity=".9"/>`).join('');
    }

    /**
     * The eight plants, one composition each.
     *
     * They sit below the corner marks — roughly y 32 down — and they are the
     * whole point of the tile: the two suits share their numbers, so 春 1 and
     * 梅 1 can only be told apart by what is drawn under them.
     */
    const FLOWER_ART = {
        /* 春 — a peony, open and heavy, with a bud beside it. */
        1: () => stem(50, 98, 50, 64) + leaf(46, 86, 26, 205) + leaf(54, 80, 24, -25)
               + bloom(50, 58, 24, RED, 6) + bloom(28, 76, 11, RED, 5),
        /* 夏 — a lotus on its pad. */
        2: () => leaf(48, 88, 36, 176) + leaf(52, 88, 34, -4) + stem(50, 90, 50, 62, 2.8)
               + bloom(50, 56, 25, RED, 8, 0.32),
        /* 秋 — two blooms on one stalk, the way an autumn spray is drawn. */
        3: () => stem(50, 98, 44, 56) + leaf(48, 84, 24, 208) + leaf(52, 72, 22, -28)
               + bloom(42, 50, 19, RED, 6) + bloom(70, 70, 15, RED, 6),
        /* 冬 — a bloom standing over winter grass. */
        4: () => grass() + bloom(52, 52, 21, RED, 5) + bloom(28, 72, 11, RED, 5),
        /* 梅 — plum: blossoms along a bare branch. */
        5: () => `<path d="M8 98 C 24 84, 32 68, 42 44 M30 70 C 46 68, 60 62, 76 52"
                        stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
               + bloom(44, 40, 15, RED, 5) + bloom(78, 48, 12, RED, 5) + bloom(22, 80, 11, RED, 5),
        /* 兰 — orchid: long leaves thrown wide, one slim bloom. */
        6: () => leaf(50, 96, 46, 194, GREEN, 0.12) + leaf(50, 96, 44, -14, GREEN, 0.12)
               + leaf(50, 96, 34, -56, GREEN, 0.14) + leaf(50, 96, 32, 234, GREEN, 0.14)
               + bloom(52, 44, 14, RED, 5, 0.34),
        /* 菊 — chrysanthemum: a dense head, two rings of narrow petals. */
        7: () => stem(50, 98, 50, 60) + leaf(46, 82, 26, 210) + leaf(54, 74, 24, -30)
               + bloom(50, 54, 26, RED, 14, 0.22) + bloom(50, 54, 16, RED, 10, 0.26),
        /* 竹 — bamboo: two stalks and a spray of leaves. */
        8: () => stalk(38, 36, 98, 12) + stalk(64, 48, 98, 10)
               + leaf(44, 40, 30, -34) + leaf(34, 44, 28, 214) + leaf(70, 52, 24, -22),
    };

    /**
     * A flower's face: its number, its character, and the plant.
     *
     * The seasons carry the number first and the gentlemen carry it second,
     * which is how the two suits are told apart on a real set before either
     * character has been read.
     */
    function flowerFace(n) {
        const i = Math.min(7, Math.max(0, n - 1));
        const seasons = i < 4;
        const num = (i % 4) + 1;
        const head =
            `<text x="${seasons ? 21 : 79}" y="24" text-anchor="middle" font-size="25"
                   font-weight="700" fill="${RED}">${num}</text>`
          + `<text x="${seasons ? 63 : 23}" y="25" text-anchor="middle" font-size="26"
                   font-weight="700" fill="${seasons ? RED : INK}">${FLOWER_GLYPH[i]}</text>`;
        return svg(head + FLOWER_ART[i + 1]());
    }

    /** The face for a numbered tile, drawn. */
    function suitFace(suit, n) {
        if (suit === 'p') return dots(n);
        if (suit === 's') return bamboo(n);
        return characters(n);
    }

    CV.MJFaces = { suitFace, whiteDragon, flowerFace, dots, bamboo, characters,
                   NUMERAL, FLOWER_GLYPH };
})();
