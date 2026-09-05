import test from "node:test";
import assert from "node:assert/strict";
import { GAME_CONFIG, PHASES } from "../src/data/constants.js";
import { createDemoDeck } from "../src/data/cards.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { isTacticalCard, isWildCard } from "../src/game/abilityLogic.js";
import { evaluateHandRole } from "../src/game/roleLogic.js";
import { createInitialGameState } from "../src/game/gameState.js";

test("demo deck keeps twenty cards split into attack and tactical roles", () => {
  const deck = createDemoDeck();
  assert.equal(deck.length, GAME_CONFIG.DECK_SIZE);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(deck.map((card) => card.name))].map((name) => [
        name,
        deck.filter((card) => card.name === name).length,
      ]),
    ),
    {
      "Strike 1": 2,
      "Boost 2": 2,
      "Support 3": 2,
      "Strike 4": 3,
      "Heavy 5": 2,
      "Heavy 6": 2,
      "Wild Die": 1,
      "Tune Up": 2,
      "Tune Down": 2,
      Reorder: 1,
      Recycle: 1,
    },
  );
  assert.equal(deck.filter(isTacticalCard).length, 6);
  assert.equal(deck.filter(isWildCard).length, 1);
  assert.ok(deck.every((card) => card.baseDieValue === card.dieValue));
});

test("battle starts with five free cards, full points and fifteen-card deck", () => {
  const state = createInitialGameState(() => 0.5);
  assert.equal(state.phase, PHASES.DRAW_SELECT);
  assert.equal(state.player.hand.length, 5);
  assert.equal(state.player.deck.length, 15);
  assert.equal(state.player.point, 10);
});

test("draw costs one point and moves exactly one card into hand", () => {
  const engine = new BattleEngine(createInitialGameState(() => 0.5));
  assert.equal(engine.chooseDraw(true), true);
  assert.equal(engine.state.player.point, 9);
  assert.equal(engine.state.player.hand.length, 6);
  assert.equal(engine.state.player.deck.length, 14);
  assert.equal(engine.state.phase, PHASES.CARD_SELECT);
});

test("used card is included in role check and then moves to discard", () => {
  const cards = [1, 2, 3].map((dieValue) => ({
    id: `die_${dieValue}`,
    name: `Die ${dieValue}`,
    cost: 1,
    attack: 10,
    dieValue,
    onUseAbility: null,
    passiveAbility: null,
  }));
  const state = createInitialGameState(() => 0.5);
  state.phase = PHASES.CARD_SELECT;
  state.player.hand = cards;
  state.player.deck = [];
  const engine = new BattleEngine(state);

  engine.selectCard("die_3");
  const result = engine.useSelectedCard();

  assert.equal(result.roleName, "1-2-3");
  assert.equal(result.finalAttack, 5);
  assert.equal(engine.state.player.hand.length, 2);
  assert.equal(engine.state.player.discardPile.at(-1).id, "die_3");
  assert.equal(engine.state.cpu.hp, 95);
});

test("CPU attacks, points recover with a max of ten, and turn advances", () => {
  const state = createInitialGameState(() => 0.5);
  state.phase = PHASES.PLAYER_ATTACK;
  state.player.point = 8;
  const engine = new BattleEngine(state);

  assert.equal(engine.startCpuTurn(), true);
  assert.equal(engine.state.player.hp, 90);
  assert.equal(engine.finishTurn(), true);
  assert.equal(engine.state.player.point, 10);
  assert.equal(engine.state.turn, 2);
  assert.equal(engine.state.phase, PHASES.DRAW_SELECT);
});

test("ending a turn discards the whole hand and deals a fresh one", () => {
  const state = createInitialGameState(() => 0.5);
  state.phase = PHASES.PLAYER_ATTACK;
  const oldHandIds = state.player.hand.map((card) => card.id);
  const engine = new BattleEngine(state);

  engine.startCpuTurn();
  engine.finishTurn();

  const { player } = engine.state;
  assert.equal(player.hand.length, GAME_CONFIG.START_HAND_SIZE);
  assert.equal(player.deck.length, 10);
  assert.deepEqual(
    oldHandIds.filter((id) => !player.discardPile.some((card) => card.id === id)),
    [],
  );
  assert.equal(
    player.deck.length + player.hand.length + player.discardPile.length,
    GAME_CONFIG.DECK_SIZE,
  );
});

test("an empty deck is rebuilt by shuffling the discard pile back in", () => {
  const state = createInitialGameState(() => 0.5);
  state.phase = PHASES.PLAYER_ATTACK;
  state.player.discardPile = state.player.deck;
  state.player.deck = [];
  const engine = new BattleEngine(state, () => 0.5);

  engine.startCpuTurn();
  engine.finishTurn();

  const { player } = engine.state;
  assert.equal(player.hand.length, GAME_CONFIG.START_HAND_SIZE);
  assert.equal(
    player.deck.length + player.hand.length + player.discardPile.length,
    GAME_CONFIG.DECK_SIZE,
  );
  assert.match(engine.state.battleMessage, /捨て札をシャッフル/);
});

test("drawing recycles the discard pile once the deck runs dry", () => {
  const state = createInitialGameState(() => 0.5);
  state.player.discardPile = state.player.deck;
  state.player.deck = [];
  const engine = new BattleEngine(state, () => 0.5);

  assert.equal(engine.chooseDraw(true), true);
  const { player } = engine.state;
  assert.equal(player.hand.length, GAME_CONFIG.START_HAND_SIZE + 1);
  assert.equal(player.discardPile.length, 0);
  assert.equal(player.deck.length, 14);
  assert.equal(player.point, 9);
});

