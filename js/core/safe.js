/**
 * CardVerse — the values that came from somewhere else.
 *
 * Almost everything in the hub is written by this code and can be trusted on
 * sight: the game registry, the room list, the cosmetics catalogue, the AI
 * personas. Exactly three things are not, and they are the only reason this
 * file exists:
 *
 *   1. **A guest's `hello`** — a name and an avatar typed into another
 *      browser, over WebRTC, by somebody the host may have never met.
 *   2. **A host's snapshot** — the whole table state, including every seat's
 *      name and avatar, sent by a browser the guest has no control over. A
 *      guest trusts its host completely for game rules; it must not trust it
 *      with markup.
 *   3. **An imported backup** — a `.json` file a player was handed, or pulled
 *      from a Drive folder. "Import my save" is a normal thing to ask a friend
 *      for, which makes the file a normal thing for an attacker to offer.
 *
 * All three end up inside a template literal that becomes `innerHTML`. That is
 * the whole bug class: a string that looks like a face but is `<img src=x
 * onerror=…>` runs as script in the reader's browser, with the reader's
 * localStorage — which on a shared `*.github.io` origin is every other game
 * under that account too.
 *
 * So: **anything off the wire or out of a file goes through here first.** The
 * render sites escape as well, because two layers cost nothing and the next
 * person to add a view will not have read this comment.
 */

(() => {
    'use strict';

    /**
     * Keys that are not data even when they arrive looking like data.
     *
     * `JSON.parse('{"__proto__":{"x":1}}')` produces a genuine own enumerable
     * property called `__proto__`, and the moment anything does
     * `target[key] = value` with it, the assignment goes to the setter on
     * `Object.prototype` and re-points the target's prototype instead of
     * storing a field. `Object.assign` and a plain `for…of Object.keys` loop
     * both do exactly that, and both are used on untrusted objects here.
     */
    const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

    const isSafeKey = (key) => !BANNED_KEYS.has(key);

    /**
     * Plain display text: no markup, no control characters, capped by *code
     * point* rather than by UTF-16 unit.
     *
     * The code-point part is not pedantry. `'🧑‍💻'.length` is 5, so the old
     * `.slice(0, 4)` cut a ZWJ emoji mid-surrogate and handed the other end a
     * lone surrogate that renders as a replacement box. A player whose avatar
     * was the developer emoji arrived at every table as `🧑‍�`.
     */
    function text(value, max) {
        const raw = (value === undefined || value === null) ? '' : String(value);
        // Strip the five characters that can end a tag or an attribute, plus
        // control characters and the bidi overrides that make one name render
        // as another.
        //
        // U+200D, the zero-width joiner, is deliberately **not** in the strip
        // list. It is what holds a ZWJ emoji together — 🧑‍💻 is 🧑 + ZWJ + 💻 —
        // and removing it turns one avatar into two glyphs. The neighbouring
        // invisibles are stripped: U+200B/U+200C pad a name out with nothing,
        // and the bidi marks and overrides make a name render as another name.
        const stripped = raw
            .replace(/[<>&"'`]/g, '')
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u001F\u007F-\u009F\u200B\u200C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
            .trim();
        return Array.from(stripped).slice(0, max).join('');
    }

    /** A seat's face. Eight code points is room for any single emoji, ZWJ and all. */
    function avatar(value) {
        return text(value, 8) || '🙂';
    }

    /** A player's name. Sixteen is what the profile screen and `rename()` allow. */
    function name(value, fallback) {
        return text(value, 16) || fallback || 'Player';
    }

    /**
     * A deep copy of parsed JSON with the dangerous keys dropped and the
     * shape bounded.
     *
     * Bounded matters as much as filtered: an imported file is whatever bytes
     * somebody chose, and a thousand-deep nesting or a self-referential blob
     * turns a "restore my save" click into a frozen tab. Depth and breadth
     * both stop well above anything CardVerse actually writes.
     */
    function walk(value, depth, str) {
        if (depth > 12) return null;
        if (typeof value === 'string') return str ? str(value) : value;
        if (value === null || typeof value !== 'object') {
            return (typeof value === 'function' || typeof value === 'symbol') ? null : value;
        }
        if (Array.isArray(value)) {
            return value.slice(0, 5000).map((v) => walk(v, depth + 1, str));
        }
        const out = {};
        let n = 0;
        for (const key of Object.keys(value)) {
            if (!isSafeKey(key)) continue;
            if (++n > 500) break;
            out[key] = walk(value[key], depth + 1, str);
        }
        return out;
    }

    const clean = (value) => walk(value, 0, null);

    /**
     * `clean`, plus every string in the structure stripped of the characters
     * that can end an attribute or open a tag.
     *
     * This is for a host's table snapshot, and it exists because escaping the
     * render sites one at a time does not scale. A snapshot reaches the screen
     * through roughly forty HTML attributes — `data-id` on every card and
     * tile, `data-act` on every button, `class` on every seat badge — and each
     * one is a place a future game adds a forty-first. A card id of
     * `x" onmouseover="…` breaks out of `data-id="…"` and it does not matter
     * how carefully the *text* around it was escaped.
     *
     * Nothing on the wire is prose: a snapshot is ids, enums, flags and
     * numbers. `0-S14`, `hit`, `banker`, `m3-2`. So there is nothing here for
     * the strip to damage, and the result screen — which does carry sentences —
     * comes through its own path and escapes them.
     */
    const wire = (value) => walk(value, 0, (s) => text(s, 200));

    window.CV = window.CV || {};
    window.CV.Safe = { BANNED_KEYS, isSafeKey, text, avatar, name, clean, wire };
})();
