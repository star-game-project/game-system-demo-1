import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_GROWTH } from "../src/data/roles.js";
import { evaluateHandRole } from "../src/game/roleLogic.js";

const hand = (...values) => values.map((dieValue, index) => ({ id: `c${index}`, dieValue }));
/** 成立した役のIDを倍率の高い順で。 */
const ids = (...values) => evaluateHandRole(hand(...values)).roles.map((r) => r.id);
const mult = (...values) => evaluateHandRole(hand(...values)).multiplier;
/** 実装は積を小数3桁に丸めるので、期待値も同じ丸めで比較する。 */
const product = (...multipliers) =>
  Number(multipliers.reduce((a, b) => a * b, 1).toFixed(3));
const WILD = { id: "wild", dieValue: 1, passiveAbility: { type: "WILD_DIE" } };
const withWild = (...values) => [...hand(...values), WILD];

test("SAME NUMBER outranks every other role and needs at least three cards", () => {
  assert.equal(evaluateHandRole(hand(2, 2, 2)).roleId, "same_number");
  // すべて同じ目なら偶奇も必ず揃うので、EVEN とは重複させない。
  assert.deepEqual(ids(2, 2, 2), ["same_number"]);
  assert.equal(mult(2, 2, 2), 2.5);
  // 3枚に満たない場合は SAME NUMBER にならない。
  // 2枚のペアは必ず同じ目＝同じ偶奇なので、EVEN / ODD として拾われる。
  assert.equal(evaluateHandRole(hand(5, 5)).roleName, "ODD");
  assert.equal(evaluateHandRole(hand(6, 6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(hand(3, 3, 3)).roleName, "SAME NUMBER");
});

test("whole-hand roles need at least two cards", () => {
  assert.equal(evaluateHandRole(hand(5)).roleId, null);
  assert.equal(evaluateHandRole(hand(6)).roleId, null);
  assert.equal(evaluateHandRole(hand(5)).multiplier, 1);
});

test("subset roles fire on partial matches so most hands score", () => {
  assert.equal(evaluateHandRole(hand(3, 3, 1, 4, 6)).roleName, "PAIR");
  assert.equal(evaluateHandRole(hand(3, 3, 1, 1, 6)).roleName, "TWO PAIR");
  assert.equal(evaluateHandRole(hand(3, 3, 3, 1, 6)).roleName, "THREE OF A KIND");
  assert.equal(evaluateHandRole(hand(3, 3, 3, 1, 1)).roleName, "FULL HOUSE");
  assert.equal(evaluateHandRole(hand(3, 3, 3, 3, 1)).roleName, "FOUR OF A KIND");
});

test("straights are scored by their length", () => {
  assert.equal(evaluateHandRole(hand(4, 5, 6, 6, 6)).roleName, "THREE OF A KIND");
  assert.equal(evaluateHandRole(hand(2, 4, 5, 6)).roleName, "THREE STRAIGHT");
  assert.equal(evaluateHandRole(hand(3, 4, 5, 6)).roleName, "FOUR STRAIGHT");
  assert.equal(evaluateHandRole(hand(2, 3, 4, 5, 6)).roleName, "FIVE STRAIGHT");
});

test("EVEN and ODD recognize hands containing only their parity", () => {
  assert.equal(evaluateHandRole(hand(2, 4, 4, 6)).roleName, "EVEN");
  assert.equal(evaluateHandRole(hand(1, 3, 3, 5)).roleName, "ODD");
  // 手札全体の条件なので、1枚でも外れると成立しない。
  assert.notEqual(evaluateHandRole(hand(2, 4, 4, 5)).roleName, "EVEN");
});

test("the 1-2-3 penalty multiplies in and is escaped by extending to four", () => {
  // 減算役も他の役と掛け合わさる。1・2・3 は3連番でもあるので両方成立する。
  assert.deepEqual(ids(1, 2, 3, 5, 6), ["three_straight", "one_two_three"]);
  assert.equal(mult(1, 2, 3, 5, 6), product(1.15, 0.5));

  // ペアがあっても減算は打ち消されない。
  assert.ok(ids(1, 1, 2, 3, 6).includes("one_two_three"));

  // 4 まで伸ばすと減算が消え、STRAIGHT だけが残る。
  assert.deepEqual(ids(1, 2, 3, 4, 6), ["four_straight"]);
  assert.deepEqual(ids(1, 2, 3, 4, 5), ["five_straight"]);
});

test("roles from different families multiply together", () => {
  // 同じ系統は入れ子なので最上位ひとつだけ。系統をまたぐと掛け合わさる。
  assert.deepEqual(ids(3, 3, 3, 1, 1), ["full_house", "odd_only"]);
  assert.equal(mult(3, 3, 3, 1, 1), product(1.9, 1.3));

  assert.deepEqual(ids(6, 6, 6, 6, 2), ["four_of_a_kind", "even_only"]);
  assert.equal(mult(6, 6, 6, 6, 2), product(2.25, 1.3));

  assert.deepEqual(ids(2, 3, 4, 4, 5), ["pair", "four_straight"]);
  assert.equal(mult(2, 3, 4, 4, 5), product(1.1, 1.35));
});

test("nested roles within one family are never counted twice", () => {
  // FULL HOUSE は THREE OF A KIND / TWO PAIR / PAIR も満たすが、採るのは1つだけ。
  const result = evaluateHandRole(hand(3, 3, 3, 1, 1));
  const setRoles = result.roles.filter((role) => role.family === "set");
  assert.equal(setRoles.length, 1);
  assert.equal(setRoles[0].id, "full_house");
});

test("a hand with no pattern at all still has no role", () => {
  assert.equal(evaluateHandRole(hand(1, 4)).roleId, null);
  assert.equal(evaluateHandRole([]).multiplier, 1);
});

test("a wild die takes whichever value scores highest", () => {
  assert.equal(evaluateHandRole(withWild(4, 4)).roleName, "SAME NUMBER");
  assert.equal(evaluateHandRole(withWild(2, 3, 4, 5)).roleName, "FIVE STRAIGHT");
  assert.equal(evaluateHandRole(withWild(4, 4, 6, 6)).roleName, "FULL HOUSE");
  // 1,5,5 + ワイルド：5 にすると THREE OF A KIND × ODD が両方成立し、最も高くなる。
  const oddTrio = evaluateHandRole(withWild(1, 5, 5));
  assert.deepEqual(oddTrio.roles.map((role) => role.id).sort(), ["odd_only", "three_of_a_kind"]);
  assert.equal(oddTrio.multiplier, product(1.5, 1.3));
});

test("a wild die is never used to complete the 1-2-3 penalty", () => {
  // ワイルドが 3 になると 1-2-3 が成立してしまうが、より高い倍率を選ぶ。
  assert.equal(evaluateHandRole(withWild(1, 2, 5)).roles.some((r) => r.id === "one_two_three"), false);

  // すでに 1・2・3 が揃っていても、ワイルドが 4 になれば STRAIGHT で脱出できる。
  assert.equal(
    evaluateHandRole(withWild(1, 2, 3, 6)).roles.some((r) => r.id === "one_two_three"),
    false,
  );

  // ワイルドがなければ罠から逃げられない。
  assert.ok(ids(1, 2, 3, 6).includes("one_two_three"));
});

test("an upgraded role adds the growth step per level to its multiplier", () => {
  const levels = { pair: 2 };
  assert.equal(evaluateHandRole(hand(2, 2, 5), levels).multiplier, 1.1 + 2 * ROLE_GROWTH.UPGRADE_STEP);
  assert.equal(evaluateHandRole(hand(2, 2, 5)).multiplier, 1.1, "no levels means the base multiplier");
});

test("an upgraded lower role can overtake a higher one in the same family", () => {
  // TWO PAIR ×1.25 も成立するが、PAIR を ×1.3 まで上げると PAIR の方が高い。
  const result = evaluateHandRole(hand(2, 2, 5, 5, 1), { pair: 2 });
  assert.equal(result.roleId, "pair");
  assert.equal(result.multiplier, 1.3);
  assert.equal(evaluateHandRole(hand(2, 2, 5, 5, 1)).roleId, "two_pair");
});

test("the penalty role cannot be upgraded", () => {
  assert.equal(evaluateHandRole(hand(1, 2, 3, 6, 6), { one_two_three: 5 }).roles.find((role) => role.id === "one_two_three").multiplier, 0.5);
});

test("a wild die follows upgraded multipliers when picking its value", () => {
  // 2,3,4 + ワイルド：通常は 1 か 5 にして FOUR STRAIGHT ×1.35。
  // PAIR を ×1.6 まで上げると、2〜4 のどれかにして PAIR × THREE STRAIGHT の方が高くなる。
  assert.equal(evaluateHandRole(withWild(2, 3, 4)).roleId, "four_straight");
  const upgraded = evaluateHandRole(withWild(2, 3, 4), { pair: 5 });
  assert.deepEqual(upgraded.roles.map((role) => role.id).sort(), ["pair", "three_straight"]);
  assert.equal(upgraded.multiplier, product(1.6, 1.15));
});
