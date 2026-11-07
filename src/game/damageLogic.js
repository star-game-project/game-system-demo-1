import { evaluateHandRole } from "./roleLogic.js";
import { getPassiveBonus, getTemporaryBonus } from "./abilityLogic.js";

/** fixedRole を渡すと、手札から判定せずにその役を使う（Role Lock で固定しているターン）。 */
export function calculateAttack(
  card,
  hand,
  playerState,
  turn,
  roleLevels = {},
  ruleset = "standard",
  fixedRole = null,
) {
  const role = fixedRole ?? evaluateHandRole(hand, roleLevels, ruleset);
  const passiveBonus = getPassiveBonus(card, hand);
  const temporaryBonus = getTemporaryBonus(playerState.temporaryEffects, turn);
  const adjustedAttack = card.attack + passiveBonus + temporaryBonus;

  return {
    baseAttack: card.attack,
    passiveBonus,
    temporaryBonus,
    roles: role.roles,
    roleId: role.roleId,
    roleName: role.roleName,
    roleMultiplier: role.multiplier,
    finalAttack: Math.max(0, Math.round(adjustedAttack * role.multiplier)),
  };
}
