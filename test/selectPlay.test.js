import test from "node:test";
import assert from "node:assert/strict";
import { PHASES } from "../src/data/constants.js";
import { rolesFor } from "../src/data/roles.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";

/**
 * 「選んで出す（試作）」の戦闘。カードは1枚ずつ対象を選んで場に出し、
 * ターン終了時に、場のカードだけで判定した役の倍率でまとめて処理する。手札は直接組む。
 */
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

function fieldEngine(hand, { point = 10, items = [] } = {}) {
  const state = createInitialGameState(() => 0.5, null, { ruleset: "select_play", items });
  state.phase = PHASES.CARD_SELECT;
  state.player.hand = hand;
  state.player.point = point;
  const engine = new BattleEngine(state, () => 0.5);
  state.currentRole = engine.evaluateRole();
  return engine;
}

/** 対象を選んでから1枚出す。 */
function play(engine, cardId, targetId = null) {
  if (targetId) assert.ok(engine.setTarget(targetId));
  assert.ok(engine.selectCard(cardId), cardId);
  assert.ok(engine.useSelectedCard(), cardId);
}

test("a played card goes to the field and does nothing until the turn ends", () => {
  const engine = fieldEngine([card("a", 4), card("b", 4)]);
  play(engine, "a");

  assert.equal(engine.state.enemies[0].hp, 50, "no damage yet");
  assert.equal(engine.state.player.point, 9, "points are paid when the card is played");
  assert.deepEqual(engine.getPlayedCards().map((c) => c.id), ["a"]);
  assert.deepEqual(engine.state.player.hand.map((c) => c.id), ["b"]);
  assert.equal(engine.state.phase, PHASES.CARD_SELECT, "the turn goes on");
});

test("the first card played also gets the multiplier of the role decided at the end", () => {
  const engine = fieldEngine([card("a", 4, { attack: 10 }), card("b", 4, { attack: 15 }), card("c", 1)]);
  play(engine, "a");
  // 1枚目を出した時点では、場に 4 が1枚だけで役はない。
  assert.equal(engine.state.currentRole.multiplier, 1);
  play(engine, "b");
  assert.equal(engine.state.currentRole.roleId, "pair");

  engine.endTurn();
  // 4,4 は SET（2枚）×1.1。1枚目も 10 × 1.1 = 11、2枚目は 15 × 1.1 = 17（四捨五入）。
  assert.equal(engine.state.enemies[0].hp, 50 - 11 - 17);
  assert.equal(engine.state.lastAttack.roleMultiplier, 1.1);
  assert.equal(engine.state.phase, PHASES.PLAYER_ATTACK);
  assert.deepEqual(engine.getPlayedCards(), [], "the field is cleared");
  assert.equal(engine.state.player.discardPile.length, 2);
});

test("each card keeps the target chosen when it was played", () => {
  const engine = fieldEngine([card("a", 4, { attack: 10 }), card("b", 4, { attack: 10 })]);
  play(engine, "a", "enemy_1");
  play(engine, "b", "enemy_2");
  engine.endTurn();
  assert.equal(engine.state.enemies[0].hp, 50 - 11);
  assert.equal(engine.state.enemies[1].hp, 50 - 11);
});

test("an attack whose target already fell goes to the first enemy still standing", () => {
  const engine = fieldEngine([card("a", 4, { attack: 60 }), card("b", 4, { attack: 10 })]);
  engine.state.enemies[1].hp = 5;
  play(engine, "a", "enemy_1");
  play(engine, "b", "enemy_1");
  engine.state.enemies[1].hp = 5;
  engine.endTurn();
  // 1枚目で AEGIS A が倒れ、2枚目（対象は A）は生き残っている B に当たる。
  assert.equal(engine.state.enemies[0].hp, 0);
  assert.equal(engine.state.enemies[1].hp, 0);
  assert.equal(engine.state.phase, PHASES.VICTORY);
});

test("defense cards count toward the role and add shield, without the multiplier", () => {
  const engine = fieldEngine([card("atk", 4, { attack: 10 }), card("def", 4, { attack: 0, defense: 10 })]);
  play(engine, "def");
  play(engine, "atk");
  engine.endTurn();
  // 防御カードの目も役に入る（4,4 で SET（2枚））。攻撃は 10 × 1.1、シールドは 10 のまま。
  assert.equal(engine.state.enemies[0].hp, 50 - 11);
  assert.equal(engine.state.player.shield, 10);
});

test("an area attack on the field hits every enemy, with the field's multiplier", () => {
  const engine = fieldEngine([card("a", 3, { attack: 10 }), card("sweep", 3, { attack: 9, target: "all" })]);
  play(engine, "a");
  play(engine, "sweep");
  engine.endTurn();
  // 3,3 は ×1.1。対象には 11 + 10、もう1体には 10。
  assert.equal(engine.state.enemies[0].hp, 50 - 11 - 10);
  assert.equal(engine.state.enemies[1].hp, 50 - 10);
});

