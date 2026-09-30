// Собирает итоговый план из всех расчётов. Экраны знают только эту функцию.
import * as skills from './calc-skills.js';
import * as values from './skill-values.js';
import { findSquad } from './squad.js';
import { typeBonus } from './score.js';
import { summarize, universalLeaders } from './allocate.js';
// Таланты временно убраны из плана (владелец, 01.10.2026) — расчёт остаётся в talents-plan.js.
import { gapLine, colorTo, slotName, shareOf, memberReasons, warnings, disclaimers } from './explain.js';

export function initAll(data) {
  skills.init(data.skills);
  values.init(data.skills);
}

function relaxedText(found) {
  const parts = [];
  if (found.size < 5) parts.push(`У вас ${found.size} ${found.size === 1 ? 'Двойник' : found.size < 5 ? 'Двойника' : 'Двойников'} для пачки — пятёрка неполная.`);
  if (found.missing.length) {
    const lines = found.missing.map((x) => (x.have === 0 ? `нет ${x.rarity}` : `не хватает ${x.rarity}: просили ${x.need}, есть ${x.have}`));
    parts.push(`${lines.join('; ')} — взяли тех, кто есть.`.replace(/^./, (c) => c.toUpperCase()));
  }
  else if (found.relaxed) parts.push('Нужного состава из того, что у вас есть, не собрать — взяли лучший из возможных.');
  return parts.length ? parts.join(' ') : null;
}

// Для экрана: любая ошибка расчёта превращается в понятное сообщение, а не в вечную крутилку.
export function safeBuildPlan(profile, data) {
  try {
    return buildPlan(profile, data);
  } catch (e) {
    return { ok: false, message: `Не получилось собрать план: ${e.message}. Попробуйте «Заполнить профиль ещё раз».` };
  }
}

export function buildPlan(profile, data) {
  const byId = Object.fromEntries(data.fetches.map((f) => [f.id, f]));
  const names = data.skills.names;
  const found = findSquad(profile, data.fetches);
  if (found.empty) {
    return { ok: false, message: 'Отметьте хотя бы одного Двойника, который у вас есть, — без этого план не собрать.' };
  }
  const role = profile.quiz.role;
  const { result } = found.chosen;
  // Порядок и отрыв — из «учебного» расчёта, «что качать сейчас» и общие осколки — из реального.
  const sum = summarize(found.start, found.order, role);
  const leaders = universalLeaders(result);
  const nameOf = (id) => byId[id].nameRu;

  const squad = result.members.map((m) => {
    const s = sum[m.id];
    const skillsView = m.skills.map((id, i) => ({
      slot: i, skillId: id, name: names[id], text: values.describe(id, m.rarity, Math.max(m.levels[i], 1)),
      exact: values.isExact(id),
    }));
    const gaps = [];
    for (let k = 1; k < s.order.length; k++) {
      const a = s.order[k - 1];
      const b = s.order[k];
      gaps.push(gapLine(a, b, s.final[a] - s.final[b]));
    }
    return {
      id: m.id, name: nameOf(m.id), rarity: m.rarity, isUR: m.rarity === 'UR',
      share: shareOf(result.members, m.id, role),
      reasons: memberReasons(m, role, profile.roster[m.id]),
      skills: skillsView,
      order: m.rarity === 'UR' ? 'навыки копируются — сам не качается'
        : s.order.length ? s.order.map(slotName).join(' → ') : 'осколков пока не хватает',
      gaps,
      push: s.firstPush ? `сначала ${slotName(s.firstPush.slot)} навык до ${colorTo(s.firstPush.to)}` : null,
      skip: m.rarity === 'UR' ? [] : s.untouched.map((i) => `${slotName(i)} («${names[m.skills[i]]}») не качать, пока полезные навыки не на максимуме; потом можно своими осколками — ради Алхимии и выработки ихора`),
    };
  });

  // Подряд идущие шаги одного навыка склеиваются в одну строку «с 1 до 4».
  const merged = [];
  for (const st of found.now.steps) {
    const last = merged[merged.length - 1];
    if (last && last.id === st.id && last.slot === st.slot && last.to === st.from) last.to = st.to;
    else merged.push({ ...st });
  }
  const now = merged.length === 0
    ? ['Осколков на руках пока нет — качать нечем. Когда появятся, вкладывайте по порядку ниже.']
    : merged.slice(0, 4).map((st) =>
    `${nameOf(st.id)} — ${slotName(st.slot)} навык с ${st.from} до ${st.to} (${colorTo(st.to).replace(/ого$/, 'ый').replace(/его$/, 'ий')} цвет)`);

  const inSquad = new Set(found.chosen.ids);
  const untouched = Object.entries(profile.roster)
    .filter(([id, o]) => o?.have && byId[id] && !inSquad.has(id))
    .map(([id]) => ({ id, name: nameOf(id) }));


  const membersNamed = result.members.map((m) => ({ ...m, name: nameOf(m.id) }));
  return {
    ok: true,
    squadIds: found.chosen.ids,
    kept: found.kept,
    switchedText: found.switched ? `Пачка сменилась: новая сильнее прежней примерно на ${Math.round(found.switched.gain * 100)} %.` : null,
    keptText: found.kept ? 'Оставляем прежнюю пачку: другие варианты сильнее меньше чем на 5 %, а вложенное в неё пропало бы.' : null,
    relaxedText: relaxedText(found),
    runnerUp: found.runnerUp ? found.runnerUp.ids.map(nameOf) : null,
    typeText: (() => {
      const t = typeBonus(result.members);
      return t.bonus ? `${t.count} ${t.count === 5 ? 'Двойников' : 'Двойника'} одного типа — Атака +${Math.round(t.bonus * 100)} % всему отряду.` : null;
    })(),
    now, squad,
    universal: Object.fromEntries(Object.entries(leaders).map(([r, id]) => [r, id ? nameOf(id) : null])),
    untouched,
    warnings: warnings(profile),
    disclaimers: disclaimers({ members: membersNamed, roster: profile.roster, names }),
  };
}
