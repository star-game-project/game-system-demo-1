import test from "node:test";
import assert from "node:assert/strict";
import { PHASES } from "../src/data/constants.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";
import {
  DEFAULT_POINT_RULES,
  POINT_RULE_PRESETS,
  normalizePointRules,
  recoverPoints,
} from "../src/game/pointRules.js";

test("recovery adds up to the cap, while full refill always tops up to the cap", () => {
  const additive = { startPoint: 10, maxPoint: 10, recovery: 3, fullRefill: false };
  assert.equal(recoverPoints(2, additive), 5);
  assert.equal(recoverPoints(9, additive), 10);

  const refill = { startPoint: 5, maxPoint: 5, recovery: 1, fullRefill: true };
  assert.equal(recoverPoints(0, refill), 5);
  assert.equal(recoverPoints(4, refill), 5);
});

test("rules are rounded, clamped, and never start above the cap", () => {
  assert.deepEqual(
    normalizePointRules({ startPoint: 9, maxPoint: "6", recovery: 2.6, fullRefill: 0 }),
    { maxPoint: 6, startPoint: 6, recovery: 3, fullRefill: false },
  );
  assert.equal(normalizePointRules({ ...DEFAULT_POINT_RULES, maxPoint: 99 }).maxPoint, 20);
  assert.equal(normalizePointRules({ ...DEFAULT_POINT_RULES, recovery: 0 }).recovery, 1);
  assert.equal(normalizePointRules({ ...DEFAULT_POINT_RULES, recovery: "abc" }).recovery, DEFAULT_POINT_RULES.recovery);
});

test("every preset is already normalized", () => {
  for (const preset of POINT_RULE_PRESETS) {
    assert.deepEqual(normalizePointRules(preset.rules), { ...preset.rules }, preset.id);
  }
});

test("a battle starts with and recovers by the chosen rules", () => {
  const pointRules = { startPoint: 6, maxPoint: 6, recovery: 2, fullRefill: false };
  const state = createInitialGameState(() => 0.5, null, { pointRules });
  assert.equal(state.player.point, 6);
  assert.equal(state.player.maxPoint, 6);

  const engine = new BattleEngine(state);
  state.player.point = 1;
  state.phase = PHASES.CPU_ATTACK;
  engine.finishTurn();
  assert.equal(state.player.point, 3);
});

test("full refill restores the cap every turn regardless of leftovers", () => {
  const pointRules = { startPoint: 5, maxPoint: 5, recovery: 1, fullRefill: true };
  const state = createInitialGameState(() => 0.5, null, { pointRules });
  const engine = new BattleEngine(state);

  state.player.point = 0;
  state.phase = PHASES.CPU_ATTACK;
  engine.finishTurn();
  assert.equal(state.player.point, 5);
});

test("the default rules match the original game", () => {
  const state = createInitialGameState(() => 0.5);
  assert.deepEqual(state.pointRules, { ...DEFAULT_POINT_RULES });
});
