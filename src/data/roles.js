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
 */
export const HAND_ROLES = Object.freeze([
  {
    id: "same_number",
    name: "SAME NUMBER",
    family: "set",
    multiplier: 4,
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
    multiplier: 3.5,
    kind: "bonus",
    priority: 95,
    description: "同じ目が4枚",
  },
  {
    id: "five_straight",
    name: "FIVE STRAIGHT",
    family: "straight",
    multiplier: 2.4,
    kind: "bonus",
    priority: 85,
    description: "5つ連続する目",
  },
  {
    id: "full_house",
    name: "FULL HOUSE",
    family: "set",
    multiplier: 2.8,
    kind: "bonus",
    priority: 90,
    description: "同じ目3枚 + 別の同じ目2枚",
  },
  {
    id: "four_straight",
    name: "FOUR STRAIGHT",
    family: "straight",
    multiplier: 1.7,
    kind: "bonus",
    priority: 70,
    description: "4つ連続する目",
  },
  {
    id: "three_of_a_kind",
    name: "THREE OF A KIND",
    family: "set",
    multiplier: 2,
    kind: "bonus",
    priority: 80,
    description: "同じ目が3枚",
  },
  {
    id: "even_only",
    name: "EVEN",
    family: "parity",
    multiplier: 2.8,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが偶数",
  },
  {
    id: "odd_only",
    name: "ODD",
    family: "parity",
    multiplier: 2.8,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが奇数",
  },
  {
    id: "three_straight",
    name: "THREE STRAIGHT",
    family: "straight",
    multiplier: 1.3,
    kind: "bonus",
    priority: 50,
    description: "3つ連続する目",
  },
  {
    id: "two_pair",
    name: "TWO PAIR",
    family: "set",
    multiplier: 1.5,
    kind: "bonus",
    priority: 60,
    description: "2枚組が2種類",
  },
  {
    id: "pair",
    name: "PAIR",
    family: "set",
    multiplier: 1.2,
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

export const ROLE_BY_ID = Object.freeze(
  Object.fromEntries(HAND_ROLES.map((role) => [role.id, role])),
);

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
