import { rolesFor, upgradedMultiplier } from "../data/roles.js";
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

/**
 * family ごとに、レベル反映後の倍率が高い順に並べた役。
 * 強化で下位の役が上位を追い越すこともあるため、レベルごとに並べ直す。
 * ruleset が「ダイスの色（試作）」なら色の役（color 系統）も加わる。
 */
function familiesFor(levels, ruleset) {
  const roles = rolesFor(ruleset).map((role) => ({ ...role, multiplier: upgradedMultiplier(role, levels) }));
  return [...new Set(roles.map((role) => role.family))].map((family) =>
    roles
      .filter((role) => role.family === family)
      .sort((a, b) => b.multiplier - a.multiplier || b.priority - a.priority),
  );
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
  const { counts, distinct, run, values, handSize, colorMax } = context;
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
    // 色の役。色はワイルドでも普通に1色なので、目の割り当てとは関係なく決まる。
    case "flush":
      return colorMax === handSize;
    case "four_flush":
      return colorMax >= 4;
    case "three_flush":
      return colorMax >= 3;
    case "one_two_three":
      // 4 まで伸ばせば STRAIGHT として脱出できる。
      return (
        counts.has(1) && counts.has(2) && counts.has(3) && !counts.has(4)
      );
    default:
      return false;
  }
}

function evaluateConcreteHand(values, handSize, families, colorMax = 0) {
  const counts = tally(values);
  const distinct = [...counts.keys()].sort((a, b) => a - b);
  const context = {
    counts,
    distinct,
    run: longestRun(distinct),
    values,
    handSize,
    colorMax,
  };

  // family ごとに最も倍率の高い役をひとつ選び、family をまたいで掛け合わせる。
  const perFamily = families.map((candidates) =>
    candidates.find(
      (role) => meetsHandSize(role, handSize) && matchesRole(role.id, context),
    ),
  ).filter(Boolean);

  // 成立が他の系統を必ず含意する役は、その系統を打ち消す
  // （SET（全部同じ）は偶奇も必ず揃うため PARITY と重複させない）。
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
      stage: role.stage,
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

/** 同じ色のカードの最大枚数。色の無いカード（現行ルール）は数えない。 */
function largestColorGroup(hand) {
  const colors = hand.map((card) => card.color).filter(Boolean);
  return Math.max(0, ...tally(colors).values());
}

/**
 * levels は役の強化レベル（{ 役id: レベル }）。省略時は強化なし。
 * ruleset は遊んでいるルール（rulesets.js）。「ダイスの色（試作）」のときだけ色の役を判定する。
 */
export function evaluateHandRole(hand, levels = {}, ruleset = "standard") {
  if (!hand.length) return noRole();
  const families = familiesFor(levels, ruleset);
  const colorMax = largestColorGroup(hand);

  const fixedValues = hand
    .filter((card) => !isWildCard(card))
    .map((card) => card.dieValue);
  const wildCount = hand.length - fixedValues.length;

  if (wildCount === 0 || wildCount > MAX_WILD_SEARCH) {
    return evaluateConcreteHand(fixedValues, hand.length, families, colorMax);
  }

  // ワイルドはプレイヤーにとって最も有利になる目として扱う。
  // 倍率が並んだ場合は priority の高い役を採る。
  let best = null;
  wildAssignments(wildCount).forEach((assignment) => {
    const result = evaluateConcreteHand(
      [...fixedValues, ...assignment],
      hand.length,
      families,
      colorMax,
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
