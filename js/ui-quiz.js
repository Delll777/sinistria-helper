import { h, mount } from './ui-common.js';
import { countsOk } from './store.js';

const QUESTIONS = [
  { key: 'donation', title: 'Сколько планируете донатить в эту Синистрию?',
    options: [['none', 'Не донатю'], ['small', 'Немного'], ['big', 'Больше 10 тысяч']] },
  { key: 'role', title: 'Чем хотите заниматься?',
    options: [['attack', 'Атаковать (авангард)'], ['defense', 'Защищать и держать щит (арьергард)'],
      ['bases', 'Нападать на базы игроков'], ['hold', 'Захватывать и держать мост или форт'],
      ['siege', 'Штурмовать строения'], ['farm', 'Спокойно набивать очки и обменник']] },
  { key: 'toEnd', title: 'Доиграете Синистрию до конца?',
    options: [['yes', 'Да, до последнего дня'], ['unsure', 'Не уверен(а)']] },
];

const defaults = () => ({ donation: null, role: null, toEnd: null, auto: true, counts: { SSR: 0, SR: 0, R: 0 } });

export function renderQuiz(root, state, go, persist) {
  const quiz = state.profile.quiz || defaults();
  state.profile.quiz = quiz;
  const i = state.quizStep || 0;
  const back = i > 0 ? h('button', { class: 'ghost', onclick: () => { state.quizStep = i - 1; go('quiz'); } }, '← Назад') : null;
  const progress = h('p', { class: 'muted' }, `Вопрос ${i + 1} из ${QUESTIONS.length + 1}`);

  if (i < QUESTIONS.length) {
    const q = QUESTIONS[i];
    mount(root, progress, h('h2', {}, q.title),
      h('div', { class: 'options' }, q.options.map(([v, label]) => h('button', {
        class: quiz[q.key] === v ? 'option chosen' : 'option',
        onclick: () => { quiz[q.key] = v; persist(); state.quizStep = i + 1; go('quiz'); },
      }, label))), back);
    return;
  }

  // Последний вопрос: состав пачки.
  const c = quiz.counts;
  const sum = () => c.SSR + c.SR + c.R;
  const stepper = (r) => h('div', { class: 'stepper' },
    h('span', { class: `badge r-${r}` }, r),
    h('button', { disabled: quiz.auto || c[r] === 0, onclick: () => { c[r] -= 1; persist(); go('quiz'); } }, '−'),
    h('b', {}, String(c[r])),
    h('button', { disabled: quiz.auto || sum() >= 5, onclick: () => { c[r] += 1; persist(); go('quiz'); } }, '+'));
  const left = 5 - sum();
  mount(root, progress,
    h('h2', {}, 'Какой состав пачки вам интересен?'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: quiz.auto, onchange: (e) => { quiz.auto = e.target.checked; persist(); go('quiz'); } }),
      'Реши сам, как лучше'),
    h('div', { class: quiz.auto ? 'steppers off' : 'steppers' }, ['SSR', 'SR', 'R'].map(stepper)),
    quiz.auto ? h('p', { class: 'muted' }, 'Помощник подберёт состав по вашему донату.')
      : h('p', { class: 'muted' }, left > 0 ? `Свободных мест: ${left} — их помощник заполнит сам.` : 'Все 5 мест распределены.'),
    h('button', {
      class: 'primary', disabled: !quiz.auto && !countsOk(c),
      onclick: () => { persist(); go('thanks'); },
    }, 'Дальше'), back);
}
