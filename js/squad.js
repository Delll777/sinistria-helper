// Выбор пятёрки: перебор всех составов из того, что есть у игрока, быстрый отбор,
// затем подробный расчёт с распределением осколков. Шаблонов нет.
import { DEFAULT_COMPOSITION, DAILY_UNIVERSAL, ROUND_DAYS, SLOT_OPEN_LEVEL, SSR_LEVEL_CAP, MAX_LEVEL,
  SHORTLIST, KEEP_MARGIN, RUNNER_UP_MARGIN, ORDER_SHARDS, NAMED_FUTURE_SHARE, INVESTED_LEVEL } from './weights.js';
import { allocate, quickLevels } from './allocate.js';
import { attackWeights } from './score.js';
import { attackAtLevel } from './attack.js';
import { ladderFor, bestAssignment } from './levels.js';

const RARITIES = ['SSR', 'SR', 'R'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const frameOf = (donation) => DEFAULT_COMPOSITION[donation] || DEFAULT_COMPOSITION.none;

// Свободные места раздаются в рамках доната (принцип 1): больше дорогих Двойников, чем позволяет
// донат, помощник сам не добавляет. wide = true — рамки доната снимаются (если иначе не собрать).
export function compositionRanges(quiz, size, wide = false) {
  if (quiz.auto) return structuredClone(frameOf(quiz.donation));
  const c = { SSR: 0, SR: 0, R: 0, ...quiz.counts };
  const free = Math.max(0, size - c.SSR - c.SR - c.R);
  const frame = frameOf(quiz.donation);
  return Object.fromEntries(RARITIES.map((r) => [r,
    [c[r], wide ? c[r] + free : Math.min(c[r] + free, Math.max(c[r], frame[r][1]))]]));
}

function choose(arr, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push([...acc]); return out; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]); choose(arr, k, i + 1, acc, out); acc.pop();
  }
  return out;
}

export function combos(pool, size, ranges) {
  const by = Object.fromEntries(RARITIES.map((r) => [r, pool.filter((f) => f.rarity === r)]));
  const out = [];
  for (let a = ranges.SSR[0]; a <= ranges.SSR[1]; a++) {
    for (let b = ranges.SR[0]; b <= ranges.SR[1]; b++) {
      const c = size - a - b;
      if (c < ranges.R[0] || c > ranges.R[1]) continue;
      if (a > by.SSR.length || b > by.SR.length || c > by.R.length || c < 0) continue;
      for (const x of choose(by.SSR, a)) for (const y of choose(by.SR, b)) for (const z of choose(by.R, c)) {
        out.push([...x, ...y, ...z]);
      }
    }
  }
  return out;
}

export function budget(profile) {
  const day = clamp(Number(profile.day) || 1, 1, ROUND_DAYS);
  const left = ROUND_DAYS - day;
  const daily = DAILY_UNIVERSAL[profile.quiz.donation] || DAILY_UNIVERSAL.none;
  const universal = Object.fromEntries(RARITIES.map((r) => [r, (profile.universal?.[r] || 0) + daily[r] * left]));
  // Именные осколки: кто падал раньше, будет падать и дальше, но реже (NAMED_FUTURE_SHARE).
  const namedFor = (id) => {
    const now = profile.roster[id]?.named || 0;
    return Math.round(now + now * NAMED_FUTURE_SHARE * Math.min(1, left / day));
  };
  return { universal, namedFor };
}

// Двойник на итоговом уровне level: навыки — нынешние, открытые к этому уровню — с 1-го.
function memberAt(f, owned, level, named) {
  const cur = f.skills.map((_, i) => owned?.skillLevels?.[i] || 0);
  return {
    id: f.id, rarity: f.rarity, type: f.type, skills: f.skills, level, named,
    levels: f.skills.map((_, i) => (level >= SLOT_OPEN_LEVEL[i] ? Math.max(cur[i], 1) : 0)),
    entered: owned?.attack || null,
    enteredAt: owned?.attack ? { level: owned.level || 1, levels: cur } : null,
  };
}

