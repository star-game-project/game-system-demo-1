import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { drawWithRecycle } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";
import { calculateAttack } from "./damageLogic.js";
import {
  createTemporaryEffects,
  pruneTemporaryEffects,
} from "./abilityLogic.js";

export class BattleEngine {
  constructor(initialState, random = Math.random) {
    this.state = initialState;
    this.random = random;
  }

  /** 山札から引く。山札が尽きたら捨て札をシャッフルして再構築する。 */
  drawIntoHand(amount) {
    const { player } = this.state;
    const result = drawWithRecycle(
      player.deck,
      player.discardPile,
      amount,
      this.random,
    );
    player.deck = result.deck;
    player.discardPile = result.discardPile;
    player.hand.push(...result.drawn);
    return result;
  }

  /** ターン終了時に手札をすべて捨て札へ送る。 */
  discardHand() {
    const { player } = this.state;
    const discarded = player.hand;
    player.discardPile.push(...discarded);
    player.hand = [];
    return discarded;
  }

  canDraw() {
    const { player } = this.state;
    return (
      player.point >= GAME_CONFIG.DRAW_COST &&
      player.deck.length + player.discardPile.length > 0
    );
  }

  chooseDraw(shouldDraw) {
    const { player } = this.state;
    if (this.state.phase !== PHASES.DRAW_SELECT) return false;

    if (shouldDraw) {
      if (!this.canDraw()) return false;
      const result = this.drawIntoHand(1);
      if (!result.drawn.length) return false;
      player.point = Math.max(0, player.point - GAME_CONFIG.DRAW_COST);
      const recycleNote = result.recycleCount
        ? "捨て札をシャッフルして山札を再構築。"
        : "";
      this.state.battleMessage = `${recycleNote}${result.drawn[0].name} をドローしました。`;
    } else {
      this.state.battleMessage = "ドローをスキップしました。";
    }

    this.state.currentRole = evaluateHandRole(player.hand);
    this.state.phase = PHASES.CARD_SELECT;
    return true;
  }

  selectCard(cardId) {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (!card || card.cost > this.state.player.point) return false;
    this.state.selectedCardId = card.id;
    this.state.battleMessage = `${card.name} を選択中。攻撃内容を確認してください。`;
    return true;
  }

  getSelectedCard() {
    return this.state.player.hand.find(
      (card) => card.id === this.state.selectedCardId,
    ) ?? null;
  }

  getAttackPreview(cardId = this.state.selectedCardId) {
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (!card) return null;
    return calculateAttack(card, this.state.player.hand, this.state.player, this.state.turn);
  }

  useSelectedCard() {
    if (this.state.phase !== PHASES.CARD_SELECT) return null;
    const card = this.getSelectedCard();
    if (!card || card.cost > this.state.player.point) return null;

    const attack = calculateAttack(
      card,
      this.state.player.hand,
      this.state.player,
      this.state.turn,
    );

    this.state.player.point = Math.max(0, this.state.player.point - card.cost);
    this.state.player.temporaryEffects.push(
      ...createTemporaryEffects(card, this.state.turn),
    );
    this.state.cpu.hp = Math.max(0, this.state.cpu.hp - attack.finalAttack);
    this.state.player.hand = this.state.player.hand.filter((item) => item.id !== card.id);
    this.state.player.discardPile.push(card);
    this.state.player.cardsPlayed += 1;
    this.state.currentRole = evaluateHandRole(this.state.player.hand);
    this.state.lastAttack = { ...attack, cardName: card.name };
    this.state.selectedCardId = null;
    this.state.battleMessage = `${card.name} — ${attack.finalAttack}ダメージ！`;
    this.state.phase =
      this.state.cpu.hp <= 0 ? PHASES.VICTORY : PHASES.PLAYER_ATTACK;

    return attack;
  }

  startCpuTurn() {
    if (this.state.phase !== PHASES.PLAYER_ATTACK) return false;
    this.state.phase = PHASES.CPU_ATTACK;
    this.state.player.hp = Math.max(
      0,
      this.state.player.hp - GAME_CONFIG.CPU_ATTACK_DAMAGE,
    );
    this.state.battleMessage = `CPUの反撃。${GAME_CONFIG.CPU_ATTACK_DAMAGE}ダメージを受けました。`;
    if (this.state.player.hp <= 0) this.state.phase = PHASES.DEFEAT;
    return true;
  }

  finishTurn() {
    if (this.state.phase !== PHASES.CPU_ATTACK) return false;
    const pointBefore = this.state.player.point;
    this.state.phase = PHASES.POINT_RECOVERY;
    this.state.player.point = Math.min(
      this.state.player.maxPoint,
      this.state.player.point + GAME_CONFIG.TURN_POINT_RECOVERY,
    );
    const recovered = this.state.player.point - pointBefore;
    this.state.turn += 1;
    this.state.player.temporaryEffects = pruneTemporaryEffects(
      this.state.player.temporaryEffects,
      this.state.turn,
    );

    // 手札はターン終了時にすべて捨て札へ送り、新しい手札を引き直す。
    const discarded = this.discardHand();
    const refill = this.drawIntoHand(GAME_CONFIG.START_HAND_SIZE);

    this.state.selectedCardId = null;
    this.state.currentRole = evaluateHandRole(this.state.player.hand);
    this.state.phase = PHASES.DRAW_SELECT;
    const recycleNote = refill.recycleCount
      ? "捨て札をシャッフルして山札を再構築。"
      : "";
    this.state.battleMessage = `ポイント +${recovered}。手札${discarded.length}枚を捨て、${refill.drawn.length}枚を引き直しました。${recycleNote}ターン ${this.state.turn} を開始します。`;
    return true;
  }

  endTurnWithoutCard() {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    const hasPlayableCard = this.state.player.hand.some(
      (card) => card.cost <= this.state.player.point,
    );
    if (hasPlayableCard) return false;
    this.state.selectedCardId = null;
    this.state.lastAttack = null;
    this.state.phase = PHASES.PLAYER_ATTACK;
    this.state.battleMessage = "使用できるカードがないため、ターンを終了します。";
    return true;
  }
}
