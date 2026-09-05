import test from "node:test";
import assert from "node:assert/strict";
import { CARD_CATALOGUE, DEFAULT_DECK_COUNTS } from "../src/data/cards.js";
import { DECK_RULES } from "../src/data/constants.js";
import {
  addCard,
  canAddCard,
  createEmptyCounts,
  removeCard,
  summarizeDeck,
  validateDeck,
} from "../src/game/deckBuilder.js";

test("an empty deck is invalid and the default deck is valid", () => {
  assert.equal(validateDeck(createEmptyCounts()).valid, false);
  assert.equal(validateDeck(DEFAULT_DECK_COUNTS).valid, true);
});

test("a die value cannot exceed its budget", () => {
  let counts = createEmptyCounts();
  // 目1のカードは Strike 1 と Pierce 1 の2種類。合わせて上限4枚。
  for (let index = 0; index < DECK_RULES.MAX_PER_DIE_VALUE; index += 1) {
    counts = addCard(counts, index % 2 ? "pierce_1" : "strike_1");
  }
  assert.equal(summarizeDeck(counts).byDie[1], DECK_RULES.MAX_PER_DIE_VALUE);
  assert.equal(canAddCard(counts, "strike_1"), false);
  assert.equal(canAddCard(counts, "pierce_1"), false);
  assert.equal(canAddCard(counts, "heavy_6"), true);
});

test("wild cards have their own smaller budget", () => {
  let counts = createEmptyCounts();
  for (let index = 0; index < DECK_RULES.MAX_WILD_CARDS; index += 1) {
    counts = addCard(counts, "wild_die");
  }
  assert.equal(summarizeDeck(counts).byDie.wild, DECK_RULES.MAX_WILD_CARDS);
  assert.equal(canAddCard(counts, "wild_die"), false);
});

test("a single card cannot exceed the copy limit", () => {
  let counts = createEmptyCounts();
  for (let index = 0; index < DECK_RULES.MAX_COPIES_PER_CARD; index += 1) {
    counts = addCard(counts, "heavy_6");
  }
  assert.equal(counts.heavy_6, DECK_RULES.MAX_COPIES_PER_CARD);
  assert.equal(canAddCard(counts, "heavy_6"), false);
});

test("the die budget forces a deck to spread across at least five values", () => {
  // 目ごとの上限 4 とワイルド上限 2 では、4種類だけでは 18 枚にしか届かない。
  const reachableWithFourValues =
    DECK_RULES.MAX_PER_DIE_VALUE * 4 + DECK_RULES.MAX_WILD_CARDS;
  assert.ok(reachableWithFourValues < DECK_RULES.DECK_SIZE);
});

test("adding past the deck size is refused and removing stops at zero", () => {
  let counts = { ...createEmptyCounts(), ...DEFAULT_DECK_COUNTS };
  assert.equal(summarizeDeck(counts).total, DECK_RULES.DECK_SIZE);
  CARD_CATALOGUE.forEach((definition) => {
    assert.equal(canAddCard(counts, definition.key), false);
  });

  counts = removeCard(createEmptyCounts(), "heavy_6");
  assert.equal(counts.heavy_6, 0);
});

test("a deck with no attack cards is rejected", () => {
  let counts = createEmptyCounts();
  const tacticalKeys = ["tune_up", "tune_down", "overclock", "reorder", "recycle"];
  // 戦術カードだけでは目の枠に阻まれて20枚に届かないため、枚数エラーも併発する。
  tacticalKeys.forEach((key) => {
    for (let index = 0; index < DECK_RULES.MAX_COPIES_PER_CARD; index += 1) {
      counts = addCard(counts, key);
    }
  });
  const result = validateDeck(counts);
  assert.equal(result.valid, false);
  assert.equal(result.summary.attackCount, 0);
});
