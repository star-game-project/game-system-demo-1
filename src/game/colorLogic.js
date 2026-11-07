import { CARD_BY_KEY } from "../data/cards.js";
import { DICE_COLORS } from "../data/diceColors.js";
import { canRemoveFromRun } from "./rewardLogic.js";

/**
 * 連戦中のデッキの色は { cardKey: [1枚目の色, 2枚目の色, …] } で持つ。
 * createDeckFromCounts が作るカードの id は `${key}_${i + 1}` なので、i 番目の色がその1枚の色になる。
 * 枚数（runCounts）とは別に持つことで、現行ルールのデッキの持ち方には手を入れない。
 */

/** 色を1つ等確率で選ぶ。 */
export function rollDiceColor(random = Math.random) {
  return DICE_COLORS[Math.floor(random() * DICE_COLORS.length)].id;
}

/** 連戦を始めるときに、デッキの全カードへ1枚ずつ色を付ける。 */
export function rollRunColors(counts, random = Math.random) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => [key, Array.from({ length: count }, () => rollDiceColor(random))]),
  );
}

/**
 * 報酬を確定したあとの色。rewardLogic.applyReward と同じ条件で入手・削除を反映する。
 * 入手したカードは候補に付いていた色で末尾に足し、削除したカードはその1枚（removeIndex）の色を除く。
 * counts は確定前の枚数。
 */
export function applyRewardColors(
  runColors,
  counts,
  offers,
  { gainKey = null, gainColor = null, removeKey = null, removeIndex = null } = {},
) {
  const next = Object.fromEntries(
    Object.entries(runColors).map(([key, colors]) => [key, [...colors]]),
  );
  if (gainKey && gainColor && offers.includes(gainKey) && CARD_BY_KEY[gainKey]) {
    next[gainKey] = [...(next[gainKey] ?? []), gainColor];
  }
  if (
    removeKey &&
    removeIndex !== null &&
    canRemoveFromRun(counts, removeKey, gainKey) &&
    next[removeKey]?.[removeIndex] !== undefined
  ) {
    next[removeKey].splice(removeIndex, 1);
  }
  return next;
}
