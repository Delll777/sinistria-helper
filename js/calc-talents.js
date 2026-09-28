// Цены и ихор талантов. Никакого DOM, только числа.

export function ichorAt(t, level) {
  const mul = t.ichorMul[level - 1];
  if (mul === undefined) return null;
  return Math.round(t.baseIchor * mul);
}

export function priceToNext(t, level) {
  if (level >= t.maxLevel) return 'максимум';
  const m = t.priceMul[level - 1];
  if (m === undefined) return null;
  return Math.round((t.firstPrice * m) / 6);
}

export function totalCost(t) {
  if (!t.complete) return null;
  return t.priceMul.reduce((s, m) => s + Math.round((t.firstPrice * m) / 6), 0);
}

export function effectAt(t, level) {
  const v = t.effectOffset + t.effectStep * level;
  return t.effectTemplate
    .replace('{v20}', String(20 * level))
    .replace('{v}', String(v));
}

export function ichorPerCoin(t) {
  const total = totalCost(t);
  const top = ichorAt(t, t.maxLevel);
  if (total === null || top === null) return null;
  return Math.round((top / total) * 10) / 10;
}
