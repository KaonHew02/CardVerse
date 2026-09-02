/**
 * CardVerse — avatars, card backs, tables, tile skins.
 *
 * Everything here is CSS or an emoji. No image assets, which is why the whole
 * hub is a folder you can copy and why a new card back is one line in
 * `CATALOG` plus one `.back-<id>` rule in game.css. The tile skins exist in
 * the catalog ahead of Mahjong so the shop and the save format do not change
 * when it lands.
 *
 * Prices are the coin sink beyond room fees. They are deliberately reachable —
 * a cosmetic that takes a month is a cosmetic nobody buys.
 */

(() => {
    'use strict';

    const KEY = () => window.CV.Store.KEYS.cosmetics;

    const CATALOG = {
        avatar: [
            { group: 'Default',             items: [
                { id: '🙂', price: 0 }, { id: '😎', price: 0 }, { id: '🤠', price: 0 }, { id: '🥸', price: 0 },
                { id: '🧑‍💻', price: 0 }, { id: '👩‍🎤', price: 0 }, { id: '🧔', price: 0 }, { id: '👩', price: 0 },
            ] },
            { group: 'Animals',             items: [
                { id: '🐱', price: 300 }, { id: '🐶', price: 300 }, { id: '🦊', price: 400 }, { id: '🐼', price: 400 },
                { id: '🐯', price: 500 }, { id: '🦁', price: 500 }, { id: '🐸', price: 300 }, { id: '🦉', price: 400 },
            ] },
            { group: 'Fantasy',             items: [
                { id: '🧙', price: 800 }, { id: '🧝', price: 800 }, { id: '🧛', price: 800 }, { id: '🐉', price: 1500 },
                { id: '🦄', price: 1000 }, { id: '👻', price: 600 }, { id: '🤖', price: 700 }, { id: '👽', price: 700 },
            ] },
            { group: 'Traditional Chinese', items: [
                { id: '🧧', price: 500 }, { id: '🏮', price: 500 }, { id: '🐲', price: 1200 }, { id: '🎋', price: 400 },
                { id: '🀄', price: 800 }, { id: '🧨', price: 600 }, { id: '🥟', price: 300 }, { id: '🍵', price: 300 },
            ] },
            { group: 'Funny',               items: [
                { id: '🤡', price: 400 }, { id: '💩', price: 200 }, { id: '🥴', price: 300 }, { id: '🫠', price: 300 },
                { id: '🐔', price: 350 }, { id: '🦖', price: 900 }, { id: '🍕', price: 250 }, { id: '🎃', price: 400 },
            ] },
        ],
        back: [
            { id: 'classic', name: 'Classic', price: 0 },
            { id: 'gold',    name: 'Gold',    price: 800 },
            { id: 'dragon',  name: 'Dragon',  price: 1500 },
            { id: 'phoenix', name: 'Phoenix', price: 1500 },
            { id: 'mahjong', name: 'Mahjong', price: 1000 },
            { id: 'lucky',   name: 'Lucky',   price: 2000 },
        ],
        table: [
            { id: 'classic',  name: 'Classic Green', price: 0 },
            { id: 'wood',     name: 'Wood',          price: 600 },
            { id: 'jade',     name: 'Jade',          price: 1200 },
            { id: 'luxury',   name: 'Luxury',        price: 2500 },
            { id: 'night',    name: 'Night',         price: 900 },
            { id: 'festival', name: 'Festival',      price: 1800 },
        ],
        tile: [
            { id: 'classic', name: 'Classic', price: 0 },
            { id: 'jade',    name: 'Jade',    price: 1200 },
            { id: 'gold',    name: 'Gold',    price: 1800 },
            { id: 'modern',  name: 'Modern',  price: 900 },
        ],
    };

    function blank() {
        return {
            owned:    { avatar: [], back: ['classic'], table: ['classic'], tile: ['classic'] },
            equipped: { back: 'classic', table: 'classic', tile: 'classic' },
        };
    }

    let state = null;

    function load() {
        state = Object.assign(blank(), window.CV.Store.get(KEY(), null) || {});
        state.owned    = Object.assign(blank().owned,    state.owned || {});
        state.equipped = Object.assign(blank().equipped, state.equipped || {});
        return state;
    }

    const save = () => window.CV.Store.set(KEY(), state);
    const get  = () => (state || load());

    /** Flat list for a kind; avatars carry their group name. */
    function items(kind) {
        if (kind === 'avatar') {
            return CATALOG.avatar.flatMap((g) => g.items.map((i) => Object.assign({ group: g.group, name: i.id }, i)));
        }
        return CATALOG[kind] || [];
    }

    function find(kind, id) { return items(kind).find((i) => i.id === id) || null; }

    function owns(kind, id) {
        const item = find(kind, id);
        if (!item) return false;
        if (item.price === 0) return true;
        return (get().owned[kind] || []).includes(id);
    }

    /** Buy if affordable. Returns 'owned' | 'bought' | 'broke' | 'missing'. */
    function buy(kind, id) {
        const item = find(kind, id);
        if (!item) return 'missing';
        if (owns(kind, id)) return 'owned';
        if (!window.CV.Profile.spend(item.price)) return 'broke';
        get().owned[kind].push(id);
        save();
        return 'bought';
    }

    function equip(kind, id) {
        if (!owns(kind, id)) return false;
        if (kind === 'avatar') return window.CV.Profile.setAvatar(id);
        get().equipped[kind] = id;
        return save();
    }

    const equipped = (kind) => get().equipped[kind] || 'classic';

    /** Paint the equipped table and card back onto the document. */
    function applyToDocument() {
        const root = document.documentElement;
        root.dataset.table = equipped('table');
        root.dataset.back  = equipped('back');
    }

    function replace(next) {
        state = Object.assign(blank(), next || {});
        return save();
    }

    window.CV = window.CV || {};
    window.CV.Cosmetics = {
        CATALOG, load, save, get, items, find, owns, buy, equip, equipped, applyToDocument, replace,
    };
})();
