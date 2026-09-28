// Мелочи для экранов: создание элементов и картинки с запасной рамкой.

// Раскрывает вложенные списки и выбрасывает пустые места, чтобы на экран не попали «null» и «[object …]».
export function flatChildren(children) {
  return children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
}

export function mount(root, ...children) {
  root.replaceChildren(...flatChildren(children).map((c) => (c.nodeType ? c : String(c))));
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of flatChildren(children)) el.append(c.nodeType ? c : String(c));
  return el;
}

export function picture(src, label, cls) {
  const box = h('span', { class: `pic ${cls}` });
  const img = h('img', { src, alt: label, loading: 'lazy' });
  img.addEventListener('error', () => {
    box.classList.add('noimg');
    img.remove();
    box.append(h('span', { class: 'pic-label' }, label));
  });
  box.append(img);
  return box;
}

export const portrait = (f) => picture(`img/fetches/${f.id}.png`, f.nameRu, `portrait r-${f.rarity}`);
export const skillIcon = (id, name) => picture(`img/skills/${id}.png`, name, 'icon');
export const shardIcon = (r) => picture(`img/shards/${r}.png`, r, `icon shard r-${r}`);
export const talentIcon = (t) => picture(`img/talents/${t.id}.png`, t.name, 'icon');
export const coinIcon = () => picture('img/coin.png', 'валюта', 'icon');

export function numberInput(value, onChange, attrs = {}) {
  return h('input', {
    type: 'number', inputmode: 'numeric', min: 0, value: value ?? '', ...attrs,
    oninput: (e) => onChange(e.target.value === '' ? null : Number(e.target.value)),
  });
}
