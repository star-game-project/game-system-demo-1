export function shuffleDeck(cards, random = Math.random) {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

export function drawCards(deck, amount = 1) {
  const safeAmount = Math.min(Math.max(0, amount), deck.length);
  return {
    drawn: deck.slice(0, safeAmount),
    deck: deck.slice(safeAmount),
  };
}

/**
 * 山札から指定枚数を引く。山札が尽きた場合は捨て札をシャッフルして山札を再構築し、
 * 続きを引く。山札・捨て札の両方が空になった時点で打ち切る。
 */
export function drawWithRecycle(
  deck,
  discardPile,
  amount = 1,
  random = Math.random,
) {
  let remainingDeck = [...deck];
  let remainingDiscard = [...discardPile];
  const drawn = [];
  let recycleCount = 0;

  for (let index = 0; index < Math.max(0, amount); index += 1) {
    if (!remainingDeck.length) {
      if (!remainingDiscard.length) break;
      remainingDeck = shuffleDeck(remainingDiscard, random);
      remainingDiscard = [];
      recycleCount += 1;
    }
    drawn.push(remainingDeck.shift());
  }

  return {
    drawn,
    deck: remainingDeck,
    discardPile: remainingDiscard,
    recycleCount,
  };
}
