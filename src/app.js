import {
  DECK_RULES,
  GAME_CONFIG,
  PHASES,
  PHASE_LABELS,
  REWARD_RULES,
  SCREENS,
} from "./data/constants.js";
import {
  CARD_BY_KEY,
  CARD_CATALOGUE,
  DEFAULT_DECK_COUNTS,
  createDeckFromCounts,
} from "./data/cards.js";
import { ROLE_BY_ID, ROLE_FAMILY_INFO, ROLE_GROWTH, roleFamiliesFor, roleLabel, upgradedMultiplier } from "./data/roles.js";
import {
  addCard,
  bucketLimit,
  canAddCard,
  createEmptyCounts,
  dieBucket,
  removeCard,
  summarizeDeck,
  validateDeck,
} from "./game/deckBuilder.js";
import {
  getTemporaryBonus,
  isAreaAttackCard,
  isDefenseCard,
  isTacticalCard,
  isWildCard,
  requiredTargetCount,
} from "./game/abilityLogic.js";
import { BattleEngine } from "./game/battleEngine.js";
import { cpuActionLabel, getCpuIntent } from "./game/enemyLogic.js";
import { createInitialGameState } from "./game/gameState.js";
import {
  DEFAULT_POINT_RULES,
  POINT_RULE_LIMIT,
  POINT_RULE_PRESETS,
  normalizePointRules,
  pointRulesLabel,
} from "./game/pointRules.js";
import {
  DEFAULT_RULESET_ID,
  DEFAULT_SELECT_PLAY_HAND_SIZE,
  RULE_OPTIONS,
  SELECT_PLAY_HAND_SIZES,
  STANDARD_RULESET,
  hasRule,
  ruleOptionsOf,
  rulesetIdFrom,
  rulesetLabel,
} from "./game/rulesets.js";
import { DICE_COLOR_BY_ID } from "./data/diceColors.js";
import { ITEMS, ITEM_BY_ID, ITEM_RULES } from "./data/items.js";
import {
  applyItemReward,
  canAddStartItem,
  canGainItem,
  countStartItems,
  drawItemOffers,
  itemsFromCounts,
} from "./game/itemLogic.js";
import { applyRewardColors, rollDiceColor, rollRunColors } from "./game/colorLogic.js";
import {
  applyReward,
  applyRoleUpgrade,
  canRemoveFromRun,
  countCards,
  drawRewardOffers,
  drawRoleOffers,
} from "./game/rewardLogic.js";

const app = document.querySelector("#app");
const timers = new Set();
const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

let screen = SCREENS.DECK_BUILD;
let deckCounts = { ...createEmptyCounts(), ...DEFAULT_DECK_COUNTS };
let engine = null;
// 構築画面で選ぶポイント設定。連戦中も引き継ぐ。
let pointRules = { ...DEFAULT_POINT_RULES };
// 構築画面で選ぶルール（現行ルールか、検討中の新しいルールか）。連戦中も引き継ぐ。
let ruleset = DEFAULT_RULESET_ID;
// 戦術カードの対象選択中だけ保持する UI 状態。
let pendingTactical = null;
// 確定ボタンはなく、選んであるカードをもう一度押すと使う（ダブルクリックでも、間を空けた2回のクリックでもよい）。
// 1回目のクリックで選び、右の欄で内訳を確認できる。
// クリックのたびに再描画で要素が作り直されるので、ダブルクリックは要素ではなくカードの id と時刻で判定する
// （戦術カードの対象選択を2回目のクリックで取り消さないために使う）。
const DOUBLE_CLICK_MS = 400;
let lastCardClick = { cardId: null, at: 0 };
// 連戦中のデッキ（カードごとの枚数）。構築画面のデッキから始まり、報酬で入手・削除して育つ。
let runCounts = null;
// 連戦中の役の強化レベル（{ 役id: レベル }）。報酬で上がり、1戦目からやり直すと消える。
let runRoleLevels = {};
// 連戦中のデッキの色（{ cardKey: [1枚目の色, …] }）。「ダイスの色（試作）」のときだけ持ち、現行ルールでは null。
let runColors = null;
// 連戦中に持っているアイテム（id の配列）。戦闘中に使うと減り、報酬で増える。
// 1戦目からやり直すと、構築画面で選んだ持ち込みアイテムに戻る。
let runItems = [];
// 構築画面で選ぶ持ち込みアイテム（{ アイテムid: 個数 }）。連戦の最初に持つ。
let startItemCounts = {};
// 「選んで出す（試作）」の手札の枚数（構築画面で 6 / 7 から選ぶ）。ほかのルールでは使わない。
let selectHandSize = DEFAULT_SELECT_PLAY_HAND_SIZE;
// 報酬画面の状態：{ offers, gainKey, removeKey, roleOffers, roleKey, itemOffers, itemKey, battle, playerHp }
let reward = null;

/** 構築画面のデッキで、1戦目から連戦を始める。 */
function startRun() {
  runCounts = { ...deckCounts };
  runRoleLevels = {};
  runItems = itemsFromCounts(startItemCounts);
  // 色は連戦を始めるときに1枚ずつ決め、連戦中は変わらない。
  // 「目と色を振る（試作）」も ON なら、色はカードに固定せず手札に来るたびに振るので持たない。
  runColors = hasRule(ruleset, "dice_color") && !hasRule(ruleset, "roll_dice") ? rollRunColors(runCounts) : null;
  startBattle();
}

/** carry を渡すと連戦として、何戦目かと残りHPを引き継ぐ。 */
function startBattle(carry = {}) {
  clearTimers();
  pendingTactical = null;
  reward = null;
  engine = new BattleEngine(
    createInitialGameState(Math.random, createDeckFromCounts(runCounts, runColors), {
      pointRules,
      ruleset,
      roleLevels: runRoleLevels,
      items: runItems,
      handSize: selectHandSize,
      ...carry,
    }),
  );
  screen = SCREENS.BATTLE;
}

function openReward() {
  const { state } = engine;
  // 戦闘中に使った分を反映して、残っているアイテムを持ち越す。
  runItems = [...state.player.items];
  const offers = drawRewardOffers();
  reward = {
    offers,
    // 候補の色は先に決めて見せる（入手したらその色になる）。
    offerColors: runColors ? offers.map(() => rollDiceColor()) : null,
    gainKey: null,
    removeKey: null,
    // 色があるときは、同じカードでも色ごとに別の1枚として削除を選ぶ。
    removeIndex: null,
    roleOffers: drawRoleOffers(Math.random, REWARD_RULES.ROLE_OFFER_COUNT, state.ruleset),
    itemOffers: drawItemOffers(),
    itemKey: null,
    roleKey: null,
    battle: state.battle,
    playerHp: state.player.hp,
  };
  screen = SCREENS.REWARD;
}

function cancelTargeting() {
  pendingTactical = null;
}

function tacticalLabel(ability) {
  if (ability.type === "DIE_VALUE_SHIFT") {
    return `目を ${ability.value > 0 ? "+" : ""}${ability.value}`;
  }
  if (ability.type === "HAND_POSITION_SWAP") return "2枚の位置を入替";
  if (ability.type === "REDRAW_CARD") return "1枚捨てて引く";
  if (ability.type === "GAIN_SHIELD") return `シールド +${ability.value}`;
  return "TACTICAL";
}

function schedule(callback, delay) {
  const timer = window.setTimeout(() => {
    timers.delete(timer);
    callback();
  }, delay);
  timers.add(timer);
}

function clearTimers() {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.clear();
}

