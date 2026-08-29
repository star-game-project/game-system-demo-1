const CARD_DEFINITIONS = Object.freeze([
  {
    key: "strike_1",
    name: "Strike 1",
    cost: 1,
    attack: 10,
    dieValue: 1,
    count: 4,
    onUseAbility: null,
    passiveAbility: null,
  },
  {
    key: "boost_2",
    name: "Boost 2",
    cost: 2,
    attack: 15,
    dieValue: 2,
    count: 3,
    onUseAbility: {
      type: "NEXT_TURN_ATTACK_BONUS",
      value: 5,
      duration: 1,
    },
    passiveAbility: null,
  },
  {
    key: "support_3",
    name: "Support 3",
    cost: 1,
    attack: 5,
    dieValue: 3,
    count: 3,
    onUseAbility: null,
    passiveAbility: {
      type: "RIGHT_CARD_ATTACK_BONUS",
      value: 5,
    },
  },
  {
    key: "strike_4",
    name: "Strike 4",
    cost: 2,
    attack: 15,
    dieValue: 4,
    count: 4,
    onUseAbility: null,
    passiveAbility: null,
  },
  {
    key: "heavy_5",
    name: "Heavy 5",
    cost: 3,
    attack: 20,
    dieValue: 5,
    count: 3,
    onUseAbility: null,
    passiveAbility: null,
  },
  {
    key: "heavy_6",
    name: "Heavy 6",
    cost: 3,
    attack: 25,
    dieValue: 6,
    count: 3,
    onUseAbility: null,
    passiveAbility: null,
  },
]);

export function createDemoDeck() {
  return CARD_DEFINITIONS.flatMap((definition) =>
    Array.from({ length: definition.count }, (_, index) => ({
      ...definition,
      id: `${definition.key}_${index + 1}`,
      onUseAbility: definition.onUseAbility ? { ...definition.onUseAbility } : null,
      passiveAbility: definition.passiveAbility ? { ...definition.passiveAbility } : null,
    })),
  );
}

export { CARD_DEFINITIONS };
