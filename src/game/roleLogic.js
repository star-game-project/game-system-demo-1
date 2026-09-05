import { BONUS_ROLES, PENALTY_ROLES, ROLE_BY_ID } from "../data/roles.js";
import { isWildCard, MAX_DIE_VALUE, MIN_DIE_VALUE } from "./abilityLogic.js";

const NO_ROLE = Object.freeze({
  roleId: null,
  roleName: null,
  multiplier: 1,
});

const DIE_VALUES = Array.from(
  { length: MAX_DIE_VALUE - MIN_DIE_VALUE + 1 },
  (_, index) => MIN_DIE_VALUE + index,
);

// ワイルドが多い手札まで総当たりすると組み合わせが膨らむため上限を設ける。
const MAX_WILD_SEARCH = 4;

function toResult(roleId) {
  const role = ROLE_BY_ID[roleId];
  return { roleId: role.id, roleName: role.name, multiplier: role.multiplier };
}

function meetsHandSize(role, handSize) {
  return handSize >= (role.minHandSize ?? 1);
}

/** 目ごとの枚数。 */
function tally(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

/** 連続する目の最長の長さ。 */
function longestRun(distinctSorted) {
  let best = 0;
  let run = 0;
  let previous = null;

  distinctSorted.forEach((value) => {
    run = previous !== null && value === previous + 1 ? run + 1 : 1;
    previous = value;
    best = Math.max(best, run);
  });
  return best;
}

/** ワイルドを含まない、確定した目の並びに対する成立判定。 */
function matchesRole(roleId, context) {
  const { counts, distinct, run, values, handSize } = context;
  const maxCount = Math.max(0, ...counts.values());
  const pairCount = [...counts.values()].filter((count) => count >= 2).length;

  switch (roleId) {
    case "same_number":
      return distinct.length === 1;
    case "four_of_a_kind":
      return maxCount >= 4;
    case "five_straight":
      return run >= 5;
    case "full_house":
      return (
        [...counts.values()].some((count) => count >= 3) && pairCount >= 2
      );
    case "four_straight":
      return run >= 4;
    case "three_of_a_kind":
      return maxCount >= 3;
    case "even_only":
      return values.every((value) => value % 2 === 0);
    case "odd_only":
      return values.every((value) => value % 2 === 1);
    case "three_straight":
      return run >= 3;
    case "two_pair":
      return pairCount >= 2;
    case "pair":
      return maxCount >= 2;
    case "one_two_three":
      // 4 まで伸ばせば STRAIGHT として脱出できる。
      return (
        counts.has(1) && counts.has(2) && counts.has(3) && !counts.has(4)
      );
    default:
      return false;
  }
}

function evaluateConcreteHand(values, handSize) {
  const counts = tally(values);
  const context = {
    counts,
    distinct: [...counts.keys()].sort((a, b) => a - b),
    run: longestRun([...counts.keys()].sort((a, b) => a - b)),
    values,
    handSize,
  };

  const penalty = PENALTY_ROLES.find(
    (role) => meetsHandSize(role, handSize) && matchesRole(role.id, context),
  );
  if (penalty) return toResult(penalty.id);

  const bonus = BONUS_ROLES.find(
    (role) => meetsHandSize(role, handSize) && matchesRole(role.id, context),
  );
  return bonus ? toResult(bonus.id) : { ...NO_ROLE };
}

/** ワイルドに割り当てる目の組み合わせ（順序は結果に影響しないので多重集合で列挙）。 */
function wildAssignments(count, start = 0) {
  if (count === 0) return [[]];
  const results = [];
  for (let index = start; index < DIE_VALUES.length; index += 1) {
    wildAssignments(count - 1, index).forEach((rest) => {
      results.push([DIE_VALUES[index], ...rest]);
    });
  }
  return results;
}

export function evaluateHandRole(hand) {
  if (!hand.length) return { ...NO_ROLE };

  const fixedValues = hand
    .filter((card) => !isWildCard(card))
    .map((card) => card.dieValue);
  const wildCount = hand.length - fixedValues.length;

  if (wildCount === 0 || wildCount > MAX_WILD_SEARCH) {
    return evaluateConcreteHand(fixedValues, hand.length);
  }

  // ワイルドはプレイヤーにとって最も有利になる目として扱う。
  // 倍率が並んだ場合は priority の高い役を採る。
  const rank = (result) => [
    result.multiplier,
    result.roleId ? ROLE_BY_ID[result.roleId].priority : -Infinity,
  ];

  let best = null;
  let bestRank = null;
  wildAssignments(wildCount).forEach((assignment) => {
    const result = evaluateConcreteHand(
      [...fixedValues, ...assignment],
      hand.length,
    );
    const current = rank(result);
    if (
      !best ||
      current[0] > bestRank[0] ||
      (current[0] === bestRank[0] && current[1] > bestRank[1])
    ) {
      best = result;
      bestRank = current;
    }
  });
  return best;
}
