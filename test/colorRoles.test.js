import test from "node:test";
import assert from "node:assert/strict";
import { COLOR_ROLES, bonusRolesFor, rolesFor, HAND_ROLES } from "../src/data/roles.js";
import { evaluateHandRole } from "../src/game/roleLogic.js";
import { drawRoleOffers } from "../src/game/rewardLogic.js";
import { createInitialGameState } from "../src/game/gameState.js";

/** [目, 色] の組から手札を作る。 */
const hand = (...cards) =>
  cards.map(([dieValue, color], index) => ({ id: `c${index}`, dieValue, color }));
const ids = (result) => result.roles.map((role) => role.id);
const PROTO = "dice_color";

test("colour roles exist only under the prototype rules", () => {
  assert.equal(rolesFor("standard"), HAND_ROLES);
  assert.deepEqual(
    rolesFor(PROTO).filter((role) => role.family === "color").map((role) => role.id),
    ["flush", "four_flush", "three_flush"],
  );
  assert.ok(COLOR_ROLES.every((role) => role.ruleset === PROTO));
});

test("the current rules ignore colour even when cards carry one", () => {
  const cards = hand([1, "red"], [3, "red"], [6, "red"], [2, "red"], [5, "red"]);
  assert.equal(
    evaluateHandRole(cards).roles.some((role) => role.family === "color"),
    false,
  );
});

test("same-colour groups are graded by size", () => {
  // 目の役（ここでは TWO PAIR）も立つが、色の役が枚数どおりに立つかだけを見る。
  const three = hand([1, "red"], [4, "red"], [6, "red"], [1, "blue"], [4, "green"]);
  const four = hand([1, "red"], [4, "red"], [6, "red"], [1, "red"], [4, "green"]);
  const five = hand([1, "red"], [4, "red"], [6, "red"], [1, "red"], [4, "red"]);
  assert.ok(ids(evaluateHandRole(three, {}, PROTO)).includes("three_flush"));
  assert.ok(ids(evaluateHandRole(four, {}, PROTO)).includes("four_flush"));
  assert.ok(ids(evaluateHandRole(five, {}, PROTO)).includes("flush"));
});

test("only the best colour role is taken, like any other family", () => {
  const five = hand([1, "red"], [4, "red"], [6, "red"], [1, "red"], [4, "red"]);
  const colourRoles = evaluateHandRole(five, {}, PROTO).roles.filter((role) => role.family === "color");
  assert.deepEqual(colourRoles.map((role) => role.id), ["flush"]);
});

test("a colour role multiplies with the dice-face roles", () => {
  // 3,3,3,1,1 は FULL HOUSE × ODD。そこに全部同色が掛かる。
  const cards = hand([3, "blue"], [3, "blue"], [3, "blue"], [1, "blue"], [1, "blue"]);
  const result = evaluateHandRole(cards, {}, PROTO);
  assert.deepEqual(ids(result).sort(), ["flush", "full_house", "odd_only"]);
  const standard = evaluateHandRole(cards, {}, "standard");
  assert.equal(result.multiplier, Number((standard.multiplier * 2).toFixed(3)));
});

test("a whole-hand flush needs a full hand, so playing cards down cannot fake one", () => {
  // 4枚すべて同色でも、手札5枚に満たなければ FLUSH ではなく FOUR FLUSH。
  const four = hand([1, "red"], [4, "red"], [6, "red"], [1, "red"]);
  const colourRoles = ids(evaluateHandRole(four, {}, PROTO)).filter((id) => id.endsWith("flush"));
  assert.deepEqual(colourRoles, ["four_flush"]);
});

test("a wild die keeps its own colour while standing in for any face", () => {
  const wild = { id: "w", dieValue: 1, color: "green", passiveAbility: { type: "WILD_DIE" } };
  const cards = [...hand([2, "green"], [5, "green"]), wild];
  // 色は緑3枚。ワイルドの目の割り当てに関係なく THREE FLUSH が立つ。
  assert.ok(ids(evaluateHandRole(cards, {}, PROTO)).includes("three_flush"));
});

test("upgrading a colour role raises it like any bonus role", () => {
  const three = hand([1, "red"], [4, "red"], [6, "red"], [1, "blue"], [4, "green"]);
  const base = evaluateHandRole(three, {}, PROTO);
  const upgraded = evaluateHandRole(three, { three_flush: 2 }, PROTO);
  assert.ok(upgraded.multiplier > base.multiplier);
});

test("colour roles are offered as upgrades only under the prototype", () => {
  const standardPool = bonusRolesFor("standard").map((role) => role.id);
  const protoPool = bonusRolesFor(PROTO).map((role) => role.id);
  assert.equal(standardPool.some((id) => id.endsWith("flush")), false);
  assert.ok(["flush", "four_flush", "three_flush"].every((id) => protoPool.includes(id)));

  const offers = drawRoleOffers(() => 0.5, protoPool.length, PROTO);
  assert.deepEqual([...offers].sort(), [...protoPool].sort());
  assert.equal(drawRoleOffers(() => 0.5, 99, "standard").some((id) => id.endsWith("flush")), false);
});

test("without coloured cards the prototype scores exactly like the current rules", () => {
  // 色は連戦を始めるときに付く。色の無い手札では、色の役は1つも立たない。
  const standard = createInitialGameState(() => 0.5);
  const prototype = createInitialGameState(() => 0.5, null, { ruleset: PROTO });
  assert.deepEqual(prototype.currentRole, standard.currentRole);
});
