/**
 * 敵の行動パターン。先頭から順に1ターン1行動ずつ実行し、末尾まで来たら先頭に戻る。
 * ランダム性は持たせず、次の行動は常にプレイヤーに公開する。
 *
 * ATTACK n: n + 溜め込み分のダメージを与え、溜め込みを0に戻す。
 * CHARGE n: 攻撃せず、次の ATTACK のダメージを n 上げる。
 * BLOCK n: 攻撃せず、直後のプレイヤーターン中にその敵が受けるダメージを合計 n まで防ぐ。
 *
 * 敵は同じ種類を2体出す。2体の合計が旧仕様の1体（HP100・1ターン平均14ダメージ）と
 * 同じになるよう、1体あたり HP50・パターンの数値は半分（1周の与ダメージ 28 = 7 × 4ターン）。
 */
export const CPU_ACTION_PATTERN = Object.freeze([
  Object.freeze({ type: "ATTACK", value: 7 }),
  Object.freeze({ type: "CHARGE", value: 7 }),
  Object.freeze({ type: "ATTACK", value: 14 }),
  Object.freeze({ type: "BLOCK", value: 15 }),
]);

export const ENEMY_TYPES = Object.freeze({
  aegis: Object.freeze({ name: "AEGIS", maxHp: 50, actionPattern: CPU_ACTION_PATTERN }),
});

/** 1回の戦闘に出る敵。2体の行動周期はそろえる（同じターンに同じ行動をする）。 */
export const ENCOUNTER = Object.freeze(["aegis", "aegis"]);

const ENEMY_LABELS = ["A", "B", "C", "D"];

export function createEnemies(encounter = ENCOUNTER) {
  return encounter.map((type, index) => {
    const definition = ENEMY_TYPES[type];
    return {
      id: `enemy_${index + 1}`,
      name: `${definition.name} ${ENEMY_LABELS[index]}`,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      actionPattern: definition.actionPattern,
      actionIndex: 0,
      charge: 0,
      block: 0,
    };
  });
}
