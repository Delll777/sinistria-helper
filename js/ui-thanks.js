import { h, mount } from './ui-common.js';

export function renderThanks(root, state, go) {
  mount(root, h('div', { class: 'center' },
    h('h2', {}, 'Спасибо, задаём профиль'), h('p', { class: 'muted' }, 'Теперь отметьте, кто у вас есть.')));
  setTimeout(() => { if (state.step === 'thanks') go('roster'); }, 1300);
}
