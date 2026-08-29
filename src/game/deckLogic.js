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
