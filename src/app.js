import {
  DECK_RULES,
  GAME_CONFIG,
  PHASES,
  PHASE_LABELS,
  SCREENS,
} from "./data/constants.js";
import {
  CARD_CATALOGUE,
  DEFAULT_DECK_COUNTS,
  createDeckFromCounts,
} from "./data/cards.js";
import { BONUS_ROLES, PENALTY_ROLES } from "./data/roles.js";
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
  isTacticalCard,
  isWildCard,
  requiredTargetCount,
} from "./game/abilityLogic.js";
import { BattleEngine } from "./game/battleEngine.js";
import { createInitialGameState } from "./game/gameState.js";

const app = document.querySelector("#app");
const timers = new Set();
const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

let screen = SCREENS.DECK_BUILD;
let deckCounts = { ...createEmptyCounts(), ...DEFAULT_DECK_COUNTS };
let engine = null;
// 戦術カードの対象選択中だけ保持する UI 状態。
let pendingTactical = null;

function startBattle() {
  clearTimers();
  pendingTactical = null;
  engine = new BattleEngine(
    createInitialGameState(Math.random, createDeckFromCounts(deckCounts)),
  );
  screen = SCREENS.BATTLE;
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
  if (ability.type === "GRANT_EXTRA_ATTACK") return "このターン追加で1回攻撃";
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
function roleNameLabel(role) {
  if (!role?.roles?.length) return role?.roleName || null;
  return role.roles.map((entry) => entry.name).join(" × ");
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
  if (isWildCard(card)) {
    return `<span class="ability ability--wild"><i>◈</i> WILD DIE</span>`;
  }
  if (card.onUseAbility?.type === "NEXT_TURN_ATTACK_BONUS") {
    return `<span class="ability ability--boost"><i>↗</i> NEXT TURN ATK +${card.onUseAbility.value}</span>`;
  }
  if (card.passiveAbility?.type === "RIGHT_CARD_ATTACK_BONUS") {
    return `<span class="ability ability--support"><i>→</i> RIGHT CARD ATK +${card.passiveAbility.value}</span>`;
  }
  return `<span class="ability ability--none">NO ABILITY</span>`;
}

function statusPanel(entity, label, modifier = "") {
  const percent = hpPercent(entity.hp, entity.maxHp);
  return `
    <section class="fighter-status fighter-status--${modifier}">
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
    </section>
  `;
}

function getCenterDisplay(state) {
  if (state.phase === PHASES.PLAYER_ATTACK || state.phase === PHASES.VICTORY) {
    const attack = state.lastAttack;
    if (!attack) {
      return {
        kicker: "NO CARD PLAYED",
        multiplier: "",
        value: "—",
        unit: "TURN END",
        className: "",
      };
    }
    return {
      kicker: roleNameLabel(attack) || "DIRECT HIT",
      multiplier: attack?.roleName ? multiplierLabel(attack.roleMultiplier) : "",
      value: attack ? `${attack.finalAttack}` : "0",
      unit: "DAMAGE",
      className: "combat-readout--player-hit",
    };
  }

  if (state.phase === PHASES.CPU_ATTACK || state.phase === PHASES.DEFEAT) {
    return {
      kicker: "ENEMY STRIKE",
      multiplier: "",
      value: `${GAME_CONFIG.CPU_ATTACK_DAMAGE}`,
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
    </section>
  `;
}

function renderPreview(state) {
  const selected = engine.getSelectedCard();
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
          <span class="preview-label">HAND ROLE</span>
          <div><strong>${roleNameLabel(role) || "NONE"}</strong><b>${multiplierLabel(role?.multiplier ?? 1)}</b></div>
          ${roleBreakdown(role) ? `<small class="role-breakdown">${roleBreakdown(role)}</small>` : ""}
        </div>
        <div class="final-damage">
          <span>FINAL DAMAGE</span>
          <strong>${preview?.finalAttack ?? "—"}</strong>
        </div>
        ${selected ? `<div class="selected-abilities">${abilityLabel(selected)}</div>` : `<p class="preview-hint">手札を選ぶと、常在効果と役を含む最終ダメージを確認できます。</p>`}
      </div>
      <div class="role-guide">
        <span class="preview-label">ROLE QUICK GUIDE</span>
        <div class="role-guide__row"><span>同じ目のみ（2枚以上）</span><b>×4</b></div>
        <div class="role-guide__row"><span>偶数 / 奇数のみ</span><b>×1.5</b></div>
        <div class="role-guide__row role-guide__row--risk"><span>1・2・3を含む</span><b>×0.5</b></div>
      </div>
    </aside>
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
      </div>
      <div class="resource-stats">
        <span><i class="deck-icon"></i>DECK <b>${state.player.deck.length}</b></span>
        <span><i class="discard-icon"></i>DISCARD <b>${state.player.discardPile.length}</b></span>
        ${state.player.shield ? `<span class="buff-chip buff-chip--shield">SHIELD ${state.player.shield}</span>` : ""}
        ${state.player.extraAttacks ? `<span class="buff-chip buff-chip--extra">攻撃 あと${state.player.extraAttacks + 1}回</span>` : ""}
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
      const preview = tactical ? null : engine.getAttackPreview(card.id);
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
          aria-label="${card.name}、目${card.dieValue}、${tactical ? tacticalLabel(card.tacticalAbility) : `攻撃${card.attack}`}、コスト${card.cost}"
        >
          <span class="battle-card__edge"></span>
          <span class="battle-card__cost"><small>COST</small>${card.cost}</span>
          <span class="battle-card__index">${String(index + 1).padStart(2, "0")}</span>
          <span class="battle-card__die" aria-hidden="true">${isWildCard(card) ? "◈" : DIE_FACES[card.dieValue]}</span>
          ${tuned ? `<span class="tuned-flag">TUNED ${card.baseDieValue}→${card.dieValue}</span>` : ""}
          <span class="battle-card__name">${card.name}</span>
          ${
            tactical
              ? `<span class="battle-card__attack battle-card__attack--tactical"><small>TACTICAL</small><b>—</b></span>`
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
    const headline = selected
      ? `${selected.name} で攻撃`
      : canAttack
        ? "使用するカードを選択"
        : "攻撃できるカードがありません";
    const detail = selected
      ? "使用前の手札で役を判定します"
      : canAttack
        ? "戦術カードは攻撃せず手札を操作します（ターンは終了しません）"
        : "戦術カードで手札を整えるか、ターンを終了しましょう";
    return `
      <div class="command-copy">
        <span class="command-step">02 / 02</span>
        <div><strong>${headline}</strong><small>${detail}</small></div>
      </div>
      <div class="command-actions">
        ${!canAttack ? `<button class="command-button command-button--danger" data-action="end-turn">END TURN</button>` : `<button class="command-button command-button--attack" data-action="attack" ${selected ? "" : "disabled"}><span>EXECUTE</span><small>ATTACK</small></button>`}
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
        <p>${victory ? `${state.turn}ターンでCPUを撃破しました。` : `CPUの攻撃に敗れました。戦術を組み直しましょう。`}</p>
        <div class="result-stats">
          <span><small>TURN</small><b>${state.turn}</b></span>
          <span><small>CARDS USED</small><b>${state.player.cardsPlayed}</b></span>
          <span><small>HP LEFT</small><b>${state.player.hp}</b></span>
        </div>
        <div class="result-actions">
          <button class="command-button command-button--secondary" data-action="edit-deck">EDIT DECK</button>
          <button class="command-button command-button--primary" data-action="restart">REMATCH</button>
        </div>
      </div>
    </div>
  `;
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
            <small>${tactical ? "TACTICAL" : `ATK ${definition.attack}`} / COST ${definition.cost}</small>
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

function renderRoleTable() {
  // 倍率の高い順に並べ、減算役は最後にまとめる。
  return [...BONUS_ROLES, ...PENALTY_ROLES].map(
    (role) => `
      <div class="role-table__row ${role.kind === "penalty" ? "role-table__row--risk" : ""}">
        <span>${role.name}</span>
        <small>${role.description}</small>
        <b>${multiplierLabel(role.multiplier)}</b>
      </div>
    `,
  ).join("");
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
        <div class="topbar__center"><span>DECK</span><strong>${summary.total} / ${DECK_RULES.DECK_SIZE}</strong></div>
        <a class="docs-link" href="/docs">SPEC</a>
        <button class="command-button command-button--primary" data-action="start-battle" ${valid ? "" : "disabled"}>
          <span>BATTLE START</span><small>${valid ? "READY" : "デッキ未完成"}</small>
        </button>
      </header>

      <section class="build-summary">
        <div class="build-summary__budget">
          <span class="eyebrow">DIE BUDGET</span>
          <div class="die-budget-track">${renderDieBudget(summary)}</div>
          <small>同じ目は最大${DECK_RULES.MAX_PER_DIE_VALUE}枚、ワイルドは最大${DECK_RULES.MAX_WILD_CARDS}枚。役を作るため必ず5種類以上の目が混ざります。</small>
        </div>
        <dl class="build-summary__stats">
          <div><dt>ATTACK</dt><dd>${summary.attackCount}</dd></div>
          <div><dt>TACTICAL</dt><dd>${summary.tacticalCount}</dd></div>
          <div><dt>AVG COST</dt><dd>${summary.averageCost.toFixed(1)}</dd></div>
          <div><dt>AVG ATK</dt><dd>${summary.averageAttack.toFixed(1)}</dd></div>
        </dl>
      </section>

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
              <button class="command-button command-button--secondary" data-action="deck-preset">おすすめ構成</button>
              <button class="command-button command-button--secondary" data-action="deck-clear">すべて外す</button>
            </div>
          </div>
          <div class="catalogue-grid">${renderCatalogue()}</div>
        </section>

        <aside class="role-table">
          <span class="eyebrow">ROLE LIST</span>
          <p class="role-table__hint">手札全体の目で役が決まります。倍率が最も高い役だけが適用されます。</p>
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
        <div class="topbar__center"><span>BATTLE</span><strong>#001</strong></div>
        <div class="topbar__actions">
          <button class="icon-button" data-action="edit-deck" aria-label="デッキを編集" title="デッキを編集">☰</button>
          <button class="icon-button" data-action="restart" aria-label="同じデッキで再戦" title="同じデッキで再戦">↻</button>
        </div>
      </header>

      <div class="battle-layout">
        <div class="battle-board">
          ${statusPanel(state.cpu, "CPU // AEGIS", "cpu")}
          ${renderCenter(state)}
          <div class="player-zone">
            ${statusPanel(state.player, "PLAYER // DICER", "player")}
            ${renderPoints(state)}
          </div>
        </div>
        ${renderPreview(state)}
      </div>

      <section class="hand-section">
        <div class="hand-heading">
          <div><span class="eyebrow">YOUR ARSENAL</span><h2>HAND <b>${state.player.hand.length}</b></h2></div>
          <div class="hand-role"><span>CURRENT ROLE</span><strong>${roleNameLabel(state.currentRole) || "NONE"}</strong><b>${multiplierLabel(state.currentRole?.multiplier ?? 1)}</b></div>
        </div>
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

  // 対象選択中：ソースをもう一度押すとキャンセル、それ以外は対象のトグル。
  if (pendingTactical) {
    if (cardId === pendingTactical.cardId) {
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

  app.querySelectorAll("[data-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      handleCardClick(button.dataset.cardId);
    });
  });

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const action = button.dataset.action;

      if (action === "draw" && engine.chooseDraw(true)) render();
      if (action === "skip" && engine.chooseDraw(false)) render();
      if (action === "cancel-tactical") {
        cancelTargeting();
        render();
      }
      if (action === "attack" && engine.useSelectedCard()) {
        cancelTargeting();
        proceedAfterPlayerAction();
      }
      if (action === "end-turn" && engine.endTurnWithoutCard()) {
        cancelTargeting();
        proceedAfterPlayerAction();
      }
      if (action === "start-battle" && validateDeck(deckCounts).valid) {
        startBattle();
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
      if (action === "restart") {
        startBattle();
        render();
      }
    });
  });
}

render();
