import { evaluateHandRole } from "./roleLogic.js";
import { getPassiveBonus, getTemporaryBonus } from "./abilityLogic.js";

export function calculateAttack(card, hand, playerState, turn) {
  const role = evaluateHandRole(hand);
  const passiveBonus = getPassiveBonus(card, hand);
  const temporaryBonus = getTemporaryBonus(playerState.temporaryEffects, turn);
  const adjustedAttack = card.attack + passiveBonus + temporaryBonus;

  return {
    baseAttack: card.attack,
    passiveBonus,
    temporaryBonus,
    roleId: role.roleId,
    roleName: role.roleName,
    roleMultiplier: role.multiplier,
    finalAttack: Math.max(0, Math.round(adjustedAttack * role.multiplier)),
  };
}
