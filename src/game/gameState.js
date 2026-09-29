import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { createDemoDeck } from "../data/cards.js";
import { CPU_ACTION_PATTERN } from "../data/enemies.js";
import { drawCards, shuffleDeck } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";
import { DEFAULT_POINT_RULES, normalizePointRules } from "./pointRules.js";

/** 1ターン中に使ったカードの合計。ターン開始時に作り直す。 */
export function createTurnTotals() {
  return { cards: 0, dealt: 0, blocked: 0, shield: 0 };
}

/**
 * 戦闘の初期状態。連戦では battle（何戦目か）と playerHp（前の戦闘の残りHP）を引き継ぐ。
 * それ以外（山札・ポイント・CPU）は毎戦リセットする。pointRules は構築画面で選んだポイント設定。
 */
export function createInitialGameState(
  random = Math.random,
  deckCards = null,
  {
    battle = 1,
    playerHp = GAME_CONFIG.PLAYER_MAX_HP,
    pointRules = DEFAULT_POINT_RULES,
  } = {},
) {
  const rules = normalizePointRules(pointRules);
  const shuffled = shuffleDeck(deckCards ?? createDemoDeck(), random);
  const openingDraw = drawCards(shuffled, GAME_CONFIG.START_HAND_SIZE);

  return {
    battle,
    pointRules: rules,
    turn: 1,
    phase: PHASES.DRAW_SELECT,
    player: {
      hp: playerHp,
      maxHp: GAME_CONFIG.PLAYER_MAX_HP,
      point: rules.startPoint,
      maxPoint: rules.maxPoint,
      deck: openingDraw.deck,
      hand: openingDraw.drawn,
      discardPile: [],
      cardsPlayed: 0,
      shield: 0,
      temporaryEffects: [],
    },
    cpu: {
      hp: GAME_CONFIG.CPU_MAX_HP,
      maxHp: GAME_CONFIG.CPU_MAX_HP,
      actionPattern: CPU_ACTION_PATTERN,
      actionIndex: 0,
      charge: 0,
      block: 0,
    },
    selectedCardId: null,
    currentRole: evaluateHandRole(openingDraw.drawn),
    lastAttack: null,
    lastDefense: null,
    turnTotals: createTurnTotals(),
    battleMessage: `${GAME_CONFIG.START_HAND_SIZE}枚のカードをドロー。あなたのターンです。`,
  };
}
