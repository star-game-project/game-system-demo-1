import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHandRole } from "../src/game/roleLogic.js";

const hand = (...values) => values.map((dieValue, index) => ({ id: `c${index}`, dieValue }));
const WILD = { id: "wild", dieValue: 1, passiveAbility: { type: "WILD_DIE" } };
const withWild = (...values) => [...hand(...values), WILD];

test("SAME NUMBER outranks every other role and needs at least three cards", () => {
  assert.deepEqual(evaluateHandRole(hand(2, 2, 2)), {
    roleId: "same_number",
    roleName: "SAME NUMBER",
    multiplier: 4,
  });
  // 3枚に満たない場合は SAME NUMBER にならない。
  // 2枚のペアは必ず同じ目＝同じ偶奇なので、EVEN / ODD として拾われる。
  assert.equal(evaluateHandRole(hand(5, 5)).roleName, "ODD");
  assert.equal(evaluateHandRole(hand(6, 6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(hand(3, 3, 3)).roleName, "SAME NUMBER");
});

test("whole-hand roles need at least two cards", () => {
  assert.equal(evaluateHandRole(hand(5)).roleId, null);
  assert.equal(evaluateHandRole(hand(6)).roleId, null);
  assert.equal(evaluateHandRole(hand(5)).multiplier, 1);
});

test("subset roles fire on partial matches so most hands score", () => {
  assert.equal(evaluateHandRole(hand(3, 3, 1, 4, 6)).roleName, "PAIR");
  assert.equal(evaluateHandRole(hand(3, 3, 1, 1, 6)).roleName, "TWO PAIR");
  assert.equal(evaluateHandRole(hand(3, 3, 3, 1, 6)).roleName, "THREE OF A KIND");
  assert.equal(evaluateHandRole(hand(3, 3, 3, 1, 1)).roleName, "FULL HOUSE");
  assert.equal(evaluateHandRole(hand(3, 3, 3, 3, 1)).roleName, "FOUR OF A KIND");
});

test("straights are scored by their length", () => {
  assert.equal(evaluateHandRole(hand(4, 5, 6, 6, 6)).roleName, "THREE OF A KIND");
  assert.equal(evaluateHandRole(hand(2, 4, 5, 6)).roleName, "THREE STRAIGHT");
  assert.equal(evaluateHandRole(hand(3, 4, 5, 6)).roleName, "FOUR STRAIGHT");
  assert.equal(evaluateHandRole(hand(2, 3, 4, 5, 6)).roleName, "FIVE STRAIGHT");
});

test("EVEN and ODD recognize hands containing only their parity", () => {
  assert.equal(evaluateHandRole(hand(2, 4, 4, 6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(hand(1, 3, 3, 5)).roleName, "ODD");
  // 手札全体の条件なので、1枚でも外れると成立しない。
  assert.notEqual(evaluateHandRole(hand(2, 4, 4, 5)).roleName, "EVEN");
});

test("1-2-3 overrides bonus roles but is escaped by extending to four", () => {
  // 減算役は通常役より先に判定される。1,1 のペアがあっても罠が優先。
  assert.deepEqual(evaluateHandRole(hand(1, 2, 3, 5, 6)), {
    roleId: "one_two_three",
    roleName: "1-2-3",
    multiplier: 0.5,
  });
  assert.equal(evaluateHandRole(hand(1, 1, 2, 3, 6)).roleName, "1-2-3");

  // 4 まで伸ばすと STRAIGHT として脱出できる。
  assert.equal(evaluateHandRole(hand(1, 2, 3, 4, 6)).roleName, "FOUR STRAIGHT");
  assert.equal(evaluateHandRole(hand(1, 2, 3, 4, 5)).roleName, "FIVE STRAIGHT");
});

test("a hand with no pattern at all still has no role", () => {
  assert.equal(evaluateHandRole(hand(1, 4)).roleId, null);
  assert.equal(evaluateHandRole([]).multiplier, 1);
});

test("a wild die takes whichever value scores highest", () => {
  assert.equal(evaluateHandRole(withWild(4, 4)).roleName, "SAME NUMBER");
  assert.equal(evaluateHandRole(withWild(2, 3, 4, 5)).roleName, "FIVE STRAIGHT");
  assert.equal(evaluateHandRole(withWild(4, 4, 6, 6)).roleName, "FULL HOUSE");
  assert.equal(evaluateHandRole(withWild(1, 5, 5)).roleName, "ODD");
});

test("a wild die is never used to complete the 1-2-3 penalty", () => {
  // ワイルドが 3 になると 1-2-3 が成立してしまうが、より高い倍率を選ぶ。
  assert.notEqual(evaluateHandRole(withWild(1, 2, 5)).roleName, "1-2-3");

  // すでに 1・2・3 が揃っていても、ワイルドが 4 になれば STRAIGHT で脱出できる。
  assert.equal(evaluateHandRole(withWild(1, 2, 3, 6)).roleName, "FOUR STRAIGHT");

  // ワイルドがなければ罠から逃げられない。
  assert.equal(evaluateHandRole(hand(1, 2, 3, 6)).roleName, "1-2-3");
});
