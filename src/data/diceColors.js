/**
 * ダイスの色。ルール「ダイスの色（試作）」でだけ使う。
 * ポーカーのスートにあたる。同じカードでも1枚ずつ色が違い、入手したときに決まる。
 */
export const DICE_COLORS = Object.freeze([
  Object.freeze({ id: "red", label: "赤" }),
  Object.freeze({ id: "blue", label: "青" }),
  Object.freeze({ id: "green", label: "緑" }),
  Object.freeze({ id: "yellow", label: "黄" }),
]);

export const DICE_COLOR_BY_ID = Object.freeze(
  Object.fromEntries(DICE_COLORS.map((color) => [color.id, color])),
);
