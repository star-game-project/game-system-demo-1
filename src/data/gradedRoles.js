/**
 * 試作ルール「役の新計算（試作）」の役。
 * 役を構成する枚数が増えるほど、式に従って倍率が上がる。系統ごとに最も高い役を1つ採り、
 * 系統をまたいで掛け合わせる（今までと同じ）。
 *
 * 系統の強化は、式の底（基礎倍率）に +UPGRADE_STEP/レベル を足す（SET なら 1.15 → 1.25）。
 * COMBO 系統は強化できない（抽選に出ない）が、COMBO を構成する役の倍率は強化後の値を使う。
 *
 * 各段階は「何枚（何連）以上」「同じ大きさの組がいくつ以上」で成立し、
 * 判定時は倍率の高い順に見て最初に成立したものを採る。
 * 手札の枚数を超える段階は作らない（maxCards）。
 */

/** 系統ごとの基礎倍率と式。base は強化後の底。 */
export const GRADED_FORMULAS = Object.freeze({
  // 1.15^(n-1) × 1.05^(n-2)
  set: Object.freeze({ base: 1.15, multiplier: (base, n) => base ** (n - 1) * 1.05 ** (n - 2) }),
  // 1.15^(n-2) × 1.1^(n-3)
  straight: Object.freeze({ base: 1.15, multiplier: (base, n) => base ** (n - 2) * 1.1 ** (n - 3) }),
  // 1.2^(n-2) × 0.9^(n-3)
  parity: Object.freeze({ base: 1.2, multiplier: (base, n) => base ** (n - 2) * 0.9 ** (n - 3) }),
  // 1.10^(n-1) × 1.03^(n-2)
  color: Object.freeze({ base: 1.1, multiplier: (base, n) => base ** (n - 1) * 1.03 ** (n - 2) }),
});

/** COMBO 系統：構成する系統と、(構成する役の倍率 × factor)^(個数-1) の factor。 */
export const COMBO_FORMULAS = Object.freeze({
  set_combo: Object.freeze({ of: "set", factor: 0.9 }),
  straight_combo: Object.freeze({ of: "straight", factor: 0.9 }),
  color_combo: Object.freeze({ of: "color", factor: 0.95 }),
});

const MAX_RUN = 6; // ダイスの目は1〜6なので、連続は最大6。

function rounded(value) {
  return Number(value.toFixed(3));
}

/** 強化レベルを反映した、系統 family の n 枚（n 連）の倍率。 */
export function gradedMultiplier(family, n, levels = {}, step = 0.1) {
  const formula = GRADED_FORMULAS[family];
  const base = formula.base + (levels[family] ?? 0) * step;
  return rounded(formula.multiplier(base, n));
}

/** 強化レベルを反映した COMBO の倍率。size は構成する役の枚数（連の長さ）、count は個数。 */
export function comboMultiplier(family, size, count, levels = {}, step = 0.1) {
  const { of, factor } = COMBO_FORMULAS[family];
  return rounded((gradedMultiplier(of, size, levels, step) * factor) ** (count - 1));
}

function role(fields) {
  return Object.freeze({ kind: "bonus", ruleset: "graded_roles", graded: true, priority: 0, ...fields });
}

/**
 * 手札の最大枚数 maxCards と、色の役を入れるか（withColor）から、段階の一覧を作る。
 * multiplier は強化なしの値。強化後の値は upgradedMultiplier（roles.js）が params から計算し直す。
 */
