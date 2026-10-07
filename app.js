import { CONFIG } from './config.js';
import {
  FLOW_QUESTIONS, buildPlans, formatCuring, addDays, buildIcs,
  quickTimerOptions, parseCustomSeconds, CUSTOM_TIME_MAX,
  shoppingList, shoptetCode, buildCartUrl,
} from './logic.js';

const app = document.getElementById('app');
const backBtn = document.getElementById('back');
const REMINDER_KEY = 'nehtik.lastManicure';

let db = null;
const stack = []; // historie obrazovek: { view, ...data }

// --- pomocné ---

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* soukromé okno apod. */ }
}

const fmtDate = (d) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });

function productLink(product) {
  if (!product?.source) return null;
  return el('a', { href: product.source, target: '_blank', rel: 'noopener', class: 'product' },
    `${product.name} – v e-shopu ↗`);
}

// --- navigace ---

function go(state) {
  stack.push(state);
  history.pushState({ depth: stack.length }, '');
  render();
}
function back() {
  if (stack.length > 1) history.back();
}
window.addEventListener('popstate', () => {
  if (stack.length > 1) stack.pop();
  render();
});
backBtn.addEventListener('click', back);

function render() {
  const state = stack[stack.length - 1];
  backBtn.hidden = stack.length <= 1;
  app.replaceChildren(VIEWS[state.view](state));
  window.scrollTo(0, 0);
}

// --- obrazovky ---

function reminderCard() {
  const saved = storageGet(REMINDER_KEY);
  if (!saved) return null;
  const next = addDays(new Date(saved), CONFIG.reminderDays);
  const days = Math.ceil((next - new Date()) / 86400000);
  const text = days > 0 ? `Další manikúra za ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`
    : 'Je čas na nové nehty 💅';
  return el('section', { class: 'card reminder' },
    el('strong', {}, text),
    el('p', { class: 'muted' }, `Naposledy ${fmtDate(new Date(saved))}, další kolem ${fmtDate(next)}.`),
    days <= 3 && CONFIG.couponText ? el('p', {}, CONFIG.couponText) : null,
    el('div', { class: 'row' },
      el('a', { class: 'btn small', href: CONFIG.shopUrl, target: '_blank', rel: 'noopener' }, 'Doplnit zásoby')),
  );
}

function homeView() {
  return el('div', {},
    el('h1', {}, 'Co dnes budeš dělat?'),
    el('p', { class: 'muted' }, 'Provedu tě krok za krokem a pohlídám čas pod lampou.'),
    reminderCard(),
    el('button', { class: 'btn block ghost', onclick: () => go({ view: 'quick' }) }, '⏱ Rychlý časovač'),
    el('div', { class: 'choices' },
      db.app_flows.map((f) => el('button', {
        class: 'choice',
        onclick: () => go({ view: 'question', flowId: f.id, index: 0, answers: {} }),
      }, f.title))),
    el('p', { class: 'muted' },
      'Materiál najdeš na ', el('a', { href: CONFIG.shopUrl, target: '_blank', rel: 'noopener' }, 'dikos-kosmetika.cz'), '.'),
  );
}

function questionView({ flowId, index, answers }) {
  const questions = FLOW_QUESTIONS[flowId];
  const q = questions[index];
  const flow = db.app_flows.find((f) => f.id === flowId);
  const pick = (value) => {
    const next = { ...answers, [q.id]: value };
    if (index + 1 < questions.length) go({ view: 'question', flowId, index: index + 1, answers: next });
    else showResult(flowId, next);
  };
  return el('div', {},
    el('p', { class: 'muted' }, `${flow.title} · ${index + 1}/${questions.length}`),
    el('h1', {}, q.text),
    q.help ? el('p', { class: 'muted' }, q.help) : null,
    el('div', { class: 'choices' },
      q.options.map((o) => el('button', { class: 'choice', onclick: () => pick(o.value) }, o.label))),
  );
}

function showResult(flowId, answers) {
  const { plans, redirect } = buildPlans(db, flowId, answers);
  if (redirect) return go({ view: 'redirect', to: redirect, lamp: answers.lamp });
  if (plans.length === 1) return go({ view: 'steps', plan: plans[0], lamp: answers.lamp });
  go({ view: 'plans', plans, lamp: answers.lamp });
}

function redirectView({ to }) {
  const flow = db.app_flows.find((f) => f.id === to);
  return el('div', {},
    el('h1', {}, 'Tady bude potřeba modeláž'),
    el('p', {}, 'Ulomený celý okraj se opravuje dostavěním nehtu.'),
    el('button', { class: 'btn block', onclick: () => go({ view: 'question', flowId: to, index: 0, answers: {} }) },
      flow.title),
  );
}

