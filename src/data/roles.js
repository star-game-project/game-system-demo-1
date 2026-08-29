export const HAND_ROLES = Object.freeze([
  {
    id: "same_number",
    name: "SAME NUMBER",
    multiplier: 4,
    priority: 100,
    description: "すべて同じ目",
  },
  {
    id: "even_only",
    name: "EVEN",
    multiplier: 1.5,
    priority: 80,
    description: "すべて偶数",
  },
  {
    id: "odd_only",
    name: "ODD",
    multiplier: 1.5,
    priority: 80,
    description: "すべて奇数",
  },
  {
    id: "one_two_three",
    name: "1-2-3",
    multiplier: 0.5,
    priority: 50,
    description: "1・2・3を含む",
  },
]);
