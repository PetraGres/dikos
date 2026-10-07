import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCuring, productCuring, buildPlans, FLOW_QUESTIONS, buildIcs } from '../logic.js';

const db = JSON.parse(readFileSync(new URL('../data/dikos_nail_guide.json', import.meta.url)));
const product = (id) => db.products.find((p) => p.id === id);
const allSteps = (res) => res.plans.flatMap((p) => p.steps);

test('parseCuring rozlišuje pevný čas, rozsah a chybějící údaj', () => {
  assert.deepEqual(parseCuring(30), { kind: 'fixed', seconds: 30 });
  assert.deepEqual(parseCuring('60-120'), { kind: 'range', min: 60, max: 120 });
  assert.deepEqual(parseCuring(null), { kind: 'missing' });
  assert.deepEqual(parseCuring(undefined), { kind: 'missing' });
});

test('čas se bere jen z produktu pro danou lampu, nic se nedopočítává', () => {
  assert.deepEqual(productCuring(product('NA-02-13'), 'led'), { kind: 'fixed', seconds: 30 });
  assert.deepEqual(productCuring(product('NA-02-16'), 'led'), { kind: 'missing' });
  // Nylon Fiber nemá LED čas – nesmí se vzít UV ani UV/LED
  assert.deepEqual(productCuring(product('NFG-02'), 'led'), { kind: 'missing' });
});

test('gel lak: báze má čas, barva upozornění, matný top rozsah', () => {
  const res = buildPlans(db, 'flow_gel_lak', { lamp: 'uv_led', finish: 'NA-02-15' });
  const [plan] = res.plans;
  assert.equal(plan.steps.find((s) => s.name === 'Báze').curing.seconds, 30);
  assert.equal(plan.steps.find((s) => s.name.startsWith('Barva')).curing.kind, 'missing');
  assert.deepEqual(plan.steps.find((s) => s.name === 'Top').curing, { kind: 'range', min: 30, max: 45 });
});

test('Gummy Base: krokové časy platí pro UV/LED, pro LED lampu chybí', () => {
  const uvled = buildPlans(db, 'flow_strengthening', { state: 'damaged', length: 'natural', lamp: 'uv_led' });
  const gummy = uvled.plans.find((p) => p.product.id === 'GBC-03');
  assert.ok(gummy.steps.some((s) => s.curing?.seconds === 60));

  const led = buildPlans(db, 'flow_strengthening', { state: 'damaged', length: 'natural', lamp: 'led' });
  const gummyLed = led.plans.find((p) => p.product.id === 'GBC-03');
  assert.ok(gummyLed.steps.filter((s) => s.curing).every((s) => s.curing.kind === 'missing'));
});

test('modeláž na tipy nabídne Nylon Fiber i Polygel', () => {
  const res = buildPlans(db, 'flow_modeling', { base: 'tipy', lamp: 'uv_led' });
  const ids = res.plans.map((p) => p.product.id).sort();
  assert.deepEqual(ids, ['NA-22-01', 'NFG-02']);
  const poly = res.plans.find((p) => p.product.id === 'NA-22-01');
  assert.equal(poly.steps.find((s) => s.name === 'Polygel').curing.kind, 'range');
});

test('zlomený nehet: malé poškození = Ultra Strong Fiber, velké = přesměrování', () => {
  const small = buildPlans(db, 'flow_broken_nail', { damage: 'small', lamp: 'led' });
  assert.equal(small.plans[0].product.id, 'EI-01-E010');
  assert.equal(small.plans[0].steps.find((s) => s.name === 'Oprava gelem').curing.seconds, 30);
  assert.equal(buildPlans(db, 'flow_broken_nail', { damage: 'large', lamp: 'led' }).redirect, 'flow_modeling');
});

test('každá kombinace odpovědí vrátí aspoň jeden postup nebo přesměrování', () => {
  for (const flow of db.app_flows) {
    const qs = FLOW_QUESTIONS[flow.id];
    assert.ok(qs, `chybí otázky pro ${flow.id}`);
    const combos = qs.reduce((acc, q) => acc.flatMap((a) => q.options.map((o) => ({ ...a, [q.id]: o.value }))), [{}]);
    for (const answers of combos) {
      const res = buildPlans(db, flow.id, answers);
      assert.ok(res.plans.length || res.redirect, `${flow.id} ${JSON.stringify(answers)}`);
      for (const s of allSteps(res)) if (s.product) assert.ok(s.product.source, s.product.id);
    }
  }
});