// Уровни пачки к концу раунда (владелец, 09.11.2026): ступени лесенки по донату раздаются так, чтобы пачка
// была сильнее, с учётом уже вложенных искр и оставшихся дней (levels.js). parts — Двойники пачки без UR,
// «будущие» Двойники на пустых местах — в конце. UR в лесенку не входит: он на уровне лучшего SSR.
// quick — оценка пачки на этих уровнях при навыках быстрой прикидки (оценка линейна по Атакам).
function projectSquad(parts, { donation, day, role, universal, ur }) {
  const nReal = parts.filter((p) => !p.extra?.placeholder).length;
  const now = parts.map((p) => p.owned?.level || 1);
  const steps = ladderFor(donation, parts.length, parts.filter((p) => p.f.rarity === 'SSR').length);
  const assemble = (levels) => {
    const ms = parts.map((p, i) => ({ ...memberAt(p.f, p.owned, levels[i], p.named), ...p.extra }));
    const real = ms.slice(0, nReal);
    return ur ? [...real, urMember(ur, real), ...ms.slice(nReal)] : ms;
  };
  // Вклад Атаки каждого — на пробном раскладе «кто выше сейчас, тот и выше».
  const trial = new Array(parts.length);
  now.map((_, i) => i).sort((a, b) => now[b] - now[a]).forEach((i, k) => { trial[i] = Math.max(now[i], steps[k]); });
  const sample = quickLevels(assemble(trial), role, universal);
  const atk = sample.map((m) => attackAtLevel(m));
  const w = attackWeights(sample.map((m, i) => ({ ...m, attack: atk[i](m.level) })), role);
  const at = (i) => (ur && i >= nReal ? i + 1 : i);
  const ssr = parts.map((_, i) => i).filter((i) => i < nReal && parts[i].f.rarity === 'SSR');
  const donorLevel = (levels) => Math.max(1, ...(ssr.length ? ssr : levels.slice(0, nReal).map((_, i) => i)).map((i) => levels[i]));
  const value = (levels) => levels.reduce((v, l, i) => v + w[at(i)] * atk[at(i)](l), 0)
    + (ur ? w[nReal] * atk[nReal](donorLevel(levels)) : 0);
  // Потолок SSR; SSR уже выше потолка — исключительный случай (владелец): его потолок не держит.
  const ssrCap = SSR_LEVEL_CAP[donation] || SSR_LEVEL_CAP.none;
  const caps = parts.map((p, i) => (p.f.rarity === 'SSR' && now[i] <= ssrCap ? ssrCap : MAX_LEVEL));
  // Главная ступень — у SR: за их Вознесение дают рейтинг, за R нет (владелец, 09.11.2026).
  const mayTop = parts.map((p) => p.f.rarity === 'SR');
  const levels = bestAssignment(now, steps, day, value, caps, mayTop);
  return { members: assemble(levels), quick: value(levels) };
}

function urMember(ur, members) {
  const ssr = members.filter((m) => m.rarity === 'SSR').sort((a, b) => b.level - a.level)[0];
  const donor = ssr || [...members].sort((a, b) => b.level - a.level)[0];
  return {
    id: ur.id, rarity: 'UR', type: ur.type, skills: ur.skills, level: donor ? donor.level : 1, named: 0,
    levels: ur.skills.map(() => 1), entered: null, enteredAt: null, locked: true,
    mirrorOf: donor ? donor.id : undefined,
  };
}

