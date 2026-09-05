export const MIN_DIE_VALUE = 1;
export const MAX_DIE_VALUE = 6;

/** 戦術カードの種類と、必要な対象の数。 */
export const TACTICAL_ABILITIES = Object.freeze({
  DIE_VALUE_SHIFT: { targetCount: 1 },
  HAND_POSITION_SWAP: { targetCount: 2 },
  REDRAW_CARD: { targetCount: 1 },
  // 対象を取らない効果。選択に入らずその場で解決する。
  GAIN_SHIELD: { targetCount: 0 },
  GRANT_EXTRA_ATTACK: { targetCount: 0 },
});

/** 攻撃せずに手札を操作するカードか。 */
export function isTacticalCard(card) {
  return Boolean(card?.tacticalAbility);
}

/** 役判定で任意の目として扱われるカードか。 */
export function isWildCard(card) {
  return card?.passiveAbility?.type === "WILD_DIE";
}

export function requiredTargetCount(card) {
  if (!isTacticalCard(card)) return 0;
  return TACTICAL_ABILITIES[card.tacticalAbility.type]?.targetCount ?? 0;
}

export function clampDieValue(value) {
  return Math.max(MIN_DIE_VALUE, Math.min(MAX_DIE_VALUE, value));
}

/** 対象カードの目を増減する。1〜6の範囲に収める。 */
export function shiftDieValue(hand, targetId, delta) {
  return hand.map((card) =>
    card.id === targetId
      ? { ...card, dieValue: clampDieValue(card.dieValue + delta) }
      : card,
  );
}

/** 手札内での2枚の位置を入れ替える。常在能力の隣接関係が変化する。 */
export function swapHandPositions(hand, firstId, secondId) {
  const first = hand.findIndex((card) => card.id === firstId);
  const second = hand.findIndex((card) => card.id === secondId);
  if (first < 0 || second < 0 || first === second) return hand;

  const next = [...hand];
  [next[first], next[second]] = [next[second], next[first]];
  return next;
}

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
