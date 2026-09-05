import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHandRole } from "../src/game/roleLogic.js";

const hand = (...values) => values.map((dieValue, index) => ({ id: `c${index}`, dieValue }));
const WILD = { id: "wild", dieValue: 1, passiveAbility: { type: "WILD_DIE" } };
const withWild = (...values) => [...hand(...values), WILD];

test("SAME NUMBER takes priority over EVEN and needs at least two cards", () => {
  assert.deepEqual(evaluateHandRole(hand(2, 2, 2)), {
    roleId: "same_number",
    roleName: "SAME NUMBER",
    multiplier: 4,
  });
  assert.equal(evaluateHandRole(hand(5, 5)).roleName, "SAME NUMBER");
});

test("a single card never forms SAME NUMBER", () => {
  assert.equal(evaluateHandRole(hand(5)).roleName, "ODD");
  assert.equal(evaluateHandRole(hand(6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(hand(5)).multiplier, 1.5);
});

test("EVEN and ODD recognize hands containing only their parity", () => {
  assert.equal(evaluateHandRole(hand(2, 4, 4, 6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(hand(1, 3, 3, 5)).roleName, "ODD");
});

test("1-2-3 allows other die values and applies the penalty multiplier", () => {
  assert.deepEqual(evaluateHandRole(hand(1, 2, 3, 5, 6)), {
    roleId: "one_two_three",
    roleName: "1-2-3",
    multiplier: 0.5,
  });
});

test("mixed hand and empty hand have no role", () => {
  assert.equal(evaluateHandRole(hand(1, 2, 4, 5)).roleId, null);
  assert.equal(evaluateHandRole([]).multiplier, 1);
});

test("a wild die stands in for whatever the hand needs", () => {
  assert.equal(evaluateHandRole(withWild(4, 4)).roleName, "SAME NUMBER");
  assert.equal(evaluateHandRole(withWild(2, 6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(withWild(3, 5)).roleName, "ODD");
  assert.equal(evaluateHandRole([WILD, { ...WILD, id: "wild2" }]).roleName, "SAME NUMBER");
});

test("a wild die is never used to complete the 1-2-3 penalty", () => {
  // 1 と 2 しかないので、ワイルドが 3 を埋めれば 1-2-3 が成立してしまう。
  const result = evaluateHandRole(withWild(1, 2, 4));
  assert.equal(result.roleId, null);
  assert.equal(result.multiplier, 1);

  // 実際に 1・2・3 が揃っている場合は従来どおり成立する。
  assert.equal(evaluateHandRole(withWild(1, 2, 3, 4)).roleName, "1-2-3");
});
