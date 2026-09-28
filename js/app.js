import { loadAll } from './data.js';
import { initAll } from './planner.js';
import * as store from './store.js';
import { renderQuiz } from './ui-quiz.js';
import { renderThanks } from './ui-thanks.js';
import { renderRoster } from './ui-roster.js';
import { renderThink } from './ui-think.js';
import { renderPlan } from './ui-plan.js';

const SCREENS = { quiz: renderQuiz, thanks: renderThanks, roster: renderRoster, think: renderThink, plan: renderPlan };
const state = { data: null, profile: null, step: 'quiz', quizStep: 0, plan: null, storage: null };

function persist() {
  const ok = store.save(state.storage, state.profile);
  document.getElementById('hint').textContent = ok ? '' : 'Браузер не разрешает сохранение — данные пропадут при закрытии.';
}

function go(step) {
  state.step = SCREENS[step] ? step : 'quiz';
  SCREENS[state.step](document.getElementById('screen'), state, go, persist);
  window.scrollTo(0, 0);
}

async function start() {
  state.data = await loadAll();
  initAll(state.data);
  state.storage = store.getStorage(window);
  state.profile = store.load(state.storage);
  if (!state.storage) persist();
  if (state.profile.quiz && state.profile.lastPlan) go('think');
  else if (state.profile.quiz?.role) go('roster');
  else go('quiz');
}

start().catch((e) => {
  document.getElementById('screen').textContent = 'Не удалось загрузить данные: ' + e.message;
});
