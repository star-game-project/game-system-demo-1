import { CARD_BY_KEY, CARD_CATALOGUE } from "../data/cards.js";
import { DECK_RULES } from "../data/constants.js";
import { isTacticalCard, isWildCard } from "./abilityLogic.js";

/** 目の上限を数えるときの区分。ワイルドは目を持たないので別枠にする。 */
export function dieBucket(definition) {
  return isWildCard(definition) ? "wild" : definition.dieValue;
}

export function createEmptyCounts() {
  return Object.fromEntries(CARD_CATALOGUE.map((card) => [card.key, 0]));
}

export function summarizeDeck(counts) {
  const byDie = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, wild: 0 };
  let total = 0;
  let attackCount = 0;
  let tacticalCount = 0;
  let totalCost = 0;
  let totalAttack = 0;

  CARD_CATALOGUE.forEach((definition) => {
    const count = counts[definition.key] ?? 0;
    if (count <= 0) return;
    byDie[dieBucket(definition)] += count;
    total += count;
    totalCost += definition.cost * count;
    if (isTacticalCard(definition)) tacticalCount += count;
    else {
      attackCount += count;
      totalAttack += definition.attack * count;
    }
  });

  return {
    total,
    byDie,
    attackCount,
    tacticalCount,
    averageCost: total ? totalCost / total : 0,
    averageAttack: attackCount ? totalAttack / attackCount : 0,
  };
}

/** その目の枠の上限（ワイルドだけ別枠）。 */
export function bucketLimit(bucket) {
  return bucket === "wild"
    ? DECK_RULES.MAX_WILD_CARDS
    : DECK_RULES.MAX_PER_DIE_VALUE;
}

export function canAddCard(counts, key) {
  const definition = CARD_BY_KEY[key];
  if (!definition) return false;

  const summary = summarizeDeck(counts);
  if (summary.total >= DECK_RULES.DECK_SIZE) return false;
  if ((counts[key] ?? 0) >= DECK_RULES.MAX_COPIES_PER_CARD) return false;

  const bucket = dieBucket(definition);
  return summary.byDie[bucket] < bucketLimit(bucket);
}

export function addCard(counts, key) {
  if (!canAddCard(counts, key)) return counts;
  return { ...counts, [key]: (counts[key] ?? 0) + 1 };
}

export function removeCard(counts, key) {
  if ((counts[key] ?? 0) <= 0) return counts;
  return { ...counts, [key]: counts[key] - 1 };
}

export function validateDeck(counts) {
  const summary = summarizeDeck(counts);
  const errors = [];

  if (summary.total !== DECK_RULES.DECK_SIZE) {
    errors.push(
      `デッキはちょうど${DECK_RULES.DECK_SIZE}枚にしてください（現在 ${summary.total}枚）`,
    );
  }
  if (!summary.attackCount) {
    errors.push("攻撃カードが1枚もありません");
  }

  Object.entries(summary.byDie).forEach(([bucket, count]) => {
    const limit = bucketLimit(bucket === "wild" ? "wild" : Number(bucket));
    if (count > limit) {
      const label = bucket === "wild" ? "ワイルド" : `目${bucket}`;
      errors.push(`${label}が上限${limit}枚を超えています（${count}枚）`);
    }
  });

  CARD_CATALOGUE.forEach((definition) => {
    const count = counts[definition.key] ?? 0;
    if (count > DECK_RULES.MAX_COPIES_PER_CARD) {
      errors.push(
        `${definition.name} が上限${DECK_RULES.MAX_COPIES_PER_CARD}枚を超えています`,
      );
    }
  });

  return { valid: errors.length === 0, errors, summary };
}
