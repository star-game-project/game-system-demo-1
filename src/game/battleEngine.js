import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { drawWithRecycle } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";
import { calculateAttack } from "./damageLogic.js";
import { advanceCpuAction, aliveEnemies, cpuActionDamage, getCpuIntent } from "./enemyLogic.js";
import { createTurnTotals } from "./gameState.js";
import { recoverPoints } from "./pointRules.js";
import {
  createTemporaryEffects,
  isAreaAttackCard,
  isDefenseCard,
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

    this.state.currentRole = evaluateHandRole(player.hand, this.state.roleLevels);
    this.state.phase = PHASES.CARD_SELECT;
    return true;
  }

  selectCard(cardId) {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (!card || isTacticalCard(card)) return false;
    if (card.cost > this.state.player.point) return false;
    this.state.selectedCardId = card.id;
    this.state.battleMessage = isDefenseCard(card)
      ? `${card.name} を選択中。シールド +${card.defense} を得てターンを終了します。`
      : `${card.name} を選択中。攻撃内容を確認してください。`;
    return true;
  }

  getSelectedCard() {
    return this.state.player.hand.find(
      (card) => card.id === this.state.selectedCardId,
    ) ?? null;
  }

  getAttackPreview(cardId = this.state.selectedCardId) {
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (!card || isDefenseCard(card)) return null;
    const attack = calculateAttack(
      card,
      this.state.player.hand,
      this.state.player,
      this.state.turn,
      this.state.roleLevels,
    );
    return { ...attack, ...this.resolveHits(card, attack.finalAttack, false) };
  }

  /** 攻撃が当たる敵：全体攻撃なら生き残っているすべての敵、それ以外は対象の1体。 */
  getAttackTargets(card) {
    if (isAreaAttackCard(card)) return aliveEnemies(this.state.enemies);
    const target = this.getTargetEnemy();
    return target ? [target] : [];
  }

  /**
   * 攻撃を当たる敵それぞれに解決する。ブロックは敵ごとに受ける。
   * commit が false のときは計算だけ行い、ブロックもHPも変えない（プレビュー用）。
   */
  resolveHits(card, damage, commit = true) {
    const hits = this.getAttackTargets(card).map((enemy) => {
      const { blocked, dealt } = this.applyCpuBlock(damage, commit, enemy);
      if (commit) enemy.hp = Math.max(0, enemy.hp - dealt);
      return { enemyId: enemy.id, enemyName: enemy.name, blocked, dealt, defeated: enemy.hp <= 0 };
    });
    return {
      hits,
      blocked: hits.reduce((sum, hit) => sum + hit.blocked, 0),
      dealt: hits.reduce((sum, hit) => sum + hit.dealt, 0),
    };
  }

  /** 攻撃の対象。選んだ敵が倒れていれば、生き残っている先頭の敵。 */
  getTargetEnemy() {
    const alive = aliveEnemies(this.state.enemies);
    return alive.find((enemy) => enemy.id === this.state.targetId) ?? alive[0] ?? null;
  }

  /** 攻撃の対象を選ぶ。倒れた敵は選べない。 */
  setTarget(enemyId) {
    const enemy = this.state.enemies.find((item) => item.id === enemyId);
    if (!enemy || enemy.hp <= 0) return false;
    this.state.targetId = enemyId;
    return true;
  }

  /** 対象の敵のブロックで攻撃を減らす。commit が false のときはブロックを消費しない。 */
  applyCpuBlock(damage, commit = true, enemy = this.getTargetEnemy()) {
    const blocked = Math.min(enemy?.block ?? 0, damage);
    if (commit && enemy) enemy.block -= blocked;
    return { blocked, dealt: damage - blocked };
  }

  /** 攻撃カードまたは防御カードで、今のポイントで使えるものがあるか。 */
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
    this.state.currentRole = evaluateHandRole(player.hand, this.state.roleLevels);
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
    if (isDefenseCard(card)) return this.defendWith(card);

    const attack = calculateAttack(
      card,
      this.state.player.hand,
      this.state.player,
      this.state.turn,
      this.state.roleLevels,
    );

    const { hits, blocked, dealt } = this.resolveHits(card, attack.finalAttack);
    attack.hits = hits;
    attack.blocked = blocked;
    attack.dealt = dealt;
    attack.targetId = isAreaAttackCard(card) ? "all" : hits[0].enemyId;
    const hitText = (hit) =>
      `${hit.enemyName} ${hit.dealt}ダメージ${hit.blocked ? `（ブロック −${hit.blocked}）` : ""}${hit.defeated ? " 撃破！" : ""}`;

    this.state.player.point = Math.max(0, this.state.player.point - card.cost);
    this.state.player.temporaryEffects.push(
      ...createTemporaryEffects(card, this.state.turn),
    );
    this.state.player.hand = this.state.player.hand.filter((item) => item.id !== card.id);
    this.state.player.discardPile.push(card);
    this.state.player.cardsPlayed += 1;
    this.state.currentRole = evaluateHandRole(this.state.player.hand, this.state.roleLevels);
    this.state.lastAttack = { ...attack, cardName: card.name };
    this.state.lastDefense = null;
    this.state.turnTotals.cards += 1;
    this.state.turnTotals.dealt += dealt;
    this.state.turnTotals.blocked += blocked;
    this.state.selectedCardId = null;

    const scope = isAreaAttackCard(card) ? "全体" : hits[0].enemyName;
    this.state.battleMessage = `${card.name} → ${scope} — ${hits.map(hitText).join(" / ")}`;
    // ターンは終了しない。ポイントが続く限り続けてカードを使える。
    const alive = aliveEnemies(this.state.enemies);
    if (!alive.length) {
      this.state.phase = PHASES.VICTORY;
    } else if (!alive.some((enemy) => enemy.id === this.state.targetId)) {
      // 対象が倒れたら、生き残っている先頭の敵に移る。
      this.state.targetId = alive[0].id;
    }
    return attack;
  }

  /**
   * 防御カードを使う。攻撃と同じくターンは終了せず、ポイントが続く限り続けて使える。
   * 防御値に役の倍率は掛からない。
   */
  defendWith(card) {
    const { player } = this.state;
    const defense = { cardName: card.name, shield: card.defense };

    player.point = Math.max(0, player.point - card.cost);
    player.shield += card.defense;
    player.hand = player.hand.filter((item) => item.id !== card.id);
    player.discardPile.push(card);
    player.cardsPlayed += 1;
    this.state.currentRole = evaluateHandRole(player.hand, this.state.roleLevels);
    this.state.lastAttack = null;
    this.state.lastDefense = defense;
    this.state.turnTotals.cards += 1;
    this.state.turnTotals.shield += card.defense;
    this.state.selectedCardId = null;

    this.state.battleMessage = `${card.name} — シールド +${card.defense}（現在 ${player.shield}）。`;
    return defense;
  }

  startCpuTurn() {
    if (this.state.phase !== PHASES.PLAYER_ATTACK) return false;
    this.state.phase = PHASES.CPU_ATTACK;

    // 生き残っている敵が先頭から順に行動する。シールドは順に削られる。
    const results = [];
    for (const enemy of aliveEnemies(this.state.enemies)) {
      results.push(this.resolveEnemyAction(enemy));
      if (this.state.player.hp <= 0) break;
    }
    this.state.lastCpuActions = results;
    this.state.battleMessage = results.map((result) => result.message).join(" ");
    if (this.state.player.hp <= 0) this.state.phase = PHASES.DEFEAT;
    return true;
  }

  /** 1体の敵の行動を解決する。 */
  resolveEnemyAction(enemy) {
    const { player } = this.state;
    const action = getCpuIntent(enemy);
    advanceCpuAction(enemy);
    const base = { enemyId: enemy.id, enemyName: enemy.name, action, charge: 0, incoming: 0, absorbed: 0, taken: 0 };

    // ブロックは直後のプレイヤーターン限り。その敵が次に行動する時点で消える。
    enemy.block = 0;

    if (action.type === "BLOCK") {
      enemy.block = action.value;
      return { ...base, message: `${enemy.name}は防御態勢（次のあなたのターン、合計${enemy.block}まで防ぐ）。` };
    }

    if (action.type === "CHARGE") {
      enemy.charge += action.value;
      return { ...base, message: `${enemy.name}は力を溜めている（次の攻撃 +${enemy.charge}）。` };
    }

    const charge = enemy.charge;
    const incoming = cpuActionDamage(action, charge);
    const absorbed = Math.min(player.shield, incoming);
    const taken = incoming - absorbed;

    enemy.charge = 0;
    player.shield -= absorbed;
    player.hp = Math.max(0, player.hp - taken);

    const message = absorbed
      ? `${enemy.name}の攻撃。シールドが${absorbed}吸収し、${taken}ダメージ。`
      : `${enemy.name}の攻撃。${incoming}ダメージ。`;
    return { ...base, charge, incoming, absorbed, taken, message };
  }


  finishTurn() {
    if (this.state.phase !== PHASES.CPU_ATTACK) return false;
    const pointBefore = this.state.player.point;
    this.state.phase = PHASES.POINT_RECOVERY;
    this.state.player.point = recoverPoints(this.state.player.point, this.state.pointRules);
    const recovered = this.state.player.point - pointBefore;
    this.state.turn += 1;
    this.state.player.temporaryEffects = pruneTemporaryEffects(
      this.state.player.temporaryEffects,
      this.state.turn,
    );

    // シールドはターンをまたがない。
    this.state.player.shield = 0;
    this.state.turnTotals = createTurnTotals();

    // 手札はターン終了時にすべて捨て札へ送り、新しい手札を引き直す。
    const discarded = this.discardHand();
    const refill = this.drawIntoHand(GAME_CONFIG.START_HAND_SIZE);

    this.state.selectedCardId = null;
    this.state.currentRole = evaluateHandRole(this.state.player.hand, this.state.roleLevels);
    this.state.phase = PHASES.DRAW_SELECT;
    const recycleNote = refill.recycleCount
      ? "捨て札をシャッフルして山札を再構築。"
      : "";
    this.state.battleMessage = `ポイント +${recovered}。手札${discarded.length}枚を捨て、${refill.drawn.length}枚を引き直しました。${recycleNote}ターン ${this.state.turn} を開始します。`;
    return true;
  }

  /** カードを使い終えたらプレイヤーが自分でターンを終了する。いつでも終了できる。 */
  endTurn() {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    this.state.selectedCardId = null;
    this.state.phase = PHASES.PLAYER_ATTACK;
    this.state.battleMessage = "ターンを終了します。";
    return true;
  }
}
