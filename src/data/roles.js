import { hasRule } from "../game/rulesets.js";

/**
 * 役はゲーム全体のルールとして管理する。
 *
 * 役は family（系統）に属する。同じ family の役は互いに入れ子になっており
 * （2枚 ⊂ 2組 ⊂ 3枚＋2枚 など）、まとめて掛けると同じ手札を
 * 多重に数えてしまうため、family ごとに最も倍率の高い役をひとつだけ採る。
 *
 * 表示では、同じ family の役を1つの名前（name ＝ 系統名）にまとめ、
 * 強い役が成立するほど同じ名前のまま倍率が上がる「段階」（stage）として見せる。
 * 例）SET（2枚）×1.1 → SET（2組）×1.25 → … → SET（全部同じ）×2.5
 *
 * 採用された役は family をまたいで掛け合わせる。
 * 例）3,3,3,1,1 → SET（3枚＋2枚）× PARITY（奇数のみ）
 *
 * minHandSize は「手札全体」を条件にする役だけが持つ。
 *
 * ボーナス役の倍率は、旧値のボーナス部分（1を超える分）を半分にしたもの（例：×2.8 → ×1.9）。
 * 減算役（×0.5）は変えていない。
 *
 * PARITY（偶数のみ・奇数のみ）はさらに ×1.9 → ×1.3 に下げている。デッキを偶奇に寄せるだけで成立率を100%にできる唯一の役で、
 * 同じ寄せ方で同じ目の系統も成立しやすくなり掛け合わさるため、偶数のみのデッキが突出していた
 * （12枚・各目4枚以下での手札5枚の期待倍率：偶数のみ ×2.77 → ×1.90、均等 ×1.23 → ×1.21）。
 */
export const HAND_ROLES = Object.freeze([
  {
    id: "same_number",
    name: "SET",
    stage: "全部同じ",
    family: "set",
    multiplier: 2.5,
    kind: "bonus",
    priority: 100,
    minHandSize: 3,
    // すべて同じ目なら偶奇も必ず揃うため、parity 系統とは重複させない。
    excludes: ["parity"],
    description: "手札すべてが同じ目（3枚以上）",
  },
  {
    id: "four_of_a_kind",
    name: "SET",
    stage: "4枚",
    family: "set",
    multiplier: 2.25,
    kind: "bonus",
    priority: 95,
    description: "同じ目が4枚",
  },
  {
    id: "five_straight",
    name: "STRAIGHT",
    stage: "5連",
    family: "straight",
    multiplier: 1.7,
    kind: "bonus",
    priority: 85,
    description: "5つ連続する目",
  },
  {
    id: "full_house",
    name: "SET",
    stage: "3枚＋2枚",
    family: "set",
    multiplier: 1.9,
    kind: "bonus",
    priority: 90,
    description: "同じ目3枚 + 別の同じ目2枚",
  },
  {
    id: "four_straight",
    name: "STRAIGHT",
    stage: "4連",
    family: "straight",
    multiplier: 1.35,
    kind: "bonus",
    priority: 70,
    description: "4つ連続する目",
  },
  {
    id: "three_of_a_kind",
    name: "SET",
    stage: "3枚",
    family: "set",
    multiplier: 1.5,
    kind: "bonus",
    priority: 80,
    description: "同じ目が3枚",
  },
  {
    id: "even_only",
    name: "PARITY",
    stage: "偶数のみ",
    family: "parity",
    multiplier: 1.3,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが偶数",
  },
  {
    id: "odd_only",
    name: "PARITY",
    stage: "奇数のみ",
    family: "parity",
    multiplier: 1.3,
    kind: "bonus",
    priority: 88,
    minHandSize: 2,
    description: "手札すべてが奇数",
  },
  {
    id: "three_straight",
    name: "STRAIGHT",
    stage: "3連",
    family: "straight",
    multiplier: 1.15,
    kind: "bonus",
    priority: 50,
    description: "3つ連続する目",
  },
  {
    id: "two_pair",
    name: "SET",
    stage: "2組",
    family: "set",
    multiplier: 1.25,
    kind: "bonus",
    priority: 60,
    description: "2枚組が2種類",
  },
  {
    id: "pair",
    name: "SET",
    stage: "2枚",
    family: "set",
    multiplier: 1.1,
    kind: "bonus",
    priority: 40,
    description: "同じ目が2枚",
  },
  {
    // 1・2・3 が揃うと減算。ただし 4 まで伸ばせば STRAIGHT として脱出できる。
    id: "one_two_three",
    name: "1-2-3",
    // 段階が1つしかない減算役は、段階を添えずに名前だけで呼ぶ。
    family: "penalty",
    kind: "penalty",
    multiplier: 0.5,
    priority: 999,
    description: "1・2・3を含み、4がない（減算）",
  },
]);

