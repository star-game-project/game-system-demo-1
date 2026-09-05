import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { drawWithRecycle } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";
import { calculateAttack } from "./damageLogic.js";
import {
  createTemporaryEffects,
  isTacticalCard,
  pruneTemporaryEffects,
  requiredTargetCount,
  shiftDieValue,
  swapHandPositions,
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
    if (!card || isTacticalCard(card)) return false;
    if (card.cost > this.state.player.point) return false;
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

  hasPlayableAttackCard() {
    const { player } = this.state;
    return player.hand.some(
      (card) => !isTacticalCard(card) && card.cost <= player.point,
    );
  }

  /** 戦術カードの対象になりうる手札（自分自身は除く）。 */
  getTacticalTargets(cardId) {
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (!isTacticalCard(card)) return [];
    return this.state.player.hand.filter((item) => item.id !== cardId);
  }

  /**
   * 戦術カードを使用する。攻撃ではないためターンは終了せず、
   * ポイントが続く限り同一ターン中に何枚でも使える。
   */
  playTacticalCard(cardId, targetIds = []) {
    if (this.state.phase !== PHASES.CARD_SELECT) return null;

    const { player } = this.state;
    const card = player.hand.find((item) => item.id === cardId);
    if (!isTacticalCard(card) || card.cost > player.point) return null;

    const validTargets = new Set(
      this.getTacticalTargets(cardId).map((item) => item.id),
    );
    const targets = [...new Set(targetIds)].filter((id) => validTargets.has(id));
    if (targets.length !== requiredTargetCount(card)) return null;

    // 先に使用カードを手札から取り除いてから効果を解決する。
    player.point = Math.max(0, player.point - card.cost);
    player.hand = player.hand.filter((item) => item.id !== cardId);
    player.discardPile.push(card);
    player.cardsPlayed += 1;

    const message = this.resolveTacticalAbility(card, targets);

    if (!player.hand.some((item) => item.id === this.state.selectedCardId)) {
      this.state.selectedCardId = null;
    }
    this.state.currentRole = evaluateHandRole(player.hand);
    this.state.battleMessage = message;
    return { card, targets, role: this.state.currentRole };
  }

  resolveTacticalAbility(card, targets) {
    const { player } = this.state;
    const ability = card.tacticalAbility;
    const nameOf = (id) =>
      player.hand.find((item) => item.id === id)?.name ?? "カード";

    if (ability.type === "DIE_VALUE_SHIFT") {
      const before = player.hand.find((item) => item.id === targets[0]);
      player.hand = shiftDieValue(player.hand, targets[0], ability.value);
      const after = player.hand.find((item) => item.id === targets[0]);
      return `${card.name} — ${after.name} の目を ${before.dieValue} → ${after.dieValue} に変更しました。`;
    }

    if (ability.type === "HAND_POSITION_SWAP") {
      const names = targets.map(nameOf);
      player.hand = swapHandPositions(player.hand, targets[0], targets[1]);
      return `${card.name} — ${names[0]} と ${names[1]} の位置を入れ替えました。`;
    }

    if (ability.type === "GAIN_SHIELD") {
      player.shield += ability.value;
      return `${card.name} — シールド +${ability.value}（現在 ${player.shield}）。`;
    }

    if (ability.type === "GRANT_EXTRA_ATTACK") {
      player.extraAttacks += ability.value;
      return `${card.name} — このターン、あと${player.extraAttacks + 1}回攻撃できます。`;
    }

    if (ability.type === "REDRAW_CARD") {
      const discardedName = nameOf(targets[0]);
      const discarded = player.hand.find((item) => item.id === targets[0]);
      player.hand = player.hand.filter((item) => item.id !== targets[0]);
      player.discardPile.push(discarded);
      const result = this.drawIntoHand(1);
      const drawnName = result.drawn[0]?.name;
      const recycleNote = result.recycleCount
        ? "捨て札をシャッフルして山札を再構築。"
        : "";
      return drawnName
        ? `${card.name} — ${discardedName} を捨て、${recycleNote}${drawnName} を引きました。`
        : `${card.name} — ${discardedName} を捨てましたが、引けるカードがありません。`;
    }

    return `${card.name} を使用しました。`;
  }

  useSelectedCard() {
    if (this.state.phase !== PHASES.CARD_SELECT) return null;
    const card = this.getSelectedCard();
    if (!card || isTacticalCard(card)) return null;
    if (card.cost > this.state.player.point) return null;

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

    if (this.state.cpu.hp <= 0) {
      this.state.battleMessage = `${card.name} — ${attack.finalAttack}ダメージ！`;
      this.state.phase = PHASES.VICTORY;
      return attack;
    }

    // 追加攻撃が残っている間はターンを終了せず、カード選択に留まる。
    if (this.state.player.extraAttacks > 0) {
      this.state.player.extraAttacks -= 1;
      this.state.battleMessage = `${card.name} — ${attack.finalAttack}ダメージ！ 続けてあと${this.state.player.extraAttacks + 1}回攻撃できます。`;
      this.state.phase = PHASES.CARD_SELECT;
      return attack;
    }

    this.state.battleMessage = `${card.name} — ${attack.finalAttack}ダメージ！`;
    this.state.phase = PHASES.PLAYER_ATTACK;
    return attack;
  }

  startCpuTurn() {
    if (this.state.phase !== PHASES.PLAYER_ATTACK) return false;
    this.state.phase = PHASES.CPU_ATTACK;

    const { player } = this.state;
    const incoming = GAME_CONFIG.CPU_ATTACK_DAMAGE;
    const absorbed = Math.min(player.shield, incoming);
    const taken = incoming - absorbed;

    player.shield -= absorbed;
    player.hp = Math.max(0, player.hp - taken);
    this.state.lastCpuAttack = { incoming, absorbed, taken };

    this.state.battleMessage = absorbed
      ? `CPUの反撃。シールドが${absorbed}吸収し、${taken}ダメージを受けました。`
      : `CPUの反撃。${incoming}ダメージを受けました。`;
    if (player.hp <= 0) this.state.phase = PHASES.DEFEAT;
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

    // シールドと追加攻撃はターンをまたがない。
    this.state.player.shield = 0;
    this.state.player.extraAttacks = 0;

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
    if (this.hasPlayableAttackCard()) return false;
    this.state.selectedCardId = null;
    this.state.lastAttack = null;
    this.state.phase = PHASES.PLAYER_ATTACK;
    this.state.battleMessage = "使用できるカードがないため、ターンを終了します。";
    return true;
  }
}
