/**
 * 役はゲーム全体のルールとして管理する。
 *
 * 役は family（系統）に属する。同じ family の役は互いに入れ子になっており
 * （PAIR ⊂ TWO PAIR ⊂ FULL HOUSE など）、まとめて掛けると同じ手札を
 * 多重に数えてしまうため、family ごとに最も倍率の高い役をひとつだけ採る。
 *
 * 採用された役は family をまたいで掛け合わせる。
 * 例）3,3,3,1,1 → FULL HOUSE（set）× ODD（parity）
 *
 * minHandSize は「手札全体」を条件にする役だけが持つ。
 *
 * ボーナス役の倍率は、旧値のボーナス部分（1を超える分）を半分にしたもの（例：×2.8 → ×1.9）。
 * 減算役（×0.5）は変えていない。
 *
 * EVEN / ODD はさらに ×1.9 → ×1.3 に下げている。デッキを偶奇に寄せるだけで成立率を100%にできる唯一の役で、
 * 同じ寄せ方で同じ目の系統も成立しやすくなり掛け合わさるため、偶数のみのデッキが突出していた
 * （12枚・各目4枚以下での手札5枚の期待倍率：偶数のみ ×2.77 → ×1.90、均等 ×1.23 → ×1.21）。
 */
export const HAND_ROLES = Object.freeze([
  {
    id: "same_number",
    name: "SAME NUMBER",
    family: "set",
    multiplier: 2.5,
    kind: "bonus",
    priority: 100,
    minHandSize: 3,
    // すべて同じ目なら偶奇も必ず揃うため、parity 系統とは重複させない。
    excludes: ["parity"],
    description: "手札すべてが同じ目（3枚以上）",
  },
  {
    id: "four_of_a_kind",
    name: "FOUR OF A KIND",
    family: "set",
    multiplier: 2.25,
    kind: "bonus",
    priority: 95,
    description: "同じ目が4枚",
  },
  {
    id: "five_straight",
    name: "FIVE STRAIGHT",
    family: "straight",
    multiplier: 1.7,
    kind: "bonus",
    priority: 85,
    description: "5つ連続する目",
  },
  {
    id: "full_house",
    name: "FULL HOUSE",
    family: "set",
    multiplier: 1.9,
    kind: "bonus",
    priority: 90,
    description: "同じ目3枚 + 別の同じ目2枚",
  },
  {
    id: "four_straight",
    name: "FOUR STRAIGHT",
    family: "straight",
    multiplier: 1.35,
    kind: "bonus",
    priority: 70,
    description: "4つ連続する目",
  },
  {
    id: "three_of_a_kind",
    name: "THREE OF A KIND",
    family: "set",
    multiplier: 1.5,
    kind: "bonus",
    priority: 80,
    description: "同じ目が3枚",
  },
  {
    id: "even_only",
    name: "EVEN",
    family: "parity",
    multiplier: 1.3,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが偶数",
  },
  {
    id: "odd_only",
    name: "ODD",
    family: "parity",
    multiplier: 1.3,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが奇数",
  },
  {
    id: "three_straight",
    name: "THREE STRAIGHT",
    family: "straight",
    multiplier: 1.15,
    kind: "bonus",
    priority: 50,
    description: "3つ連続する目",
  },
  {
    id: "two_pair",
    name: "TWO PAIR",
    family: "set",
    multiplier: 1.25,
    kind: "bonus",
    priority: 60,
    description: "2枚組が2種類",
  },
  {
    id: "pair",
    name: "PAIR",
    family: "set",
    multiplier: 1.1,
    kind: "bonus",
    priority: 40,
    description: "同じ目が2枚",
  },
  {
    // 1・2・3 が揃うと減算。ただし 4 まで伸ばせば STRAIGHT として脱出できる。
    id: "one_two_three",
    name: "1-2-3",
    family: "penalty",
    kind: "penalty",
    multiplier: 0.5,
    priority: 999,
    description: "1・2・3を含み、4がない（減算）",
  },
]);

