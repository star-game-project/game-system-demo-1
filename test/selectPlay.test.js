import test from "node:test";
import assert from "node:assert/strict";
import { PHASES } from "../src/data/constants.js";
import { rolesFor } from "../src/data/roles.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";

/** 「選んで出す（試作）」の戦闘。手札は直接組む。 */
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

function selectEngine(hand, { point = 10, items = [] } = {}) {
  const state = createInitialGameState(() => 0.5, null, { ruleset: "select_play", items });
  state.phase = PHASES.CARD_SELECT;
  state.player.hand = hand;
  state.player.point = point;
  const engine = new BattleEngine(state, () => 0.5);
  state.currentRole = engine.evaluateRole();
  return engine;
}

const select = (engine, ...ids) => ids.forEach((id) => assert.ok(engine.toggleSelection(id), id));

test("the role is judged on the chosen cards only", () => {
  const engine = selectEngine([card("a", 4), card("b", 4), card("c", 1), card("d", 6), card("e", 3)]);
  assert.equal(engine.state.currentRole.multiplier, 1, "nothing chosen, no role");
  select(engine, "a", "c");
  assert.equal(engine.state.currentRole.multiplier, 1, "4 and 1 make nothing");
  select(engine, "b");
  assert.equal(engine.state.currentRole.roleId, "pair");
  // もう一度押すと外れる。
  engine.toggleSelection("b");
  assert.equal(engine.state.currentRole.multiplier, 1);
});

test("the chosen cards are played together: their attack is summed and multiplied once", () => {
  const engine = selectEngine([card("a", 4, { attack: 10 }), card("b", 4, { attack: 15 }), card("c", 1)]);
  select(engine, "a", "b");
  const result = engine.playSelectedGroup();

  // 4,4 は SET（2枚）×1.1。(10 + 15) × 1.1 = 27.5 → 28。
  assert.equal(result.totalAttack, 25);
  assert.equal(result.finalAttack, 28);
  assert.equal(engine.state.enemies[0].hp, 50 - 28);
  assert.equal(engine.state.enemies[1].hp, 50, "a single-target group hits only the target");
  assert.equal(engine.state.player.point, 8);
  assert.deepEqual(engine.state.player.hand.map((c) => c.id), ["c"]);
  assert.equal(engine.state.player.discardPile.length, 2);
});

test("playing the group ends the turn", () => {
  const engine = selectEngine([card("a", 4), card("b", 4)]);
  select(engine, "a");
  engine.playSelectedGroup();
  assert.equal(engine.state.phase, PHASES.PLAYER_ATTACK);
  assert.equal(engine.playSelectedGroup(), null, "only once a turn");
});

test("defense cards in the group add their defense as shield, without the multiplier, and count toward the role", () => {
  const engine = selectEngine([card("atk", 4, { attack: 10 }), card("def", 4, { attack: 0, defense: 10 })]);
  select(engine, "atk", "def");
  const result = engine.playSelectedGroup();
  // 防御カードの目も役に入る（4,4 で SET（2枚））。攻撃は 10 × 1.1、シールドは 10 のまま。
  assert.equal(result.roleId, "pair");
  assert.equal(result.finalAttack, 11);
  assert.equal(engine.state.player.shield, 10);
});

test("a group cannot cost more than the points left", () => {
  const engine = selectEngine([card("a", 4, { cost: 3 }), card("b", 4, { cost: 3 })], { point: 5 });
  assert.ok(engine.toggleSelection("a"));
  assert.equal(engine.canToggleSelection("b"), false);
  assert.equal(engine.toggleSelection("b"), false);
});

test("an area attack in the group hits every enemy, with the group's multiplier", () => {
  const engine = selectEngine([card("a", 3, { attack: 10 }), card("sweep", 3, { attack: 9, target: "all" })]);
  select(engine, "a", "sweep");
  engine.playSelectedGroup();
  // 3,3 は ×1.1。対象には (10 + 9) × 1.1 = 21、もう1体には 9 × 1.1 = 10。
  assert.equal(engine.state.enemies[0].hp, 50 - 21);
  assert.equal(engine.state.enemies[1].hp, 50 - 10);
});

test("'all of' stages need five chosen cards, so two matching cards stay a plain pair", () => {
  const two = selectEngine([card("a", 2), card("b", 2)]);
  select(two, "a", "b");
  assert.deepEqual(two.state.currentRole.roles.map((role) => role.id), ["pair"]);

  const five = selectEngine([2, 2, 2, 2, 2].map((value, index) => card(`c${index}`, value)));
  select(five, "c0", "c1", "c2", "c3", "c4");
  assert.deepEqual(five.state.currentRole.roles.map((role) => role.id), ["same_number"]);
});

test("the 1-2-3 penalty is not judged, since it could simply be left in hand", () => {
  assert.equal(rolesFor("select_play").some((role) => role.kind === "penalty"), false);
  const engine = selectEngine([card("a", 1), card("b", 2), card("c", 3)]);
  select(engine, "a", "b", "c");
  assert.deepEqual(engine.state.currentRole.roles.map((role) => role.id), ["three_straight"]);
});

test("one-card play and the role lock are switched off under this rule", () => {
  const engine = selectEngine([card("a", 4), card("b", 4)], { items: ["role_lock"] });
  assert.equal(engine.selectCard("a"), false);
  assert.equal(engine.useSelectedCard(), null);
  select(engine, "a", "b");
  assert.equal(engine.canUseItemAt(0), false);
});

test("a tactical card that discards a chosen card takes it out of the selection", () => {
  const recycle = card("recycle", 5, { attack: 0, tacticalAbility: { type: "REDRAW_CARD" } });
  const engine = selectEngine([card("a", 4), card("b", 4), recycle]);
  select(engine, "a", "b");
  assert.equal(engine.toggleSelection("recycle"), false, "tactical cards are used on their own");
  engine.playTacticalCard("recycle", ["a"]);
  assert.deepEqual(engine.state.selectedCardIds, ["b"]);
  assert.equal(engine.state.currentRole.multiplier, 1);
});

test("knocking out every enemy wins the battle", () => {
  const engine = selectEngine([card("a", 4, { attack: 30, target: "all" }), card("b", 4, { attack: 30, target: "all" })]);
  select(engine, "a", "b");
  engine.playSelectedGroup();
  assert.equal(engine.state.phase, PHASES.VICTORY);
});

test("a fresh battle under this rule starts with nothing chosen and no role", () => {
  const state = createInitialGameState(() => 0.5, null, { ruleset: "select_play" });
  assert.deepEqual(state.selectedCardIds, []);
  assert.equal(state.currentRole.multiplier, 1);
});
