import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DECK_COUNTS, createDeckFromCounts } from "../src/data/cards.js";
import { DICE_COLORS, DICE_COLOR_COUNT, diceColorsFor, normalizeColorCount } from "../src/data/diceColors.js";
import { createInitialGameState } from "../src/game/gameState.js";
import { rollFacesOnDraw } from "../src/game/diceRollLogic.js";
import { DECK_RULES } from "../src/data/constants.js";
import {
  applyRewardColors,
  rollDiceColor,
  rollRunColors,
} from "../src/game/colorLogic.js";

test("four dice colours by default, up to six", () => {
  assert.deepEqual(
    diceColorsFor().map((color) => color.id),
    ["red", "blue", "green", "yellow"],
  );
  assert.equal(DICE_COLOR_COUNT.DEFAULT, 4);
  assert.equal(DICE_COLOR_COUNT.MAX, 6);
  assert.deepEqual(
    DICE_COLORS.map((color) => color.id),
    ["red", "blue", "green", "yellow", "purple", "orange"],
  );
  assert.deepEqual(diceColorsFor(6).map((color) => color.id), DICE_COLORS.map((color) => color.id));
});

test("the colour count stays between two and six", () => {
  assert.equal(normalizeColorCount(1), 2);
  assert.equal(normalizeColorCount(9), 6);
  assert.equal(normalizeColorCount(undefined), 4);
  assert.equal(normalizeColorCount(5), 5);
});

test("with more colours, the rolls spread over all of them", () => {
  // 6色なら random() の値域を6等分した区間ごとの色になる。
  assert.equal(rollDiceColor(() => 0.99, 6), "orange");
  assert.equal(rollDiceColor(() => 4.5 / 6, 6), "purple");
  // 2色なら赤と青だけ。
  assert.equal(rollDiceColor(() => 0.99, 2), "blue");
  const colors = rollRunColors({ pierce_1: 3 }, () => 0.99, 5);
  assert.deepEqual(colors.pierce_1, ["purple", "purple", "purple"]);
});

test("the chosen colour count is kept in the battle and used when faces are rolled", () => {
  assert.equal(createInitialGameState(() => 0.5).colorCount, 4);
  assert.equal(createInitialGameState(() => 0.5, null, { colorCount: 6 }).colorCount, 6);
  const [rolled] = rollFacesOnDraw([{ id: "a", dieValue: 1 }], "dice_color+roll_dice", () => 0.99, 6);
  assert.equal(rolled.color, "orange");
});

test("each colour is rolled with equal chance", () => {
  // random() の値域を4等分した区間ごとに、それぞれの色になる。
  assert.equal(rollDiceColor(() => 0), "red");
  assert.equal(rollDiceColor(() => 0.25), "blue");
  assert.equal(rollDiceColor(() => 0.5), "green");
  assert.equal(rollDiceColor(() => 0.99), "yellow");
});

test("a run colours every card in the deck, one colour per copy", () => {
  const colors = rollRunColors({ pierce_1: 2, heavy_6: 1, boost_2: 0 }, () => 0.5);
  assert.deepEqual(colors, { pierce_1: ["green", "green"], heavy_6: ["green"] });
});

test("the i-th colour goes to the i-th copy of a card", () => {
  const deck = createDeckFromCounts({ pierce_1: 2 }, { pierce_1: ["red", "blue"] });
  assert.deepEqual(
    deck.map((card) => [card.id, card.color]),
    [["pierce_1_1", "red"], ["pierce_1_2", "blue"]],
  );
});

test("cards built without colours carry no colour at all (current rules)", () => {
  const deck = createDeckFromCounts(DEFAULT_DECK_COUNTS);
  assert.ok(deck.every((card) => !("color" in card)));
});

test("a gained card joins the run in the colour it was offered in", () => {
  const counts = { pierce_1: 1 };
  const next = applyRewardColors({ pierce_1: ["red"] }, counts, ["pierce_1", "heavy_6"], {
    gainKey: "pierce_1",
    gainColor: "yellow",
  });
  assert.deepEqual(next, { pierce_1: ["red", "yellow"] });
});

test("removing picks out exactly the chosen copy's colour", () => {
  const counts = { pierce_1: 3, heavy_6: DECK_RULES.MIN_DECK_SIZE };
  const next = applyRewardColors(
    { pierce_1: ["red", "blue", "green"], heavy_6: Array(DECK_RULES.MIN_DECK_SIZE).fill("red") },
    counts,
    [],
    { removeKey: "pierce_1", removeIndex: 1 },
  );
  assert.deepEqual(next.pierce_1, ["red", "green"]);
});

test("a removal the deck size forbids leaves the colours alone", () => {
  // 最小枚数ちょうどのデッキからは削除できない。枚数側と同じ条件で止める。
  const counts = { pierce_1: DECK_RULES.MIN_DECK_SIZE };
  const colors = { pierce_1: Array(DECK_RULES.MIN_DECK_SIZE).fill("blue") };
  const next = applyRewardColors(colors, counts, [], { removeKey: "pierce_1", removeIndex: 0 });
  assert.deepEqual(next, colors);
});

test("gaining and removing the same card keeps indices of the old copies", () => {
  const counts = { pierce_1: 2, heavy_6: DECK_RULES.MIN_DECK_SIZE };
  const next = applyRewardColors(
    { pierce_1: ["red", "blue"], heavy_6: Array(DECK_RULES.MIN_DECK_SIZE).fill("red") },
    counts,
    ["pierce_1"],
    { gainKey: "pierce_1", gainColor: "green", removeKey: "pierce_1", removeIndex: 0 },
  );
  assert.deepEqual(next.pierce_1, ["blue", "green"]);
});

test("an offer that was not on the table cannot be gained", () => {
  const next = applyRewardColors({ pierce_1: ["red"] }, { pierce_1: 1 }, ["heavy_6"], {
    gainKey: "pierce_1",
    gainColor: "green",
  });
  assert.deepEqual(next, { pierce_1: ["red"] });
});
