import test from "node:test";
import assert from "node:assert/strict";
import { PHASES } from "../src/data/constants.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";
import { rollFacesOnDraw } from "../src/game/diceRollLogic.js";

/** 0, 1/6, 2/6 … を順に返す乱数。振った目が 1, 2, 3 … になる。 */
function stepper(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

const card = (id, dieValue, overrides = {}) => ({
  id,
  name: id,
  cost: 1,
  attack: 10,
  dieValue,
  baseDieValue: dieValue,
  onUseAbility: null,
  passiveAbility: null,
  tacticalAbility: null,
  ...overrides,
});

test("with the option off, cards keep the die printed on them", () => {
  const cards = [card("a", 4)];
  assert.equal(rollFacesOnDraw(cards, "standard"), cards);
  assert.equal(rollFacesOnDraw(cards, "dice_color"), cards);
});

test("with the option on, a card's die is rolled when it comes into hand", () => {
  const rolled = rollFacesOnDraw([card("a", 4), card("b", 4)], "roll_dice", stepper([0, 5 / 6]));
  assert.deepEqual(rolled.map((c) => c.dieValue), [1, 6]);
  assert.deepEqual(rolled.map((c) => c.baseDieValue), [1, 6], "a later Tune Up counts from the rolled face");
  assert.equal(rolled[0].color, undefined, "no colour without the dice-colour option");
});

test("with dice colour also on, the colour is rolled too", () => {
  const [rolled] = rollFacesOnDraw([card("a", 4, { color: "red" })], "dice_color+roll_dice", stepper([0, 0.3]));
  assert.equal(rolled.dieValue, 1);
  assert.equal(rolled.color, "blue");
});

test("a wild die stays wild: its face is not rolled, but its colour is", () => {
  const wild = card("w", 1, { passiveAbility: { type: "WILD_DIE" } });
  const [rolled] = rollFacesOnDraw([wild], "dice_color+roll_dice", stepper([0.9]));
  assert.equal(rolled.dieValue, 1);
  assert.ok(rolled.color);
});

test("the opening hand and every later draw are rolled, and the role follows the rolled faces", () => {
  // 乱数 0.5 は目 4。山札の並びは関係なく、手札はすべて 4 になる。
  const state = createInitialGameState(() => 0.5, null, { ruleset: "roll_dice" });
  assert.ok(state.player.hand.every((c) => c.dieValue === 4 || c.passiveAbility?.type === "WILD_DIE"));
  // 5枚すべて 4 なので SET（全部同じ）。
  assert.equal(state.currentRole.roleId, "same_number");

  const engine = new BattleEngine(state, stepper([0]));
  state.phase = PHASES.CARD_SELECT;
  engine.endTurn();
  engine.startCpuTurn();
  engine.finishTurn();
  assert.ok(engine.state.player.hand.every((c) => c.dieValue === 1), "the next hand is rolled again");
});
