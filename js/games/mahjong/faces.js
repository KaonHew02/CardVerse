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
        5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
        6: [[30, 20], [70, 20], [30, 50], [70, 50], [30, 80], [70, 80]],
        7: [[22, 17], [50, 25], [78, 33], [30, 62], [70, 62], [30, 85], [70, 85]],
        8: [[30, 15], [70, 15], [30, 38], [70, 38], [30, 62], [70, 62], [30, 85], [70, 85]],
        9: [[22, 22], [50, 22], [78, 22], [22, 50], [50, 50], [78, 50], [22, 78], [50, 78], [78, 78]],
    };

    /** How big one pip is, which has to shrink as the count grows. */
    const SIZE = { 1: 28, 2: 18, 3: 16, 4: 17, 5: 15, 6: 14, 7: 12.5, 8: 11, 9: 13 };

    const svg = (body) =>
        `<svg class="tile-art" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;

    /**
     * 筒子 — rings. The one is a single large ring, and the five has a red
     * centre, both of which are on every set worth the name.
     */
    function dots(n) {
        const r = SIZE[n];
        const w = n === 1 ? 7 : n <= 3 ? 5 : 4.4;
        return svg(SPOTS[n].map(([x, y], i) => {
            const hot = n === 1 || (n === 5 && i === 2);
            return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffdf3" stroke="${BLUE}" stroke-width="${w}"/>`
                 + `<circle cx="${x}" cy="${y}" r="${r * 0.36}" fill="${hot ? RED : BLUE}"/>`;
        }).join(''));
    }

    /**
     * 索子 — sticks. The one is the bird, which is the one tile on the set
     * that is a picture rather than a count, so it gets drawn as one.
     */
    function bamboo(n) {
        if (n === 1) return svg(bird());
        const r = SIZE[n];
        const h = r * 1.9;
        const w = Math.max(4.5, r * 0.52);
        return svg(SPOTS[n].map(([x, y]) => {
            const top = y - h / 2;
            return `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" rx="${w / 2}"
                        fill="${GREEN}"/>`
                 + `<rect x="${x - w / 2}" y="${y - w * 0.28}" width="${w}" height="${w * 0.56}"
                        fill="#fffdf3" opacity=".85"/>`;
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