test("the preview of a selected card uses the tentative role of the field plus that card", () => {
  const engine = fieldEngine([card("a", 4, { attack: 10 }), card("b", 4, { attack: 20 })]);
  play(engine, "a");
  engine.selectCard("b");
  const preview = engine.getAttackPreview("b");
  assert.equal(preview.tentative, true);
  assert.equal(preview.roleMultiplier, 1.1);
  assert.equal(preview.finalAttack, 22);
  // 見込みを出しても、敵や場は変わらない。
  assert.equal(engine.state.enemies[0].hp, 50);
  assert.equal(engine.getFieldPreview().finalAttack, 10, "the field alone is a lone 4, no role yet");
});

test("cards cannot be played past the points left", () => {
  const engine = fieldEngine([card("a", 4, { cost: 3 }), card("b", 4, { cost: 3 })], { point: 5 });
  play(engine, "a");
  assert.equal(engine.selectCard("b"), false);
});

test("'all of' stages need five cards on the field, and 1-2-3 is not judged", () => {
  const two = fieldEngine([card("a", 2), card("b", 2)]);
  play(two, "a");
  play(two, "b");
  assert.deepEqual(two.state.currentRole.roles.map((role) => role.id), ["pair"]);

  assert.equal(rolesFor("select_play").some((role) => role.kind === "penalty"), false);
  const low = fieldEngine([card("a", 1), card("b", 2), card("c", 3)]);
  ["a", "b", "c"].forEach((id) => play(low, id));
  assert.deepEqual(low.state.currentRole.roles.map((role) => role.id), ["three_straight"]);
});

test("the role lock cannot be used under this rule", () => {
  const engine = fieldEngine([card("a", 4), card("b", 4)], { items: ["role_lock"] });
  play(engine, "a");
  play(engine, "b");
  assert.equal(engine.canUseItemAt(0), false);
});

test("tactical cards still take effect at once and are not part of the field", () => {
  const tuneUp = card("tune", 2, { attack: 0, tacticalAbility: { type: "DIE_VALUE_SHIFT", value: 1 } });
  const engine = fieldEngine([card("a", 4), card("b", 3), tuneUp]);
  play(engine, "a");
  // 手札の 3 を 4 にしてから出すと、場は 4,4 になる。
  assert.ok(engine.playTacticalCard("tune", ["b"]));
  play(engine, "b");
  assert.deepEqual(engine.getPlayedCards().map((c) => c.id), ["a", "b"]);
  assert.equal(engine.state.currentRole.roleId, "pair");
});

test("ending the turn with an empty field is an ordinary end of turn", () => {
  const engine = fieldEngine([card("a", 4)]);
  engine.endTurn();
  assert.equal(engine.state.phase, PHASES.PLAYER_ATTACK);
  assert.equal(engine.state.enemies[0].hp, 50);
});

test("a fresh battle under this rule starts with an empty field and no role", () => {
  const state = createInitialGameState(() => 0.5, null, { ruleset: "select_play" });
  assert.deepEqual(state.playedCards, []);
  assert.equal(state.currentRole.multiplier, 1);
});

test("there is no draw step: every turn starts with a full hand, ready to play", () => {
  const state = createInitialGameState(() => 0.5, null, { ruleset: "select_play" });
  assert.equal(state.phase, PHASES.CARD_SELECT);
  assert.equal(state.player.hand.length, state.handSize);

  const engine = new BattleEngine(state, () => 0.5);
  assert.equal(engine.chooseDraw(true), false, "drawing is not offered");
  engine.endTurn();
  engine.startCpuTurn();
  engine.finishTurn();
  assert.equal(engine.state.phase, PHASES.CARD_SELECT);
  assert.equal(engine.state.player.hand.length, state.handSize);

  // ほかのルールは今までどおりドロー選択から始まる。
  assert.equal(createInitialGameState(() => 0.5).phase, PHASES.DRAW_SELECT);
  assert.equal(createInitialGameState(() => 0.5, null, { ruleset: "dice_color" }).phase, PHASES.DRAW_SELECT);
});

test("the hand size is chosen on the build screen, six or seven, and only for this rule", () => {
  const six = createInitialGameState(() => 0.5, null, { ruleset: "select_play" });
  assert.equal(six.handSize, 6, "six by default");
  assert.equal(six.player.hand.length, 6);

  const seven = createInitialGameState(() => 0.5, null, { ruleset: "select_play", handSize: 7 });
  assert.equal(seven.player.hand.length, 7);
  const engine = new BattleEngine(seven, () => 0.5);
  engine.endTurn();
  engine.startCpuTurn();
  engine.finishTurn();
  assert.equal(engine.state.player.hand.length, 7, "every turn refills to the chosen size");

  assert.equal(createInitialGameState(() => 0.5, null, { ruleset: "select_play", handSize: 9 }).handSize, 6, "only 6 or 7");
  assert.equal(createInitialGameState(() => 0.5, null, { handSize: 7 }).player.hand.length, 5, "the current rules keep five");
});
