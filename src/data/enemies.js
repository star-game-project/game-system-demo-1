/**
 * CPUの行動パターン。先頭から順に1ターン1行動ずつ実行し、末尾まで来たら先頭に戻る。
 * ランダム性は持たせず、次の行動は常にプレイヤーに公開する。
 *
 * 1周の合計は 42（旧仕様の 14 × 3ターン）に揃え、難易度を変えずに強弱だけを付けている。
 */
export const CPU_ACTION_PATTERN = Object.freeze([
  Object.freeze({ type: "ATTACK", value: 10 }),
  Object.freeze({ type: "ATTACK", value: 10 }),
  Object.freeze({ type: "ATTACK", value: 22 }),
]);
