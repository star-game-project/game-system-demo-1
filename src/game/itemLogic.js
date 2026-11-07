import { ITEMS, ITEM_BY_ID, ITEM_RULES } from "../data/items.js";
import { shuffleDeck } from "./deckLogic.js";

/**
 * 所持しているアイテムは id の配列（並び順＝表示順）で持つ。同じアイテムを複数持てる。
 * 連戦中は持ち越し、1戦目からやり直すと空に戻る。
 */

/** いま使えるか。使っても意味がないとき（HPが満タンでの回復など）は使わせない。 */
export function canUseItem(item, player) {
  if (!item) return false;
  if (item.effect.type === "HEAL") return player.hp < player.maxHp;
  return true;
}

/** HPを回復する。最大HPを超えない。実際に回復した量を返す。 */
export function healPlayer(player, amount) {
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  return player.hp - before;
}

/** 報酬の候補。アイテム全体から重複なしで等確率に選ぶ。 */
export function drawItemOffers(random = Math.random, count = ITEM_RULES.OFFER_COUNT) {
  return shuffleDeck(ITEMS.map((item) => item.id), random).slice(0, count);
}

export function canGainItem(items) {
  return items.length < ITEM_RULES.MAX_HELD;
}

/** 報酬を確定する。候補にない・持てる数を超える入手はしない。 */
export function applyItemReward(items, offers, itemKey = null) {
  if (!itemKey || !offers.includes(itemKey) || !ITEM_BY_ID[itemKey]) return [...items];
  if (!canGainItem(items)) return [...items];
  return [...items, itemKey];
}

/** 構築画面で選ぶ持ち込みアイテム（{ id: 個数 }）の合計。 */
export function countStartItems(counts) {
  return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count), 0);
}

export function canAddStartItem(counts, id) {
  return Boolean(ITEM_BY_ID[id]) && countStartItems(counts) < ITEM_RULES.MAX_HELD;
}

/**
 * 持ち込みアイテムを、連戦の最初に持つ所持の配列にする。
 * 並びはアイテム一覧の順。持てる数を超える分は持たない。
 */
export function itemsFromCounts(counts) {
  return ITEMS.flatMap((item) =>
    Array.from({ length: Math.max(0, counts[item.id] ?? 0) }, () => item.id),
  ).slice(0, ITEM_RULES.MAX_HELD);
}
