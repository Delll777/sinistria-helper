// Значения навыков по уровням и разметка «что даёт, когда работает». Никакого DOM.
let S = null;

export function init(skillsJson) { S = skillsJson; }

export function catalog(id) { return S.catalog[id]; }

const rar = (r) => (r === 'UR' ? 'SSR' : r);
const round1 = (x) => Math.round(x * 10) / 10;

// Навыки удара: шаг двойной на 7, 13, 19 и тройной на 25, 31, 36 (19 замеров из 19).
function strikeExtras(level) {
  return [7, 13, 19].filter((l) => l <= level).length
    + 2 * [25, 31, 36].filter((l) => l <= level).length;
}

// Бусты: шаг двойной на 7, 13, 19, 25 (замеры); на 31 и 36 не измерено — считаем тоже двойным.
function boostExtras(level) {
  return [7, 13, 19, 25, 31, 36].filter((l) => l <= level).length;
}

export function valueAt(skillId, rarity, level) {
  if (!level || level < 1) return 0;
  const c = S.catalog[skillId];
  if (!c || c.kind === 'noncombat') return 0;
  const r = rar(rarity);
  if (c.kind === 'strike') return S.damageBase[r] + S.damageStep[r] * (level - 1 + strikeExtras(level));
  return round1(c.base[r] + c.step[r] * (level - 1 + boostExtras(level)));
}

export function worksIn(skillId, situation) {
  const c = S.catalog[skillId];
  return !!c && c.kind !== 'noncombat' && c.when.includes(situation);
}

export function describe(skillId, rarity, level) {
  const v = valueAt(skillId, rarity, Math.max(level, 1));
  // Неразрывный пробел перед «%», чтобы знак не уезжал на новую строку.
  return S.catalog[skillId].text.replace('{v}', String(v).replace('.', ',')).replace(/ %/g, ' %');
}

export function isExact(skillId) { return !!S.catalog[skillId]?.exact; }
