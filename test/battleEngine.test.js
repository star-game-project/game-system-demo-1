import test from "node:test";
import assert from "node:assert/strict";
import { GAME_CONFIG, PHASES } from "../src/data/constants.js";
import { createDemoDeck } from "../src/data/cards.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";

test("demo deck has the specified 20-card distribution", () => {
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
      "Strike 1": 4,
      "Boost 2": 3,
      "Support 3": 3,
      "Strike 4": 4,
      "Heavy 5": 3,
      "Heavy 6": 3,
    },
  );
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
