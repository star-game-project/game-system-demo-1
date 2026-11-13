import { isWildCard, MAX_DIE_VALUE, MIN_DIE_VALUE } from "./abilityLogic.js";
import { rollDiceColor } from "./colorLogic.js";
import { hasRule } from "./rulesets.js";

/**
 * 「目と色を振る（試作）」：カードの目はカードに固定されず、手札に来るたびにダイスを振って決める。
 * 「ダイスの色（試作）」も ON なら、色も手札に来るたびに振る（連戦中の固定の色は持たない）。
 * ワイルドのカードは目を振らない（どの目としても扱われるため）。色は振る。
 *
 * colorCount は使う色の数（state.colorCount）。
 * 元のカードは書き換えず、振り直したカードを新しく作って返す。試作ルールが OFF ならそのまま返す。
 */
export function rollFacesOnDraw(cards, rulesetId, random = Math.random, colorCount = undefined) {
  if (!hasRule(rulesetId, "roll_dice")) return cards;
  const withColor = hasRule(rulesetId, "dice_color");
  return cards.map((card) => {
    const rolled = { ...card };
    if (!isWildCard(card)) {
      const value = MIN_DIE_VALUE + Math.floor(random() * (MAX_DIE_VALUE - MIN_DIE_VALUE + 1));
      rolled.dieValue = value;
      // 戦術カードで変えた目（TUNED）は、振った目からの変化として見せる。
      rolled.baseDieValue = value;
    }
    if (withColor) rolled.color = rollDiceColor(random, colorCount);
    return rolled;
  });
}
