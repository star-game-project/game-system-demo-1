export function getPassiveBonus(card, hand) {
  const cardIndex = hand.findIndex((handCard) => handCard.id === card.id);
  if (cardIndex < 1) return 0;

  const leftCard = hand[cardIndex - 1];
  const ability = leftCard.passiveAbility;
  return ability?.type === "RIGHT_CARD_ATTACK_BONUS" ? ability.value : 0;
}

export function getTemporaryBonus(effects, turn) {
  return effects
    .filter(
      (effect) =>
        effect.type === "ATTACK_BONUS" &&
        turn >= effect.activeFromTurn &&
        turn <= effect.expiresAfterTurn,
    )
    .reduce((total, effect) => total + effect.value, 0);
}

export function createTemporaryEffects(card, currentTurn) {
  const ability = card.onUseAbility;
  if (!ability || ability.type !== "NEXT_TURN_ATTACK_BONUS") return [];

  const duration = ability.duration ?? 1;
  return [
    {
      id: `attack_bonus_${card.id}_${currentTurn}`,
      type: "ATTACK_BONUS",
      value: ability.value,
      activeFromTurn: currentTurn + 1,
      expiresAfterTurn: currentTurn + duration,
      source: card.name,
    },
  ];
}

export function pruneTemporaryEffects(effects, turn) {
  return effects.filter((effect) => effect.expiresAfterTurn >= turn);
}
