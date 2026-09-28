/**
 * CPUの行動パターン。先頭から順に1ターン1行動ずつ実行し、末尾まで来たら先頭に戻る。
 * ランダム性は持たせず、次の行動は常にプレイヤーに公開する。
 */
export const CPU_ACTION_PATTERN = Object.freeze([
  Object.freeze({ type: "ATTACK", value: 14 }),
]);
