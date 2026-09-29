/** 次のCPUターンに実行される行動（行動予告）。 */
export function getCpuIntent(cpu) {
  return cpu.actionPattern[cpu.actionIndex];
}

/** 行動パターンを1つ進める。末尾の次は先頭に戻る。 */
export function advanceCpuAction(cpu) {
  cpu.actionIndex = (cpu.actionIndex + 1) % cpu.actionPattern.length;
}

/** その行動で与えるダメージ。ATTACK には現在の溜め込み分が上乗せされる。 */
export function cpuActionDamage(action, charge = 0) {
  return action.type === "ATTACK" ? action.value + charge : 0;
}

/** charge を渡すと、ATTACK の表記に溜め込み分と合計を含める。 */
export function cpuActionLabel(action, charge = 0) {
  if (action.type === "ATTACK") {
    return charge
      ? `ATTACK ${action.value}+${charge} = ${action.value + charge}`
      : `ATTACK ${action.value}`;
  }
  if (action.type === "CHARGE") return `CHARGE +${action.value}`;
  if (action.type === "BLOCK") return `BLOCK ${action.value}`;
  return action.type;
}
