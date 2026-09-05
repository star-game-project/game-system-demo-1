import { ROLE_FAMILIES } from "../data/roles.js";
import { isWildCard, MAX_DIE_VALUE, MIN_DIE_VALUE } from "./abilityLogic.js";

const NO_ROLE = Object.freeze({
  roles: [],
  roleId: null,
  roleName: null,
  multiplier: 1,
});

function noRole() {
  return { ...NO_ROLE, roles: [] };
}

const DIE_VALUES = Array.from(
  { length: MAX_DIE_VALUE - MIN_DIE_VALUE + 1 },
  (_, index) => MIN_DIE_VALUE + index,
);

// ワイルドが多い手札まで総当たりすると組み合わせが膨らむため上限を設ける。
const MAX_WILD_SEARCH = 4;

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
  const distinct = [...counts.keys()].sort((a, b) => a - b);
  const context = {
    counts,
    distinct,
    run: longestRun(distinct),
    values,
    handSize,
  };

  // family ごとに最も倍率の高い役をひとつ選び、family をまたいで掛け合わせる。
  const perFamily = ROLE_FAMILIES.map(({ roles: candidates }) =>
    candidates.find(
      (role) => meetsHandSize(role, handSize) && matchesRole(role.id, context),
    ),
  ).filter(Boolean);

  // 成立が他の系統を必ず含意する役は、その系統を打ち消す
  // （SAME NUMBER は偶奇も必ず揃うため EVEN / ODD と重複させない）。
  const excluded = new Set(perFamily.flatMap((role) => role.excludes ?? []));
  const roles = perFamily.filter((role) => !excluded.has(role.family));

  if (!roles.length) return noRole();

  const multiplier = roles.reduce(
    (total, role) => total * role.multiplier,
    1,
  );
  // 見出しに使う役は、倍率がいちばん高いもの。
  const headline = roles.reduce((best, role) =>
    role.multiplier > best.multiplier ? role : best,
  );

  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      multiplier: role.multiplier,
      family: role.family,
    })),
    roleId: headline.id,
    roleName: headline.name,
    multiplier: Number(multiplier.toFixed(3)),
  };
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
  if (!hand.length) return noRole();

  const fixedValues = hand
    .filter((card) => !isWildCard(card))
    .map((card) => card.dieValue);
  const wildCount = hand.length - fixedValues.length;

  if (wildCount === 0 || wildCount > MAX_WILD_SEARCH) {
    return evaluateConcreteHand(fixedValues, hand.length);
  }

  // ワイルドはプレイヤーにとって最も有利になる目として扱う。
  // 倍率が並んだ場合は priority の高い役を採る。
  let best = null;
  wildAssignments(wildCount).forEach((assignment) => {
    const result = evaluateConcreteHand(
      [...fixedValues, ...assignment],
      hand.length,
    );
    if (
      !best ||
      result.multiplier > best.multiplier ||
      (result.multiplier === best.multiplier &&
        result.roles.length > best.roles.length)
    ) {
      best = result;
    }
  });
  return best;
}
