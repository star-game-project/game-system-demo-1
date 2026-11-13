import { PHASES } from "../data/constants.js";

/**
 * デモで遊び比べるルール。デッキ構築画面で選び、連戦中は変えない。
 * 検討中の大きな変更を、現行ルールと切り替えて試すためにある（デモ限定）。
 */
export const RULESETS = Object.freeze([
  Object.freeze({
    id: "standard",
    label: "現行ルール",
    description: "ダイスの目だけで役を判定する。",
  }),
  Object.freeze({
    id: "dice_color",
    label: "ダイスの色（試作）",
    description:
      "カード1枚ごとにダイスの色（4色）が付き、目に加えて色でも役を判定する（同じ色3枚・4枚・全部同色）。",
  }),
  Object.freeze({
    id: "select_play",
    label: "選んで出す（試作）",
    description:
      "カードは1枚ずつ対象を選んで場に出し、ターン終了時にまとめて処理する。役は場に出したカードだけで判定し、その倍率を場のすべての攻撃に掛ける。",
  }),
]);

export const DEFAULT_RULESET_ID = "standard";

export const RULESET_BY_ID = Object.freeze(
  Object.fromEntries(RULESETS.map((ruleset) => [ruleset.id, ruleset])),
);

/** 知らない id は現行ルールに戻す。 */
export function normalizeRulesetId(id) {
  return RULESET_BY_ID[id] ? id : DEFAULT_RULESET_ID;
}

/**
 * ターンの最初の段階。「選んで出す（試作）」にはドロー選択（DRAW / SKIP）がなく、
 * 5枚の手札でカードを使う段階から始まる。
 */
export function turnStartPhase(rulesetId) {
  return rulesetId === "select_play" ? PHASES.CARD_SELECT : PHASES.DRAW_SELECT;
}