/**
 * 色の役。ルール「ダイスの色（試作）」でだけ判定する（rolesFor）。
 * 同じ色の枚数で段階を付け、目の役とは系統（color）をまたいで掛け合わせる。
 * 倍率は、色が一様に付いた手札5枚での成立しやすさを目の役の並びに当てはめた仮の値：
 *   FLUSH（3枚）（同色がちょうど3枚）35.2% → SET（2枚）並み
 *   FLUSH（4枚）（ちょうど4枚）5.9%       → SET（3枚）並み
 *   FLUSH（全部）（5枚すべて）0.4%        → SET（3枚＋2枚）と SET（4枚）の間
 */
export const COLOR_ROLES = Object.freeze([
  {
    id: "flush",
    name: "FLUSH",
    stage: "全部",
    family: "color",
    multiplier: 2,
    kind: "bonus",
    priority: 92,
    // 手札全体が条件の役。カードを使って手札が減ると成立しやすくなるため、手札5枚を下限にする。
    minHandSize: 5,
    ruleset: "dice_color",
    description: "手札すべてが同じ色（5枚以上）",
  },
  {
    id: "four_flush",
    name: "FLUSH",
    stage: "4枚",
    family: "color",
    multiplier: 1.5,
    kind: "bonus",
    priority: 78,
    ruleset: "dice_color",
    description: "同じ色が4枚",
  },
  {
    id: "three_flush",
    name: "FLUSH",
    stage: "3枚",
    family: "color",
    multiplier: 1.1,
    kind: "bonus",
    priority: 35,
    ruleset: "dice_color",
    description: "同じ色が3枚",
  },
]);

export const ROLE_BY_ID = Object.freeze(
  Object.fromEntries([...HAND_ROLES, ...COLOR_ROLES].map((role) => [role.id, role])),
);

/**
 * 「選んで出す（試作）」で判定する役。出すカードを自分で選べるため、次のように変える。
 * - 「全部」を条件にする段階（全部同じ・偶数のみ・奇数のみ）は、2〜3枚だけ選べば必ず成立してしまう。
 *   そこで出す枚数の下限を手札1回分（5枚）に上げる。
 * - 減算役 1-2-3 は、1・2・3 を一緒に出さなければ避けられて罰則にならないため判定しない。
 */
const SELECT_PLAY_MIN_CARDS = 5;
function forSelectPlay(roles) {
  return Object.freeze(
    roles.filter((role) => role.kind === "bonus").map((role) =>
      role.minHandSize
        ? Object.freeze({
            ...role,
            minHandSize: Math.max(role.minHandSize, SELECT_PLAY_MIN_CARDS),
            description: role.description
              .replace("手札すべて", "出したカードすべて")
              .replace(/（\d+枚以上）/, "")
              .concat(`（${Math.max(role.minHandSize, SELECT_PLAY_MIN_CARDS)}枚以上）`),
          })
        : role,
    ),
  );
}

const COLOR_HAND_ROLES = Object.freeze([...HAND_ROLES, ...COLOR_ROLES]);
const SELECT_PLAY_ROLES = forSelectPlay(HAND_ROLES);
const SELECT_PLAY_COLOR_ROLES = forSelectPlay(COLOR_HAND_ROLES);

