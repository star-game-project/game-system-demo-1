import test from "node:test";
import assert from "node:assert/strict";
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
  assert.equal(mult(2, 2, 2), 4);
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
  assert.equal(mult(1, 2, 3, 5, 6), product(1.3, 0.5));

  // ペアがあっても減算は打ち消されない。
  assert.ok(ids(1, 1, 2, 3, 6).includes("one_two_three"));

  // 4 まで伸ばすと減算が消え、STRAIGHT だけが残る。
  assert.deepEqual(ids(1, 2, 3, 4, 6), ["four_straight"]);
  assert.deepEqual(ids(1, 2, 3, 4, 5), ["five_straight"]);
});

test("roles from different families multiply together", () => {
  // 同じ系統は入れ子なので最上位ひとつだけ。系統をまたぐと掛け合わさる。
  assert.deepEqual(ids(3, 3, 3, 1, 1), ["full_house", "odd_only"]);
  assert.equal(mult(3, 3, 3, 1, 1), product(2.8, 2.8));

  assert.deepEqual(ids(6, 6, 6, 6, 2), ["four_of_a_kind", "even_only"]);
  assert.equal(mult(6, 6, 6, 6, 2), product(3.5, 2.8));

  assert.deepEqual(ids(2, 3, 4, 4, 5), ["pair", "four_straight"]);
  assert.equal(mult(2, 3, 4, 4, 5), product(1.2, 1.7));
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
  assert.equal(evaluateHandRole(withWild(1, 5, 5)).roleName, "ODD");
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
