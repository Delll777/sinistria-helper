// Цены и приросты навыков Двойников. Никакого DOM, только числа.
let D = null;

export function init(data) { D = data; }

export function blockOf(level) {
  return Math.floor((level - 1) / 6) + 1;
}

function isStep(level) {
  return level % 6 === 0 || level === D.maxLevel - 1;
}

export function priceToNext(level) {
  if (level >= D.maxLevel) return null;
  if (level === D.maxLevel - 1) return D.blockPrice[5] * 3;
  if (level % 6 === 0) return D.blockPrice[blockOf(level)] * 2;
  return D.blockPrice[blockOf(level) - 1];
}

export function gainToNext(level, rarity) {
  if (level >= D.maxLevel) return null;
  const base = D.gainByRarity[rarity][blockOf(level) - 1];
  const attack = isStep(level) ? base * 2 : base;
  return { attack, defense: attack, alchemy: Math.round(attack * 0.4) };
}

export function costBetween(from, to) {
  let sum = 0;
  for (let l = from; l < to; l++) {
    const p = priceToNext(l);
    if (p !== null) sum += p;
  }
  return sum;
}

export function gainBetween(from, to, rarity) {
  let attack = 0;
  for (let l = from; l < to; l++) {
    const g = gainToNext(l, rarity);
    if (g !== null) attack += g.attack;
  }
  return { attack, defense: attack, alchemy: Math.round(attack * 0.4) };
}

export function damagePercent(level, rarity) {
  let v = D.damageBase[rarity];
  const step = D.damageStep[rarity];
  for (let k = 2; k <= level; k++) {
    const mult = D.stepX3.includes(k) ? 3 : D.stepX2.includes(k) ? 2 : 1;
    v += step * mult;
  }
  return v;
}

export function efficiency(level, rarity) {
  const p = priceToNext(level);
  const g = gainToNext(level, rarity);
  if (p === null || g === null) return 0;
  return g.attack / p;
}