test("cards played is tracked separately from the discard pile", () => {
  const state = createInitialGameState(() => 0.5);
  state.phase = PHASES.CARD_SELECT;
  const engine = new BattleEngine(state, () => 0.5);

  engine.selectCard(state.player.hand[0].id);
  engine.useSelectedCard();
  assert.equal(engine.state.player.cardsPlayed, 1);

  engine.startCpuTurn();
  engine.finishTurn();
  assert.equal(engine.state.player.cardsPlayed, 1);
  assert.equal(engine.state.player.discardPile.length, 5);
});


const tacticalHand = () => [
  { id: "t_up", name: "Tune Up", cost: 1, attack: 0, dieValue: 4, baseDieValue: 4,
    onUseAbility: null, passiveAbility: null,
    tacticalAbility: { type: "DIE_VALUE_SHIFT", value: 1 } },
  { id: "t_swap", name: "Reorder", cost: 1, attack: 0, dieValue: 2, baseDieValue: 2,
    onUseAbility: null, passiveAbility: null,
    tacticalAbility: { type: "HAND_POSITION_SWAP" } },
  { id: "t_redraw", name: "Recycle", cost: 1, attack: 0, dieValue: 5, baseDieValue: 5,
    onUseAbility: null, passiveAbility: null,
    tacticalAbility: { type: "REDRAW_CARD" } },
  { id: "a_five", name: "Heavy 5", cost: 3, attack: 20, dieValue: 5, baseDieValue: 5,
    onUseAbility: null, passiveAbility: null, tacticalAbility: null },
  { id: "a_six", name: "Heavy 6", cost: 3, attack: 25, dieValue: 6, baseDieValue: 6,
    onUseAbility: null, passiveAbility: null, tacticalAbility: null },
];

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

function engineWithHand(hand) {
  const state = createInitialGameState(() => 0.5);
  state.phase = PHASES.CARD_SELECT;
  state.player.hand = hand;
  state.currentRole = evaluateHandRole(hand);
  return new BattleEngine(state, () => 0.5);
}

function tacticalEngine() {
  return engineWithHand(tacticalHand());
}

test("a tactical card shifts a die, spends a point and does not end the turn", () => {
  const engine = tacticalEngine();
  const pointBefore = engine.state.player.point;

  const result = engine.playTacticalCard("t_up", ["a_five"]);

  assert.ok(result);
  assert.equal(engine.state.phase, PHASES.CARD_SELECT);
  assert.equal(engine.state.player.point, pointBefore - 1);
  assert.equal(engine.state.player.hand.find((c) => c.id === "a_five").dieValue, 6);
  assert.equal(engine.state.player.hand.find((c) => c.id === "t_up"), undefined);
  assert.equal(engine.state.player.discardPile.at(-1).id, "t_up");
});

test("shifting a die is clamped to the one-to-six range", () => {
  const engine = tacticalEngine();
  engine.playTacticalCard("t_up", ["a_six"]);
  assert.equal(engine.state.player.hand.find((c) => c.id === "a_six").dieValue, 6);
});

test("tuning a die into place completes SAME NUMBER before the attack", () => {
  const engine = engineWithHand([
    card("t_up", 4, {
      attack: 0,
      tacticalAbility: { type: "DIE_VALUE_SHIFT", value: 1 },
    }),
    card("five", 5),
    card("six", 6),
  ]);
  assert.equal(engine.state.currentRole.roleId, null);

  engine.playTacticalCard("t_up", ["five"]);

  assert.equal(engine.state.currentRole.roleId, "same_number");
  assert.equal(engine.state.currentRole.multiplier, 4);

  // 役倍率は攻撃前に反映される。
  engine.selectCard("six");
  assert.equal(engine.getAttackPreview("six").finalAttack, 40);
});

test("position swap reorders the hand without changing the role", () => {
  const engine = engineWithHand([
    card("a", 2),
    card("swap", 2, {
      attack: 0,
      tacticalAbility: { type: "HAND_POSITION_SWAP" },
    }),
    card("b", 4),
    card("c", 6),
  ]);
  assert.equal(engine.state.currentRole.roleId, "even_only");

  engine.playTacticalCard("swap", ["a", "c"]);

  assert.deepEqual(engine.state.player.hand.map((item) => item.id), ["c", "b", "a"]);
  // 目の内訳は変わらないので役も変わらない。
  assert.equal(engine.state.currentRole.roleId, "even_only");
});

test("redraw discards the target and draws a replacement", () => {
  const engine = tacticalEngine();
  const deckBefore = engine.state.player.deck.length;

  engine.playTacticalCard("t_redraw", ["a_six"]);

  const { player } = engine.state;
  assert.equal(player.hand.length, 4);
  assert.equal(player.hand.some((card) => card.id === "a_six"), false);
  assert.equal(player.deck.length, deckBefore - 1);
  assert.ok(player.discardPile.some((card) => card.id === "a_six"));
});

test("tactical cards are rejected as attacks and by bad targeting", () => {
  const engine = tacticalEngine();

  assert.equal(engine.selectCard("t_up"), false);
  assert.equal(engine.state.selectedCardId, null);
  assert.equal(engine.playTacticalCard("a_five", ["a_six"]), null);
  assert.equal(engine.playTacticalCard("t_up", []), null);
  assert.equal(engine.playTacticalCard("t_up", ["t_up"]), null);
  assert.equal(engine.playTacticalCard("t_swap", ["a_five"]), null);
  assert.equal(engine.state.player.hand.length, 5);
});

test("a hand of only tactical cards allows ending the turn", () => {
  const engine = tacticalEngine();
  engine.state.player.hand = tacticalHand().filter(isTacticalCard);

  assert.equal(engine.hasPlayableAttackCard(), false);
  assert.equal(engine.endTurnWithoutCard(), true);
  assert.equal(engine.state.phase, PHASES.PLAYER_ATTACK);
});
