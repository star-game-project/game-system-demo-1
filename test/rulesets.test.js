import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/game/gameState.js";
import {
  DEFAULT_RULESET_ID,
  RULESETS,
  RULESET_BY_ID,
  normalizeRulesetId,
} from "../src/game/rulesets.js";

test("the current rules and the dice-colour prototype are both selectable", () => {
  assert.deepEqual(
    RULESETS.map((ruleset) => ruleset.id),
    ["standard", "dice_color"],
  );
  assert.equal(DEFAULT_RULESET_ID, "standard");
  assert.ok(RULESET_BY_ID[DEFAULT_RULESET_ID]);
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
