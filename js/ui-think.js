import { h, mount } from './ui-common.js';
import { safeBuildPlan } from './planner.js';
import { remember, clean } from './store.js';

const PHRASES = ['Обрабатываем данные…', 'Обсуждаем с Двойниками план…', 'Считаем, кому отдать осколки…',
  'Прикидываем таланты…', 'Сверяем с принципами…'];

export function renderThink(root, state, go, persist) {
  const line = h('p', { class: 'think-line' }, PHRASES[0]);
  mount(root, h('div', { class: 'center' }, h('div', { class: 'spinner' }), line));
  let k = 0;
  const timer = setInterval(() => { k = (k + 1) % PHRASES.length; line.textContent = PHRASES[k]; }, 700);
  const started = Date.now();
  setTimeout(() => {
    try {
      state.profile = clean(state.profile, state.data.fetches, state.data.talents);
    } catch { /* нечего чистить — план сообщит об ошибке сам */ }
    state.plan = safeBuildPlan(state.profile, state.data);
    state.profile = remember(state.profile, state.plan);
    persist();
    const wait = Math.max(0, 2100 - (Date.now() - started));
    setTimeout(() => { clearInterval(timer); go('plan'); }, wait);
  }, 50);
}
