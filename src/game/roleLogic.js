import { HAND_ROLES } from "../data/roles.js";

const ROLE_BY_ID = Object.freeze(
  Object.fromEntries(HAND_ROLES.map((role) => [role.id, role])),
);

const NO_ROLE = Object.freeze({
  roleId: null,
  roleName: null,
  multiplier: 1,
});

function toResult(roleId) {
  const role = ROLE_BY_ID[roleId];
  return { roleId: role.id, roleName: role.name, multiplier: role.multiplier };
}

function meetsHandSize(roleId, hand) {
  return hand.length >= (ROLE_BY_ID[roleId].minHandSize ?? 1);
}

export function evaluateHandRole(hand) {
  if (!hand.length) return { ...NO_ROLE };

  const values = hand.map((card) => card.dieValue);
  const uniqueValues = new Set(values);

  if (uniqueValues.size === 1 && meetsHandSize("same_number", hand)) {
    return toResult("same_number");
  }
  if (values.every((value) => value % 2 === 0)) {
    return toResult("even_only");
  }
  if (values.every((value) => value % 2 === 1)) {
    return toResult("odd_only");
  }
  if ([1, 2, 3].every((value) => uniqueValues.has(value))) {
    return toResult("one_two_three");
  }
  return { ...NO_ROLE };
}
