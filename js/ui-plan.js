import { h, mount, portrait } from './ui-common.js';
import { empty } from './store.js';

const REASON = { always: 'обязательно всем', economy: 'экономия ресурсов', path: 'открыть следующий ярус', combat: 'бой' };

export function renderPlan(root, state, go, persist) {
  const plan = state.plan;
  const byId = Object.fromEntries(state.data.fetches.map((f) => [f.id, f]));
  const buttons = h('div', { class: 'actions' },
    h('button', { class: 'ghost', onclick: () => { state.profile = empty(); persist(); state.quizStep = 0; go('quiz'); } }, 'Заполнить профиль ещё раз'),
    h('button', { class: 'primary', onclick: () => go('roster') }, 'Пересчитать пачку'));

  if (!plan?.ok) {
    mount(root, h('h2', {}, 'План'), h('p', {}, plan?.message || 'План не собран.'), buttons);
    return;
  }

  const notes = [plan.keptText, plan.switchedText, plan.relaxedText].filter(Boolean);
  const member = (m) => h('div', { class: 'card member' },
    h('div', { class: 'row' }, portrait(byId[m.id]),
      h('div', {}, h('b', {}, m.name), h('div', { class: 'muted' }, `${m.rarity} · вклад в силу отряда ~${Math.round(m.share * 100)} %`))),
    h('ul', { class: 'reasons' }, m.reasons.map((r) => h('li', {}, r))),
    h('div', { class: 'skill-order' },
      h('p', { class: 'muted' }, m.skills.map((s) => `${s.slot + 1}-й — «${s.name}»${s.exact ? '' : ' (примерно)'}`).join(' · ')),
      h('p', {}, h('b', {}, 'Порядок: '), m.order),
      m.push ? h('p', {}, h('b', {}, 'Первым делом: '), m.push) : null,
      m.gaps.length ? h('ul', {}, m.gaps.map((g) => h('li', {}, g))) : null,
      m.skip.length ? h('p', { class: 'warn' }, m.skip.join('; ')) : null));

  const uni = Object.entries(plan.universal).filter(([, n]) => n)
    .map(([r, n]) => h('li', {}, h('span', { class: `badge r-${r}` }, r), ` общие осколки — ${n}`));

  const talents = plan.talents.steps.map((s) => h('li', { class: s.affordable ? '' : 'muted' },
    `${s.name}: ${s.from} → ${s.to} · ${s.cost} валюты · ${REASON[s.reason]}${s.affordable ? '' : ' · пока не хватает'}`));

  mount(root, 
    h('h2', {}, 'Ваш план'),
    notes.length ? h('div', { class: 'card note' }, notes.map((n) => h('p', {}, n))) : null,
    plan.warnings.length ? h('div', { class: 'card warn' }, plan.warnings.map((w) => h('p', {}, w))) : null,
    h('h3', {}, 'Что качать прямо сейчас'), h('ol', {}, plan.now.map((s) => h('li', {}, s))),
    h('h3', {}, 'Пятёрка'), plan.squad.map(member),
    plan.runnerUp ? h('p', { class: 'muted' }, `Почти так же силён запасной вариант: ${plan.runnerUp.join(', ')}.`) : null,
    uni.length ? [h('h3', {}, 'Кому отдавать общие осколки'), h('ul', {}, uni)] : null,
    h('h3', {}, 'Таланты'),
    h('p', { class: 'muted' }, `Валюты сейчас: ${plan.talents.coins}. Хватает на ${plan.talents.affordableCount} шаг(ов) из ${plan.talents.steps.length}.`),
    h('ol', { class: 'talents' }, talents),
    plan.untouched.length ? [h('h3', {}, 'Кого не трогать'),
      h('p', {}, plan.untouched.map((u) => u.name).join(', ')),
      h('p', { class: 'muted' }, 'Ресурсы в них — это ресурсы, которых не хватит пятёрке.')] : null,
    h('h3', {}, 'Оговорки'), h('ul', { class: 'muted' }, plan.disclaimers.map((d) => h('li', {}, d))),
    buttons);
}
