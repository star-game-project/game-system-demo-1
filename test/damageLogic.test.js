import test from "node:test";
import assert from "node:assert/strict";
import { calculateAttack } from "../src/game/damageLogic.js";
import {
  createTemporaryEffects,
  getTemporaryBonus,
} from "../src/game/abilityLogic.js";

const support = {
  id: "support",
  name: "Support 3",
  attack: 5,
  dieValue: 3,
  passiveAbility: { type: "RIGHT_CARD_ATTACK_BONUS", value: 5 },
  onUseAbility: null,
};
const strike = {
  id: "strike",
  name: "Strike 5",
  attack: 10,
  dieValue: 5,
  passiveAbility: null,
  onUseAbility: null,
};

test("passive and temporary bonuses are added before the role multiplier", () => {
  const player = {
    temporaryEffects: [
      { type: "ATTACK_BONUS", value: 5, activeFromTurn: 2, expiresAfterTurn: 2 },
    ],
  };
  const result = calculateAttack(strike, [support, strike], player, 2);

  assert.equal(result.passiveBonus, 5);
  assert.equal(result.temporaryBonus, 5);
  assert.equal(result.roleName, "ODD");
  assert.equal(result.finalAttack, 30);
});

test("right-card passive does not buff the support card itself", () => {
  const result = calculateAttack(support, [support, strike], { temporaryEffects: [] }, 1);
  assert.equal(result.passiveBonus, 0);
});

test("next-turn ability is inactive now, active next turn, then expires", () => {
  const boost = {
    id: "boost",
    name: "Boost 2",
    onUseAbility: { type: "NEXT_TURN_ATTACK_BONUS", value: 5, duration: 1 },
  };
  const [effect] = createTemporaryEffects(boost, 3);

  assert.equal(getTemporaryBonus([effect], 3), 0);
  assert.equal(getTemporaryBonus([effect], 4), 5);
  assert.equal(getTemporaryBonus([effect], 5), 0);
});
