/**
 * カード一覧（カタログ）。デッキはここからプレイヤーが構築する。
 * dieValue は表示・役判定に使う目。wild_die だけは役判定で任意の目として扱う。
 */
const CARD_CATALOGUE = Object.freeze([
  // ---- 攻撃カード ----
  {
    key: "pierce_1",
    name: "Pierce 1",
    cost: 2,
    attack: 18,
    dieValue: 1,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "boost_2",
    name: "Boost 2",
    cost: 2,
    attack: 15,
    dieValue: 2,
    onUseAbility: { type: "NEXT_TURN_ATTACK_BONUS", value: 5, duration: 1 },
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "support_3",
    name: "Support 3",
    cost: 1,
    attack: 5,
    dieValue: 3,
    onUseAbility: null,
    passiveAbility: { type: "RIGHT_CARD_ATTACK_BONUS", value: 5 },
    tacticalAbility: null,
  },
  {
    key: "blade_3",
    name: "Blade 3",
    cost: 2,
    attack: 14,
    dieValue: 3,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "strike_4",
    name: "Strike 4",
    cost: 2,
    attack: 15,
    dieValue: 4,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "hammer_4",
    name: "Hammer 4",
    cost: 3,
    attack: 22,
    dieValue: 4,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "heavy_5",
    name: "Heavy 5",
    cost: 3,
    attack: 20,
    dieValue: 5,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "heavy_6",
    name: "Heavy 6",
    cost: 3,
    attack: 25,
    dieValue: 6,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    // 役判定でのみ任意の目として扱われる。表示上の目は 1。
    key: "wild_die",
    name: "Wild Die",
    cost: 2,
    attack: 10,
    dieValue: 1,
    onUseAbility: null,
    passiveAbility: { type: "WILD_DIE" },
    tacticalAbility: null,
  },

  // ---- 防御カード（攻撃の代わりに使う通常行動。使うとターンが終了する。防御値に役の倍率は掛からない）----
  // 攻撃カードとしては使い道のなかった低攻撃力のカード（旧 Strike 1 / Jab 2）を置き換えたもの。
  {
    key: "brace_1",
    name: "Brace 1",
    cost: 1,
    attack: 0,
    defense: 10,
    dieValue: 1,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "parry_2",
    name: "Parry 2",
    cost: 1,
    attack: 0,
    defense: 10,
    dieValue: 2,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: null,
  },

  // ---- 戦術カード（攻撃せず、ターンも終了しない）----
  {
    key: "tune_up",
    name: "Tune Up",
    cost: 1,
    attack: 0,
    dieValue: 4,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "DIE_VALUE_SHIFT", value: 1 },
  },
  {
    key: "tune_down",
    name: "Tune Down",
    cost: 1,
    attack: 0,
    dieValue: 3,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "DIE_VALUE_SHIFT", value: -1 },
  },
  {
    key: "overclock",
    name: "Overclock",
    cost: 2,
    attack: 0,
    dieValue: 6,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "DIE_VALUE_SHIFT", value: 2 },
  },
  {
    key: "guard",
    name: "Guard",
    cost: 2,
    attack: 0,
    dieValue: 5,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "GAIN_SHIELD", value: 14 },
  },
  {
    key: "double_tap",
    name: "Double Tap",
    cost: 3,
    attack: 0,
    dieValue: 1,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "GRANT_EXTRA_ATTACK", value: 1 },
  },
  {
    key: "reorder",
    name: "Reorder",
    cost: 1,
    attack: 0,
    dieValue: 2,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "HAND_POSITION_SWAP" },
  },
  {
    key: "recycle",
    name: "Recycle",
    cost: 1,
    attack: 0,
    dieValue: 5,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: { type: "REDRAW_CARD" },
  },
]);

export const CARD_BY_KEY = Object.freeze(
  Object.fromEntries(CARD_CATALOGUE.map((card) => [card.key, card])),
);

/** 目の上限を守った初期デッキ（合計20枚）。 */
export const DEFAULT_DECK_COUNTS = Object.freeze({
  brace_1: 1,
  pierce_1: 2,
  double_tap: 1,
  boost_2: 2,
  reorder: 1,
  support_3: 1,
  blade_3: 1,
  tune_down: 1,
  strike_4: 2,
  tune_up: 1,
  heavy_5: 2,
  recycle: 1,
  guard: 1,
  heavy_6: 2,
  wild_die: 1,
});

function instantiate(definition, index) {
  return {
    ...definition,
    id: `${definition.key}_${index + 1}`,
    // 目は Tune Up / Tune Down で変化するため、初期値を控えておく。
    baseDieValue: definition.dieValue,
    onUseAbility: definition.onUseAbility ? { ...definition.onUseAbility } : null,
    passiveAbility: definition.passiveAbility
      ? { ...definition.passiveAbility }
      : null,
    tacticalAbility: definition.tacticalAbility
      ? { ...definition.tacticalAbility }
      : null,
  };
}

/** { cardKey: 枚数 } からデッキの実体を作る。 */
export function createDeckFromCounts(counts) {
  return Object.entries(counts).flatMap(([key, count]) => {
    const definition = CARD_BY_KEY[key];
    if (!definition || count <= 0) return [];
    return Array.from({ length: count }, (_, index) =>
      instantiate(definition, index),
    );
  });
}

export function createDemoDeck() {
  return createDeckFromCounts(DEFAULT_DECK_COUNTS);
}

export { CARD_CATALOGUE };
