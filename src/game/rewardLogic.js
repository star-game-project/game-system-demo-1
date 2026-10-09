import { CARD_BY_KEY, CARD_CATALOGUE } from "../data/cards.js";
import { DECK_RULES, REWARD_RULES } from "../data/constants.js";
import { shuffleDeck } from "./deckLogic.js";

/** 報酬の候補。カタログ全体から重複なしで等確率に選ぶ。 */
export function drawRewardOffers(random = Math.random, count = REWARD_RULES.OFFER_COUNT) {
  return shuffleDeck(CARD_CATALOGUE.map((card) => card.key), random).slice(0, count);
}

export function countCards(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/**
 * 削除できるか。戦闘を続けられるよう、入手分を含めた枚数が構築画面の最小枚数を下回る削除はできない。
 * 構築画面のそれ以外の制約（目の上限・同名の上限・最大枚数）は、連戦中のデッキには掛けない。
 */
export function canRemoveFromRun(counts, key, gainKey = null) {
  if ((counts[key] ?? 0) <= 0) return false;
  const totalAfter = countCards(counts) + (gainKey ? 1 : 0) - 1;
  return totalAfter >= DECK_RULES.MIN_DECK_SIZE;
}

/** 報酬を確定する。gainKey は候補から選んだカード、removeKey は削除するカード（どちらも null で省略）。 */
export function applyReward(counts, offers, { gainKey = null, removeKey = null } = {}) {
  const next = { ...counts };
  if (gainKey && offers.includes(gainKey) && CARD_BY_KEY[gainKey]) {
    next[gainKey] = (next[gainKey] ?? 0) + 1;
  }
  if (removeKey && canRemoveFromRun(counts, removeKey, gainKey)) {
    next[removeKey] -= 1;
  }
  return next;
}
