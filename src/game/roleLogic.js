const NO_ROLE = Object.freeze({
  roleId: null,
  roleName: null,
  multiplier: 1,
});

export function evaluateHandRole(hand) {
  if (!hand.length) return { ...NO_ROLE };

  const values = hand.map((card) => card.dieValue);
  const uniqueValues = new Set(values);

  if (uniqueValues.size === 1) {
    return { roleId: "same_number", roleName: "SAME NUMBER", multiplier: 4 };
  }
  if (values.every((value) => value % 2 === 0)) {
    return { roleId: "even_only", roleName: "EVEN", multiplier: 1.5 };
  }
  if (values.every((value) => value % 2 === 1)) {
    return { roleId: "odd_only", roleName: "ODD", multiplier: 1.5 };
  }
  if ([1, 2, 3].every((value) => uniqueValues.has(value))) {
    return { roleId: "one_two_three", roleName: "1-2-3", multiplier: 0.5 };
  }
  return { ...NO_ROLE };
}
