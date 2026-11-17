import test from "node:test";
import assert from "node:assert/strict";
import { rolesFor, upgradableFamiliesFor, upgradedMultiplier } from "../src/data/roles.js";
import { evaluateHandRole } from "../src/game/roleLogic.js";
import { drawRoleOffers } from "../src/game/rewardLogic.js";

const G = "graded_roles";
const SELECT = "graded_roles+select_play";
const COLOR_SELECT = "dice_color+select_play+graded_roles";

/** 目だけ、または [目, 色] から手札を作る。 */
const hand = (...cards) =>
  cards.map((entry, index) => {
    const [dieValue, color] = Array.isArray(entry) ? entry : [entry];
    return { id: `c${index}`, dieValue, color };
  });
const labels = (result) => result.roles.map((role) => `${role.name}（${role.stage}）`);
const round3 = (value) => Number(value.toFixed(3));

test("SET grows with the number of matching faces: 1.15^(n-1) × 1.05^(n-2)", () => {
  assert.deepEqual(labels(evaluateHandRole(hand(3, 3, 1, 5, 6), {}, G)), ["SET（2枚）"]);
  assert.equal(evaluateHandRole(hand(3, 3, 1, 5, 6), {}, G).multiplier, 1.15);
  assert.equal(evaluateHandRole(hand(3, 3, 3, 1, 6), {}, G).multiplier, round3(1.15 ** 2 * 1.05));
  assert.equal(evaluateHandRole(hand(3, 3, 3, 3, 6), {}, G).multiplier, round3(1.15 ** 3 * 1.05 ** 2));
});

test("SET-COMBO counts SETs of the same size: (SET × 0.9)^(count-1)", () => {
  // 3,3,1,1 は 2枚の SET が2つ。
  const result = evaluateHandRole(hand(3, 3, 1, 1, 6), {}, G);
  assert.deepEqual(labels(result), ["SET（2枚）", "SET-COMBO（2枚×2）"]);
  assert.equal(result.roles[1].multiplier, round3(1.15 * 0.9));
  // 3枚＋2枚は大きさが違うので SET-COMBO にならない（PARITY は別に立つ）。
  assert.ok(!labels(evaluateHandRole(hand(3, 3, 3, 1, 1), {}, G)).some((label) => label.startsWith("SET-COMBO")));
  // 3枚の SET が2つ（6枚）。
  const triples = evaluateHandRole(hand(3, 3, 3, 4, 4, 4), {}, SELECT);
  assert.ok(labels(triples).includes("SET-COMBO（3枚×2）"));
  assert.equal(triples.roles.find((role) => role.family === "set_combo").multiplier, round3(1.15 ** 2 * 1.05 * 0.9));
});

test("STRAIGHT needs three in a row: 1.15^(n-2) × 1.1^(n-3)", () => {
  assert.deepEqual(labels(evaluateHandRole(hand(1, 2, 3, 5, 5), {}, G)), ["SET（2枚）", "STRAIGHT（3連）"]);
  assert.equal(evaluateHandRole(hand(1, 2, 3, 4, 6), {}, G).multiplier, round3(1.15 ** 2 * 1.1));
  assert.equal(evaluateHandRole(hand(2, 3, 4, 5, 6), {}, G).multiplier, round3(1.15 ** 3 * 1.1 ** 2));
});

test("there is no 1-2-3 penalty under the graded rules", () => {
  const result = evaluateHandRole(hand(1, 2, 3, 6, 6), {}, G);
  assert.ok(result.multiplier > 1);
  assert.ok(!result.roles.some((role) => role.family === "penalty"));
});

test("STRAIGHT-COMBO needs the very same run twice, and replaces SET-COMBO", () => {
  const result = evaluateHandRole(hand(1, 1, 2, 2, 3, 3), {}, SELECT);
  assert.ok(labels(result).includes("STRAIGHT-COMBO（3連×2）"));
  assert.ok(!result.roles.some((role) => role.family === "set_combo"), "the three pairs are not a SET-COMBO");
  assert.equal(result.roles.find((role) => role.family === "straight_combo").multiplier, round3(1.15 * 0.9));
  // 1-2-3 と 2-3-4 は違う階段なので成立しない。
  const shifted = evaluateHandRole(hand(1, 2, 3, 2, 3, 4), {}, SELECT);
  assert.ok(!shifted.roles.some((role) => role.family === "straight_combo"));
});

test("PARITY needs the whole hand on one side, three cards or more: 1.2^(n-2) × 0.9^(n-3)", () => {
  assert.equal(evaluateHandRole(hand(2, 4, 6), {}, G).multiplier, 1.2);
  assert.deepEqual(labels(evaluateHandRole(hand(2, 4), {}, G)), [], "two cards are not enough");
  const five = evaluateHandRole(hand(1, 3, 5, 1, 5), {}, G);
  assert.equal(five.roles.find((role) => role.family === "parity").multiplier, round3(1.2 ** 3 * 0.9 ** 2));
  assert.ok(!evaluateHandRole(hand(1, 3, 5, 2, 5), {}, G).roles.some((role) => role.family === "parity"));
});

test("FLUSH and FLUSH-COMBO follow their own formulas, only with dice colours", () => {
  const cards = hand([1, "red"], [1, "red"], [2, "red"], [4, "blue"], [6, "blue"], [5, "blue"]);
  const result = evaluateHandRole(cards, {}, COLOR_SELECT);
  const flush = result.roles.find((role) => role.family === "color");
  const combo = result.roles.find((role) => role.family === "color_combo");
  assert.equal(flush.multiplier, round3(1.1 ** 2 * 1.03));
  assert.equal(combo.stage, "3枚×2");
  assert.equal(combo.multiplier, round3(1.1 ** 2 * 1.03 * 0.95));
  assert.ok(!rolesFor(G).some((role) => role.family === "color"), "no colour roles without dice colours");
});

test("upgrading a family raises the base of its formula", () => {
  // SET Lv1：底が 1.25。3枚は 1.25^2 × 1.05。
  assert.equal(evaluateHandRole(hand(3, 3, 3, 1, 6), { set: 1 }, G).multiplier, round3(1.25 ** 2 * 1.05));
  const four = rolesFor(G).find((role) => role.id === "straight_4");
  assert.equal(upgradedMultiplier(four, { straight: 2 }), round3(1.35 ** 2 * 1.1));
});

test("a COMBO family uses the upgraded multiplier of the role it is made of", () => {
  const result = evaluateHandRole(hand(3, 3, 1, 1, 6), { set: 1 }, G);
  assert.equal(result.roles.find((role) => role.family === "set_combo").multiplier, round3(1.25 * 0.9));
});

test("COMBO families are never offered as upgrades", () => {
  const families = upgradableFamiliesFor(COLOR_SELECT).map(({ family }) => family);
  assert.deepEqual(families, ["set", "straight", "parity", "color"]);
  for (let seed = 0; seed < 10; seed += 1) {
    const offers = drawRoleOffers(() => seed / 10, 3, COLOR_SELECT);
    assert.ok(offers.every((family) => !family.endsWith("_combo")));
  }
});

test("the current rules are untouched when the graded rules are off", () => {
  assert.equal(evaluateHandRole(hand(3, 3, 1, 1, 6)).roleId, "two_pair");
  assert.equal(evaluateHandRole(hand(3, 3, 1, 1, 6)).multiplier, 1.25);
});
