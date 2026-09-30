// Профиль игрока. Хранится только в браузере игрока; доступ к хранилищу может быть запрещён
// (приватный режим) — тогда страница работает без сохранения.
export const KEY = 'sinistria-helper';
export const VERSION = 3;

export function empty() {
  return {
    version: VERSION, quiz: null, day: 1, roster: {}, ur: null,
    universal: { R: 0, SR: 0, SSR: 0 }, talentCoins: 0, talents: {}, lastPlan: null,
  };
}

// Браузер может запретить само обращение к хранилищу (приватный режим) — тогда работаем без него.
export function getStorage(win) {
  try {
    return win.localStorage || null;
  } catch {
    return null;
  }
}

export function load(storage) {
  if (!storage) return empty();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    if (!p || p.version !== VERSION) return empty();
    return { ...empty(), ...p };
  } catch {
    return empty();
  }
}

export function save(storage, profile) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function countsOk(c) {
  const vals = ['SSR', 'SR', 'R'].map((r) => c?.[r] ?? 0);
  return vals.every((v) => Number.isInteger(v) && v >= 0) && vals.reduce((a, b) => a + b, 0) <= 5;
}

const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
};

export function clean(profile, fetches, talents = null) {
  const byId = Object.fromEntries(fetches.map((f) => [f.id, f]));
  const roster = {};
  for (const [id, o] of Object.entries(profile.roster || {})) {
    const f = byId[id];
    if (!f || f.rarity === 'UR' || !o?.have) continue;
    const attack = int(o.attack, 0, 10_000_000);
    roster[id] = {
      have: true,
      level: int(o.level, 1, 140),
      skillLevels: f.skills.map((_, i) => int(o.skillLevels?.[i], 0, 36)),
      named: int(o.named, 0, 1_000_000),
      attack: attack > 0 ? attack : null,
    };
  }
  const maxOf = Object.fromEntries((talents || []).map((t) => [t.id, t.maxLevel]));
  const tl = {};
  for (const [id, v] of Object.entries(profile.talents || {})) {
    if (talents && !(id in maxOf)) continue;
    tl[id] = int(v, 0, maxOf[id] ?? 10);
  }
  const ur = profile.ur && byId[profile.ur]?.rarity === 'UR' ? profile.ur : null;
  return {
    ...profile,
    day: int(profile.day, 1, 14),
    roster, ur, talents: tl,
    universal: { R: int(profile.universal?.R, 0, 1e7), SR: int(profile.universal?.SR, 0, 1e7), SSR: int(profile.universal?.SSR, 0, 1e7) },
    talentCoins: int(profile.talentCoins, 0, 1e7),
  };
}

export function remember(profile, plan) {
  if (!plan?.ok) return { ...profile, lastPlan: null };
  return { ...profile, lastPlan: { squad: [...plan.squadIds], at: new Date().toISOString() } };
}

// Правило владельца (01.10.2026): без доната или с малым донатом за первые 4 дня Синистрии нельзя
// дотянуть SSR до 105 ур. и SR до 120 ур. Такие уровни — почти наверняка неверный день или донат.
const EARLY_DAYS = 4;
const EARLY_MAX = { SSR: 105, SR: 120 };

export function levelWarnings(profile, fetches) {
  const donation = profile.quiz?.donation;
  const day = Number(profile.day) || 1;
  if (!(donation === 'none' || donation === 'small') || day > EARLY_DAYS) return [];
  const byId = Object.fromEntries(fetches.map((f) => [f.id, f]));
  return Object.entries(profile.roster || {})
    .filter(([id, o]) => o?.have && byId[id] && EARLY_MAX[byId[id].rarity] && Number(o.level) >= EARLY_MAX[byId[id].rarity])
    .map(([id, o]) => ({ id, name: byId[id].nameRu, rarity: byId[id].rarity, level: Number(o.level) }));
}

export function levelWarningText(list, donation, day) {
  const who = list.map((x) => `${x.name} — ${x.level} ур.`).join(', ');
  const don = donation === 'small' ? 'с донатом до 10 000 ₽' : 'без доната';
  return `${who} При игре ${don} на ${day}-й день Синистрии таких уровней достичь невозможно `
    + '(SSR — от 105, SR — от 120). Проверьте, правильно ли указан день Синистрии и уровень доната в анкете.';
}
