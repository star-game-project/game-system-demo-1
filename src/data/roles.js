/**
 * 役はゲーム全体のルールとして管理する。
 *
 * kind "penalty" の役を先に判定し、成立すればそれだけを適用する。
 * 成立しなければ kind "bonus" を multiplier の高い順に判定し、
 * 最初に成立したひとつだけを適用する。
 *
 * minHandSize は「手札全体」を条件にする役だけが持つ。
 */
export const HAND_ROLES = Object.freeze([
  {
    id: "same_number",
    name: "SAME NUMBER",
    multiplier: 4,
    kind: "bonus",
    priority: 100,
    minHandSize: 3,
    description: "手札すべてが同じ目（3枚以上）",
  },
  {
    id: "four_of_a_kind",
    name: "FOUR OF A KIND",
    multiplier: 3.5,
    kind: "bonus",
    priority: 95,
    description: "同じ目が4枚",
  },
  {
    id: "five_straight",
    name: "FIVE STRAIGHT",
    multiplier: 2.4,
    kind: "bonus",
    priority: 85,
    description: "5つ連続する目",
  },
  {
    id: "full_house",
    name: "FULL HOUSE",
    multiplier: 2.8,
    kind: "bonus",
    priority: 90,
    description: "同じ目3枚 + 別の同じ目2枚",
  },
  {
    id: "four_straight",
    name: "FOUR STRAIGHT",
    multiplier: 1.7,
    kind: "bonus",
    priority: 70,
    description: "4つ連続する目",
  },
  {
    id: "three_of_a_kind",
    name: "THREE OF A KIND",
    multiplier: 2,
    kind: "bonus",
    priority: 80,
    description: "同じ目が3枚",
  },
  {
    id: "even_only",
    name: "EVEN",
    multiplier: 2.8,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが偶数",
  },
  {
    id: "odd_only",
    name: "ODD",
    multiplier: 2.8,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが奇数",
  },
  {
    id: "three_straight",
    name: "THREE STRAIGHT",
    multiplier: 1.3,
    kind: "bonus",
    priority: 50,
    description: "3つ連続する目",
  },
  {
    id: "two_pair",
    name: "TWO PAIR",
    multiplier: 1.5,
    kind: "bonus",
    priority: 60,
    description: "2枚組が2種類",
  },
  {
    id: "pair",
    name: "PAIR",
    multiplier: 1.2,
    kind: "bonus",
    priority: 40,
    description: "同じ目が2枚",
  },
  {
    // 1・2・3 が揃うと減算。ただし 4 まで伸ばせば STRAIGHT として脱出できる。
    id: "one_two_three",
    name: "1-2-3",
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

/** 倍率の高い順に並べた通常役。倍率が同じ場合は priority の高い方を先に見る。 */
export const BONUS_ROLES = Object.freeze(
  HAND_ROLES.filter((role) => role.kind === "bonus").sort(
    (a, b) => b.multiplier - a.multiplier || b.priority - a.priority,
  ),
);
