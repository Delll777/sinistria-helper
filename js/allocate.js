// Жадное распределение осколков: следующий уровень — туда, где прирост оценки отряда
// на единицу осколков больше. Шаг — на 1 уровень или сразу через дорогой последний уровень
// цвета (6, 12, 18… — цена ×2) к новому цвету звезды. Полезные навыки держатся в пределах
// отрыва MAX_LEAD (принцип 7). Бесполезные для роли навыки качаются только своими осколками
// и только когда полезные уже на максимуме — ради Алхимии и выработки ихора (правка владельца).
import { costBetween } from './calc-skills.js';
import { squadScore } from './score.js';
import { attackOf } from './attack.js';
import { catalog, worksIn } from './skill-values.js';
import { ROLE_WEIGHTS, MAX_LEAD, USEFUL_COVERAGE } from './weights.js';

const MAX = 36;

export function targets(from) {
  const out = [from + 1];
  const edge = Math.ceil(from / 6) * 6;          // последний (дорогой) уровень текущего цвета
  const through = Math.min(MAX, edge + 1);
  if (through > from + 1) out.push(through);
  return out;
}

export function isUseful(skillId, role) {
  if (catalog(skillId).kind === 'noncombat') return false;
  const w = ROLE_WEIGHTS[role];
  const coverage = Object.keys(w).reduce((sum, sit) => sum + (worksIn(skillId, sit) ? w[sit] : 0), 0);
  return coverage >= USEFUL_COVERAGE;
}

// Слот полезен, если полезен свой навык или навык UR, который копирует этого Двойника (принцип 5).
function usefulSlot(m, slot, role, ms) {
  if (isUseful(m.skills[slot], role)) return true;
  return ms.some((u) => u.mirrorOf === m.id && u.skills[slot] && isUseful(u.skills[slot], role));
}

// Не уходит ли навык дальше отрыва от самого отстающего полезного навыка того же Двойника.
function withinLead(m, slot, to, role, ms) {
  const others = m.skills.map((id, i) => i)
    .filter((i) => i !== slot && m.levels[i] >= 1 && m.levels[i] < MAX && usefulSlot(m, i, role, ms));
  if (others.length === 0) return true;
  const lowest = Math.min(...others.map((i) => m.levels[i]));
  return to - lowest <= (MAX_LEAD[m.rarity] ?? 0);
}

function leftoverMove(ms, named, role) {
  let best = null;
  for (const m of ms) {
    if (m.locked) continue;
    const useful = m.skills.map((id, i) => i).filter((i) => m.levels[i] >= 1 && usefulSlot(m, i, role, ms));
    if (useful.some((i) => m.levels[i] < MAX)) continue;
    m.skills.forEach((id, slot) => {
      const from = m.levels[slot];
      if (from < 1 || from >= MAX || useful.includes(slot)) return;
      const cost = costBetween(from, from + 1);
      if (named[m.id] < cost) return;
      if (!best || cost < best.cost) best = { m, slot, from, to: from + 1, cost };
    });
  }
  return best;
}

function mirror(ms) {
  for (const m of ms) {
    if (!m.mirrorOf) continue;
    const donor = ms.find((x) => x.id === m.mirrorOf);
    if (donor) m.levels = m.skills.map((_, i) => Math.max(1, donor.levels[i] || 0));
  }
}

function scoreOf(ms, role) {
  mirror(ms);
  return squadScore(ms.map((m) => ({ ...m, attack: attackOf(m) })), role);
}

export function allocate({ members, universal }, role) {
  const ms = members.map((m) => ({ ...m, levels: [...m.levels] }));
  const named = Object.fromEntries(ms.map((m) => [m.id, m.named || 0]));
  const uni = { R: 0, SR: 0, SSR: 0, ...universal };
  const steps = [];
  let current = scoreOf(ms, role);

  for (let guard = 0; guard < 3000; guard++) {
    let best = null;
    for (const m of ms) {
      if (m.locked) continue;
      m.skills.forEach((_, slot) => {
        const from = m.levels[slot];
        if (from < 1 || from >= MAX || !usefulSlot(m, slot, role, ms)) return;
        for (const to of targets(from)) {
          if (!withinLead(m, slot, to, role, ms)) continue;
          const cost = costBetween(from, to);
          if (named[m.id] + (uni[m.rarity] || 0) < cost) continue;
          m.levels[slot] = to;
          const gain = scoreOf(ms, role) - current;
          m.levels[slot] = from;
          if (gain <= 0) continue;
          const ratio = gain / cost;
          if (!best || ratio > best.ratio) best = { m, slot, from, to, cost, gain, ratio };
        }
      });
    }
    if (!best) {
      const extra = leftoverMove(ms, named, role);
      if (!extra) break;
      named[extra.m.id] -= extra.cost;
      extra.m.levels[extra.slot] = extra.to;
      current = scoreOf(ms, role);
      steps.push({ id: extra.m.id, slot: extra.slot, from: extra.from, to: extra.to, cost: extra.cost,
        named: extra.cost, universal: 0, leftover: true });
      continue;
    }
    const fromNamed = Math.min(named[best.m.id], best.cost);
    named[best.m.id] -= fromNamed;
    uni[best.m.rarity] -= best.cost - fromNamed;
    best.m.levels[best.slot] = best.to;
    current = scoreOf(ms, role);
    steps.push({ id: best.m.id, slot: best.slot, from: best.from, to: best.to, cost: best.cost,
      named: fromNamed, universal: best.cost - fromNamed });
  }
  mirror(ms);
  return { members: ms, steps, score: current, left: { named, universal: uni } };
}

// role передан — «не качать» только бесполезным, полезные идут в порядок, даже если ушли вперёд.
export function summarize(start, result, role = null) {
  const out = {};
  for (const m of result.members) {
    const s0 = start.find((x) => x.id === m.id);
    const mine = result.steps.filter((s) => s.id === m.id);
    // При равных уровнях ведущий — тот, кто раньше дошёл до своего итогового уровня.
    const reachedAt = (slot) => {
      let last = Infinity;
      mine.forEach((s, i) => { if (s.slot === slot) last = i; });
      return last;
    };
    const slots = m.skills.map((_, i) => i);
    const leftover = [...new Set(mine.filter((s) => s.leftover).map((s) => s.slot))];
    const useful = (i) => (role ? usefulSlot(m, i, role, result.members) : m.levels[i] > s0.levels[i]);
    const touched = slots.filter((i) => !leftover.includes(i)
      && (m.levels[i] > s0.levels[i] || (role && m.levels[i] >= 1 && useful(i))));
    const untouched = slots.filter((i) => s0.levels[i] >= 1 && m.levels[i] === s0.levels[i] && !touched.includes(i));
    const order = [...touched].sort((a, b) => (m.levels[b] - m.levels[a]) || (reachedAt(a) - reachedAt(b)));
    const push = mine.find((s) => s.to - s.from > 1);
    out[m.id] = {
      order, final: [...m.levels], untouched, leftover,
      firstPush: push ? { slot: push.slot, to: push.to } : null,
      universalSpent: mine.reduce((sum, s) => sum + s.universal, 0),
    };
  }
  return out;
}

export function universalLeaders(result) {
  const out = { R: null, SR: null, SSR: null };
  const best = { R: 0, SR: 0, SSR: 0 };
  for (const m of result.members) {
    const spent = result.steps.filter((s) => s.id === m.id).reduce((sum, s) => sum + s.universal, 0);
    if (spent > (best[m.rarity] ?? Infinity)) { best[m.rarity] = spent; out[m.rarity] = m.id; }
  }
  return out;
}
