import test from "node:test";
import assert from "node:assert/strict";
import { CARD_BY_KEY, CARD_CATALOGUE, DEFAULT_DECK_COUNTS } from "../src/data/cards.js";
import { DECK_RULES, REWARD_RULES } from "../src/data/constants.js";
import { BONUS_ROLES } from "../src/data/roles.js";
import {
  applyReward,
  applyRoleUpgrade,
  canRemoveFromRun,
  countCards,
  drawRewardOffers,
  drawRoleOffers,
} from "../src/game/rewardLogic.js";

const minimal = () => ({ ...DEFAULT_DECK_COUNTS });

test("offers are distinct catalogue cards, three by default", () => {
  for (const seed of [0, 0.3, 0.7, 0.999]) {
    const offers = drawRewardOffers(() => seed);
    assert.equal(offers.length, REWARD_RULES.OFFER_COUNT);
    assert.equal(new Set(offers).size, offers.length);
    assert.ok(offers.every((key) => CARD_BY_KEY[key]));
  }
});

test("every catalogue card can be offered", () => {
  const seen = new Set();
  let state = 1;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  for (let index = 0; index < 500; index += 1) drawRewardOffers(random).forEach((key) => seen.add(key));
  assert.equal(seen.size, CARD_CATALOGUE.length);
});

test("choosing an offer adds one copy, and removing takes one away", () => {
  const counts = minimal();
  const offers = ["guard", "heavy_6", "recycle"];
  const next = applyReward(counts, offers, { gainKey: "heavy_6", removeKey: "pierce_1" });

  assert.equal(next.heavy_6, counts.heavy_6 + 1);
  assert.equal(next.pierce_1, counts.pierce_1 - 1);
  assert.equal(countCards(next), countCards(counts));
  assert.equal(counts.heavy_6, DEFAULT_DECK_COUNTS.heavy_6, "the input counts are not mutated");
});

test("both the gain and the removal are optional", () => {
  const counts = minimal();
  assert.deepEqual(applyReward(counts, ["guard"], {}), counts);
});

test("a card that was not offered cannot be gained", () => {
  const counts = minimal();
  assert.deepEqual(applyReward(counts, ["guard"], { gainKey: "wild_die" }), counts);
});

test("run decks may break the build-screen limits", () => {
  // 同名・同じ目の上限（4枚）を超えて増やせる。
  let counts = { ...minimal(), heavy_6: DECK_RULES.MAX_COPIES_PER_CARD };
  counts = applyReward(counts, ["heavy_6"], { gainKey: "heavy_6" });
  assert.equal(counts.heavy_6, DECK_RULES.MAX_COPIES_PER_CARD + 1);
});

test("removal cannot shrink the deck below the minimum size", () => {
  const atMinimum = { heavy_6: DECK_RULES.MIN_DECK_SIZE };
  assert.equal(canRemoveFromRun(atMinimum, "heavy_6"), false);
  assert.deepEqual(applyReward(atMinimum, [], { removeKey: "heavy_6" }), atMinimum);

  // 同時に1枚入手するなら、最小枚数を保てるので削除できる。
  assert.equal(canRemoveFromRun(atMinimum, "heavy_6", "guard"), true);
  assert.equal(canRemoveFromRun(atMinimum, "guard"), false, "a card not in the deck cannot be removed");
});

test("role offers are distinct bonus roles, never the penalty", () => {
  let state = 3;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const seen = new Set();
  for (let index = 0; index < 300; index += 1) {
    const offers = drawRoleOffers(random);
    assert.equal(offers.length, REWARD_RULES.ROLE_OFFER_COUNT);
    assert.equal(new Set(offers).size, offers.length);
    offers.forEach((id) => seen.add(id));
  }
  assert.ok(!seen.has("one_two_three"));
  assert.deepEqual([...seen].sort(), BONUS_ROLES.map((role) => role.id).sort());
});

test("upgrading a role raises its level by one and is optional", () => {
  const levels = { pair: 1 };
  assert.deepEqual(applyRoleUpgrade(levels, ["pair", "odd_only"], "pair"), { pair: 2 });
  assert.deepEqual(applyRoleUpgrade(levels, ["pair", "odd_only"], "odd_only"), { pair: 1, odd_only: 1 });
  assert.deepEqual(applyRoleUpgrade(levels, ["pair"], null), levels);
  assert.deepEqual(applyRoleUpgrade(levels, ["pair"], "full_house"), levels, "only an offered role can be upgraded");
  assert.deepEqual(levels, { pair: 1 }, "the input levels are not mutated");
});