export function buildGradedRoles(maxCards, withColor) {
  const roles = [];
  const range = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

  range(2, maxCards).forEach((n) =>
    roles.push(role({
      id: `set_${n}`, name: "SET", stage: `${n}枚`, family: "set",
      params: { type: "set", size: n }, multiplier: gradedMultiplier("set", n),
      description: `同じ目が${n}枚`,
    })),
  );
  range(2, Math.floor(maxCards / 2)).forEach((size) =>
    range(2, Math.floor(maxCards / size)).forEach((count) =>
      roles.push(role({
        id: `set_combo_${size}x${count}`, name: "SET-COMBO", stage: `${size}枚×${count}`, family: "set_combo",
        params: { type: "set_combo", size, count }, multiplier: comboMultiplier("set_combo", size, count),
        upgradable: false, description: `ちょうど${size}枚の SET が${count}つ`,
      })),
    ),
  );
  range(3, Math.min(MAX_RUN, maxCards)).forEach((n) =>
    roles.push(role({
      id: `straight_${n}`, name: "STRAIGHT", stage: `${n}連`, family: "straight",
      params: { type: "straight", size: n }, multiplier: gradedMultiplier("straight", n),
      description: `${n}つ連続する目`,
    })),
  );
  range(3, Math.min(MAX_RUN, Math.floor(maxCards / 2))).forEach((size) =>
    range(2, Math.floor(maxCards / size)).forEach((count) =>
      roles.push(role({
        id: `straight_combo_${size}x${count}`, name: "STRAIGHT-COMBO", stage: `${size}連×${count}`, family: "straight_combo",
        params: { type: "straight_combo", size, count }, multiplier: comboMultiplier("straight_combo", size, count),
        upgradable: false,
        // 同じ階段が2つあれば同じ枚数の SET も必ず2つ以上あるが、SET-COMBO としては数えない。
        excludes: ["set_combo"],
        description: `まったく同じ目の${size}連が${count}つ`,
      })),
    ),
  );
  range(3, maxCards).forEach((n) =>
    ["even", "odd"].forEach((parity) =>
      roles.push(role({
        id: `${parity}_${n}`, name: "PARITY", stage: `${parity === "even" ? "偶数" : "奇数"}${n}枚`, family: "parity",
        priority: parity === "even" ? 1 : 0,
        params: { type: parity, size: n }, multiplier: gradedMultiplier("parity", n),
        description: `${n}枚すべてが${parity === "even" ? "偶数" : "奇数"}`,
      })),
    ),
  );
  if (withColor) {
    range(2, maxCards).forEach((n) =>
      roles.push(role({
        id: `color_${n}`, name: "FLUSH", stage: `${n}枚`, family: "color",
        params: { type: "color", size: n }, multiplier: gradedMultiplier("color", n),
        description: `同じ色が${n}枚`,
      })),
    );
    range(2, Math.floor(maxCards / 2)).forEach((size) =>
      range(2, Math.floor(maxCards / size)).forEach((count) =>
        roles.push(role({
          id: `color_combo_${size}x${count}`, name: "FLUSH-COMBO", stage: `${size}枚×${count}`, family: "color_combo",
          params: { type: "color_combo", size, count }, multiplier: comboMultiplier("color_combo", size, count),
          upgradable: false, description: `ちょうど${size}枚の FLUSH が${count}つ`,
        })),
      ),
    );
  }
  return Object.freeze(roles);
}

/** 強化レベルを反映した倍率（params から計算し直す）。 */
export function gradedRoleMultiplier(gradedRole, levels = {}, step = 0.1) {
  const { type, size, count } = gradedRole.params;
  if (type === "even" || type === "odd") return gradedMultiplier("parity", size, levels, step);
  if (type in COMBO_FORMULAS) return comboMultiplier(type, size, count, levels, step);
  return gradedMultiplier(type, size, levels, step);
}

/** その値の個数がちょうど size の組が count 個以上あるか。 */
function exactGroups(counts, size, count) {
  return [...counts.values()].filter((value) => value === size).length >= count;
}

/** 長さ size の同じ階段が count 個以上あるか（その範囲の目がすべて count 枚以上）。 */
function repeatedRun(counts, size, count) {
  for (let start = 1; start + size - 1 <= MAX_RUN; start += 1) {
    let ok = true;
    for (let value = start; value < start + size; value += 1) {
      if ((counts.get(value) ?? 0) < count) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

/**
 * 確定した目と色に対する成立判定。context は roleLogic.js の evaluateConcreteHand が作る。
 * colorCounts は色ごとの枚数（Map）。
 */
export function matchesGradedRole(gradedRole, context) {
  const { counts, run, values, handSize, colorCounts } = context;
  const { type, size, count } = gradedRole.params;
  const maxCount = Math.max(0, ...counts.values());
  const colorMax = Math.max(0, ...colorCounts.values());
  switch (type) {
    case "set":
      return maxCount >= size;
    case "set_combo":
      return exactGroups(counts, size, count);
    case "straight":
      return run >= size;
    case "straight_combo":
      return repeatedRun(counts, size, count);
    case "even":
      return handSize === size && values.every((value) => value % 2 === 0);
    case "odd":
      return handSize === size && values.every((value) => value % 2 === 1);
    case "color":
      return colorMax >= size;
    case "color_combo":
      return exactGroups(colorCounts, size, count);
    default:
      return false;
  }
}