test('ics připomínka má celodenní událost na zadané datum', () => {
  const ics = buildIcs(new Date(2026, 9, 28), 'Nové nehty', 'text, se středníkem; a čárkou');
  assert.match(ics, /DTSTART;VALUE=DATE:20261028/);
  assert.match(ics, /DTEND;VALUE=DATE:20261029/);
  assert.match(ics, /DESCRIPTION:text\\, se středníkem\\; a čárkou/);
});

test('rychlý časovač nabízí jen časy uvedené v databázi pro zvolenou lampu', async () => {
  const { quickTimerOptions } = await import('../logic.js');
  const led = quickTimerOptions(db, 'led');
  const ledIds = led.map((o) => o.product.id).sort();
  // LED čas mají: Base Elastic, Ultra Strong Fiber, Polygel (rozsah)
  assert.deepEqual(ledIds, ['EI-01-E010', 'NA-02-13', 'NA-22-01']);
  assert.ok(led.every((o) => o.curing.kind !== 'missing'));

  const uvled = quickTimerOptions(db, 'uv_led');
  const nfg = uvled.filter((o) => o.product.id === 'NFG-02').map((o) => o.curing.seconds);
  assert.deepEqual(nfg, [30, 90]); // podle kroků z databáze, ne 90 pro všechno
  assert.ok(!uvled.some((o) => o.product.id === 'NA-02-14')); // No Wipe top čas nemá
  for (const o of uvled) {
    const raw = o.product.steps
      ? o.product.steps.map((s) => s.curing_seconds)
      : [o.product.curing.uv_led_seconds];
    const shown = o.curing.kind === 'range' ? `${o.curing.min}-${o.curing.max}` : o.curing.seconds;
    assert.ok(raw.includes(shown), `${o.label}: ${shown} není v databázi`);
  }
});

test('vlastní čas přijme jen celé sekundy 1–600', async () => {
  const { parseCustomSeconds } = await import('../logic.js');
  assert.equal(parseCustomSeconds('45'), 45);
  assert.equal(parseCustomSeconds(''), null);
  assert.equal(parseCustomSeconds('0'), null);
  assert.equal(parseCustomSeconds('601'), null);
  assert.equal(parseCustomSeconds('12.5'), null);
});

test('nákupní seznam: produkty z postupu bez duplicit', async () => {
  const { shoppingList } = await import('../logic.js');
  const res = buildPlans(db, 'flow_gel_lak', { lamp: 'led', finish: 'NA-02-14' });
  assert.deepEqual(shoppingList(res.plans[0]).map((p) => p.id), ['NA-02-13', 'NA-02-14']);
  const nfg = buildPlans(db, 'flow_modeling', { base: 'tipy', lamp: 'uv_led' }).plans.find((p) => p.product.id === 'NFG-02');
  assert.deepEqual(shoppingList(nfg).map((p) => p.id), ['NFG-02', 'EI-15-66']);
});

test('odkaz pro zákaznici: přímá adresa, jinak vyhledávání podle názvu', async () => {
  const { customerLink } = await import('../logic.js');
  const search = 'https://www.dikos-kosmetika.cz/vyhledavani/?string=';
  assert.equal(customerLink(product('NA-22-01'), search), 'https://www.dikos-kosmetika.cz/nailee-polygel-v-tube-30-ml-clear/');
  assert.equal(customerLink(product('NA-02-13'), search), search + 'Nailee%20Base%20Build%20Up%20Elastic%205g');
  assert.equal(customerLink(product('EI-15-66'), search), search + 'Nail%20Prep');
  assert.equal(customerLink({ name: 'X – Y', search_term: 'NA-18-119' }, search), search + 'NA-18-119');
  // žádný zákaznický odkaz nesmí vést na kategorii nebo stránku značky
  for (const p of db.products) {
    const link = customerLink(p, search);
    assert.ok(link.startsWith(search) || link === p.source, p.id);
    assert.ok(!/\/znacka\/|\/gely-na-gelove-nehty\/$|\/modelovaci-gely\/$/.test(link), p.id);
  }
});
