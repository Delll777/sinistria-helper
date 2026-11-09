// Уровни Двойников пачки к концу раунда (владелец, 09.11.2026). У игрока общий запас Искр жизни на раунд —
// ровно на лесенку по донату. Уже вложенное лежит в нынешних уровнях: у Двойников пачки оно засчитывается,
// у остальных пропало. Что ещё придёт — по оставшимся дням. Кого на какую ступень — решает польза для пачки.
import { LEVEL_LADDER, EXTRA_SSR_DROP, SPARK_COST, MAX_LEVEL, ROUND_DAYS } from './weights.js';

// Цена перехода с уровня level на следующий.
export function sparkCost(level) {
  let i = 1;
  while (i < SPARK_COST.length - 1 && level > SPARK_COST[i][0]) i++;
  const [x0, y0] = SPARK_COST[i - 1];
  const [x1, y1] = SPARK_COST[i];
  return Math.round(y0 * Math.pow(y1 / y0, (level - x0) / (x1 - x0)));
}

const CUM = [0, 0];
for (let l = 1; l < MAX_LEVEL; l++) CUM[l + 1] = CUM[l] + sparkCost(l);

// Сколько искр стоит дойти от 1-го уровня до level (level может быть дробным — для расчёта).
export function sparksTo(level) {
  const x = Math.max(1, Math.min(MAX_LEVEL, level));
  const lo = Math.floor(x);
  return lo >= MAX_LEVEL ? CUM[MAX_LEVEL] : CUM[lo] + (CUM[lo + 1] - CUM[lo]) * (x - lo);
}

// Ступени для n Двойников пачки (без UR); ssr — сколько среди них SSR.
export function ladderFor(donation, n, ssr = 0) {
  const steps = (LEVEL_LADDER[donation] || LEVEL_LADDER.none).slice(0, n);
  const extra = Math.max(0, ssr - 1);
  if (extra && steps.length) steps[steps.length - 1] -= EXTRA_SSR_DROP * extra;
  return steps;
}

const leftShare = (day) => (ROUND_DAYS - Math.max(1, Math.min(ROUND_DAYS, day))) / (ROUND_DAYS - 1);

// now[i] — нынешний уровень Двойника, steps[i] — его ступень. Запас искр пачки: всё вложенное в её
// Двойников плюс то, что придёт до конца раунда. Он делится так, чтобы все сдвинулись от своих ступеней
// одинаково (лишние искры — вверх, нехватка — вниз), но никто не опустился ниже нынешнего уровня.
// caps[i] — потолок уровня (SSR держат Кофры крови): выше него не растут, лишние искры уходят остальным.
const budgetOf = (now, steps, day) => steps.reduce((s, x) => s + sparksTo(x), 0) * leftShare(day)
  + now.reduce((s, x) => s + sparksTo(x), 0);
const levelAt = (now, s, d, cap = MAX_LEVEL) => Math.max(now, Math.min(cap, MAX_LEVEL, s + d));
const capOf = (caps, i) => (caps ? caps[i] ?? MAX_LEVEL : MAX_LEVEL);

// Общий сдвиг от ступеней, на который хватает искр have.
function shift(now, steps, have, caps = null) {
  let lo = -MAX_LEVEL;
  let hi = MAX_LEVEL;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    let cost = 0;
    for (let i = 0; i < steps.length; i++) cost += sparksTo(levelAt(now[i], steps[i], mid, capOf(caps, i)));
    if (cost <= have) lo = mid; else hi = mid;
  }
  return lo;
}

export function finalLevels(now, steps, day, caps = null) {
  const d = shift(now, steps, budgetOf(now, steps, day), caps);
  return steps.map((s, i) => Math.round(levelAt(now[i], s, d, capOf(caps, i))));
}

const PERMS = {};
function permutations(n) {
  if (PERMS[n]) return PERMS[n];
  const out = [];
  const walk = (acc, left) => {
    if (!left.length) { out.push(acc); return; }
    left.forEach((x, i) => walk([...acc, x], [...left.slice(0, i), ...left.slice(i + 1)]));
  };
  walk([], Array.from({ length: n }, (_, i) => i));
  PERMS[n] = out;
  return out;
}

// Перебор: кого на какую ступень. value(levels) — польза пачки при таких итоговых уровнях.
// Допустимые расклады (order[i] — номер ступени i-го Двойника):
// 1) Двойник с потолком (SSR) не встаёт на ступень выше потолка — так на всех финальных пачках:
//    верхние ступени берут SR и R;
// 2) прокачанного не останавливают ради того, кто ниже (владелец: «перекачивать мощного нерационально»):
//    если ступень Двойника ниже его нынешнего уровня, никто с уровнем ниже не стоит выше него.
//    В первые дни все ниже своих ступеней — порядок свободный; чем больше вложено, тем крепче место;
// 3) главная (верхняя) ступень — у того, кому можно (mayTop: SR — за их Вознесение дают рейтинг,
//    за R нет; владелец, 09.11.2026), если такой в пачке есть.
// Правила накладываются по очереди; правило, после которого не осталось ни одного расклада, пропускается
// (поэтому уже прокачанную главную R не останавливают ради SR).
export function allowedOrders(now, steps, caps = null, mayTop = null) {
  const top = steps.indexOf(Math.max(...steps));
  const rules = [
    (o) => o.every((k, i) => steps[k] <= Math.max(capOf(caps, i), now[i])),
    (o) => o.every((k, i) => steps[k] >= now[i]
      || o.every((k2, j) => !(now[j] < now[i] && steps[k2] > steps[k]))),
    (o) => !mayTop || !mayTop.some(Boolean) || Boolean(mayTop[o.indexOf(top)]),
  ];
  let list = permutations(steps.length);
  for (const rule of rules) {
    const next = list.filter(rule);
    if (next.length) list = next;
  }
  return list;
}

// Запас искр от расклада не зависит. Пока никто не выше своей ступени со сдвигом и не упёрся в потолок,
// сдвиг у всех раскладов один — его считаем раз; иначе — заново, как прямой расчёт finalLevels.
export function bestAssignment(now, steps, day, value, caps = null, mayTop = null) {
  const n = steps.length;
  const have = budgetOf(now, steps, day);
  const d0 = shift(new Array(n).fill(1), steps, have);
  const onStep = steps.map((s) => levelAt(1, s, d0));
  const onStepR = onStep.map(Math.round);
  const t = new Array(n);
  const tc = new Array(n);
  let best = null;
  let bestV = -Infinity;
  for (const order of allowedOrders(now, steps, caps, mayTop)) {
    const levels = new Array(n);
    let fits = true;
    for (let i = 0; i < n && fits; i++) fits = now[i] <= onStep[order[i]] && onStep[order[i]] <= capOf(caps, i);
    if (fits) {
      for (let i = 0; i < n; i++) levels[i] = onStepR[order[i]];
    } else {
      for (let i = 0; i < n; i++) { t[i] = steps[order[i]]; tc[i] = capOf(caps, i); }
      const d = shift(now, t, have, tc);
      for (let i = 0; i < n; i++) levels[i] = Math.round(levelAt(now[i], t[i], d, tc[i]));
    }
    const v = value(levels);
    if (best === null || v > bestV) { best = levels; bestV = v; }
  }
  return best || [];
}
