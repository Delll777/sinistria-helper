import { h, mount, portrait, shardIcon, numberInput } from './ui-common.js';
import { levelWarnings, levelWarningText } from './store.js';

const ATTACK_HINT = 'Видно в окне «Повышение навыка»; помогает точнее решить, кому качать навык удара — он бьёт от Атаки самого Двойника.';

export function renderRoster(root, state, go, persist) {
  const p = state.profile;
  const { fetches, skills } = state.data;
  const regular = fetches.filter((f) => f.rarity !== 'UR');
  const urs = fetches.filter((f) => f.rarity === 'UR');
  const set = (fn) => { fn(); persist(); };

  const detail = (f) => {
    const o = p.roster[f.id];
    return h('div', { class: 'card owned' },
      h('div', { class: 'row' }, portrait(f), h('b', {}, f.nameRu)),
      h('label', {}, 'Уровень', numberInput(o.level, (v) => set(() => { o.level = v; }), { max: 140 })),
      h('div', { class: 'skills-in' }, f.skills.map((id, i) => h('label', {},
        `${i + 1}-й навык «${skills.names[id]}»`,
        numberInput(o.skillLevels?.[i], (v) => set(() => { o.skillLevels = o.skillLevels || []; o.skillLevels[i] = v; }), { max: 36 })))),
      h('label', {}, 'Свои осколки', numberInput(o.named, (v) => set(() => { o.named = v; }))),
      h('label', {}, 'Атака (по желанию)', numberInput(o.attack, (v) => set(() => { o.attack = v; })),
        h('small', { class: 'muted' }, ATTACK_HINT)));
  };

  const details = h('div', { class: 'details' });
  const drawDetails = () => details.replaceChildren(...regular.filter((f) => p.roster[f.id]?.have).map(detail));

  const grid = h('div', { class: 'grid' }, regular.map((f) => {
    const cell = h('button', { class: p.roster[f.id]?.have ? 'cell on' : 'cell', 'aria-pressed': !!p.roster[f.id]?.have },
      portrait(f), h('span', { class: 'cell-name' }, f.nameRu));
    cell.addEventListener('click', () => {
      set(() => {
        const o = p.roster[f.id];
        if (o?.have) o.have = false;
        else p.roster[f.id] = { level: 1, skillLevels: [1], named: 0, attack: null, ...o, have: true };
      });
      cell.classList.toggle('on', !!p.roster[f.id]?.have);
      drawDetails();
    });
    return cell;
  }));
  drawDetails();

  const urBlock = h('div', { class: 'grid ur' },
    h('button', { class: p.ur ? 'cell' : 'cell on', onclick: () => { set(() => { p.ur = null; }); go('roster'); } }, 'UR не взяли'),
    urs.map((f) => h('button', { class: p.ur === f.id ? 'cell on' : 'cell', onclick: () => { set(() => { p.ur = f.id; }); go('roster'); } },
      portrait(f), h('span', { class: 'cell-name' }, f.nameRu))));

  const shards = h('div', { class: 'row wrap' }, ['R', 'SR', 'SSR'].map((r) => h('label', { class: 'res' },
    shardIcon(r), `Общие ${r}`, numberInput(p.universal[r], (v) => set(() => { p.universal[r] = v; })))));

  mount(root, 
    h('h2', {}, 'Двойники и ресурсы'),
    h('label', { class: 'res' }, 'Какой сейчас день Синистрии? (от 1 до 14)', numberInput(p.day, (v) => set(() => { p.day = v; }), { min: 1, max: 14 })),
    h('h3', {}, 'Кто у вас есть'), h('p', { class: 'muted' }, 'Нажмите на портрет, чтобы отметить.'), grid, details,
    h('h3', {}, 'UR'), urBlock,
    h('h3', {}, 'Ресурсы'), shards,
    h('button', { class: 'primary', onclick: () => submit() }, 'Составить план'));

  // Нереальные уровни для дня и доната — окно с предупреждением, но продолжить можно.
  function submit() {
    const list = levelWarnings(p, fetches);
    if (list.length === 0) { go('think'); return; }
    const close = () => overlay.remove();
    const overlay = h('div', { class: 'modal-back' },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'warn-title' },
        h('h3', { id: 'warn-title' }, 'Проверьте уровни'),
        h('p', {}, levelWarningText(list, p.quiz.donation, Number(p.day) || 1)),
        h('div', { class: 'actions' },
          h('button', { class: 'primary', onclick: close }, 'Исправить'),
          h('button', { class: 'ghost', onclick: () => { close(); go('think'); } }, 'Всё верно, продолжить'))));
    document.body.append(overlay);
    overlay.querySelector('button').focus();
  }
}
