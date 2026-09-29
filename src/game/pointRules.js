import { GAME_CONFIG } from "../data/constants.js";

export const POINT_RULE_LIMIT = Object.freeze({ MIN: 1, MAX: 20 });

/**
 * ポイントの設定。デッキ構築画面で戦闘前に変更できる。
 * fullRefill が true のときは recovery を使わず、毎ターン maxPoint まで回復する（貯められない）。
 */
export const DEFAULT_POINT_RULES = Object.freeze({
  startPoint: GAME_CONFIG.START_POINT,
  maxPoint: GAME_CONFIG.MAX_POINT,
  recovery: GAME_CONFIG.TURN_POINT_RECOVERY,
  fullRefill: false,
});

/** 比較用のプリセット。 */
export const POINT_RULE_PRESETS = Object.freeze([
  { id: "default", label: "標準 10/10/+5", rules: DEFAULT_POINT_RULES },
  { id: "a", label: "A 回復3", rules: { startPoint: 10, maxPoint: 10, recovery: 3, fullRefill: false } },
  { id: "b", label: "B 上限6", rules: { startPoint: 6, maxPoint: 6, recovery: 5, fullRefill: false } },
  { id: "c", label: "C 毎ターン5まで全回復", rules: { startPoint: 5, maxPoint: 5, recovery: 5, fullRefill: true } },
]);

function clampRuleValue(value, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(POINT_RULE_LIMIT.MIN, Math.min(POINT_RULE_LIMIT.MAX, number));
}

/** 入力値を整数・範囲内に揃え、開始値が上限を超えないようにする。 */
export function normalizePointRules(rules) {
  const maxPoint = clampRuleValue(rules.maxPoint, DEFAULT_POINT_RULES.maxPoint);
  return {
    maxPoint,
    startPoint: Math.min(maxPoint, clampRuleValue(rules.startPoint, DEFAULT_POINT_RULES.startPoint)),
    recovery: clampRuleValue(rules.recovery, DEFAULT_POINT_RULES.recovery),
    fullRefill: Boolean(rules.fullRefill),
  };
}

/** ターン終了時の回復後のポイント。 */
export function recoverPoints(point, rules) {
  if (rules.fullRefill) return rules.maxPoint;
  return Math.min(rules.maxPoint, point + rules.recovery);
}

export function pointRulesLabel(rules) {
  const recovery = rules.fullRefill ? `毎ターン${rules.maxPoint}まで全回復` : `毎ターン+${rules.recovery}`;
  return `開始${rules.startPoint} / 上限${rules.maxPoint} / ${recovery}`;
}
