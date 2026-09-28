// Атака Двойника: база по уровню + прибавки от уровней навыков (точные, из таблицы).
// База по уровню — грубая кривая по замерам, в интерфейсе помечается «примерно».
import { gainBetween } from './calc-skills.js';

// Базовая Атака без навыков = замер минус прибавки навыков.
// SR: ур. 40 ≈ 4 100, ур. 80 ≈ 9 430, ур. 138 ≈ 17 810. R: ур. 61 ≈ 1 830, ур. 109 ≈ 11 370.
// SSR: ур. 74 ≈ 5 450. Крайние точки — продолжение, не замер. UR считается как SSR.
const CURVE = {
  R: [[1, 60], [61, 1830], [109, 11370], [140, 15000]],
  SR: [[1, 150], [40, 4100], [80, 9430], [138, 17810]],
  SSR: [[1, 200], [74, 5450], [140, 20000]],
};

function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const [xa, ya] = points[points.length - 2];
  const [xb, yb] = points[points.length - 1];
  return yb + ((yb - ya) * (x - xb)) / (xb - xa);
}

const rar = (r) => (r === 'UR' ? 'SSR' : r);

export function baseAttack(rarity, level) {
  return Math.round(interp(CURVE[rar(rarity)], level));
}

export function skillGain(rarity, levels) {
  return levels.reduce((s, l) => s + (l >= 1 ? gainBetween(1, l, rar(rarity)).attack : 0), 0);
}

// Если игрок вписал Атаку из карточки, кривая масштабируется под его аккаунт
// (у всех свои Алтарь и прочие прибавки). Вписанное меньше прибавок навыков — мусор, игнорируем.
export function attackOf({ rarity, level, levels, entered = null, enteredAt = null }) {
  let base = baseAttack(rarity, level);
  if (entered && enteredAt) {
    const baseNow = entered - skillGain(rarity, enteredAt.levels);
    const curveNow = baseAttack(rarity, enteredAt.level);
    if (baseNow > 0 && curveNow > 0) base = Math.round((base * baseNow) / curveNow);
  }
  return base + skillGain(rarity, levels);
}
