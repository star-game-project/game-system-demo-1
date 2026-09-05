import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { createDemoDeck } from "../data/cards.js";
import { drawCards, shuffleDeck } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";

export function createInitialGameState(random = Math.random) {
  const shuffled = shuffleDeck(createDemoDeck(), random);
  const openingDraw = drawCards(shuffled, GAME_CONFIG.START_HAND_SIZE);

  return {
    turn: 1,
    phase: PHASES.DRAW_SELECT,
    player: {
      hp: GAME_CONFIG.PLAYER_MAX_HP,
      maxHp: GAME_CONFIG.PLAYER_MAX_HP,
      point: GAME_CONFIG.START_POINT,
      maxPoint: GAME_CONFIG.MAX_POINT,
      deck: openingDraw.deck,
      hand: openingDraw.drawn,
      discardPile: [],
      cardsPlayed: 0,
      temporaryEffects: [],
    },
    cpu: {
      hp: GAME_CONFIG.CPU_MAX_HP,
      maxHp: GAME_CONFIG.CPU_MAX_HP,
    },
    selectedCardId: null,
    currentRole: evaluateHandRole(openingDraw.drawn),
    lastAttack: null,
    battleMessage: `${GAME_CONFIG.START_HAND_SIZE}枚のカードをドロー。あなたのターンです。`,
  };
}
