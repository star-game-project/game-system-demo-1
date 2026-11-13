import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_FAMILY_INFO, roleFamiliesFor, roleLabel, rolesFor } from "../src/data/roles.js";
import { evaluateHandRole } from "../src/game/roleLogic.js";

const hand = (...values) => values.map((dieValue, index) => ({ id: `c${index}`, dieValue }));

test("roles in one family share the family's name and differ only by stage", () => {
  for (const role of rolesFor("dice_color")) {
    assert.equal(role.name, ROLE_FAMILY_INFO[role.family].name, role.id);
    if (role.kind === "bonus") assert.ok(role.stage, `${role.id} needs a stage`);
  }
  // 段階が1つだけの減算役は、名前だけで呼ぶ。
  assert.equal(roleLabel(rolesFor().find((role) => role.id === "one_two_three")), "1-2-3");
  assert.equal(roleLabel(rolesFor().find((role) => role.id === "two_pair")), "SET（2組）");
});

test("the role list groups the current rules into four families, weakest stage first", () => {
  const families = roleFamiliesFor("standard");
  assert.deepEqual(families.map((entry) => entry.name), ["SET", "STRAIGHT", "PARITY", "1-2-3"]);
  assert.deepEqual(
    families[0].roles.map((role) => role.stage),
    ["2枚", "2組", "3枚", "3枚＋2枚", "4枚", "全部同じ"],
  );
  assert.deepEqual(families[1].roles.map((role) => role.stage), ["3連", "4連", "5連"]);
  // 倍率は段階が上がるほど高い。
  for (const { roles } of families) {
    roles.slice(1).forEach((role, index) => assert.ok(role.multiplier >= roles[index].multiplier));
  }
});

test("the colour family joins the list only under the prototype rules", () => {
  assert.equal(roleFamiliesFor("standard").some((entry) => entry.family === "color"), false);
  const color = roleFamiliesFor("dice_color").find((entry) => entry.family === "color");
  assert.deepEqual(color.roles.map((role) => role.stage), ["3枚", "4枚", "全部"]);
});

test("a scored hand names each family once, with the stage it reached", () => {
  // 3,3,3,1,1 は SET（3枚＋2枚）× PARITY（奇数のみ）。
  const result = evaluateHandRole(hand(3, 3, 3, 1, 1));
  assert.deepEqual(result.roles.map(roleLabel).sort(), ["PARITY（奇数のみ）", "SET（3枚＋2枚）"]);
});
