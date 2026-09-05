/**
 * 仕様書の数値表を実装データから生成する。
 * ここでハードコードしないことで、コードとドキュメントのズレを防ぐ。
 */
import {
  DECK_RULES,
  GAME_CONFIG,
  PHASE_LABELS,
  PHASES,
} from "/src/data/constants.js";
import {
  CARD_CATALOGUE,
  CARD_BY_KEY,
  DEFAULT_DECK_COUNTS,
} from "/src/data/cards.js";
import { BONUS_ROLES, PENALTY_ROLES } from "/src/data/roles.js";
import { summarizeDeck, bucketLimit } from "/src/game/deckBuilder.js";
import { isTacticalCard, isWildCard } from "/src/game/abilityLogic.js";

const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// 7.1 の頻度欄。20万回試行の実測値（scripts では持たないため表示用に保持する）。
const MEASURED_FREQUENCY = {
  same_number: "~0.1%",
  four_of_a_kind: "0.20%",
  full_house: "1.50%",
  even_only: "0.66%",
  odd_only: "2.37%",
  five_straight: "4.82%",
  three_of_a_kind: "6.59%",
  four_straight: "16.45%",
  two_pair: "16.06%",
  three_straight: "15.11%",
  pair: "21.91%",
  one_two_three: "14.33%",
};

const CONSTANT_LABELS = {
  PLAYER_MAX_HP: "プレイヤー最大HP",
  CPU_MAX_HP: "CPU最大HP",
  START_POINT: "開始時ポイント",
  MAX_POINT: "最大ポイント",
  TURN_POINT_RECOVERY: "ターン終了時の回復量",
  DRAW_COST: "ドローの消費ポイント",
  START_HAND_SIZE: "手札の枚数",
  DECK_SIZE: "デッキ枚数",
  CPU_ATTACK_DAMAGE: "CPUの攻撃力",
};

const DECK_RULE_LABELS = {
  DECK_SIZE: "デッキ枚数（ちょうど）",
  MAX_PER_DIE_VALUE: "同じ目の上限",
  MAX_WILD_CARDS: "ワイルドの上限",
  MAX_COPIES_PER_CARD: "同名カードの上限",
};

function table(element, headers, rows) {
  if (!element) return;
  element.innerHTML = `
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td>${cell === undefined ? "" : cell}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  `;
}

function multiplierLabel(value) {
  return Number.isInteger(value) ? `×${value}` : `×${value.toFixed(1)}`;
}

function dieLabel(definition) {
  return isWildCard(definition)
    ? '<span class="doc-die doc-die--wild">◈</span> ワイルド'
    : `<span class="doc-die">${DIE_FACES[definition.dieValue]}</span> ${definition.dieValue}`;
}

function abilityText(definition) {
  const parts = [];
  if (definition.onUseAbility?.type === "NEXT_TURN_ATTACK_BONUS") {
    parts.push(`使用時：次のターンの攻撃力 +${definition.onUseAbility.value}`);
  }
  if (definition.passiveAbility?.type === "RIGHT_CARD_ATTACK_BONUS") {
    parts.push(`常在：右隣のカードの攻撃力 +${definition.passiveAbility.value}`);
  }
  if (definition.passiveAbility?.type === "WILD_DIE") {
    parts.push("常在：役判定で任意の目として扱う");
  }
  if (definition.tacticalAbility) {
    parts.push(`戦術：${tacticalText(definition.tacticalAbility)}`);
  }
  return parts.length ? parts.join("<br />") : "—";
}

function tacticalText(ability) {
  if (ability.type === "DIE_VALUE_SHIFT") {
    return `対象1枚の目を ${ability.value > 0 ? "+" : ""}${ability.value}`;
  }
  if (ability.type === "HAND_POSITION_SWAP") {
    return "対象2枚の手札内の位置を入れ替える";
  }
  if (ability.type === "REDRAW_CARD") {
    return "対象1枚を捨て、山札から1枚引く";
  }
  return ability.type;
}

// ---- 2. ゲーム定数 ----
table(
  document.querySelector("#constants-table"),
  ["定数", "内容", "値"],
  Object.entries(GAME_CONFIG).map(([key, value]) => [
    `<code>${key}</code>`,
    CONSTANT_LABELS[key] ?? "",
    `<b>${value}</b>`,
  ]),
);

// ---- 3.1 構築ルール ----
table(
  document.querySelector("#deck-rules-table"),
  ["ルール", "内容", "値"],
  Object.entries(DECK_RULES).map(([key, value]) => [
    `<code>${key}</code>`,
    DECK_RULE_LABELS[key] ?? "",
    `<b>${value}</b>`,
  ]),
);

