import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/game/gameState.js";
import {
  DEFAULT_RULESET_ID,
  RULESETS,
  RULE_OPTIONS,
  hasRule,
  normalizeRulesetId,
  rulesetIdFrom,
  rulesetLabel,
} from "../src/game/rulesets.js";

test("the current rules and both prototypes are selectable", () => {
  assert.deepEqual(
    RULESETS.map((ruleset) => ruleset.id),
    ["standard", "dice_color", "select_play"],
  );
  assert.equal(DEFAULT_RULESET_ID, "standard");
  assert.deepEqual(RULE_OPTIONS.map((option) => option.id), ["dice_color", "select_play"]);
});

test("a battle starts on the current rules unless another is chosen", () => {
  assert.equal(createInitialGameState(() => 0.5).ruleset, "standard");
  assert.equal(
    createInitialGameState(() => 0.5, null, { ruleset: "dice_color" }).ruleset,
    "dice_color",
  );
});

test("an unknown rule set falls back to the current rules", () => {
  assert.equal(normalizeRulesetId("no_such_rules"), "standard");
  assert.equal(normalizeRulesetId(undefined), "standard");
  assert.equal(
    createInitialGameState(() => 0.5, null, { ruleset: "no_such_rules" }).ruleset,
    "standard",
  );
});

test("choosing the prototype alone, without coloured cards, changes nothing else", () => {
  // 色は連戦を始めるときに付く。色の無いデッキなら、同じ乱数で現行ルールと同じ戦闘が始まる。
  const standard = createInitialGameState(() => 0.5);
  const prototype = createInitialGameState(() => 0.5, null, { ruleset: "dice_color" });
  const { ruleset: _a, ...restStandard } = standard;
  const { ruleset: _b, ...restPrototype } = prototype;
  assert.deepEqual(restPrototype, restStandard);
});

test("the two prototypes are independent switches that can be combined", () => {
  assert.equal(rulesetIdFrom([]), "standard");
  assert.equal(rulesetIdFrom(["select_play", "dice_color"]), "dice_color+select_play", "order does not matter");
  assert.equal(normalizeRulesetId("select_play+dice_color"), "dice_color+select_play");
  assert.equal(normalizeRulesetId("dice_color+no_such_rule"), "dice_color");

  const both = "dice_color+select_play";
  assert.ok(hasRule(both, "dice_color") && hasRule(both, "select_play"));
  assert.equal(hasRule("dice_color", "select_play"), false);
  assert.equal(hasRule("standard", "dice_color"), false);
  assert.equal(rulesetLabel("standard"), "現行ルール");
  assert.equal(rulesetLabel(both), "ダイスの色（試作）＋選んで出す（試作）");
});
