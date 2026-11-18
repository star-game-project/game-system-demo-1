import { GAME_CONFIG, PHASES } from "../data/constants.js";
import { drawWithRecycle } from "./deckLogic.js";
import { evaluateHandRole } from "./roleLogic.js";
import { calculateAttack } from "./damageLogic.js";
import { advanceCpuAction, aliveEnemies, cpuActionDamage, getCpuIntent } from "./enemyLogic.js";
import { createTurnTotals } from "./gameState.js";
import { recoverPoints } from "./pointRules.js";
import { hasRule, turnStartPhase } from "./rulesets.js";
import { rollFacesOnDraw } from "./diceRollLogic.js";
import { ITEM_BY_ID } from "../data/items.js";
import { canUseItem, healPlayer } from "./itemLogic.js";
import {
  createTemporaryEffects,
  getPassiveBonus,
  getTemporaryBonus,
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

  /**
   * いまの手札の役。Role Lock で固定しているターンは、手札に関係なく固定した役を返す。
   * 「選んで出す（試作）」では、手札ではなく、このターンに場に出したカードだけで判定する（暫定の役）。
   */
  evaluateRole(hand = this.state.player.hand) {
    if (this.isSelectPlay()) {
      return evaluateHandRole(this.getPlayedCards(), this.state.roleLevels, this.state.ruleset);
    }
    return this.state.lockedRole ?? evaluateHandRole(hand, this.state.roleLevels, this.state.ruleset);
  }

  // ---- 「選んで出す（試作）」 ----
  // カードは今までどおり1枚ずつ、対象を選んで出す。ただし出した時点では処理せず「場」に置き、
  // ターン終了時にまとめて処理する。役は場に出したカードだけで判定し、その倍率を
  // 場のすべての攻撃カードに掛ける（先に出したカードにも、最後に決まった倍率が掛かる）。
  // 防御値は合計してシールドにする（倍率なし）。戦術カードとアイテムはその場で効果が出る。

  isSelectPlay() {
    return hasRule(this.state.ruleset, "select_play");
  }

  /** 場に出したカード（出した順）。 */
  getPlayedCards() {
    return (this.state.playedCards ?? []).map((entry) => entry.card);
  }

  /** 攻撃カードを出したときに、その時点の手札で決まる攻撃力（常在能力・ターンのバフを含む）。 */
  adjustedAttack(card) {
    const { player } = this.state;
    return card.attack + getPassiveBonus(card, player.hand) + getTemporaryBonus(player.temporaryEffects, this.state.turn);
  }

  /** 選択をすべて解除する（手札の選択・場のカードの選択）。 */
  clearSelection() {
    this.state.selectedCardId = null;
    this.state.selectedCardIds = [];
    this.state.selectedFieldCardId = null;
  }

  /** 選択中の手札のカード（選んだ順）。 */
  getSelectedCards() {
    const { hand } = this.state.player;
    return (this.state.selectedCardIds ?? []).map((id) => hand.find((card) => card.id === id)).filter(Boolean);
  }

  /** 手札の選択を整える：手札にないカードを外し、ポイントを超える分は後ろから外す。 */
  pruneSelection() {
    let cost = 0;
    const kept = [];
    for (const card of this.getSelectedCards()) {
      if (cost + card.cost > this.state.player.point) break;
      cost += card.cost;
      kept.push(card.id);
    }
    this.state.selectedCardIds = kept;
    this.state.selectedCardId = kept[kept.length - 1] ?? null;
  }

  /**
   * 選択中のカードを、選んだ順に場へスタックする。ポイントはここで払い、処理はターン終了時。
   * 単体攻撃は enemyId の敵を対象にする（防御・全体攻撃は対象を取らない）。
   */
  stackSelected(enemyId) {
    if (!this.isSelectPlay() || this.state.phase !== PHASES.CARD_SELECT) return null;
    const { player } = this.state;
    const cards = this.getSelectedCards();
    if (!cards.length) return null;
    const target = this.state.enemies.find((enemy) => enemy.id === enemyId && enemy.hp > 0) ?? null;
    if (!target && cards.some((card) => !isDefenseCard(card) && !isAreaAttackCard(card))) return null;
    if (cards.reduce((sum, card) => sum + card.cost, 0) > player.point) return null;

    // 攻撃力は手札が減る前に決める（隣のカードの常在能力は、まとめて出す前の手札で数える）。
    const entries = cards.map((card) => {
      const defense = isDefenseCard(card);
      return {
        card,
        targetId: defense ? null : isAreaAttackCard(card) ? "all" : target.id,
        attack: defense ? 0 : this.adjustedAttack(card),
      };
    });
    const ids = new Set(cards.map((card) => card.id));
    for (const card of cards) {
      player.point = Math.max(0, player.point - card.cost);
      player.temporaryEffects.push(...createTemporaryEffects(card, this.state.turn));
      player.cardsPlayed += 1;
    }
    player.hand = player.hand.filter((item) => !ids.has(item.id));
    this.state.playedCards = [...this.state.playedCards, ...entries];
    this.state.turnTotals.cards += cards.length;
    if (target) this.state.targetId = target.id;
    this.clearSelection();
    this.state.currentRole = this.evaluateRole();

    const role = this.state.currentRole;
    const roleText = role.roleName
      ? `${role.roles.map((r) => (r.stage ? `${r.name}（${r.stage}）` : r.name)).join(" × ")} ×${role.multiplier}`
      : "なし";
    this.state.battleMessage = `${cards.map((card) => card.name).join("・")} を場にスタックした${target ? `（${target.name}へ）` : ""}。処理はターン終了時。いまの役：${roleText}`;
    return entries;
  }

  /** 場のカードを選ぶ（もう一度押すと解除）。選ぶと、手札の選択は外れる。 */
  selectFieldCard(cardId) {
    if (!this.isSelectPlay() || this.state.phase !== PHASES.CARD_SELECT) return false;
    const entry = this.state.playedCards.find((item) => item.card.id === cardId);
    if (!entry) return false;
    if (this.state.selectedFieldCardId === cardId) {
      this.state.selectedFieldCardId = null;
      return true;
    }
    this.clearSelection();
    this.state.selectedFieldCardId = cardId;
    this.state.battleMessage = isDefenseCard(entry.card) || entry.targetId === "all"
      ? `${entry.card.name} は攻撃対象を変えられません。ドラッグで使用順を変えられます。`
      : `${entry.card.name} を選択中。敵を押すと攻撃対象を変えます。`;
    return true;
  }

  /** 選んでいる場のカードの攻撃対象を変える。単体攻撃だけ。 */
  retargetFieldCard(enemyId) {
    if (!this.isSelectPlay() || this.state.phase !== PHASES.CARD_SELECT) return false;
    const enemy = this.state.enemies.find((item) => item.id === enemyId && item.hp > 0);
    const index = this.state.playedCards.findIndex((entry) => entry.card.id === this.state.selectedFieldCardId);
    if (!enemy || index < 0) return false;
    const entry = this.state.playedCards[index];
    if (isDefenseCard(entry.card) || entry.targetId === "all") return false;
    this.state.playedCards = this.state.playedCards.map((item, i) => (i === index ? { ...item, targetId: enemy.id } : item));
    this.state.targetId = enemy.id;
    this.state.selectedFieldCardId = null;
    this.state.battleMessage = `${entry.card.name} の攻撃対象を ${enemy.name} に変更しました。`;
    return true;
  }

  /** 場のカードを使用順の toIndex 番目へ動かす（0始まり）。 */
  moveFieldCard(cardId, toIndex) {
    if (!this.isSelectPlay() || this.state.phase !== PHASES.CARD_SELECT) return false;
    const entries = [...this.state.playedCards];
    const from = entries.findIndex((entry) => entry.card.id === cardId);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(entries.length - 1, toIndex));
    if (to === from) return false;
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    this.state.playedCards = entries;
    this.state.battleMessage = `${moved.card.name} の使用順を ${to + 1} 番目にしました。`;
    return true;
  }

  /**
   * 場のカードの処理結果。commit が false なら計算だけ（プレビュー用）。
   * extra を渡すと、そのカードも場に出したと仮定して計算する（選んでいるカードの見込み）。
   * 攻撃は出した順に、出したときに選んだ対象へ当てる。対象が先に倒れていたら、生き残っている先頭の敵へ。
   */
  resolveField(commit = false, extras = []) {
    const entries = [...this.state.playedCards];
    for (const extra of extras) {
      const defense = isDefenseCard(extra);
      entries.push({
        card: extra,
        targetId: defense ? null : isAreaAttackCard(extra) ? "all" : this.getTargetEnemy()?.id ?? null,
        attack: defense ? 0 : this.adjustedAttack(extra),
      });
    }
    const role = evaluateHandRole(entries.map((entry) => entry.card), this.state.roleLevels, this.state.ruleset);
    // プレビューでは敵のHP・ブロックを動かさないよう、写しの上で計算する。
    const enemies = commit ? this.state.enemies : this.state.enemies.map((enemy) => ({ ...enemy }));
    const alive = () => enemies.filter((enemy) => enemy.hp > 0);

    const results = entries.map((entry) => {
      if (isDefenseCard(entry.card)) return { ...entry, damage: 0, hits: [], shield: entry.card.defense };
      const damage = Math.round(entry.attack * role.multiplier);
      const targets = entry.targetId === "all"
        ? alive()
        : [enemies.find((enemy) => enemy.id === entry.targetId && enemy.hp > 0) ?? alive()[0]].filter(Boolean);
      const hits = targets.map((enemy) => {
        const blocked = Math.min(enemy.block, damage);
        enemy.block -= blocked;
        const dealt = damage - blocked;
        enemy.hp = Math.max(0, enemy.hp - dealt);
        return { enemyId: enemy.id, enemyName: enemy.name, blocked, dealt, defeated: enemy.hp <= 0 };
      });
      return { ...entry, damage, hits, shield: 0 };
    });
    const hits = results.flatMap((result) => result.hits);
    return {
      results,
      roles: role.roles,
      roleId: role.roleId,
      roleName: role.roleName,
      roleMultiplier: role.multiplier,
      totalAttack: results.reduce((sum, result) => sum + result.attack, 0),
      finalAttack: results.reduce((sum, result) => sum + result.damage, 0),
      hits,
      blocked: hits.reduce((sum, hit) => sum + hit.blocked, 0),
      dealt: hits.reduce((sum, hit) => sum + hit.dealt, 0),
      shield: results.reduce((sum, result) => sum + result.shield, 0),
    };
  }

  /**
   * 場の見込み（いまターンを終えたらどうなるか）。cardId を渡すと、選択中のカードを選んだ順に
   * すべて出した場合（cardId が選択中になければ、そのカードも最後に足す）。
   */
  getFieldPreview(cardId = null) {
    if (!cardId) return this.resolveField(false);
    const cards = this.getSelectedCards();
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (card && !cards.some((item) => item.id === cardId)) cards.push(card);
    return this.resolveField(false, cards.filter((item) => !isTacticalCard(item)));
  }

  /** ターン終了時に場のカードをまとめて処理し、捨て札へ送る。 */
  resolvePlayedCards() {
    const { player } = this.state;
    if (!this.state.playedCards.length) return null;
    const result = this.resolveField(true);
    const names = this.getPlayedCards().map((card) => card.name).join("・");

    player.shield += result.shield;
    player.discardPile.push(...this.getPlayedCards());
    this.state.playedCards = [];
    this.state.lastAttack = result.hits.length ? { ...result, cardName: names } : null;
    this.state.lastDefense = result.shield ? { cardName: names, shield: result.shield } : null;
    this.state.turnTotals.dealt += result.dealt;
    this.state.turnTotals.blocked += result.blocked;
    this.state.turnTotals.shield += result.shield;
    this.state.currentRole = this.evaluateRole();

    const roleText = result.roleName
      ? `${result.roles.map((r) => (r.stage ? `${r.name}（${r.stage}）` : r.name)).join(" × ")} ×${result.roleMultiplier}`
      : "役なし ×1";
    const parts = [
      result.dealt || result.hits.length ? `合計 ${result.dealt}ダメージ` : "",
      result.shield ? `シールド +${result.shield}` : "",
    ].filter(Boolean);
    this.state.battleMessage = `場の ${names} を処理 — ${roleText}。${parts.join("・")}。`;

    const alive = aliveEnemies(this.state.enemies);
    if (alive.length && !alive.some((enemy) => enemy.id === this.state.targetId)) {
      this.state.targetId = alive[0].id;
    }
    return result;
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
    // 「目と色を振る（試作）」では、手札に来たときに目（と色）を振る。
    result.drawn = rollFacesOnDraw(result.drawn, this.state.ruleset, this.random, this.state.colorCount);
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

    this.state.currentRole = this.evaluateRole(player.hand);
    this.state.phase = PHASES.CARD_SELECT;
    return true;
  }

  selectCard(cardId) {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    const card = this.state.player.hand.find((item) => item.id === cardId);
    if (!card || isTacticalCard(card)) return false;
    if (card.cost > this.state.player.point) return false;
    if (this.isSelectPlay()) {
      // 複数枚を同時に選べる（選んだ順がそのまま場に積む順）。選んであるカードをもう一度押すと外す。
      const ids = this.state.selectedCardIds ?? [];
      if (ids.includes(card.id)) {
        this.state.selectedCardIds = ids.filter((id) => id !== card.id);
      } else {
        const cost = this.getSelectedCards().reduce((sum, item) => sum + item.cost, 0);
        if (cost + card.cost > this.state.player.point) {
          this.state.battleMessage = "ポイントが足りないため、これ以上は選べません。";
          return false;
        }
        this.state.selectedCardIds = [...ids, card.id];
      }
      this.state.selectedFieldCardId = null;
      this.state.selectedCardId = this.state.selectedCardIds[this.state.selectedCardIds.length - 1] ?? null;
      this.state.battleMessage = this.state.selectedCardIds.length
        ? `${this.state.selectedCardIds.length}枚を選択中。敵を押すと、選んだ順に場へスタックします。`
        : "選択を解除しました。";
      return true;
    }
    this.state.selectedCardId = card.id;
    this.state.battleMessage = isDefenseCard(card)
      ? `${card.name} を選択中。シールド +${card.defense} を得ます（役の倍率は掛かりません）。`
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
    if (this.isSelectPlay()) return this.getFieldCardPreview(card);
    const attack = calculateAttack(
      card,
      this.state.player.hand,
      this.state.player,
      this.state.turn,
      this.state.roleLevels,
      this.state.ruleset,
      this.state.lockedRole,
    );
    return { ...attack, ...this.resolveHits(card, attack.finalAttack, false) };
  }

  /**
   * 「選んで出す（試作）」で、選んでいる攻撃カードを場に出した場合の見込み。
   * 倍率は「いまの場＋このカード」の暫定の役。ターン終了までにさらに出せば変わる。
   */
  getFieldCardPreview(card) {
    const field = this.getFieldPreview(card.id);
    const result = field.results.find((item) => item.card.id === card.id);
    const attack = this.adjustedAttack(card);
    return {
      baseAttack: card.attack,
      passiveBonus: getPassiveBonus(card, this.state.player.hand),
      temporaryBonus: getTemporaryBonus(this.state.player.temporaryEffects, this.state.turn),
      roles: field.roles,
      roleId: field.roleId,
      roleName: field.roleName,
      roleMultiplier: field.roleMultiplier,
      finalAttack: Math.round(attack * field.roleMultiplier),
      hits: result.hits,
      blocked: result.hits.reduce((sum, hit) => sum + hit.blocked, 0),
      dealt: result.hits.reduce((sum, hit) => sum + hit.dealt, 0),
      tentative: true,
    };
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

    if (this.isSelectPlay()) {
      this.pruneSelection();
    } else if (!player.hand.some((item) => item.id === this.state.selectedCardId)) {
      this.clearSelection();
    }
    this.state.currentRole = this.evaluateRole(player.hand);
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
    if (this.isSelectPlay()) return this.stackSelected(this.getTargetEnemy()?.id ?? null);
    if (isDefenseCard(card)) return this.defendWith(card);

    const attack = calculateAttack(
      card,
      this.state.player.hand,
      this.state.player,
      this.state.turn,
      this.state.roleLevels,
      this.state.ruleset,
      this.state.lockedRole,
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
    this.state.currentRole = this.evaluateRole();
    this.state.lastAttack = { ...attack, cardName: card.name };
    this.state.lastDefense = null;
    this.state.turnTotals.cards += 1;
    this.state.turnTotals.dealt += dealt;
    this.state.turnTotals.blocked += blocked;
    this.clearSelection();

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
    this.state.currentRole = this.evaluateRole(player.hand);
    this.state.lastAttack = null;
    this.state.lastDefense = defense;
    this.state.turnTotals.cards += 1;
    this.state.turnTotals.shield += card.defense;
    this.clearSelection();

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

    // シールドと役の固定はターンをまたがない。
    this.state.player.shield = 0;
    this.state.lockedRole = null;
    this.state.playedCards = [];
    this.state.turnTotals = createTurnTotals();

    // 手札はターン終了時にすべて捨て札へ送り、新しい手札を引き直す。
    const discarded = this.discardHand();
    const refill = this.drawIntoHand(this.state.handSize ?? GAME_CONFIG.START_HAND_SIZE);

    this.clearSelection();
    this.state.currentRole = this.evaluateRole();
    this.state.phase = turnStartPhase(this.state.ruleset);
    const recycleNote = refill.recycleCount
      ? "捨て札をシャッフルして山札を再構築。"
      : "";
    this.state.battleMessage = `ポイント +${recovered}。手札${discarded.length}枚を捨て、${refill.drawn.length}枚を引き直しました。${recycleNote}ターン ${this.state.turn} を開始します。`;
    return true;
  }

  /** 持っているアイテムのうち、slot 番目をいま使えるか。 */
  canUseItemAt(slot) {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    const item = ITEM_BY_ID[this.state.player.items[slot]];
    if (item?.effect.type === "LOCK_ROLE") {
      // 「選んで出す（試作）」では役は出すカードで決まり、1ターンに1回しか出さないので固定する意味がない。
      if (this.isSelectPlay()) return false;
      // 固定は1ターンに1回。倍率が1以下（役なし・減算）を固定しても意味がない。
      return !this.state.lockedRole && this.state.currentRole.multiplier > 1;
    }
    return canUseItem(item, this.state.player);
  }

  /**
   * slot 番目のアイテムを使う。ポイント不要・使い切りで、ターンは終了しない。
   * 使えなければ null を返す。
   */
  useItem(slot) {
    if (!this.canUseItemAt(slot)) return null;
    const { player } = this.state;
    const item = ITEM_BY_ID[player.items[slot]];
    player.items = player.items.filter((_, index) => index !== slot);

    if (item.effect.type === "HEAL") {
      const healed = healPlayer(player, item.effect.value);
      this.state.battleMessage = `${item.name} — HPを${healed}回復しました（${player.hp} / ${player.maxHp}）。`;
    }
    if (item.effect.type === "LOCK_ROLE") {
      this.state.lockedRole = this.state.currentRole;
      this.state.battleMessage = `${item.name} — このターンの終わりまで、役の倍率を ×${this.state.currentRole.multiplier} に固定しました。`;
    }
    return { item };
  }

  /** 戦闘をスキップできるか。自分のターン中（ドロー選択・カード使用）だけ。 */
  canSkipBattle() {
    return [PHASES.DRAW_SELECT, PHASES.CARD_SELECT].includes(this.state.phase);
  }

  /**
   * 戦闘に勝ったことにして終える（デモ限定）。デッキ構築や報酬を手早く確かめるためのもの。
   * HP・アイテム・デッキは今のまま変えない。
   */
  skipBattle() {
    if (!this.canSkipBattle()) return false;
    this.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    this.clearSelection();
    this.state.phase = PHASES.VICTORY;
    this.state.battleMessage = "戦闘をスキップしました（デモ用）。";
    return true;
  }

  /** カードを使い終えたらプレイヤーが自分でターンを終了する。いつでも終了できる。 */
  endTurn() {
    if (this.state.phase !== PHASES.CARD_SELECT) return false;
    this.clearSelection();
    // 「選んで出す（試作）」では、ここで場のカードをまとめて処理する。
    const resolved = this.isSelectPlay() ? this.resolvePlayedCards() : null;
    if (!aliveEnemies(this.state.enemies).length) {
      this.state.phase = PHASES.VICTORY;
      return true;
    }
    this.state.phase = PHASES.PLAYER_ATTACK;
    if (!resolved) this.state.battleMessage = "ターンを終了します。";
    return true;
  }
}
