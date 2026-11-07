import test from "node:test";
import assert from "node:assert/strict";
import { PHASES } from "../src/data/constants.js";
import { ITEMS, ITEM_RULES } from "../src/data/items.js";
import { BattleEngine } from "../src/game/battleEngine.js";
import { createInitialGameState } from "../src/game/gameState.js";
import { applyItemReward, canGainItem, drawItemOffers } from "../src/game/itemLogic.js";

function engineWithItems(items, { hp = 50, phase = PHASES.CARD_SELECT } = {}) {
  const state = createInitialGameState(() => 0.5, null, { items });
  state.player.hp = hp;
  state.phase = phase;
  return new BattleEngine(state, () => 0.5);
}

test("a battle starts with the items carried in, and none by default", () => {
  assert.deepEqual(createInitialGameState(() => 0.5).player.items, []);
  assert.deepEqual(
    createInitialGameState(() => 0.5, null, { items: ["heal_potion"] }).player.items,
    ["heal_potion"],
  );
});

test("a heal potion restores HP, costs no points and is used up", () => {
  const engine = engineWithItems(["heal_potion", "heal_potion"], { hp: 50 });
  const pointBefore = engine.state.player.point;

  assert.ok(engine.useItem(0));

  assert.equal(engine.state.player.hp, 70);
  assert.equal(engine.state.player.point, pointBefore);
  assert.deepEqual(engine.state.player.items, ["heal_potion"]);
  assert.equal(engine.state.phase, PHASES.CARD_SELECT);
  assert.match(engine.state.battleMessage, /20回復/);
});

test("healing stops at max HP and reports only what was restored", () => {
  const engine = engineWithItems(["heal_potion"], { hp: 110 });
  engine.useItem(0);
  assert.equal(engine.state.player.hp, engine.state.player.maxHp);
  assert.match(engine.state.battleMessage, /10回復/);
});

test("a heal potion cannot be wasted at full HP", () => {
  const engine = engineWithItems(["heal_potion"]);
  engine.state.player.hp = engine.state.player.maxHp;
  assert.equal(engine.canUseItemAt(0), false);
  assert.equal(engine.useItem(0), null);
  assert.deepEqual(engine.state.player.items, ["heal_potion"]);
});

test("items are used only while choosing cards on your own turn", () => {
  for (const phase of [PHASES.DRAW_SELECT, PHASES.CPU_ATTACK, PHASES.VICTORY]) {
    const engine = engineWithItems(["heal_potion"], { phase });
    assert.equal(engine.useItem(0), null, phase);
  }
  assert.equal(engineWithItems([]).useItem(0), null);
});

test("reward offers come from the item list without repeats", () => {
  const offers = drawItemOffers(() => 0.5);
  assert.equal(offers.length, Math.min(ITEM_RULES.OFFER_COUNT, ITEMS.length));
  assert.equal(new Set(offers).size, offers.length);
});

test("a reward adds the chosen item, but never past the carrying limit", () => {
  assert.deepEqual(applyItemReward([], ["heal_potion"], "heal_potion"), ["heal_potion"]);
  assert.deepEqual(applyItemReward([], ["heal_potion"], null), []);
  assert.deepEqual(applyItemReward([], [], "heal_potion"), []);

  const full = Array(ITEM_RULES.MAX_HELD).fill("heal_potion");
  assert.equal(canGainItem(full), false);
  assert.deepEqual(applyItemReward(full, ["heal_potion"], "heal_potion"), full);
});

// ---- Role Lock ----

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

/** 4,4 のペアがある手札。片方の4を使うとペアが崩れる。 */
function lockEngine(items = ["role_lock"]) {
  const state = createInitialGameState(() => 0.5, null, { items });
  state.phase = PHASES.CARD_SELECT;
  state.player.hand = [card("four_a", 4), card("four_b", 4), card("one", 1), card("six", 6)];
  const engine = new BattleEngine(state, () => 0.5);
  state.currentRole = engine.evaluateRole();
  return engine;
}

test("the role lock holds the multiplier even after the pair is broken", () => {
  const engine = lockEngine();
  assert.equal(engine.state.currentRole.roleId, "pair");
  const locked = engine.state.currentRole.multiplier;

  assert.ok(engine.useItem(0));
  engine.selectCard("four_a");
  engine.useSelectedCard();

  // 手札の4は1枚だけになったが、役は固定したまま。
  assert.equal(engine.state.player.hand.filter((c) => c.dieValue === 4).length, 1);
  assert.equal(engine.state.currentRole.multiplier, locked);
  assert.deepEqual(engine.state.player.items, []);
});

test("attacks under the lock use the locked multiplier", () => {
  const engine = lockEngine();
  const locked = engine.state.currentRole.multiplier;
  engine.useItem(0);
  engine.selectCard("four_a");
  engine.useSelectedCard();

  // 2枚目：手札だけ見れば役なし（×1）だが、固定した倍率が掛かる。
  const preview = engine.getAttackPreview("six");
  assert.equal(preview.roleMultiplier, locked);
  assert.equal(preview.finalAttack, Math.round(10 * locked));
});

test("the lock is released when the turn ends", () => {
  const engine = lockEngine();
  engine.useItem(0);
  engine.endTurn();
  engine.startCpuTurn();
  engine.finishTurn();
  assert.equal(engine.state.lockedRole, null);
});

test("the lock can be used only once a turn, and never on a role worth nothing", () => {
  const twice = lockEngine(["role_lock", "role_lock"]);
  assert.ok(twice.useItem(0));
  assert.equal(twice.canUseItemAt(0), false);
  assert.equal(twice.useItem(0), null);

  // 役なし（×1）の手札では固定できない。
  const none = lockEngine();
  none.state.player.hand = [card("one", 1), card("four", 4)];
  none.state.currentRole = none.evaluateRole();
  assert.equal(none.state.currentRole.multiplier, 1);
  assert.equal(none.canUseItemAt(0), false);
});