function plansView({ plans, lamp }) {
  if (!plans.length) {
    return el('div', {},
      el('h1', {}, 'Nic vhodného jsem nenašla'),
      el('p', {}, 'Zkus jinou kombinaci, nebo se ozvi do e-shopu, rády poradíme.'));
  }
  return el('div', {},
    el('h1', {}, 'Vyber si produkt'),
    el('p', { class: 'muted' }, 'Tyhle produkty se hodí na to, co chceš udělat.'),
    el('div', { class: 'choices' },
      plans.map((p) => el('button', { class: 'choice', onclick: () => go({ view: 'steps', plan: p, lamp }) },
        p.title,
        p.product?.use_cases ? el('small', {}, p.product.use_cases.join(' · ')) : null))),
  );
}

// Vlastní čas – zákaznice si ho zadá sama (např. podle návodu svého produktu).
function customTimeControl(label, buttonText = '▶ Spustit vlastní čas') {
  const input = el('input', {
    type: 'number', min: '1', max: String(CUSTOM_TIME_MAX), step: '1',
    inputmode: 'numeric', placeholder: 's', 'aria-label': 'Čas v sekundách',
  });
  const start = () => {
    const s = parseCustomSeconds(input.value);
    if (s) startTimer(s, label);
    else input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  return el('div', { class: 'manual' }, input, el('button', { class: 'btn small ghost', onclick: start }, buttonText));
}

function otherTime(label) {
  return el('details', { class: 'other-time' },
    el('summary', {}, 'Jiný čas'),
    el('p', { class: 'muted' }, 'Uvedený čas je z produktové stránky. Pokud tvůj návod uvádí jiný, zadej ho sem.'),
    customTimeControl(label));
}

function curingControls(step, lamp) {
  const c = step.curing;
  if (!c) return null;
  if (lamp === 'unknown') {
    return el('p', { class: 'warn' }, 'Vytvrdit pod lampou. Bez typu lampy čas neurčím – řiď se návodem produktu.');
  }
  if (c.kind === 'fixed') {
    return el('div', { class: 'row' },
      el('button', { class: 'btn small', onclick: () => startTimer(c.seconds, step.name) }, `▶ Vytvrdit ${c.seconds} s`),
      otherTime(step.name));
  }
  if (c.kind === 'range') {
    return el('div', {},
      el('p', { class: 'muted' }, `Výrobce uvádí ${formatCuring(c)} podle lampy a tloušťky vrstvy. Zvol čas:`),
      el('div', { class: 'row' },
        [c.min, c.max].map((s) => el('button', { class: 'btn small ghost', onclick: () => startTimer(s, step.name) }, `▶ ${s} s`))),
      otherTime(step.name));
  }
  // čas neuveden – vlastní čas z návodu produktu
  return el('div', {},
    el('p', { class: 'warn' }, 'Čas vytvrzení u tohoto produktu nemáme ověřený. Řiď se návodem konkrétního produktu.'),
    customTimeControl(step.name, '▶ Spustit čas z návodu'));
}

const LAMP_LABELS = { uv_led: 'UV/LED', led: 'LED', uv: 'UV' };

function quickView() {
  let lamp = 'uv_led';
  const list = el('div', {});
  const lampRow = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Typ lampy' });
  const draw = () => {
    lampRow.replaceChildren(...Object.entries(LAMP_LABELS).map(([value, label]) =>
      el('button', { class: value === lamp ? 'active' : '', 'aria-pressed': String(value === lamp), onclick: () => { lamp = value; draw(); } }, label)));
    const options = quickTimerOptions(db, lamp);
    list.replaceChildren(
      options.length
        ? el('div', { class: 'card quick-list' }, options.map((o) => el('div', { class: 'quick-item' },
          el('span', {}, o.label),
          el('div', { class: 'row' },
            (o.curing.kind === 'range' ? [o.curing.min, o.curing.max] : [o.curing.seconds]).map((s) =>
              el('button', { class: 'btn small', onclick: () => startTimer(s, o.label) }, `${s} s`))))))
        : el('p', { class: 'warn' }, 'Pro tuto lampu nemáme u žádného produktu uvedený čas.'),
    );
  };
  draw();
  return el('div', {},
    el('h1', {}, 'Rychlý časovač'),
    el('p', { class: 'muted' }, 'Časy z produktových stránek Dikos podle typu lampy. Produkty bez uvedeného času tu nejsou – u nich se řiď návodem.'),
    lampRow,
    list,
    el('h2', {}, 'Vlastní čas'),
    el('p', { class: 'muted' }, 'Pro produkt, který tu není, zadej čas z jeho návodu.'),
    customTimeControl('Vlastní čas'),
  );
}

// Nákupní seznam k postupu. S cartEnabled umí vybrané produkty vložit do košíku na Dikos.
function shoppingCard(plan) {
  const products = shoppingList(plan);
  if (!products.length) return null;
  if (!CONFIG.cartEnabled) {
    return el('section', { class: 'card' },
      el('h2', {}, 'Co budeš potřebovat'),
      el('ul', { class: 'shop-list' }, products.map((p) => el('li', {}, productLink(p)))));
  }
  const selected = new Set(products.map((p) => p.id));
  const cartBtn = el('a', { class: 'btn block', target: '_blank', rel: 'noopener' });
  const update = () => {
    const items = products.filter((p) => selected.has(p.id)).map((p) => ({ code: shoptetCode(p), amount: 1 }));
    cartBtn.textContent = items.length ? `🛒 Vložit do košíku na Dikos (${items.length})` : 'Vyber produkty';
    if (items.length) cartBtn.href = buildCartUrl(CONFIG.shopUrl, items);
    else cartBtn.removeAttribute('href');
  };
  const rows = products.map((p) => {
    const box = el('input', {
      type: 'checkbox', checked: true,
      onchange: (e) => { e.target.checked ? selected.add(p.id) : selected.delete(p.id); update(); },
    });
    return el('li', {},
      el('label', { class: 'shop-item' }, box, el('span', {}, p.name)),
      el('a', { href: p.source, target: '_blank', rel: 'noopener', class: 'product' }, 'detail v e-shopu ↗'));
  });
  update();
  return el('section', { class: 'card' },
    el('h2', {}, 'Co budeš potřebovat'),
    el('p', { class: 'muted' }, 'Vybrané produkty se přidají k tomu, co už máš v košíku na Dikos.'),
    el('ul', { class: 'shop-list' }, rows),
    cartBtn);
}

function stepsView({ plan, lamp }) {
  const done = new Set();
  const list = el('div', {});
  const draw = () => list.replaceChildren(...plan.steps.map((s, i) => {
    const toggle = () => { done.has(i) ? done.delete(i) : done.add(i); draw(); };
    return el('section', { class: `card step${done.has(i) ? ' done' : ''}` },
      el('button', { class: 'step-num', onclick: toggle, 'aria-label': `Krok ${i + 1} hotový` }, done.has(i) ? '✓' : i + 1),
      el('div', {},
        el('h3', {}, s.name),
        s.hint ? el('p', { class: 'muted' }, s.hint) : null,
        productLink(s.product),
        curingControls(s, lamp)),
    );
  }));
  draw();
  return el('div', {},
    el('h1', {}, plan.title),
    productLink(plan.product),
    plan.notes.length ? el('ul', { class: 'notes card' }, plan.notes.map((n) => el('li', {}, n))) : null,
    list,
    shoppingCard(plan),
    el('button', { class: 'btn block', onclick: finish }, 'Hotovo – připomeň mi další manikúru'),
  );
}

function finish() {
  storageSet(REMINDER_KEY, new Date().toISOString());
  go({ view: 'done' });
}

function doneView() {
  const next = addDays(new Date(), CONFIG.reminderDays);
  const description = [`Čas na nové nehty. ${CONFIG.shopUrl}`, CONFIG.couponText].filter(Boolean).join('\n');
  const downloadIcs = () => {
    const blob = new Blob([buildIcs(next, 'Nové nehty 💅 (Nehtík)', description)], { type: 'text/calendar' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'nehtik-pripominka.ics' });
    document.body.append(a);
    a.click();
    a.remove();
  };
  return el('div', {},
    el('h1', {}, 'Krásné nehty! 💅'),
    el('p', {}, `Další manikúru doporučujeme kolem ${fmtDate(next)}. Přidej si připomínku do kalendáře, ať na to nezapomeneš.`),
    el('div', { class: 'choices' },
      el('button', { class: 'btn block', onclick: downloadIcs }, '📅 Přidat do kalendáře'),
      el('button', { class: 'btn block ghost', onclick: () => { stack.length = 0; go({ view: 'home' }); } }, 'Zpět na začátek')),
  );
}

const VIEWS = {
  home: homeView,
  question: questionView,
  redirect: redirectView,
  plans: plansView,
  steps: stepsView,
  done: doneView,
  quick: quickView,
};

// --- časovač ---

const timerEl = document.getElementById('timer');
const timerCount = document.getElementById('timer-count');
let timerId = null;
let wakeLock = null;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* bez zvuku */ }
  navigator.vibrate?.([200, 100, 200]);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  timerEl.hidden = true;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

async function startTimer(seconds, label) {
  stopTimer();
  const end = Date.now() + seconds * 1000;
  document.getElementById('timer-label').textContent = label;
  timerCount.textContent = seconds;
  timerEl.hidden = false;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* nepodporováno */ }
  timerId = setInterval(() => {
    const left = Math.ceil((end - Date.now()) / 1000);
    timerCount.textContent = Math.max(left, 0);
    if (left <= 0) { stopTimer(); beep(); }
  }, 200);
}
document.getElementById('timer-cancel').addEventListener('click', stopTimer);

// --- start ---

async function init() {
  try {
    const res = await fetch('data/dikos_nail_guide.json');
    db = await res.json();
  } catch {
    app.replaceChildren(el('p', { class: 'warn' }, 'Nepodařilo se načíst data. Zkus stránku obnovit.'));
    return;
  }
  stack.push({ view: 'home' });
  history.replaceState({ depth: 1 }, '');
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
