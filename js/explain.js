// Слова для плана: отрыв навыков языком игры, цвета звезды, причины и оговорки.
import { squadScore } from './score.js';
import { attackOf } from './attack.js';
import { catalog, describe, isExact } from './skill-values.js';
import { isUseful } from './allocate.js';

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

const circles = (n) => (n === 1 ? 'круг' : `${n} ${plural(n, 'круг', 'круга', 'кругов')}`);

export function gapText(d) {
  if (d <= 0) return 'вровень';
  if (d % 3 === 0) {
    const halves = d / 3;
    if (halves === 1) return 'на полкруга';
    if (halves === 3) return 'на полтора круга';
    if (halves % 2 === 0) return `на ${circles(halves / 2)}`;
    return `на ${String(halves / 2).replace('.', ',')} круга`;
  }
  const c = Math.floor(d / 6);
  const p = d % 6;
  const petals = `${p} ${plural(p, 'лепесток', 'лепестка', 'лепестков')}`;
  return c === 0 ? `на ${petals}` : `на ${circles(c)} и ${petals}`;
}

const COLORS = ['серебряного', 'зелёного', 'синего', 'фиолетового', 'жёлтого', 'красного'];
export function colorTo(level) { return COLORS[Math.floor((Math.max(level, 1) - 1) / 6)]; }

export function slotName(i) { return `${i + 1}-й`; }

// «2-й впереди 1-го на круг» или «3-й и 1-й вровень».
export function gapLine(a, b, d) {
  if (d <= 0) return `${slotName(a)} и ${slotName(b)} вровень`;
  return `${slotName(a)} впереди ${slotName(b).replace('-й', '-го')} ${gapText(d)}`;
}

// Какая доля силы отряда пропадёт без этого Двойника.
export function shareOf(members, id, role) {
  const withAtt = (ms) => ms.map((m) => ({ ...m, attack: attackOf(m) }));
  const full = squadScore(withAtt(members), role);
  if (full <= 0) return 0;
  const without = squadScore(withAtt(members.filter((m) => m.id !== id)), role);
  return Math.max(0.01, Math.min(1, 1 - without / full));
}

export function memberReasons(member, role, owned) {
  const out = [];
  member.skills.forEach((id, i) => {
    const lvl = member.levels[i];
    if (lvl >= 1 && isUseful(id, role)) out.push(`${slotName(i)} навык: ${describe(id, member.rarity, lvl)}`);
  });
  if (member.rarity === 'R') out.push('R — дешёвая в прокачке');
  if (member.rarity === 'UR') out.push('UR — навыки копирует у сильнейшей SSR пачки');
  if ((owned?.named || 0) >= 100) out.push('своих осколков много — качать дешевле');
  if (out.length === 0) out.push('лучшее из того, что есть, для заполнения места');
  return out;
}

export function warnings(profile) {
  const out = [];
  const q = profile.quiz;
  if ((q.role === 'defense' || q.role === 'hold') && q.toEnd !== 'yes') {
    out.push('Щиту нужно доиграть Синистрию до конца: основные очки он набирает во второй половине.');
  }
  if ((q.role === 'defense' || q.role === 'hold') && q.donation === 'none') {
    out.push('Щит без доната и без активной игры слабее атакующего с тем же вложением.');
  }
  return out;
}

export function disclaimers({ members, roster, talentsPlan, names }) {
  const out = ['Точная формула боя в игре неизвестна — сравнение идёт «этот вариант сильнее того», без абсолютных цифр урона.'];
  const approx = new Set();
  for (const m of members) m.skills.forEach((id, i) => {
    if (m.levels[i] >= 1 && catalog(id).kind !== 'noncombat' && !isExact(id)) approx.add(id);
  });
  if (approx.size) out.push(`Значения этих навыков примерные: ${[...approx].map((id) => names[id] || id).join(', ')}.`);
  const noAttack = members.filter((m) => m.rarity !== 'UR' && !roster[m.id]?.attack);
  if (noAttack.length) {
    out.push(`Атака оценена по уровню у: ${noAttack.map((m) => m.name || m.id).join(', ')}. Впишите её из окна «Повышение навыка» — расчёт станет точнее.`);
  }
  out.push('Сколько осколков придёт до конца Синистрии — оценка по уровню доната.');
  if (talentsPlan?.openCostApprox) out.push('Цена открытия нового таланта (с 0 на 1) не измерена — взята цена первого шага.');
  if (talentsPlan?.unknownPrices?.length) out.push(`Цены выше 2-го уровня не известны у: ${talentsPlan.unknownPrices.join(', ')}.`);
  return out;
}