/**
 * そのルールで判定する役。試作ルールは組み合わせられる（rulesets.js）。
 * - 「ダイスの色（試作）」が入っていれば、色の役を加える。
 * - 「選んで出す（試作）」が入っていれば、出したカードで判定する用に条件を変える（forSelectPlay）。
 */
export function rolesFor(ruleset = "standard") {
  const color = hasRule(ruleset, "dice_color");
  if (hasRule(ruleset, "select_play")) return color ? SELECT_PLAY_COLOR_ROLES : SELECT_PLAY_ROLES;
  return color ? COLOR_HAND_ROLES : HAND_ROLES;
}

/** そのルールのボーナス役を、倍率の高い順（同じなら priority の高い順）に並べたもの。 */
export function bonusRolesFor(ruleset = "standard") {
  return rolesFor(ruleset)
    .filter((role) => role.kind === "bonus")
    .sort((a, b) => b.multiplier - a.multiplier || b.priority - a.priority);
}

export const PENALTY_ROLES = Object.freeze(
  HAND_ROLES.filter((role) => role.kind === "penalty"),
);

/** 系統の表示名（役の name と同じ）と、日本語の呼び方。並びは役一覧に出す順。キーは強化レベルのキーにもなる。 */
export const ROLE_FAMILY_INFO = Object.freeze({
  set: Object.freeze({ name: "SET", label: "同じ目" }),
  straight: Object.freeze({ name: "STRAIGHT", label: "連番" }),
  parity: Object.freeze({ name: "PARITY", label: "偶奇" }),
  color: Object.freeze({ name: "FLUSH", label: "同じ色" }),
  penalty: Object.freeze({ name: "1-2-3", label: "減算" }),
});

/** 役の表示名。系統名に段階を添える（例：SET（2組））。段階の無い減算役は名前だけ。 */
export function roleLabel(role) {
  return role.stage ? `${role.name}（${role.stage}）` : role.name;
}

/**
 * そのルールの系統と、系統ごとの段階（弱い順）。役一覧はこの形で見せる。
 * 段階の並びは強化前の倍率。倍率が同じ段階（偶数のみ・奇数のみ）は priority の順。
 */
export function roleFamiliesFor(ruleset = "standard") {
  const roles = rolesFor(ruleset);
  return Object.entries(ROLE_FAMILY_INFO)
    .map(([family, info]) => ({
      family,
      ...info,
      roles: roles
        .filter((role) => role.family === family)
        .sort((a, b) => a.multiplier - b.multiplier || a.priority - b.priority),
    }))
    .filter(({ roles: list }) => list.length > 0);
}

/** 倍率の高い順に並べた通常役。倍率が同じ場合は priority の高い方を先に見る。 */
export const BONUS_ROLES = Object.freeze(
  HAND_ROLES.filter((role) => role.kind === "bonus").sort(
    (a, b) => b.multiplier - a.multiplier || b.priority - a.priority,
  ),
);

/**
 * 役の強化（成長）。報酬で選んだ系統のレベルを1上げ、その系統の全段階の倍率に UPGRADE_STEP を足す。
 * 役を系統ごとに1つの名前で見せているため、強化も系統単位にしている（段階ごとには上げない）。
 * 系統をまたいで倍率は掛け合わさるため、強化は掛け算ではなく足し算にしている。
 * 減算役は強化の対象外。上げ幅は当面一律（成立しやすさに合わせた調整は今後）。
 */
export const ROLE_GROWTH = Object.freeze({
  UPGRADE_STEP: 0.1,
});

/** レベルを反映した倍率。levels は { 系統: レベル }（例：{ set: 2 }）。 */
export function upgradedMultiplier(role, levels = {}) {
  if (role.kind !== "bonus") return role.multiplier;
  const level = levels[role.family] ?? 0;
  return Number((role.multiplier + level * ROLE_GROWTH.UPGRADE_STEP).toFixed(3));
}

/** 強化できる系統（ボーナス役を持つ系統）。「ダイスの色（試作）」では色の系統も加わる。 */
export function upgradableFamiliesFor(ruleset = "standard") {
  return roleFamiliesFor(ruleset).filter(({ roles }) => roles.some((role) => role.kind === "bonus"));
}