function hpPercent(current, max) {
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function multiplierLabel(value) {
  return Number.isInteger(value) ? `×${value}` : `×${value.toFixed(2)}`;
}

/** 成立している役の名前。複数成立していれば「A × B」と並べる。 */
/** 成立している役の表示名。系統名に段階を添え、系統をまたぐときは × でつなぐ（例：SET（2組） × PARITY（偶数のみ））。 */
function roleNameLabel(role) {
  if (!role?.roles?.length) return role?.roleName || null;
  return role.roles.map(roleLabel).join(" × ");
}

/** 倍率の内訳。複数成立時のみ「2.8 × 2.8」を返す。 */
function roleBreakdown(role) {
  if (!role?.roles || role.roles.length < 2) return "";
  return role.roles.map((entry) => entry.multiplier).join(" × ");
}

function abilityLabel(card) {
  if (isTacticalCard(card)) {
    return `<span class="ability ability--tactical"><i>◆</i> ${tacticalLabel(card.tacticalAbility)}</span>`;
  }
  if (isDefenseCard(card)) {
    return `<span class="ability ability--support"><i>◇</i> SHIELD +${card.defense} / NO ROLE ×</span>`;
  }
  if (isWildCard(card)) {
    return `<span class="ability ability--wild"><i>◈</i> WILD DIE</span>`;
  }
  if (isAreaAttackCard(card)) {
    return `<span class="ability ability--boost"><i>◎</i> ALL ENEMIES（各敵に ATK × 役倍率）</span>`;
  }
  if (card.onUseAbility?.type === "NEXT_TURN_ATTACK_BONUS") {
    return `<span class="ability ability--boost"><i>↗</i> NEXT TURN ATK +${card.onUseAbility.value}</span>`;
  }
  if (card.passiveAbility?.type === "RIGHT_CARD_ATTACK_BONUS") {
    return `<span class="ability ability--support"><i>→</i> RIGHT CARD ATK +${card.passiveAbility.value}</span>`;
  }
  return `<span class="ability ability--none">NO ABILITY</span>`;
}

/** 行動予告。次の行動に加え、パターン全体と現在位置も隠さず表示する。 */
function renderCpuIntent(cpu) {
  const pattern = cpu.actionPattern
    .map((action, index) => {
      const text = cpuActionLabel(action);
      return index === cpu.actionIndex ? `<b>[${text}]</b>` : text;
    })
    .join(" → ");
  return `
    <div class="cpu-intent">
      <span>NEXT ACTION</span><strong>${cpuActionLabel(getCpuIntent(cpu), cpu.charge)}</strong>
      <span>CHARGE ${cpu.charge}</span>
      <span>BLOCK ${cpu.block}</span>
      <small>PATTERN ${cpu.actionIndex + 1}/${cpu.actionPattern.length}: ${pattern} → (loop)</small>
    </div>
  `;
}

function statusPanel(entity, label, modifier = "", extraClass = "") {
  const percent = hpPercent(entity.hp, entity.maxHp);
  return `
    <section class="fighter-status fighter-status--${modifier} ${extraClass}">
      <div class="fighter-status__heading">
        <div>
          <span class="eyebrow">${modifier === "cpu" ? "HOSTILE UNIT" : "ACTIVE PLAYER"}</span>
          <h2>${label}</h2>
        </div>
        <span class="hp-readout"><b>${entity.hp}</b><small> / ${entity.maxHp}</small></span>
      </div>
      <div class="hp-track" role="progressbar" aria-label="${label} HP" aria-valuemin="0" aria-valuemax="${entity.maxHp}" aria-valuenow="${entity.hp}">
        <div class="hp-track__fill" style="--hp:${percent}%"></div>
        <div class="hp-track__shine"></div>
      </div>
      ${modifier === "cpu" ? renderCpuIntent(entity) : ""}
    </section>
  `;
}

/** 敵の一覧。クリックした敵が攻撃の対象になる。倒れた敵は選べない。 */
function renderEnemies(state) {
  const target = engine.getTargetEnemy();
  const panels = state.enemies.map((enemy) => {
    const defeated = enemy.hp <= 0;
    const targeted = !defeated && target?.id === enemy.id;
    const tag = defeated ? "DEFEATED" : targeted ? "◎ TARGET" : "クリックで対象に";
    return `
      <div class="enemy-slot ${targeted ? "is-target" : ""} ${defeated ? "is-defeated" : ""}"
        ${defeated ? "" : `data-target-id="${enemy.id}" role="button" tabindex="0"`}
        aria-label="${enemy.name}${targeted ? "（攻撃の対象）" : ""}">
        <span class="enemy-slot__tag">${tag}</span>
        ${statusPanel(enemy, enemy.name, "cpu")}
      </div>
    `;
  }).join("");
  return `<div class="enemy-row">${panels}</div>`;
}

/** このターンに使ったカードの合計。 */
function turnTotalsLabel(totals) {
  const blocked = totals.blocked ? ` (BLOCK −${totals.blocked})` : "";
  return `THIS TURN: ${totals.cards} CARDS · DMG ${totals.dealt}${blocked} · SHIELD +${totals.shield}`;
}

function getCenterDisplay(state) {
  if (state.phase === PHASES.PLAYER_ATTACK) {
    const totals = state.turnTotals;
    return {
      kicker: totals.cards ? "TURN TOTAL" : "NO CARD PLAYED",
      multiplier: totals.shield ? `SHIELD +${totals.shield}` : "",
      value: `${totals.dealt}`,
      unit: totals.blocked ? `DAMAGE (BLOCK −${totals.blocked})` : "DAMAGE",
      className: totals.dealt ? "combat-readout--player-hit" : "",
    };
  }

  if (state.phase === PHASES.VICTORY) {
    const attack = state.lastAttack;
    return {
      kicker: roleNameLabel(attack) || "DIRECT HIT",
      multiplier: attack?.roleName ? multiplierLabel(attack.roleMultiplier) : "",
      value: attack ? `${attack.dealt}` : "0",
      unit: attack?.blocked ? `DAMAGE (${attack.finalAttack} − BLOCK ${attack.blocked})` : "DAMAGE",
      className: "combat-readout--player-hit",
    };
  }

  if (state.phase === PHASES.CPU_ATTACK || state.phase === PHASES.DEFEAT) {
    const actions = state.lastCpuActions;
    const taken = actions.reduce((sum, item) => sum + item.taken, 0);
    const absorbed = actions.reduce((sum, item) => sum + item.absorbed, 0);
    return {
      kicker: actions.map((item) => `${item.enemyName}: ${cpuActionLabel(item.action, item.charge)}`).join(" / "),
      multiplier: absorbed ? `SHIELD −${absorbed}` : "",
      value: `${taken}`,
      unit: "DAMAGE TAKEN",
      className: "combat-readout--enemy-hit",
    };
  }

  const role = state.currentRole;
  return {
    kicker: roleNameLabel(role) || "NO ACTIVE ROLE",
    multiplier: role?.roleName ? multiplierLabel(role.multiplier) : "×1",
    value: state.turn.toString().padStart(2, "0"),
    unit: "TURN",
    className: role?.roleName ? "combat-readout--role" : "",
  };
}

function renderCenter(state) {
  const display = getCenterDisplay(state);
  return `
    <section class="combat-stage ${state.phase === PHASES.CPU_ATTACK ? "combat-stage--danger" : ""}">
      <div class="stage-grid" aria-hidden="true"></div>
      <div class="cpu-core ${state.phase === PHASES.PLAYER_ATTACK || state.phase === PHASES.VICTORY ? "cpu-core--hit" : ""}" aria-hidden="true">
        <span class="cpu-core__ring cpu-core__ring--outer"></span>
        <span class="cpu-core__ring cpu-core__ring--inner"></span>
        <span class="cpu-core__eye"></span>
      </div>
      <div class="phase-chip"><span></span>${PHASE_LABELS[state.phase]}</div>
      <div class="combat-readout ${display.className}" aria-live="polite">
        <span class="combat-readout__kicker">${display.kicker}</span>
        ${display.multiplier ? `<span class="combat-readout__multiplier">${display.multiplier}</span>` : ""}
        <strong>${display.value}</strong>
        <span class="combat-readout__unit">${display.unit}</span>
      </div>
      <p class="battle-message">${state.battleMessage}</p>
      ${state.phase === PHASES.CARD_SELECT && state.turnTotals.cards ? `<p class="battle-message">${turnTotalsLabel(state.turnTotals)}</p>` : ""}
    </section>
  `;
}

/** 「選んで出す（試作）」の場：出したカードと、いまターンを終えたときの見込み。 */
function renderField(state) {
  if (!engine.isSelectPlay()) return "";
  const field = engine.getFieldPreview();
  const targetName = (entry) =>
    entry.targetId === "all" ? "全体" : state.enemies.find((enemy) => enemy.id === entry.targetId)?.name ?? "—";
  // 役は場のカードの目（と色）で決まるので、出したカードごとに目と色を見せる。
  const rows = field.results.map((entry) => {
    const { card } = entry;
    const wild = isWildCard(card);
    return `
    <li class="field-card die-${card.dieValue} ${card.color ? `dice-accent--${card.color}` : ""}"
      aria-label="${card.name}、目${wild ? "ワイルド" : card.dieValue}${card.color ? `、${DICE_COLOR_BY_ID[card.color].label}` : ""}">
      <span class="field-card__die" aria-hidden="true">${wild ? "◈" : DIE_FACES[card.dieValue]}</span>
      <strong>${card.name} ${colorChip(card.color)}</strong>
      <small>${isDefenseCard(card) ? `DEF ${card.defense}` : `ATK ${entry.attack} → ${targetName(entry)}`}</small>
      <b>${isDefenseCard(card) ? `+${entry.shield}` : `${entry.damage}`}</b>
    </li>
  `;
  }).join("");
  return `
    <div class="field-zone">
      <div class="field-zone__head">
        <span class="eyebrow">FIELD（ターン終了時にまとめて処理）</span>
        <span>${field.results.length ? `暫定の役 <b>${roleNameLabel(field) || "なし"} ${multiplierLabel(field.roleMultiplier)}</b> · 合計 ${field.finalAttack} ダメージ${field.shield ? ` · シールド +${field.shield}` : ""}` : "まだ何も出していません。出したカードには、ターン終了時に決まる役の倍率がまとめて掛かります"}</span>
      </div>
      ${rows ? `<ol class="field-zone__cards">${rows}</ol>` : ""}
    </div>
  `;
}

function renderPreview(state) {
  const selected = engine.getSelectedCard();
  const tentative = engine.isSelectPlay();
  const preview = selected ? engine.getAttackPreview(selected.id) : null;
  const role = preview
    ? {
        roles: preview.roles,
        roleName: preview.roleName,
        multiplier: preview.roleMultiplier,
      }
    : state.currentRole;

  return `
    <aside class="tactical-panel">
      <div class="panel-heading">
        <span class="eyebrow">TACTICAL SCAN</span>
        <span class="panel-heading__status">LIVE</span>
      </div>
      <div class="preview-card ${selected ? "preview-card--active" : ""}">
        <div class="preview-card__top">
          <div>
            <span class="preview-label">SELECTED CARD</span>
            <h3>${selected?.name || "カードを選択"}</h3>
          </div>
          <span class="preview-die">${selected ? DIE_FACES[selected.dieValue] : "—"}</span>
        </div>
        <dl class="damage-formula">
          <div><dt>BASE ATTACK</dt><dd>${preview?.baseAttack ?? "—"}</dd></div>
          <div class="${preview?.passiveBonus ? "is-positive" : ""}"><dt>PASSIVE</dt><dd>${preview ? `+${preview.passiveBonus}` : "—"}</dd></div>
          <div class="${preview?.temporaryBonus ? "is-positive" : ""}"><dt>TURN BUFF</dt><dd>${preview ? `+${preview.temporaryBonus}` : "—"}</dd></div>
        </dl>
        <div class="formula-divider"><span>×</span></div>
        <div class="role-formula">
          <span class="preview-label">${tentative ? "ROLE（場＋このカード・暫定）" : "HAND ROLE"}</span>
          <div><strong>${roleNameLabel(role) || "NONE"}</strong><b>${multiplierLabel(role?.multiplier ?? 1)}</b></div>
          ${roleBreakdown(role) ? `<small class="role-breakdown">${roleBreakdown(role)}</small>` : ""}
        </div>
        ${
          isDefenseCard(selected)
            ? `<div class="final-damage"><span>SHIELD（役倍率なし）</span><strong>+${selected.defense}</strong></div>`
            : `<div class="final-damage"><span>FINAL DAMAGE${tentative ? "（暫定）" : ""}</span><strong>${preview?.finalAttack ?? "—"}</strong></div>`
        }
        <dl class="damage-formula">
          <div><dt>TARGET</dt><dd>${
            isAreaAttackCard(selected)
              ? `ALL（${(preview?.hits ?? []).map((hit) => `${hit.enemyName} ${hit.dealt}`).join(" / ")}）`
              : engine.getTargetEnemy()?.name ?? "—"
          }</dd></div>
          <div><dt>ENEMY BLOCK</dt><dd>${preview ? `−${preview.blocked}` : `${engine.getTargetEnemy()?.block ?? 0}`}</dd></div>
          <div><dt>DEALT</dt><dd>${preview?.dealt ?? "—"}</dd></div>
        </dl>
        ${selected ? `<div class="selected-abilities">${abilityLabel(selected)}</div>` : `<p class="preview-hint">手札を選ぶと、常在効果と役を含む最終ダメージを確認できます。</p>`}
      </div>
      <button class="command-button command-button--secondary role-guide" data-action="show-roles">ROLE LIST（役一覧）</button>
    </aside>
  `;
}

function renderItems(state) {
  const { items } = state.player;
  const slots = items.map((id, slot) => {
    const item = ITEM_BY_ID[id];
    const usable = engine.canUseItemAt(slot);
    return `
      <button class="item-slot" data-use-item="${slot}" ${usable ? "" : "disabled"} title="${item.description}">
        <strong>${item.name}</strong><small>${item.description}</small>
      </button>
    `;
  }).join("");
  return `
    <div class="item-bar">
      <span class="resource-label">ITEMS ${items.length} / ${ITEM_RULES.MAX_HELD}</span>
      ${items.length ? `<div class="item-bar__slots">${slots}</div>` : `<small class="item-bar__empty">アイテムなし（戦闘後の報酬で手に入る）</small>`}
    </div>
  `;
}

function renderPoints(state) {
  const dots = Array.from({ length: state.player.maxPoint }, (_, index) =>
    `<i class="${index < state.player.point ? "is-filled" : ""}"></i>`,
  ).join("");
  const activeBonus = getTemporaryBonus(
    state.player.temporaryEffects,
    state.turn,
  );
  const pendingBonus = state.player.temporaryEffects
    .filter((effect) => effect.activeFromTurn > state.turn)
    .reduce((sum, effect) => sum + effect.value, 0);

  return `
    <div class="resource-bar">
      <div class="point-bank">
        <span class="resource-label">ENERGY</span>
        <div class="point-dots" aria-label="ポイント ${state.player.point} / ${state.player.maxPoint}">${dots}</div>
        <strong>${state.player.point}<small> / ${state.player.maxPoint}</small></strong>
        <small class="point-rules-note">${pointRulesLabel(state.pointRules)}</small>
      </div>
      <div class="resource-stats">
        <span><i class="deck-icon"></i>DECK <b>${state.player.deck.length}</b></span>
        <span><i class="discard-icon"></i>DISCARD <b>${state.player.discardPile.length}</b></span>
        ${state.player.shield ? `<span class="buff-chip buff-chip--shield">SHIELD ${state.player.shield}</span>` : ""}
        ${state.lockedRole ? `<span class="buff-chip buff-chip--lock">ROLE LOCK ${multiplierLabel(state.lockedRole.multiplier)}（このターン）</span>` : ""}
        ${activeBonus ? `<span class="buff-chip">ATK +${activeBonus} ACTIVE</span>` : ""}
        ${pendingBonus ? `<span class="buff-chip buff-chip--pending">NEXT ATK +${pendingBonus}</span>` : ""}
      </div>
    </div>
  `;
}

function renderHand(state) {
  if (!state.player.hand.length) {
    return `
      <div class="empty-hand">
        <span>∅</span>
        <strong>NO CARDS IN HAND</strong>
        <small>次のドローフェーズでカードを引けます</small>
      </div>
    `;
  }

  const targeting = Boolean(pendingTactical);

  return state.player.hand
    .map((card, index) => {
      const tactical = isTacticalCard(card);
      const defense = isDefenseCard(card);
      const preview = tactical || defense ? null : engine.getAttackPreview(card.id);
      const selected = card.id === state.selectedCardId;
      const unaffordable = card.cost > state.player.point;
      const isSource = targeting && card.id === pendingTactical.cardId;
      const isTarget = targeting && pendingTactical.targets.includes(card.id);
      const interactive = targeting
        ? state.phase === PHASES.CARD_SELECT
        : state.phase === PHASES.CARD_SELECT && !unaffordable;
      const bonus = preview ? preview.passiveBonus + preview.temporaryBonus : 0;
      const tuned = card.dieValue !== card.baseDieValue;

      const classes = [
        "battle-card",
        `die-${card.dieValue}`,
        // 色があるときは、目ごとの色分けの代わりにダイスの色でカードを塗る。
        card.color ? `dice-accent--${card.color}` : "",
        tactical ? "battle-card--tactical" : "",
        isWildCard(card) ? "battle-card--wild" : "",
        selected ? "is-selected" : "",
        isSource ? "is-source" : "",
        isTarget ? "is-target" : "",
        targeting && !isSource ? "is-targetable" : "",
        unaffordable && !targeting ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <button
          class="${classes}"
          data-card-id="${card.id}"
          style="--card-index:${index}"
          ${interactive ? "" : "disabled"}
          aria-pressed="${selected || isTarget}"
          aria-label="${card.name}、目${card.dieValue}${card.color ? `、${DICE_COLOR_BY_ID[card.color].label}` : ""}、${tactical ? tacticalLabel(card.tacticalAbility) : defense ? `防御${card.defense}` : `攻撃${card.attack}`}、コスト${card.cost}"
        >
          <span class="battle-card__edge"></span>
          <span class="battle-card__cost"><small>COST</small>${card.cost}</span>
          <span class="battle-card__index">${String(index + 1).padStart(2, "0")}</span>
          <span class="battle-card__die" aria-hidden="true">${isWildCard(card) ? "◈" : DIE_FACES[card.dieValue]}</span>
          ${colorChip(card.color)}
          ${tuned ? `<span class="tuned-flag">TUNED ${card.baseDieValue}→${card.dieValue}</span>` : ""}
          <span class="battle-card__name">${card.name}</span>
          ${
            tactical
              ? `<span class="battle-card__attack battle-card__attack--tactical"><small>TACTICAL</small><b>—</b></span>`
              : defense
              ? `<span class="battle-card__attack"><small>DEF</small><b>${card.defense}</b></span>`
              : `<span class="battle-card__attack"><small>ATK</small><b>${card.attack + bonus}</b>${bonus ? `<em>+${bonus}</em>` : ""}</span>`
          }
          ${abilityLabel(card)}
          ${unaffordable && !targeting ? `<span class="locked-label">POINT SHORTAGE</span>` : ""}
        </button>
      `;
    })
    .join("");
}

function renderCommands(state) {
  const selected = engine.getSelectedCard();
  const cardsAvailable =
    state.player.deck.length + state.player.discardPile.length;
  const canDraw =
    state.player.point >= GAME_CONFIG.DRAW_COST && cardsAvailable > 0;

  if (state.phase === PHASES.DRAW_SELECT) {
    const disabledReason = !cardsAvailable
      ? "山札・捨て札ともに空です"
      : `ポイントが${GAME_CONFIG.DRAW_COST}必要です`;
    return `
      <div class="command-copy">
        <span class="command-step">01 / 02</span>
        <div><strong>カードをドローしますか？</strong><small>${GAME_CONFIG.DRAW_COST}ポイントで手札を1枚増やせます / 手札はターン終了時に総入れ替え</small></div>
      </div>
      <div class="command-actions">
        <button class="command-button command-button--secondary" data-action="skip">SKIP</button>
        <button class="command-button command-button--primary" data-action="draw" ${canDraw ? "" : "disabled"} title="${canDraw ? "" : disabledReason}">
          <span>DRAW</span><small>−${GAME_CONFIG.DRAW_COST} PT</small>
        </button>
      </div>
    `;
  }

  if (state.phase === PHASES.CARD_SELECT && pendingTactical) {
    const source = state.player.hand.find(
      (card) => card.id === pendingTactical.cardId,
    );
    const remaining =
      requiredTargetCount(source) - pendingTactical.targets.length;
    return `
      <div class="command-copy">
        <span class="command-step">TARGETING</span>
        <div><strong>${source.name}：対象をあと${remaining}枚選択</strong><small>${tacticalLabel(source.tacticalAbility)} — 手札のカードをクリックしてください</small></div>
      </div>
      <div class="command-actions">
        <button class="command-button command-button--secondary" data-action="cancel-tactical">CANCEL</button>
      </div>
    `;
  }

  if (state.phase === PHASES.CARD_SELECT) {
    const canAttack = engine.hasPlayableAttackCard();
    const defending = isDefenseCard(selected);
    const headline = selected
      ? engine.isSelectPlay()
        ? `${selected.name} を場に出す${defending ? "（防御）" : ""}`
        : `${selected.name} で${defending ? "防御" : "攻撃"}`
      : canAttack
        ? "使用するカードを選択"
        : "使えるカードがありません";
    const fieldRule = engine.isSelectPlay();
    const howTo = selected
      ? `${selected.name} をもう一度押すと${fieldRule ? "場に出す" : "使う"}`
      : `カードを押して選び、もう一度押すと${fieldRule ? "場に出す" : "使う"}（ダブルクリックでも可）`;
    const detail = `${howTo} — ${fieldRule
      ? selected
        ? "処理はターン終了時で、場のカード全体の役の倍率が掛かります"
        : "ポイントが続く限り何枚でも場に出せます。END TURN で場のカードをまとめて処理します"
      : selected
        ? defending
          ? `シールド +${selected.defense}（役の倍率は掛かりません）`
          : "使用前の手札で役を判定します"
        : "ポイントが続く限り何枚でも使えます。終わったら END TURN"}`;
    return `
      <div class="command-copy">
        <span class="command-step">${engine.isSelectPlay() ? "01 / 01" : "02 / 02"}</span>
        <div><strong>${headline}</strong><small>${detail}</small></div>
      </div>
      <div class="command-actions">
        <button class="command-button command-button--danger" data-action="end-turn">END TURN</button>
      </div>
    `;
  }

  return `
    <div class="command-copy command-copy--center">
      <div><strong>${state.phase === PHASES.CPU_ATTACK ? "CPUが行動中…" : "戦闘処理中…"}</strong><small>アクションが完了するまでお待ちください</small></div>
    </div>
    <div class="command-loader"><i></i><i></i><i></i></div>
  `;
}

function renderResult(state) {
  if (![PHASES.VICTORY, PHASES.DEFEAT].includes(state.phase)) return "";
  const victory = state.phase === PHASES.VICTORY;
  return `
    <div class="result-overlay">
      <div class="result-dialog result-dialog--${victory ? "victory" : "defeat"}" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <span class="result-dialog__mark">${victory ? "◆" : "×"}</span>
        <span class="eyebrow">${victory ? "TARGET ELIMINATED" : "UNIT DISABLED"}</span>
        <h2 id="result-title">${victory ? "YOU WIN" : "GAME OVER"}</h2>
        <p>${victory ? `${state.turn}ターンで敵をすべて撃破しました。HPは${state.player.hp}のまま次の戦闘へ進みます。` : `${state.battle}戦目で敗れました（突破 ${state.battle - 1}戦）。`}</p>
        <div class="result-stats">
          <span><small>BATTLE</small><b>${state.battle}</b></span>
          <span><small>TURN</small><b>${state.turn}</b></span>
          <span><small>CARDS USED</small><b>${state.player.cardsPlayed}</b></span>
          <span><small>HP LEFT</small><b>${state.player.hp}</b></span>
        </div>
        <div class="result-actions">
          <button class="command-button command-button--secondary" data-action="edit-deck">EDIT DECK</button>
          ${
            victory
              ? `<button class="command-button command-button--primary" data-action="open-reward">REWARD</button>`
              : `<button class="command-button command-button--primary" data-action="restart">RETRY FROM #001</button>`
          }
        </div>
      </div>
    </div>
  `;
}


/** ダイスの色の札。色が無い（現行ルール）ときは何も出さない。 */
function colorChip(color) {
  if (!color) return "";
  return `<span class="dice-color dice-color--${color}">${DICE_COLOR_BY_ID[color].label}</span>`;
}

function dieGlyph(definition) {
  return dieBucket(definition) === "wild" ? "◈" : DIE_FACES[definition.dieValue];
}

function renderDieBudget(summary) {
  return ["1", "2", "3", "4", "5", "6", "wild"]
    .map((bucket) => {
      const key = bucket === "wild" ? "wild" : Number(bucket);
      const count = summary.byDie[key];
      const limit = bucketLimit(key);
      const full = count >= limit;
      return `
        <div class="die-budget ${full ? "is-full" : ""} ${bucket === "wild" ? "die-budget--wild" : `die-${bucket}`}">
          <span class="die-budget__face">${bucket === "wild" ? "◈" : DIE_FACES[Number(bucket)]}</span>
          <b>${count}<small>/${limit}</small></b>
        </div>
      `;
    })
    .join("");
}

function renderCatalogue() {
  return CARD_CATALOGUE.map((definition) => {
    const count = deckCounts[definition.key] ?? 0;
    const tactical = Boolean(definition.tacticalAbility);
    const addable = canAddCard(deckCounts, definition.key);
    const bucket = dieBucket(definition);
    return `
      <article class="catalogue-card ${bucket === "wild" ? "catalogue-card--wild" : `die-${definition.dieValue}`} ${tactical ? "catalogue-card--tactical" : ""} ${count ? "is-included" : ""}">
        <header>
          <span class="catalogue-card__die">${dieGlyph(definition)}</span>
          <div>
            <strong>${definition.name}</strong>
            <small>${tactical ? "TACTICAL" : isDefenseCard(definition) ? `DEF ${definition.defense}` : `ATK ${definition.attack}`} / COST ${definition.cost}</small>
          </div>
        </header>
        ${abilityLabel(definition)}
        <div class="catalogue-card__stepper">
          <button type="button" data-deck-remove="${definition.key}" ${count ? "" : "disabled"} aria-label="${definition.name} を1枚減らす">−</button>
          <b>${count}</b>
          <button type="button" data-deck-add="${definition.key}" ${addable ? "" : "disabled"} aria-label="${definition.name} を1枚増やす">+</button>
        </div>
      </article>
    `;
  }).join("");
}

/** 強化レベルを含む倍率の表記。強化済みなら元の倍率も添える（レベルは系統の見出しに出す）。 */
function roleMultiplierText(role, levels = {}) {
  const current = multiplierLabel(upgradedMultiplier(role, levels));
  return role.kind === "bonus" && levels[role.family] ? `${current} <small>(${multiplierLabel(role.multiplier)})</small>` : current;
}

/**
 * rulesetId のルールで判定する役の一覧。系統ごとにまとめ、段階を弱い順に並べる。
 * 「ダイスの色（試作）」なら色の系統（FLUSH）も並ぶ。
 */
function renderRoleTable(levels = {}, rulesetId = ruleset) {
  return roleFamiliesFor(rulesetId).map(({ family, name, label, roles }) => {
    const risk = family === "penalty";
    const stages = roles.map(
      (role) => `
        <div class="role-table__row ${risk ? "role-table__row--risk" : ""}">
          <span>${role.stage ?? role.name}</span>
          <small>${role.description}</small>
          <b>${roleMultiplierText(role, levels)}</b>
        </div>
      `,
    ).join("");
    return `
      <div class="role-family ${risk ? "role-family--risk" : ""}">
        <div class="role-family__head"><strong>${name}</strong><small>${label}${levels[family] ? ` · Lv${levels[family]}（全段階 +${Number((levels[family] * ROLE_GROWTH.UPGRADE_STEP).toFixed(2))}）` : ""}</small></div>
        ${stages}
      </div>
    `;
  }).join("");
}

function roleRuleHint(rulesetId = ruleset) {
  const cards = hasRule(rulesetId, "select_play") ? "場に出したカード" : "手札全体";
  const basis = `${cards}の目${hasRule(rulesetId, "dice_color") ? "と色" : ""}`;
  return `${basis}で役が決まります。役は系統ごとにまとめてあり、強い段階が成立するほど同じ名前のまま倍率が上がります。系統ごとに最も高い段階を1つ採り、系統をまたいで倍率を掛け合わせます。`;
}

/**
 * 戦闘中に役一覧を開くダイアログ。render() は #app を丸ごと書き換えるため、
 * CPUターンの再描画で閉じないよう #app の外に一度だけ作る。
 */
function renderRoleDialogBody(levels, rulesetId = ruleset) {
  return `
    <form method="dialog" class="role-table">
      <span class="eyebrow">ROLE LIST</span>
      <p class="role-table__hint">${roleRuleHint(rulesetId)}</p>
      ${renderRoleTable(levels, rulesetId)}
      <button class="command-button command-button--secondary">CLOSE</button>
    </form>
  `;
}

function createRoleDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "role-dialog";
  dialog.innerHTML = renderRoleDialogBody({});
  // 枠の外（背景）をクリックしても閉じる。
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

function renderStartItems() {
  const held = countStartItems(startItemCounts);
  const rows = ITEMS.map((item) => {
    const count = startItemCounts[item.id] ?? 0;
    return `
      <div class="start-item">
        <div><strong>${item.name}</strong><small>${item.description}</small></div>
        <div class="catalogue-card__stepper">
          <button type="button" data-start-item-remove="${item.id}" ${count ? "" : "disabled"} aria-label="${item.name} を1つ減らす">−</button>
          <b>${count}</b>
          <button type="button" data-start-item-add="${item.id}" ${canAddStartItem(startItemCounts, item.id) ? "" : "disabled"} aria-label="${item.name} を1つ増やす">+</button>
        </div>
      </div>
    `;
  }).join("");
  return `
    <section class="ruleset-picker">
      <div><span class="eyebrow">STARTING ITEMS</span><strong>持ち込むアイテム ${held} / ${ITEM_RULES.MAX_HELD}</strong><small>連戦の最初に持つアイテム。戦闘後の報酬でも手に入る。</small></div>
      <div class="start-items">${rows}</div>
    </section>
  `;
}

/**
 * ルールの選択。試作ルールはそれぞれ ON / OFF でき、組み合わせられる。
 * 「現行ルール」を押すと、試作ルールをすべて OFF にする。
 */
function renderRulesetPicker() {
  const standard = !ruleOptionsOf(ruleset).length;
  const optionButton = (option, active) => `
    <button class="ruleset-option ${active ? "is-active" : ""}" data-ruleset="${option.id}" aria-pressed="${active}">
      <strong>${option.id === STANDARD_RULESET.id ? option.label : `${active ? "ON" : "OFF"} · ${option.label}`}</strong>
      <small>${option.description}</small>
    </button>
  `;
  const options = [
    optionButton(STANDARD_RULESET, standard),
    ...RULE_OPTIONS.map((option) => optionButton(option, hasRule(ruleset, option.id))),
  ].join("");
  // 「選んで出す（試作）」はドロー選択がない代わりに、手札の枚数を選ぶ。
  const handSizes = hasRule(ruleset, "select_play")
    ? `
      <div class="ruleset-picker__hand-size">
        <span>手札の枚数（毎ターン引き直す）</span>
        ${SELECT_PLAY_HAND_SIZES.map((size) => `<button class="command-button command-button--secondary ${size === selectHandSize ? "is-active" : ""}" data-hand-size="${size}" aria-pressed="${size === selectHandSize}">${size}枚</button>`).join("")}
      </div>
    `
    : "";
  const rollNote = hasRule(ruleset, "roll_dice")
    ? `<p class="ruleset-picker__note">目${hasRule(ruleset, "dice_color") ? "と色" : ""}は手札に来るたびに振るので、カードに書かれた目${hasRule(ruleset, "dice_color") ? "・色" : ""}は使われない（構築画面の目の上限は今のまま）。</p>`
    : "";
  return `
    <section class="ruleset-picker">
      <div><span class="eyebrow">RULES</span><strong>どのルールで遊ぶか：${rulesetLabel(ruleset)}</strong><small>試作ルールはそれぞれ ON / OFF でき、組み合わせて遊べる。</small></div>
      <div class="ruleset-picker__options">${options}</div>
      ${handSizes}
      ${rollNote}
    </section>
  `;
}

function renderPointRules() {
  const input = (key, label) => `
    <label class="point-rules__field">
      <span>${label}</span>
      <input type="number" min="${POINT_RULE_LIMIT.MIN}" max="${POINT_RULE_LIMIT.MAX}" step="1"
        value="${pointRules[key]}" data-point-rule="${key}"
        ${key === "recovery" && pointRules.fullRefill ? "disabled" : ""} />
    </label>
  `;
  const presets = POINT_RULE_PRESETS.map((preset) => {
    const active =
      JSON.stringify(normalizePointRules(preset.rules)) === JSON.stringify(normalizePointRules(pointRules));
    return `<button class="command-button command-button--secondary ${active ? "is-active" : ""}" data-point-preset="${preset.id}">${preset.label}</button>`;
  }).join("");
  return `
    <section class="point-rules">
      <div><span class="eyebrow">POINT RULES</span><strong>${pointRulesLabel(pointRules)}</strong></div>
      <div class="point-rules__fields">
        ${input("startPoint", "開始")}
        ${input("maxPoint", "上限")}
        ${input("recovery", "毎ターン回復")}
        <label class="point-rules__field">
          <span>毎ターン上限まで全回復</span>
          <input type="checkbox" data-point-rule="fullRefill" ${pointRules.fullRefill ? "checked" : ""} />
        </label>
      </div>
      <div class="point-rules__presets">${presets}</div>
    </section>
  `;
}

function cardStatLabel(definition) {
  if (definition.tacticalAbility) return "TACTICAL";
  if (isDefenseCard(definition)) return `DEF ${definition.defense}`;
  return `ATK ${definition.attack}`;
}

/** 報酬・デッキ一覧で使う、操作ボタンを1つ持つカード。 */
function rewardCard(definition, { count = null, color = null, selected = false, disabled = false, data, buttonLabel }) {
  const bucket = dieBucket(definition);
  return `
    <article class="catalogue-card ${bucket === "wild" ? "catalogue-card--wild" : `die-${definition.dieValue}`} ${color ? `dice-accent--${color}` : ""} ${definition.tacticalAbility ? "catalogue-card--tactical" : ""} ${selected ? "is-included reward-card--selected" : ""}">
      <header>
        <span class="catalogue-card__die">${dieGlyph(definition)}</span>
        <div>
          <strong>${definition.name}${count === null ? "" : ` ×${count}`} ${colorChip(color)}</strong>
          <small>${cardStatLabel(definition)} / COST ${definition.cost}</small>
        </div>
      </header>
      ${abilityLabel(definition)}
      <button type="button" class="command-button command-button--secondary" ${data} ${disabled ? "disabled" : ""}>${buttonLabel}</button>
    </article>
  `;
}

function renderReward() {
  const { offers, gainKey, removeKey, battle, playerHp } = reward;
  const deckEntries = CARD_CATALOGUE.filter((definition) => (runCounts[definition.key] ?? 0) > 0);
  const result = applyReward(runCounts, offers, reward);

  const offerCards = offers.map((key, index) =>
    rewardCard(CARD_BY_KEY[key], {
      color: reward.offerColors?.[index] ?? null,
      selected: gainKey === key,
      data: `data-reward-gain="${key}"`,
      buttonLabel: gainKey === key ? "選択中（もう一度で解除）" : "これを入手",
    }),
  ).join("");

  const removeButtonLabel = (selected, removable) =>
    selected ? "削除する（もう一度で解除）" : removable ? "1枚削除" : `${DECK_RULES.MIN_DECK_SIZE}枚未満になるため不可`;
  // 色があるときは1枚ずつ並べ、どの色の1枚を削除するかを選べるようにする。
  const deckCards = deckEntries.flatMap((definition) => {
    const key = definition.key;
    const removable = canRemoveFromRun(runCounts, key, gainKey);
    if (runColors) {
      return runColors[key].map((color, index) => {
        const selected = removeKey === key && reward.removeIndex === index;
        return rewardCard(definition, {
          color,
          selected,
          disabled: !(selected || removable),
          data: `data-reward-remove="${key}" data-remove-index="${index}"`,
          buttonLabel: removeButtonLabel(selected, selected || removable),
        });
      });
    }
    const selected = removeKey === key;
    return [rewardCard(definition, {
      count: runCounts[key],
      selected,
      disabled: !(selected || removable),
      data: `data-reward-remove="${key}"`,
      buttonLabel: removeButtonLabel(selected, selected || removable),
    })];
  }).join("");

  const { itemOffers, itemKey } = reward;
  const itemFull = !canGainItem(runItems);
  const itemCards = itemOffers.map((id) => {
    const item = ITEM_BY_ID[id];
    const selected = itemKey === id;
    return `
      <article class="catalogue-card ${selected ? "is-included reward-card--selected" : ""}">
        <header>
          <span class="catalogue-card__die">✚</span>
          <div><strong>${item.name}</strong><small>ITEM / ポイント不要・使い切り</small></div>
        </header>
        <span class="ability ability--none">${item.description}</span>
        <button type="button" class="command-button command-button--secondary" data-reward-item="${id}" ${itemFull && !selected ? "disabled" : ""}>${selected ? "選択中（もう一度で解除）" : itemFull ? `所持数が上限（${ITEM_RULES.MAX_HELD}）のため不可` : "これを入手"}</button>
      </article>
    `;
  }).join("");
  const heldItems = runItems.length ? runItems.map((id) => ITEM_BY_ID[id].name).join("、") : "なし";
  const itemText = itemKey ? `${ITEM_BY_ID[itemKey].name} を入手` : "アイテムなし";

  const { roleOffers, roleKey } = reward;
  // 強化は系統単位。候補の id は系統（"set" など）で、その系統の全段階の倍率が上がる。
  const familyById = Object.fromEntries(roleFamiliesFor(engine.state.ruleset).map((entry) => [entry.family, entry]));
  const roleCards = roleOffers.map((id) => {
    const { name, label, roles } = familyById[id];
    const level = runRoleLevels[id] ?? 0;
    const next = { ...runRoleLevels, [id]: level + 1 };
    const range = (levels) => {
      const values = roles.map((role) => upgradedMultiplier(role, levels));
      const low = multiplierLabel(Math.min(...values));
      const high = multiplierLabel(Math.max(...values));
      return low === high ? low : `${low}〜${high}`;
    };
    const selected = roleKey === id;
    return `
      <article class="catalogue-card ${selected ? "is-included reward-card--selected" : ""}">
        <header>
          <span class="catalogue-card__die">×</span>
          <div>
            <strong>${name} <small>Lv${level} → Lv${level + 1}</small></strong>
            <small>${range(runRoleLevels)} → ${range(next)} / 系統 ${label}</small>
          </div>
        </header>
        <span class="ability ability--none">全段階の倍率 +${ROLE_GROWTH.UPGRADE_STEP}：${roles.map((role) => role.stage).join("・")}</span>
        <button type="button" class="command-button command-button--secondary" data-reward-role="${id}">${selected ? "選択中（もう一度で解除）" : "この系統を強化"}</button>
      </article>
    `;
  }).join("");
  const roleText = roleKey ? `${ROLE_FAMILY_INFO[roleKey].name} を強化` : "強化しない";

  const gainColor = gainKey ? reward.offerColors?.[offers.indexOf(gainKey)] : null;
  const removeColor = removeKey && reward.removeIndex !== null ? runColors?.[removeKey]?.[reward.removeIndex] : null;
  const colorText = (color) => (color ? `（${DICE_COLOR_BY_ID[color].label}）` : "");
  const gainText = gainKey ? `${CARD_BY_KEY[gainKey].name}${colorText(gainColor)} を入手` : "入手しない";
  const removeText = removeKey ? `${CARD_BY_KEY[removeKey].name}${colorText(removeColor)} を1枚削除` : "削除しない";

  return `
    <main class="build-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="DICE HAND 報酬">
          <span class="brand__mark"><i>D<small>6</small></i></span>
          <span><strong>DICE HAND</strong><small>BATTLE REWARD</small></span>
        </a>
        <div class="topbar__center"><span>CLEARED</span><strong>#${String(battle).padStart(3, "0")}</strong></div>
        <button class="command-button command-button--primary" data-action="next-battle">
          <span>NEXT BATTLE</span><small>${gainText} / ${removeText} / ${roleText} / ${itemText}</small>
        </button>
      </header>

      <section class="point-rules">
        <div><span class="eyebrow">RUN STATUS</span><strong>HP ${playerHp} / ${GAME_CONFIG.PLAYER_MAX_HP}（回復なし） · デッキ ${countCards(runCounts)}枚 → ${countCards(result)}枚 · アイテム ${runItems.length} / ${ITEM_RULES.MAX_HELD}（${heldItems}）</strong></div>
        <small>候補${REWARD_RULES.OFFER_COUNT}枚から${REWARD_RULES.MAX_GAINS}枚まで入手し、デッキから${REWARD_RULES.MAX_REMOVALS}枚まで削除し、候補${REWARD_RULES.ROLE_OFFER_COUNT}つの系統から${REWARD_RULES.MAX_ROLE_UPGRADES}つまで強化できます（いずれも任意）。削除は${DECK_RULES.MIN_DECK_SIZE}枚を下回らない範囲で行えます。</small>
      </section>

      <section class="catalogue">
        <div class="build-heading"><div><span class="eyebrow">GAIN</span><h2>入手するカード（1枚まで）</h2></div></div>
        <div class="catalogue-grid">${offerCards}</div>
      </section>

      <section class="catalogue">
        <div class="build-heading"><div><span class="eyebrow">REMOVE</span><h2>今のデッキ（1枚まで削除）</h2></div></div>
        <div class="catalogue-grid">${deckCards}</div>
      </section>

      <section class="catalogue">
        <div class="build-heading"><div><span class="eyebrow">ITEM</span><h2>入手するアイテム（${ITEM_RULES.MAX_GAINS}つまで・持てるのは${ITEM_RULES.MAX_HELD}つまで）</h2></div></div>
        <div class="catalogue-grid">${itemCards}</div>
      </section>

      <section class="catalogue">
        <div class="build-heading"><div><span class="eyebrow">ROLE UPGRADE</span><h2>役の強化（1系統まで・その系統の全段階に倍率 +${ROLE_GROWTH.UPGRADE_STEP}）</h2></div></div>
        <div class="catalogue-grid">${roleCards}</div>
      </section>

      <section class="role-table">
        <span class="eyebrow">ROLE LIST（現在のレベル）</span>
        ${renderRoleTable(runRoleLevels, engine.state.ruleset)}
      </section>
    </main>
  `;
}

function renderDeckBuild() {
  const { valid, errors, summary } = validateDeck(deckCounts);
  return `
    <main class="build-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="DICE HAND デッキ構築">
          <span class="brand__mark"><i>D<small>6</small></i></span>
          <span><strong>DICE HAND</strong><small>DECK CONSTRUCTION</small></span>
        </a>
        <div class="topbar__center"><span>DECK</span><strong>${summary.total}枚 (${DECK_RULES.MIN_DECK_SIZE}〜${DECK_RULES.MAX_DECK_SIZE})</strong></div>
        <a class="docs-link" href="docs/">SPEC</a>
        <button class="command-button command-button--primary" data-action="start-battle" ${valid ? "" : "disabled"}>
          <span>BATTLE START</span><small>${valid ? "READY" : "デッキ未完成"}</small>
        </button>
      </header>

      <section class="build-summary">
        <div class="build-summary__budget">
          <span class="eyebrow">DIE BUDGET</span>
          <div class="die-budget-track">${renderDieBudget(summary)}</div>
          <small>同じ目は最大${DECK_RULES.MAX_PER_DIE_VALUE}枚、ワイルドは最大${DECK_RULES.MAX_WILD_CARDS}枚。デッキは${DECK_RULES.MIN_DECK_SIZE}〜${DECK_RULES.MAX_DECK_SIZE}枚。</small>
        </div>
        <dl class="build-summary__stats">
          <div><dt>ATTACK</dt><dd>${summary.attackCount}</dd></div>
          <div><dt>DEFENSE</dt><dd>${summary.defenseCount}</dd></div>
          <div><dt>TACTICAL</dt><dd>${summary.tacticalCount}</dd></div>
          <div><dt>AVG COST</dt><dd>${summary.averageCost.toFixed(1)}</dd></div>
          <div><dt>AVG ATK</dt><dd>${summary.averageAttack.toFixed(1)}</dd></div>
        </dl>
      </section>

      ${renderRulesetPicker()}
      ${renderPointRules()}
      ${renderStartItems()}

      ${
        errors.length
          ? `<ul class="build-errors">${errors.map((error) => `<li>${error}</li>`).join("")}</ul>`
          : `<p class="build-ready">デッキが完成しました。BATTLE START で戦闘を開始できます。</p>`
      }

      <div class="build-layout">
        <section class="catalogue">
          <div class="build-heading">
            <div><span class="eyebrow">CARD LIST</span><h2>カード一覧</h2></div>
            <div class="build-actions">
              <button class="command-button command-button--secondary" data-action="deck-preset">初期構成（最小限）</button>
              <button class="command-button command-button--secondary" data-action="deck-clear">すべて外す</button>
            </div>
          </div>
          <div class="catalogue-grid">${renderCatalogue()}</div>
        </section>

        <aside class="role-table">
          <span class="eyebrow">ROLE LIST</span>
          <p class="role-table__hint">${roleRuleHint()}</p>
          ${renderRoleTable()}
        </aside>
      </div>
    </main>
  `;
}

function render() {
  if (screen === SCREENS.DECK_BUILD) {
    app.innerHTML = renderDeckBuild();
    bindEvents();
    return;
  }

  if (screen === SCREENS.REWARD) {
    app.innerHTML = renderReward();
    bindEvents();
    return;
  }

  const state = engine.state;
  const targetingValid =
    pendingTactical &&
    state.phase === PHASES.CARD_SELECT &&
    state.player.hand.some((card) => card.id === pendingTactical.cardId);
  if (pendingTactical && !targetingValid) cancelTargeting();
  app.innerHTML = `
    <main class="battle-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="DICE HAND 戦闘デモ">
          <span class="brand__mark"><i>D<small>6</small></i></span>
          <span><strong>DICE HAND</strong><small>TACTICAL CARD BATTLE</small></span>
        </a>
        <div class="topbar__center"><span>BATTLE</span><strong>#${String(state.battle).padStart(3, "0")}</strong><span>DECK ${countCards(runCounts)}</span><span class="ruleset-chip ${ruleOptionsOf(state.ruleset).map((id) => `ruleset-chip--${id}`).join(" ")}">${rulesetLabel(state.ruleset)}</span></div>
        <div class="topbar__actions">
          <button class="icon-button icon-button--demo" data-action="skip-battle" ${engine.canSkipBattle() ? "" : "disabled"} aria-label="戦闘をスキップして報酬へ（デモ用）" title="戦闘をスキップして報酬へ（デモ用）">⏭</button>
          <button class="icon-button" data-action="show-roles" aria-label="役一覧" title="役一覧">役</button>
          <button class="icon-button" data-action="edit-deck" aria-label="デッキを編集" title="デッキを編集">☰</button>
          <button class="icon-button" data-action="restart" aria-label="1戦目からやり直す" title="1戦目からやり直す">↻</button>
        </div>
      </header>

      <div class="battle-layout">
        <div class="battle-board">
          ${renderEnemies(state)}
          ${renderCenter(state)}
          <div class="player-zone">
            ${statusPanel(state.player, "PLAYER // DICER", "player")}
            ${renderPoints(state)}
            ${renderItems(state)}
          </div>
        </div>
        ${renderPreview(state)}
      </div>

      <section class="hand-section">
        <div class="hand-heading">
          <div><span class="eyebrow">YOUR ARSENAL</span><h2>HAND <b>${state.player.hand.length}</b></h2></div>
          <div class="hand-role"><span>${engine.isSelectPlay() ? "FIELD ROLE（暫定）" : "CURRENT ROLE"}${state.lockedRole ? "（固定中）" : ""}</span><strong>${roleNameLabel(state.currentRole) || "NONE"}</strong><b>${multiplierLabel(state.currentRole?.multiplier ?? 1)}</b></div>
        </div>
        ${renderField(state)}
        <div class="hand-track">${renderHand(state)}</div>
      </section>

      <section class="command-deck">${renderCommands(state)}</section>
      ${renderResult(state)}
    </main>
  `;
  bindEvents();
}

function proceedAfterPlayerAction() {
  render();
  if (engine.state.phase === PHASES.VICTORY) return;

  schedule(() => {
    if (!engine.startCpuTurn()) return;
    render();
    if (engine.state.phase === PHASES.DEFEAT) return;

    schedule(() => {
      if (engine.finishTurn()) render();
    }, 950);
  }, 1150);
}

function handleCardClick(cardId) {
  const state = engine.state;
  if (state.phase !== PHASES.CARD_SELECT) return;

  const now = Date.now();
  const isDouble = lastCardClick.cardId === cardId && now - lastCardClick.at <= DOUBLE_CLICK_MS;
  lastCardClick = isDouble ? { cardId: null, at: 0 } : { cardId, at: now };

  // 対象選択中：ソースをもう一度押すとキャンセル、それ以外は対象のトグル。
  if (pendingTactical) {
    if (cardId === pendingTactical.cardId) {
      // ダブルクリックの2回目で、入ったばかりの対象選択を取り消さない。
      if (isDouble) return;
      cancelTargeting();
      render();
      return;
    }

    const targets = pendingTactical.targets;
    pendingTactical.targets = targets.includes(cardId)
      ? targets.filter((id) => id !== cardId)
      : [...targets, cardId];

    const source = state.player.hand.find(
      (card) => card.id === pendingTactical.cardId,
    );
    if (pendingTactical.targets.length === requiredTargetCount(source)) {
      const played = engine.playTacticalCard(
        pendingTactical.cardId,
        pendingTactical.targets,
      );
      cancelTargeting();
      if (!played) return;
    }
    render();
    return;
  }

  const card = state.player.hand.find((item) => item.id === cardId);
  if (!card || card.cost > state.player.point) return;

  if (isTacticalCard(card)) {
    if (requiredTargetCount(card) === 0) {
      engine.playTacticalCard(cardId, []);
      render();
      return;
    }
    pendingTactical = { cardId, targets: [] };
    render();
    return;
  }

  // 攻撃・防御カード：1回目で選び、選んであるカードをもう一度押すと使う（ダブルクリックでも、間を空けても）。
  if (state.selectedCardId === cardId) {
    if (engine.useSelectedCard()) {
      cancelTargeting();
      // ターンは続く。勝利したときだけ結果を表示する。
      render();
    }
    return;
  }
  if (engine.selectCard(cardId)) render();
}

function bindEvents() {
  app.querySelectorAll("[data-deck-add]").forEach((button) => {
    button.addEventListener("click", () => {
      deckCounts = addCard(deckCounts, button.dataset.deckAdd);
      render();
    });
  });

  app.querySelectorAll("[data-deck-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      deckCounts = removeCard(deckCounts, button.dataset.deckRemove);
      render();
    });
  });

  app.querySelectorAll("[data-point-rule]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.pointRule;
      const value = input.type === "checkbox" ? input.checked : input.value;
      pointRules = normalizePointRules({ ...pointRules, [key]: value });
      render();
    });
  });

  app.querySelectorAll("[data-hand-size]").forEach((button) => {
    button.addEventListener("click", () => {
      selectHandSize = Number(button.dataset.handSize);
      render();
    });
  });

  app.querySelectorAll("[data-ruleset]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.ruleset;
      if (id === STANDARD_RULESET.id) {
        ruleset = DEFAULT_RULESET_ID;
      } else {
        // 押した試作ルールだけを切り替え、ほかの試作ルールはそのまま残す。
        const on = ruleOptionsOf(ruleset);
        ruleset = rulesetIdFrom(on.includes(id) ? on.filter((option) => option !== id) : [...on, id]);
      }
      render();
    });
  });

  app.querySelectorAll("[data-point-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = POINT_RULE_PRESETS.find((item) => item.id === button.dataset.pointPreset);
      pointRules = normalizePointRules(preset.rules);
      render();
    });
  });

  app.querySelectorAll("[data-reward-gain]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.rewardGain;
      reward.gainKey = reward.gainKey === key ? null : key;
      // 入手を外して最小枚数を割る場合は、削除の選択も外す。
      if (reward.removeKey && !canRemoveFromRun(runCounts, reward.removeKey, reward.gainKey)) {
        reward.removeKey = null;
        reward.removeIndex = null;
      }
      render();
    });
  });

  app.querySelectorAll("[data-start-item-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.startItemAdd;
      if (!canAddStartItem(startItemCounts, id)) return;
      startItemCounts = { ...startItemCounts, [id]: (startItemCounts[id] ?? 0) + 1 };
      render();
    });
  });

  app.querySelectorAll("[data-start-item-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.startItemRemove;
      if (!(startItemCounts[id] > 0)) return;
      startItemCounts = { ...startItemCounts, [id]: startItemCounts[id] - 1 };
      render();
    });
  });

  app.querySelectorAll("[data-reward-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.rewardItem;
      reward.itemKey = reward.itemKey === id ? null : id;
      render();
    });
  });

  app.querySelectorAll("[data-use-item]").forEach((button) => {
    button.addEventListener("click", () => {
      if (engine.useItem(Number(button.dataset.useItem))) render();
    });
  });

  app.querySelectorAll("[data-reward-role]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.rewardRole;
      reward.roleKey = reward.roleKey === id ? null : id;
      render();
    });
  });

  app.querySelectorAll("[data-reward-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.rewardRemove;
      const index = button.dataset.removeIndex === undefined ? null : Number(button.dataset.removeIndex);
      const same = reward.removeKey === key && reward.removeIndex === index;
      reward.removeKey = same ? null : key;
      reward.removeIndex = same ? null : index;
      render();
    });
  });

  app.querySelectorAll("[data-target-id]").forEach((slot) => {
    const select = () => {
      if (engine.setTarget(slot.dataset.targetId)) render();
    };
    slot.addEventListener("click", select);
    slot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") select();
    });
  });

  app.querySelectorAll("[data-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      handleCardClick(button.dataset.cardId);
    });
  });

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const action = button.dataset.action;

      if (action === "show-roles") {
        // 強化レベルは連戦中に変わるため、開くたびに作り直す。
        roleDialog.innerHTML = renderRoleDialogBody(
          engine?.state.roleLevels ?? runRoleLevels,
          engine?.state.ruleset ?? ruleset,
        );
        roleDialog.showModal();
      }
      if (action === "draw" && engine.chooseDraw(true)) render();
      if (action === "skip" && engine.chooseDraw(false)) render();
      if (action === "cancel-tactical") {
        cancelTargeting();
        render();
      }
      if (action === "end-turn" && engine.endTurn()) {
        cancelTargeting();
        proceedAfterPlayerAction();
      }
      if (action === "start-battle" && validateDeck(deckCounts).valid) {
        startRun();
        render();
      }
      if (action === "deck-preset") {
        deckCounts = { ...createEmptyCounts(), ...DEFAULT_DECK_COUNTS };
        render();
      }
      if (action === "deck-clear") {
        deckCounts = createEmptyCounts();
        render();
      }
      if (action === "edit-deck") {
        clearTimers();
        cancelTargeting();
        screen = SCREENS.DECK_BUILD;
        render();
      }
      if (action === "skip-battle" && engine.skipBattle()) {
        clearTimers();
        cancelTargeting();
        openReward();
        render();
      }
      if (action === "open-reward" && engine.state.phase === PHASES.VICTORY) {
        openReward();
        render();
      }
      if (action === "next-battle" && reward) {
        if (runColors) {
          const gainColor = reward.gainKey ? reward.offerColors[reward.offers.indexOf(reward.gainKey)] : null;
          runColors = applyRewardColors(runColors, runCounts, reward.offers, { ...reward, gainColor });
        }
        runCounts = applyReward(runCounts, reward.offers, reward);
        runRoleLevels = applyRoleUpgrade(runRoleLevels, reward.roleOffers, reward.roleKey);
        runItems = applyItemReward(runItems, reward.itemOffers, reward.itemKey);
        startBattle({ battle: reward.battle + 1, playerHp: reward.playerHp });
        render();
      }
      if (action === "restart") {
        startRun();
        render();
      }
    });
  });
}

const roleDialog = createRoleDialog();
render();
