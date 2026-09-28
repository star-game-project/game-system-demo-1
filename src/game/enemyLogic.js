/** 次のCPUターンに実行される行動（行動予告）。 */
export function getCpuIntent(cpu) {
  return cpu.actionPattern[cpu.actionIndex];
}

/** 行動パターンを1つ進める。末尾の次は先頭に戻る。 */
export function advanceCpuAction(cpu) {
  cpu.actionIndex = (cpu.actionIndex + 1) % cpu.actionPattern.length;
}

export function cpuActionLabel(action) {
  if (action.type === "ATTACK") return `ATTACK ${action.value}`;
  return action.type;
}
