// Путь по дереву талантов под профиль игрока. Правила — владельца (разговор 28.09.2026).
import { priceToNext } from './calc-talents.js';

// Всем и на максимум: выработка гулей и помощь в Лазарете (важно для войны).
export const ALWAYS_MAX = ['carrion_bonus', 'infirmary_help_effect', 'infirmary_help_limit'];
// Экономия янтаря и ихора, доп. награды, взносы — путь недонатера.
export const ECONOMY = ['refinery_bonus', 'build_effect', 'arcanum_cost', 'radar_rewards', 'donation_bonus'];
// Боевые — только донатеру, который воюет.
export const COMBAT_BY_ROLE = {
  attack: ['rally_attack', 'pvp_damage', 'pve_damage'],
  bases: ['rally_attack', 'pvp_damage', 'damage_reduction'],
  siege: ['rally_attack', 'pvp_damage'],
  defense: ['rally_defense', 'damage_reduction', 'loss_reduction'],
  hold: ['rally_defense', 'damage_reduction', 'loss_reduction'],
  farm: [],
};

export function targetsFor(donation, role) {
  const base = [...ALWAYS_MAX, ...ECONOMY];
  if (donation !== 'big') return base;
  return [...base, ...(COMBAT_BY_ROLE[role] || [])];
}

// Цена перехода с уровня на уровень. Открытие (0 → 1) в игре не измерено:
// берём цену первого шага (firstPrice) и помечаем итог как примерный.
function stepPrice(t, level) {
  if (level === 0) return t.firstPrice;
  const p = priceToNext(t, level);
  return typeof p === 'number' ? p : null;
}

export function talentPlan({ talents, tree, levels, coins, donation, role }) {
  const byId = Object.fromEntries(talents.map((t) => [t.id, t]));
  const lv = { ...levels };
  const tierOf = (id) => tree.findIndex((tier) => tier.includes(id));
  const reasonOf = (id) => (ALWAYS_MAX.includes(id) ? 'always' : ECONOMY.includes(id) ? 'economy' : 'combat');
  const main = targetsFor(donation, role);
  // Сначала обязательные и экономия по ярусам снизу вверх, потом боевые по ярусам.
  const ordered = [
    ...main.filter((id) => reasonOf(id) !== 'combat').sort((a, b) => tierOf(a) - tierOf(b)),
    ...main.filter((id) => reasonOf(id) === 'combat').sort((a, b) => tierOf(a) - tierOf(b)),
  ];

  const steps = [];
  const unknown = new Set();
  let openCostApprox = false;
  const add = (id, to, reason) => {
    const t = byId[id];
    let from = lv[id] || 0;
    let cost = 0;
    while (from < to) {
      const p = stepPrice(t, from);
      if (p === null) { unknown.add(t.name); break; }
      if (from === 0) openCostApprox = true;
      cost += p;
      from += 1;
    }
    if (from > (lv[id] || 0)) {
      steps.push({ id, name: t.name, from: lv[id] || 0, to: from, cost, reason });
      lv[id] = from;
    }
  };

  for (const id of ordered) {
    for (let k = 0; k < tierOf(id); k++) {
      for (const below of tree[k]) if (!(lv[below] >= 1)) add(below, 1, 'path');
    }
    add(id, byId[id].maxLevel, reasonOf(id));
  }

  let cumulative = 0;
  for (const s of steps) {
    cumulative += s.cost;
    s.cumulative = cumulative;
    s.affordable = cumulative <= coins;
  }
  return {
    steps, total: cumulative,
    affordableCount: steps.filter((s) => s.affordable).length,
    unknownPrices: [...unknown], openCostApprox,
  };
}
