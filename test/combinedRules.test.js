import test from "node:test";
import assert from "node:assert/strict";
import { PHASES } from "../src/data/constants.js";
import { rolesFor } from "../src/data/roles.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";

/** 「ダイスの色（試作）」と「選んで出す（試作）」を両方 ON にしたルール。 */
const BOTH = "dice_color+select_play";

const card = (id, dieValue, color, overrides = {}) => ({
  id,
  name: id,
  cost: 1,
  attack: 10,
  dieValue,
  baseDieValue: dieValue,
  color,
  onUseAbility: null,
  passiveAbility: null,
  tacticalAbility: null,
  ...overrides,
});

function bothEngine(hand) {
  const state = createInitialGameState(() => 0.5, null, { ruleset: BOTH });
  state.player.hand = hand;
  const engine = new BattleEngine(state, () => 0.5);
  state.currentRole = engine.evaluateRole();
  return engine;
}

const play = (engine, id) => {
  assert.ok(engine.selectCard(id), id);
  assert.ok(engine.useSelectedCard(), id);
};

test("combining both prototypes keeps the colour roles and the field's role conditions", () => {
  const roles = rolesFor(BOTH);
  assert.ok(roles.some((role) => role.family === "color"), "colour roles are judged");
  assert.equal(roles.some((role) => role.kind === "penalty"), false, "1-2-3 is not judged on the field");
  assert.equal(roles.find((role) => role.id === "flush").minHandSize, 5);
  assert.equal(roles.find((role) => role.id === "even_only").minHandSize, 5);
});

test("with both on, a battle starts in the card phase with the chosen hand size", () => {
  const state = createInitialGameState(() => 0.5, null, { ruleset: BOTH, handSize: 7 });
  assert.equal(state.phase, PHASES.CARD_SELECT);
  assert.equal(state.player.hand.length, 7);
});

test("colour on the field counts: three red cards make FLUSH (3枚) on top of the dice role", () => {
  const engine = bothEngine([
    card("a", 4, "red", { attack: 10 }),
    card("b", 4, "red", { attack: 10 }),
    card("c", 1, "red", { attack: 10 }),
    card("d", 6, "blue"),
  ]);
  ["a", "b", "c"].forEach((id) => play(engine, id));
  // 場は 4,4,1 がすべて赤：SET（2枚）×1.1 × FLUSH（3枚）×1.1。手札に残った青は数えない。
  assert.deepEqual(engine.state.currentRole.roles.map((role) => role.id).sort(), ["pair", "three_flush"]);
  engine.endTurn();
  const each = Math.round(10 * 1.1 * 1.1);
  assert.equal(engine.state.enemies[0].hp, 50 - each * 3);
});
