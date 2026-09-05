const CARD_DEFINITIONS = Object.freeze([
  {
    key: "strike_1",
    name: "Strike 1",
    cost: 1,
    attack: 10,
    dieValue: 1,
    count: 2,
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
    count: 2,
    onUseAbility: {
      type: "NEXT_TURN_ATTACK_BONUS",
      value: 5,
      duration: 1,
    },
    passiveAbility: null,
    tacticalAbility: null,
  },
  {
    key: "support_3",
    name: "Support 3",
    cost: 1,
    attack: 5,
    dieValue: 3,
    count: 2,
    onUseAbility: null,
    passiveAbility: {
      type: "RIGHT_CARD_ATTACK_BONUS",
      value: 5,
    },
    tacticalAbility: null,
  },
  {
    key: "strike_4",
    name: "Strike 4",
    cost: 2,
    attack: 15,
    dieValue: 4,
    count: 3,
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
    count: 2,
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
    count: 2,
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
    count: 1,
    onUseAbility: null,
    passiveAbility: {
      type: "WILD_DIE",
    },
    tacticalAbility: null,
  },
  {
    key: "tune_up",
    name: "Tune Up",
    cost: 1,
    attack: 0,
    dieValue: 4,
    count: 2,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: {
      type: "DIE_VALUE_SHIFT",
      value: 1,
    },
  },
  {
    key: "tune_down",
    name: "Tune Down",
    cost: 1,
    attack: 0,
    dieValue: 3,
    count: 2,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: {
      type: "DIE_VALUE_SHIFT",
      value: -1,
    },
  },
  {
    key: "reorder",
    name: "Reorder",
    cost: 1,
    attack: 0,
    dieValue: 2,
    count: 1,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: {
      type: "HAND_POSITION_SWAP",
    },
  },
  {
    key: "recycle",
    name: "Recycle",
    cost: 1,
    attack: 0,
    dieValue: 5,
    count: 1,
    onUseAbility: null,
    passiveAbility: null,
    tacticalAbility: {
      type: "REDRAW_CARD",
    },
  },
]);

export function createDemoDeck() {
  return CARD_DEFINITIONS.flatMap((definition) =>
    Array.from({ length: definition.count }, (_, index) => ({
      ...definition,
      id: `${definition.key}_${index + 1}`,
      // 目は Tune Up / Tune Down で変化するため、初期値を控えておく。
      baseDieValue: definition.dieValue,
      onUseAbility: definition.onUseAbility ? { ...definition.onUseAbility } : null,
      passiveAbility: definition.passiveAbility ? { ...definition.passiveAbility } : null,
      tacticalAbility: definition.tacticalAbility
        ? { ...definition.tacticalAbility }
        : null,
    })),
  );
}

export { CARD_DEFINITIONS };
