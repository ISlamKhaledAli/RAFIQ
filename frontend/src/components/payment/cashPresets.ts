/** Received-amount text for the cash input, from exact integer piasters (display only). */
export function piastersToInputText(piasters: number): string {
  const whole = Math.floor(piasters / 100);
  const fraction = piasters % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

/** Quick cash buttons in piasters: exact total, next 50, next 100, and 200 pounds, ascending and unique. */
export function buildCashQuickPresetsPiasters(netTotalPiasters: number): number[] {
  const candidates = [
    netTotalPiasters,
    Math.ceil(netTotalPiasters / 5000) * 5000 || 5000,
    Math.ceil(netTotalPiasters / 10000) * 10000 || 10000,
    20000,
  ];
  return candidates.filter((val, idx, arr) => val >= netTotalPiasters && arr.indexOf(val) === idx);
}