// ---- 3.4 初期デッキ ----
const defaultSummary = summarizeDeck(DEFAULT_DECK_COUNTS);
table(
  document.querySelector("#default-deck-table"),
  ["カード", "目", "枚数"],
  [
    ...Object.entries(DEFAULT_DECK_COUNTS)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const definition = CARD_BY_KEY[key];
        return [definition.name, dieLabel(definition), `${count}`];
      }),
    [
      "<b>合計</b>",
      ["1", "2", "3", "4", "5", "6"]
        .map((v) => `${DIE_FACES[Number(v)]}${defaultSummary.byDie[Number(v)]}`)
        .join(" ") + ` ◈${defaultSummary.byDie.wild}`,
      `<b>${defaultSummary.total}</b>`,
    ],
  ],
);

// ---- 4.2 カード一覧 ----
table(
  document.querySelector("#catalogue-table"),
  ["カード", "種別", "目", "Cost", "ATK", "能力"],
  CARD_CATALOGUE.map((definition) => [
    `<b>${definition.name}</b>`,
    isTacticalCard(definition) ? "戦術" : "攻撃",
    dieLabel(definition),
    `${definition.cost}`,
    isTacticalCard(definition) ? "—" : `${definition.attack}`,
    abilityText(definition),
  ]),
);

// ---- 5.3 フェーズ ----
table(
  document.querySelector("#phases-table"),
  ["フェーズ", "表示", "内容"],
  [
    [PHASES.DRAW_SELECT, "DRAW / SKIP を選ぶ"],
    [PHASES.CARD_SELECT, "戦術カードの使用と、攻撃カードの選択"],
    [PHASES.PLAYER_ATTACK, "プレイヤーの攻撃の解決"],
    [PHASES.CPU_ATTACK, "CPUの攻撃"],
    [PHASES.POINT_RECOVERY, "ポイント回復と手札の引き直し"],
    [PHASES.VICTORY, "プレイヤーの勝利"],
    [PHASES.DEFEAT, "プレイヤーの敗北"],
  ].map(([phase, description]) => [
    `<code>${phase}</code>`,
    PHASE_LABELS[phase],
    description,
  ]),
);

// ---- 7.1 役一覧 ----
table(
  document.querySelector("#roles-table"),
  ["役", "条件", "倍率", "頻度"],
  [...BONUS_ROLES, ...PENALTY_ROLES].map((role) => [
    `<b>${role.name}</b>${role.minHandSize ? `<br /><small>最低${role.minHandSize}枚</small>` : ""}`,
    role.description,
    `<b class="${role.kind === "penalty" ? "is-risk" : "is-bonus"}">${multiplierLabel(role.multiplier)}</b>`,
    MEASURED_FREQUENCY[role.id] ?? "—",
  ]),
);

// ---- 8. 能力 ----
const withOnUse = CARD_CATALOGUE.filter((card) => card.onUseAbility);
table(
  document.querySelector("#onuse-table"),
  ["type", "効果", "持つカード"],
  [
    [
      "<code>NEXT_TURN_ATTACK_BONUS</code>",
      "次のターンのあいだ、攻撃力を value だけ加算する",
      withOnUse.map((card) => card.name).join(", ") || "—",
    ],
  ],
);

table(
  document.querySelector("#passive-table"),
  ["type", "効果", "持つカード"],
  [
    [
      "<code>RIGHT_CARD_ATTACK_BONUS</code>",
      "手札で右隣にあるカードの攻撃力を value だけ加算する",
      CARD_CATALOGUE.filter(
        (card) => card.passiveAbility?.type === "RIGHT_CARD_ATTACK_BONUS",
      )
        .map((card) => card.name)
        .join(", ") || "—",
    ],
    [
      "<code>WILD_DIE</code>",
      "役判定で任意の目として扱う（最も倍率が高くなる目が選ばれる）",
      CARD_CATALOGUE.filter(isWildCard)
        .map((card) => card.name)
        .join(", ") || "—",
    ],
  ],
);

const tacticalTypes = new Map();
CARD_CATALOGUE.filter(isTacticalCard).forEach((card) => {
  const list = tacticalTypes.get(card.tacticalAbility.type) ?? [];
  list.push(card);
  tacticalTypes.set(card.tacticalAbility.type, list);
});
table(
  document.querySelector("#tactical-table"),
  ["type", "対象数", "効果", "持つカード"],
  [...tacticalTypes.entries()].map(([type, cards]) => [
    `<code>${type}</code>`,
    type === "HAND_POSITION_SWAP" ? "2" : "1",
    cards.map((card) => tacticalText(card.tacticalAbility)).join("<br />"),
    cards.map((card) => `${card.name}（Cost ${card.cost}）`).join("<br />"),
  ]),
);

// ---- 目次 ----
const toc = document.querySelector("#toc");
if (toc) {
  toc.innerHTML = [...document.querySelectorAll("section[id] > h2")]
    .map(
      (heading) =>
        `<a href="#${heading.parentElement.id}">${heading.textContent}</a>`,
    )
    .join("");
}
