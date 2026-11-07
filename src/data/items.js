/**
 * バトル中に使えるアイテム。戦闘後の報酬で手に入り、連戦中は持ち越す。
 * ポイント不要の使い切りで、自分のターン（カードを使う段階）にいつでも使える。
 * 効果は effect.type で表し、アイテム名ごとの分岐は書かない。
 */
export const ITEMS = Object.freeze([
  Object.freeze({
    id: "heal_potion",
    name: "Heal Potion",
    effect: Object.freeze({ type: "HEAL", value: 20 }),
    description: "HPを20回復する（最大HPを超えない）",
  }),
  Object.freeze({
    id: "role_lock",
    name: "Role Lock",
    effect: Object.freeze({ type: "LOCK_ROLE" }),
    description: "いまの役の倍率を、このターンの終わりまで固定する（カードを使っても崩れない）",
  }),
]);

export const ITEM_BY_ID = Object.freeze(
  Object.fromEntries(ITEMS.map((item) => [item.id, item])),
);

/** 持てる数と、報酬での出し方。 */
export const ITEM_RULES = Object.freeze({
  MAX_HELD: 3,
  OFFER_COUNT: 2,
  MAX_GAINS: 1,
});
