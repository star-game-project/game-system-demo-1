import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { createDemoDeck } from "../data/cards.js";
import { createEnemies } from "../data/enemies.js";
import { drawCards, shuffleDeck } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";
import { DEFAULT_POINT_RULES, normalizePointRules } from "./pointRules.js";

/** 1ターン中に使ったカードの合計。ターン開始時に作り直す。 */
export function createTurnTotals() {
  return { cards: 0, dealt: 0, blocked: 0, shield: 0 };
}

/**
 * 戦闘の初期状態。連戦では battle（何戦目か）と playerHp（前の戦闘の残りHP）を引き継ぐ。
 * それ以外（山札・ポイント・CPU）は毎戦リセットする。pointRules は構築画面で選んだポイント設定、
 * roleLevels は報酬で強化した役のレベル。
 */
export function createInitialGameState(
  random = Math.random,
  deckCards = null,
  {
    battle = 1,
    playerHp = GAME_CONFIG.PLAYER_MAX_HP,
    pointRules = DEFAULT_POINT_RULES,
    roleLevels = {},
  } = {},
) {
  const rules = normalizePointRules(pointRules);
  const shuffled = shuffleDeck(deckCards ?? createDemoDeck(), random);
  const openingDraw = drawCards(shuffled, GAME_CONFIG.START_HAND_SIZE);

  return {
    battle,
    pointRules: rules,
    // 役の強化レベル（{ 役id: レベル }）。連戦中に報酬で上がる。
    roleLevels: { ...roleLevels },
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
    enemies: createEnemies(),
    // 攻撃の対象。倒れたら生き残っている先頭の敵に移る。
    targetId: "enemy_1",
    selectedCardId: null,
    currentRole: evaluateHandRole(openingDraw.drawn, roleLevels),
    lastAttack: null,
    lastDefense: null,
    // 直前の敵ターンで各敵が行った行動。
    lastCpuActions: [],
    turnTotals: createTurnTotals(),
    battleMessage: `${GAME_CONFIG.START_HAND_SIZE}枚のカードをドロー。あなたのターンです。`,
  };
}
