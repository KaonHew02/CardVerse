/**
 * CardVerse — drawing a playing card.
 *
 * Cards are CSS: a rank in two corners, a suit in the middle, a face-down
 * back styled from `data-back` on the root element. No sprite sheet, so a
 * new card back is one CSS rule and the folder stays copyable.
 *
 * `html()` returns a string for templating; `el()` a node. Both key on the
 * card's `id` so a re-render can tell a card that moved from a card that is
 * new and animate only the second.
 */

(() => {
    'use strict';

    const CV = window.CV;
    const { rankLabel, SUIT_SYMBOL, SUIT_COLOR, isJoker } = CV.Cards;

    function html(card, opts = {}) {
        const size  = opts.size ? ' card-' + opts.size : '';
        const fresh = opts.fresh ? ' card-fresh' : '';
        if (!card || opts.faceDown) {
            return `<div class="card card-back${size}${fresh}" data-id="${card ? card.id : 'hole'}"><div class="card-back-inner"></div></div>`;
        }
        if (isJoker(card)) {
            const big = card.r === 16;
            return `<div class="card card-joker ${big ? 'red' : 'black'}${size}${fresh}" data-id="${card.id}">
                <span class="card-corner tl">J</span>
                <span class="card-pip">🃏</span>
                <span class="card-corner br">J</span>
            </div>`;
        }
        const r = rankLabel(card.r);
        const s = SUIT_SYMBOL[card.s];
        return `<div class="card ${SUIT_COLOR[card.s]}${size}${fresh}" data-id="${card.id}" aria-label="${r} of ${CV.Cards.SUIT_NAME[card.s]}">
            <span class="card-corner tl">${r}<small>${s}</small></span>
            <span class="card-pip">${s}</span>
            <span class="card-corner br">${r}<small>${s}</small></span>
        </div>`;
    }

    /** `size: 'sm'` shrinks a hand for recaps like the result screen. */
    function el(card, opts) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html(card, opts).trim();
        return tpl.content.firstChild;
    }

    /** A fanned hand, with cards after `freshFrom` flagged as new. */
    function hand(cards, opts = {}) {
        const from = opts.freshFrom === undefined ? cards.length : opts.freshFrom;
        return `<div class="hand${opts.size ? ' hand-' + opts.size : ''}">`
            + cards.map((c, i) => html(c, Object.assign({}, opts, { fresh: i >= from }))).join('')
            + '</div>';
    }

    CV.CardView = { html, el, hand };
})();
