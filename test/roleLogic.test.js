import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHandRole } from "../src/game/roleLogic.js";

const hand = (...values) => values.map((dieValue, index) => ({ id: `c${index}`, dieValue }));

test("SAME NUMBER takes priority over EVEN and also works with one card", () => {
  assert.deepEqual(evaluateHandRole(hand(2, 2, 2)), {
    roleId: "same_number",
    roleName: "SAME NUMBER",
    multiplier: 4,
  });
  assert.equal(evaluateHandRole(hand(5)).roleName, "SAME NUMBER");
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