// Двойник как он есть сейчас: текущий уровень, открытые сейчас навыки, осколки на руках.
function currentMember(f, owned) {
  const level = owned?.level || 1;
  const cur = f.skills.map((_, i) => owned?.skillLevels?.[i] || 0);
  return {
    id: f.id, rarity: f.rarity, type: f.type, skills: f.skills, level, named: owned?.named || 0,
    levels: cur.map((l, i) => (l >= 1 || level >= SLOT_OPEN_LEVEL[i] ? Math.max(l, 1) : 0)),
    entered: owned?.attack || null,
    enteredAt: owned?.attack ? { level, levels: cur } : null,
  };
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export function findSquad(profile, fetches) {
  const byId = Object.fromEntries(fetches.map((f) => [f.id, f]));
  const role = profile.quiz.role;
  const donation = profile.quiz.donation;
  const pool = Object.entries(profile.roster)
    .filter(([id, o]) => o && o.have && byId[id] && byId[id].rarity !== 'UR')
    .map(([id]) => byId[id]);
  if (pool.length === 0) return { empty: true };

  const ur = profile.ur && byId[profile.ur] ? byId[profile.ur] : null;
  const slots = ur ? 4 : 5;
  const withUR = (rg) => (ur ? { ...rg, R: [Math.max(0, rg.R[0] - 1), rg.R[1]] } : rg);
  const ranges = withUR(compositionRanges(profile.quiz, 5));
  // Прокачанные Двойники сверх каркаса: раздвигаем рамки их редкости, остальные — сжимаем. Возьмёт ли
  // их помощник, решает оценка отряда.
  const extra = Object.fromEntries(RARITIES.map((r) => [r, Math.max(0,
    pool.filter((f) => f.rarity === r && (profile.roster[f.id]?.level || 1) >= INVESTED_LEVEL).length - ranges[r][1])]));
  const extraTotal = RARITIES.reduce((sum, r) => sum + extra[r], 0);
  if (extraTotal > 0) {
    for (const r of RARITIES) {
      ranges[r] = extra[r] > 0 ? [ranges[r][0], ranges[r][1] + extra[r]] : [Math.max(0, ranges[r][0] - extraTotal), ranges[r][1]];
    }
  }
  // Каких редкостей меньше, чем нужно по рамкам: сколько просили и сколько есть.
  const missing = RARITIES.map((r) => ({ rarity: r, need: ranges[r][0], have: pool.filter((f) => f.rarity === r).length }))
    .filter((x) => x.have < x.need);
  // Места редкости, которой ещё нет, остаются пустыми: других на них не ставим, чтобы игрок не вкладывался
  // в тех, кто в финальную пачку не войдёт (владелец, 01.10.2026). Имеющиеся нужной редкости — берём.
  const waiting = missing.map((x) => ({ rarity: x.rarity, count: x.need - x.have }));
  const empty = waiting.reduce((sum, x) => sum + x.count, 0);
  const size = Math.min(slots - empty, pool.length);
  const fitted = Object.fromEntries(RARITIES.map((r) => {
    const m = missing.find((x) => x.rarity === r);
    return [r, m ? [m.have, m.have] : ranges[r]];
  }));
  let list = size > 0 ? combos(pool, size, fitted) : [];
  if (list.length === 0 && empty === 0) list = combos(pool, size, withUR(compositionRanges(profile.quiz, 5, true)));
  let relaxed = false;
  let fillAll = false;
  if (list.length === 0) {
    // Из просимого состава нет никого — совсем без прокачки нельзя (задания не пройти):
    // берём самых полезных из имеющихся, а пересобрать пачку попросим, когда выпадут нужные.
    relaxed = true;
    fillAll = size <= 0;
    const n = fillAll ? Math.min(slots, pool.length) : size;
    list = combos(pool, n, { SSR: [0, n], SR: [0, n], R: [0, n] });
  }
  const realSize = fillAll ? Math.min(slots, pool.length) : size;

  const b = budget(profile);
  const day = Number(profile.day) || 1;
  // «Будущий» Двойник на пустом месте: только удар, без своих бафов. Нужен, чтобы из имеющихся выбрать тех,
  // кто усилит будущую пачку. Занимает свою ступень лесенки, не качается и в план не выводится.
  const waitParts = fillAll ? [] : waiting.flatMap((x) => Array.from({ length: x.count }, (_, k) => ({
    f: { id: `__wait_${x.rarity}_${k}`, rarity: x.rarity, type: null, skills: ['cursed_echoes'] },
    owned: { level: 1, skillLevels: [1] }, named: 0, extra: { locked: true, placeholder: true },
  })));
  const project = (fs) => projectSquad([
    ...fs.map((f) => ({ f, owned: profile.roster[f.id], named: b.namedFor(f.id) })), ...waitParts,
  ], { donation, day, role, universal: b.universal, ur });
  const build = (fs) => project(fs).members;
  const quick = list.map((fs) => ({ fs, score: project(fs).quick }))
    .sort((x, y) => y.score - x.score).slice(0, SHORTLIST);

  const full = (fs) => {
    const start = build(fs);
    const result = allocate({ members: start, universal: b.universal }, role);
    return { ids: start.filter((m) => !m.placeholder).map((m) => m.id), start, result, score: result.score };
  };
  const ranked = quick.map(({ fs }) => full(fs)).sort((x, y) => y.score - x.score);
  let chosen = ranked[0];
  const runnerUp = ranked[1] && ranked[1].score >= chosen.score * (1 - RUNNER_UP_MARGIN) ? ranked[1] : null;

  let kept = false;
  let switched = null;
  const prevIds = (profile.lastPlan?.squad || []).filter((id) => byId[id] && byId[id].rarity !== 'UR');
  // Прежнюю пачку сравниваем, только если она того же размера (иначе взятый UR дал бы шестерых).
  if (prevIds.length === realSize && prevIds.every((id) => profile.roster[id]?.have)) {
    const mine = chosen.ids.filter((id) => byId[id].rarity !== 'UR');
    if (!sameSet(mine, prevIds)) {
      const prev = ranked.find((x) => sameSet(x.ids.filter((id) => byId[id].rarity !== 'UR'), prevIds))
        || full(prevIds.map((id) => byId[id]));
      if (chosen.score < prev.score * (1 + KEEP_MARGIN)) { chosen = prev; kept = true; }
      else switched = { gain: chosen.score / prev.score - 1 };
    }
  }

  const nowMembers = chosen.ids.filter((id) => byId[id].rarity !== 'UR')
    .map((id) => currentMember(byId[id], profile.roster[id]));
  if (ur) nowMembers.push(urMember(ur, nowMembers));

  return {
    empty: false, relaxed, kept, switched, size: realSize, waiting, fillAll,
    missing: relaxed || realSize < slots ? missing : [],
    // «Что качать сейчас» — только по нынешним ресурсам и открытым сейчас навыкам.
    now: allocate({ members: nowMembers, universal: { R: 0, SR: 0, SSR: 0, ...profile.universal } }, role),
    chosen: { ids: chosen.ids, members: chosen.result.members, result: chosen.result },
    start: chosen.start,
    order: allocate({ members: chosen.start.map((m) => ({ ...m, named: ORDER_SHARDS })),
      universal: { R: 0, SR: 0, SSR: 0 } }, role),
    runnerUp: runnerUp && !kept ? { ids: runnerUp.ids } : null,
  };
}
