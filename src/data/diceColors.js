/**
 * ダイスの色。ルール「ダイスの色（試作）」でだけ使う。
 * ポーカーのスートにあたる。同じカードでも1枚ずつ色が違い、入手したときに決まる。
 *
 * 使う色の数は構築画面で選べる（デモ限定）。先頭から COUNT 個を使う（既定は4色：赤・青・緑・黄）。
 */
export const DICE_COLORS = Object.freeze([
  Object.freeze({ id: "red", label: "赤" }),
  Object.freeze({ id: "blue", label: "青" }),
  Object.freeze({ id: "green", label: "緑" }),
  Object.freeze({ id: "yellow", label: "黄" }),
  Object.freeze({ id: "purple", label: "紫" }),
  Object.freeze({ id: "orange", label: "橙" }),
]);

/**
 * 使う色の数。最小2（1色だと全部同じ色の役が必ず成立して意味がない）、最大6、既定4。
 */
export const DICE_COLOR_COUNT = Object.freeze({ MIN: 2, MAX: DICE_COLORS.length, DEFAULT: 4 });

/** 範囲外・数でない値は既定の色数に戻す。 */
export function normalizeColorCount(count) {
  const value = Number(count);
  if (!Number.isInteger(value)) return DICE_COLOR_COUNT.DEFAULT;
  return Math.min(DICE_COLOR_COUNT.MAX, Math.max(DICE_COLOR_COUNT.MIN, value));
}

/** count 色で遊ぶときに使う色（先頭から count 個）。 */
export function diceColorsFor(count = DICE_COLOR_COUNT.DEFAULT) {
  return DICE_COLORS.slice(0, normalizeColorCount(count));
}

export const DICE_COLOR_BY_ID = Object.freeze(
  Object.fromEntries(DICE_COLORS.map((color) => [color.id, color])),
);
