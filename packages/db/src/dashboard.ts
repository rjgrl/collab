export function percentTracked(graduates: number, tracked: number) {
  if (graduates <= 0) {
    return 0;
  }

  return Math.round((tracked / graduates) * 10000) / 100;
}