/**
 * 色の役。ルール「ダイスの色（試作）」でだけ判定する（rolesFor）。
 * 同じ色の枚数で段階を付け、目の役とは系統（color）をまたいで掛け合わせる。
 * 倍率は、色が一様に付いた手札5枚での成立しやすさを目の役の並びに当てはめた仮の値：
 *   THREE FLUSH（同色がちょうど3枚）35.2% → PAIR 並み
 *   FOUR FLUSH（ちょうど4枚）5.9%       → THREE OF A KIND 並み
 *   FLUSH（5枚すべて）0.4%               → FULL HOUSE と FOUR OF A KIND の間
 */
export const COLOR_ROLES = Object.freeze([
  {
    id: "flush",
    name: "FLUSH",
    family: "color",
    multiplier: 2,
    kind: "bonus",
    priority: 92,
    // 手札全体が条件の役。カードを使って手札が減ると成立しやすくなるため、手札5枚を下限にする。
    minHandSize: 5,
    ruleset: "dice_color",
    description: "手札すべてが同じ色（5枚以上）",
  },
  {
    id: "four_flush",
    name: "FOUR FLUSH",
    family: "color",
    multiplier: 1.5,
    kind: "bonus",
    priority: 78,
    ruleset: "dice_color",
    description: "同じ色が4枚",
  },
  {
    id: "three_flush",
    name: "THREE FLUSH",
    family: "color",
    multiplier: 1.1,
    kind: "bonus",
    priority: 35,
    ruleset: "dice_color",
    description: "同じ色が3枚",
  },
]);

export const ROLE_BY_ID = Object.freeze(
  Object.fromEntries([...HAND_ROLES, ...COLOR_ROLES].map((role) => [role.id, role])),
);

/** そのルールで判定する役。現行ルールは HAND_ROLES だけ、「ダイスの色（試作）」は色の役も加える。 */
export function rolesFor(ruleset = "standard") {
  return ruleset === "dice_color" ? [...HAND_ROLES, ...COLOR_ROLES] : HAND_ROLES;
}

/** そのルールのボーナス役を、倍率の高い順（同じなら priority の高い順）に並べたもの。 */
export function bonusRolesFor(ruleset = "standard") {
  return rolesFor(ruleset)
    .filter((role) => role.kind === "bonus")
    .sort((a, b) => b.multiplier - a.multiplier || b.priority - a.priority);
}

export const PENALTY_ROLES = Object.freeze(
  HAND_ROLES.filter((role) => role.kind === "penalty"),
);

/** family ごとに、倍率の高い順に並べた役。 */
export const ROLE_FAMILIES = Object.freeze(
  [...new Set(HAND_ROLES.map((role) => role.family))].map((family) => ({
    family,
    roles: HAND_ROLES.filter((role) => role.family === family).sort(
      (a, b) => b.multiplier - a.multiplier || b.priority - a.priority,
    ),
  })),
);

/** 倍率の高い順に並べた通常役。倍率が同じ場合は priority の高い方を先に見る。 */
export const BONUS_ROLES = Object.freeze(
  HAND_ROLES.filter((role) => role.kind === "bonus").sort(
    (a, b) => b.multiplier - a.multiplier || b.priority - a.priority,
  ),
);

/**
 * 役の強化（成長）。報酬で選んだボーナス役のレベルを1上げ、倍率に UPGRADE_STEP を足す。
 * 系統をまたいで倍率は掛け合わさるため、強化は掛け算ではなく足し算にしている。
 * 減算役は強化の対象外。上げ幅は当面一律（成立しやすさに合わせた調整は今後）。
 */
export const ROLE_GROWTH = Object.freeze({
  UPGRADE_STEP: 0.1,
});

/** レベルを反映した倍率。levels は { 役id: レベル }。 */
export function upgradedMultiplier(role, levels = {}) {
  if (role.kind !== "bonus") return role.multiplier;
  const level = levels[role.id] ?? 0;
  return Number((role.multiplier + level * ROLE_GROWTH.UPGRADE_STEP).toFixed(3));
}
