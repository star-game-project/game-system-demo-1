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
