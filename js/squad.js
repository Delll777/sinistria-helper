// Выбор пятёрки: перебор всех составов из того, что есть у игрока, быстрый отбор,
// затем подробный расчёт с распределением осколков. Шаблонов нет.
import { DEFAULT_COMPOSITION, PROJECTED_LEVEL, DAILY_UNIVERSAL, ROUND_DAYS, SLOT_OPEN_LEVEL,
  QUICK_SKILL_LEVEL, SHORTLIST, KEEP_MARGIN, RUNNER_UP_MARGIN, ORDER_SHARDS, NAMED_FUTURE_SHARE } from './weights.js';
import { allocate } from './allocate.js';
import { squadScore } from './score.js';
import { attackOf } from './attack.js';

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

export function projectMember(f, owned, donation, namedTotal) {
  const proj = PROJECTED_LEVEL[donation] || PROJECTED_LEVEL.none;
  const cur = f.skills.map((_, i) => owned?.skillLevels?.[i] || 0);
  const level = Math.max(owned?.level || 1, proj[f.rarity] || proj.SSR);
  return {
    id: f.id, rarity: f.rarity, skills: f.skills, level, named: namedTotal,
    levels: f.skills.map((_, i) => (level >= SLOT_OPEN_LEVEL[i] ? Math.max(cur[i], 1) : 0)),
    entered: owned?.attack || null,
    enteredAt: owned?.attack ? { level: owned.level || 1, levels: cur } : null,
  };
}

function urMember(ur, members) {
  const ssr = members.filter((m) => m.rarity === 'SSR').sort((a, b) => b.level - a.level)[0];
  const donor = ssr || [...members].sort((a, b) => b.level - a.level)[0];
  return {
    id: ur.id, rarity: 'UR', skills: ur.skills, level: donor ? donor.level : 1, named: 0,
    levels: ur.skills.map(() => 1), entered: null, enteredAt: null, locked: true,
    mirrorOf: donor ? donor.id : undefined,
  };
}

// Двойник как он есть сейчас: текущий уровень, открытые сейчас навыки, осколки на руках.
function currentMember(f, owned) {
  const level = owned?.level || 1;
  const cur = f.skills.map((_, i) => owned?.skillLevels?.[i] || 0);
  return {
    id: f.id, rarity: f.rarity, skills: f.skills, level, named: owned?.named || 0,
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
  const size = Math.min(slots, pool.length);
  const withUR = (rg) => (ur ? { ...rg, R: [Math.max(0, rg.R[0] - 1), rg.R[1]] } : rg);
  const ranges = withUR(compositionRanges(profile.quiz, 5));
  const missing = RARITIES.filter((r) => pool.filter((f) => f.rarity === r).length < ranges[r][0]);
  let list = combos(pool, size, ranges);
  if (list.length === 0) list = combos(pool, size, withUR(compositionRanges(profile.quiz, 5, true)));
  let relaxed = false;
  if (list.length === 0) {
    relaxed = true;
    list = combos(pool, size, { SSR: [0, size], SR: [0, size], R: [0, size] });
  }

  const b = budget(profile);
  const build = (fs) => {
    const ms = fs.map((f) => projectMember(f, profile.roster[f.id], donation, b.namedFor(f.id)));
    if (ur) ms.push(urMember(ur, ms));
    return ms;
  };
  const q = QUICK_SKILL_LEVEL[donation] || QUICK_SKILL_LEVEL.none;
  const quick = list.map((fs) => {
    const ms = build(fs).map((m) => ({ ...m, levels: m.levels.map((l) => (l ? Math.max(l, q) : 0)) }));
    return { fs, score: squadScore(ms.map((m) => ({ ...m, attack: attackOf(m) })), role) };
  }).sort((x, y) => y.score - x.score).slice(0, SHORTLIST);

  const full = (fs) => {
    const start = build(fs);
    const result = allocate({ members: start, universal: b.universal }, role);
    return { ids: start.map((m) => m.id), start, result, score: result.score };
  };
  const ranked = quick.map(({ fs }) => full(fs)).sort((x, y) => y.score - x.score);
  let chosen = ranked[0];
  const runnerUp = ranked[1] && ranked[1].score >= chosen.score * (1 - RUNNER_UP_MARGIN) ? ranked[1] : null;

  let kept = false;
  let switched = null;
  const prevIds = (profile.lastPlan?.squad || []).filter((id) => byId[id] && byId[id].rarity !== 'UR');
  // Прежнюю пачку сравниваем, только если она того же размера (иначе взятый UR дал бы шестерых).
  if (prevIds.length === size && prevIds.every((id) => profile.roster[id]?.have)) {
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
    empty: false, relaxed, kept, switched, size, missing: relaxed || size < slots ? missing : [],
    // «Что качать сейчас» — только по нынешним ресурсам и открытым сейчас навыкам.
    now: allocate({ members: nowMembers, universal: { R: 0, SR: 0, SSR: 0, ...profile.universal } }, role),
    chosen: { ids: chosen.ids, members: chosen.result.members, result: chosen.result },
    start: chosen.start,
    order: allocate({ members: chosen.start.map((m) => ({ ...m, named: ORDER_SHARDS })),
      universal: { R: 0, SR: 0, SSR: 0 } }, role),
    runnerUp: runnerUp && !kept ? { ids: runnerUp.ids } : null,
  };
}
