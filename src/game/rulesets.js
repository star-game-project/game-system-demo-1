import { GAME_CONFIG, PHASES } from "../data/constants.js";

/**
 * デモで遊び比べるルール。デッキ構築画面で選び、連戦中は変えない。
 * 検討中の大きな変更を、現行ルールと切り替えて試すためにある（デモ限定）。
 *
 * 試作ルール（RULE_OPTIONS）はそれぞれ独立に ON / OFF でき、組み合わせて遊べる。
 * ルールの id は、ON にした試作ルールを RULE_OPTIONS の順に "+" でつないだもの
 * （例："dice_color+select_play"）。何も ON でなければ "standard"（現行ルール）。
 * ルールの中身を見るときは id を直接比べず、hasRule で試作ルールが入っているかを見る。
 */
export const STANDARD_RULESET = Object.freeze({
  id: "standard",
  label: "現行ルール",
  description: "ダイスの目だけで役を判定する。",
});

export const RULE_OPTIONS = Object.freeze([
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

/** 現行ルールと、組み合わせの元になる試作ルール（仕様書の一覧用）。 */
export const RULESETS = Object.freeze([STANDARD_RULESET, ...RULE_OPTIONS]);

export const DEFAULT_RULESET_ID = STANDARD_RULESET.id;

/** ルールの id に入っている試作ルール（RULE_OPTIONS の順）。知らない名前は無視する。 */
export function ruleOptionsOf(rulesetId) {
  const names = String(rulesetId ?? "").split("+");
  return RULE_OPTIONS.filter((option) => names.includes(option.id)).map((option) => option.id);
}

/** ON にした試作ルールから、ルールの id を作る。 */
export function rulesetIdFrom(optionIds) {
  const ids = RULE_OPTIONS.filter((option) => optionIds.includes(option.id)).map((option) => option.id);
  return ids.length ? ids.join("+") : DEFAULT_RULESET_ID;
}

/** 知らない id は現行ルールに戻し、試作ルールの並びをそろえる。 */
export function normalizeRulesetId(id) {
  return rulesetIdFrom(ruleOptionsOf(id));
}

/** そのルールに試作ルール optionId（"dice_color" / "select_play"）が入っているか。 */
export function hasRule(rulesetId, optionId) {
  return ruleOptionsOf(rulesetId).includes(optionId);
}

/** 画面に出すルールの名前（例：「ダイスの色（試作）＋選んで出す（試作）」）。 */
export function rulesetLabel(rulesetId) {
  const options = ruleOptionsOf(rulesetId);
  if (!options.length) return STANDARD_RULESET.label;
  return options.map((id) => RULE_OPTIONS.find((option) => option.id === id).label).join("＋");
}

/**
 * ターンの最初の段階。「選んで出す（試作）」にはドロー選択（DRAW / SKIP）がなく、
 * 5枚の手札でカードを使う段階から始まる。
 */
export function turnStartPhase(rulesetId) {
  return hasRule(rulesetId, "select_play") ? PHASES.CARD_SELECT : PHASES.DRAW_SELECT;
}

/**
 * 「選んで出す（試作）」の手札の枚数。ドロー選択がない代わりに、構築画面で 6枚 / 7枚 から選ぶ（デモ限定）。
 * ほかのルールは GAME_CONFIG.START_HAND_SIZE（5枚）のまま。
 */
export const SELECT_PLAY_HAND_SIZES = Object.freeze([6, 7]);
export const DEFAULT_SELECT_PLAY_HAND_SIZE = 6;

/** そのルールで毎ターン引き直す手札の枚数。chosen は構築画面で選んだ枚数（「選んで出す（試作）」のときだけ使う）。 */
export function handSizeFor(rulesetId, chosen = DEFAULT_SELECT_PLAY_HAND_SIZE) {
  if (!hasRule(rulesetId, "select_play")) return GAME_CONFIG.START_HAND_SIZE;
  return SELECT_PLAY_HAND_SIZES.includes(chosen) ? chosen : DEFAULT_SELECT_PLAY_HAND_SIZE;
}
