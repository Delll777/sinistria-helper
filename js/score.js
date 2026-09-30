// Сравнительная оценка отряда. Абсолютного смысла у числа нет — только «больше / меньше».
// Урон = Атака × (обычные атаки + удары навыков) — произведение, поэтому усилители без
// источников урона ничего не дают, и наоборот (принцип 8 владельца).
import { SITUATIONS, ROLE_WEIGHTS, ROLE_SURVIVAL, SURVIVAL_POWER, INCOMING_SHARE, MAX_REDUCTION,
  STRIKE_EVERY, CAPACITY_POWER, NORMAL_ATTACK_FACTOR, TYPE_BONUS } from './weights.js';
import { catalog, valueAt, worksIn } from './skill-values.js';

const round4 = (x) => Math.round(x * 1e4) / 1e4;

export function squadBuffs(members, situation) {
  const b = { normal: 0, skill: 0, vs: 0, capacity: 0, normalRed: 0, skillRed: 0 };
  for (const m of members) {
    m.skills.forEach((id, i) => {
      if (!worksIn(id, situation)) return;
      const v = valueAt(id, m.rarity, m.levels[i]) / 100;
      switch (catalog(id).kind) {
        case 'normal_dmg': b.normal += v; break;
        case 'skill_dmg': b.skill += v; break;
        case 'vs_players':
        case 'vs_defenders': b.vs += v; break;
        case 'capacity': b.capacity += v; break;
        case 'normal_red': b.normalRed += v; break;
        case 'skill_red': b.skillRed += v; break;
        default: break;
      }
    });
  }
  for (const k of Object.keys(b)) b[k] = round4(b[k]);
  return b;
}

export function situationValue(members, situation, role = null) {
  const b = squadBuffs(members, situation);
  let damage = 0;
  for (const m of members) {
    let strikes = 0;
    m.skills.forEach((id, i) => {
      if (catalog(id).kind === 'strike' && worksIn(id, situation)) {
        strikes += valueAt(id, m.rarity, m.levels[i]) / 100 / STRIKE_EVERY;
      }
    });
    damage += m.attack * (NORMAL_ATTACK_FACTOR * (1 + b.normal) + strikes * (1 + b.skill));
  }
  const offense = damage * (1 + b.vs) * Math.pow(1 + b.capacity, CAPACITY_POWER);
  const rn = Math.min(MAX_REDUCTION, b.normalRed);
  const rk = Math.min(MAX_REDUCTION, b.skillRed);
  const survival = 1 / (INCOMING_SHARE.normal * (1 - rn) + INCOMING_SHARE.skill * (1 - rk));
  const roleK = role ? ROLE_SURVIVAL[role] ?? 1 : 1;
  return offense * Math.pow(survival, SURVIVAL_POWER[situation] * roleK);
}

// Наибольшее число Двойников одного типа в пачке (UR тоже считается) и бонус к Атаке за него.
export function typeBonus(members) {
  const count = {};
  for (const m of members) if (m.type) count[m.type] = (count[m.type] || 0) + 1;
  const best = Math.max(0, ...Object.values(count));
  const type = Object.keys(count).find((t) => count[t] === best) || null;
  return { type, count: best, bonus: TYPE_BONUS[best] || 0 };
}

export function squadScore(members, role) {
  const w = ROLE_WEIGHTS[role];
  const k = 1 + typeBonus(members).bonus;
  if (k !== 1) members = members.map((m) => ({ ...m, attack: m.attack * k }));
  let s = 0;
  for (const sit of SITUATIONS) if (w[sit]) s += w[sit] * situationValue(members, sit, role);
  return s;
}
