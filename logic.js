// Čistá logika průvodce (bez DOM) – výběr postupu a časů vytvrzení.
// Pravidla z data/dikos_nail_guide.json:
//  - čas se nikdy nedopočítává z výkonu lampy,
//  - rozsah se zobrazí jako rozsah a aplikace sama nevybírá jednu hodnotu,
//  - chybějící čas = upozornění „řiď se návodem produktu“.

export const LAMP_KEYS = { uv: 'uv_seconds', led: 'led_seconds', uv_led: 'uv_led_seconds' };

// Časy u jednotlivých kroků (product.steps) pocházejí z návodů pro UV/LED lampu.
export const STEP_TIMES_LAMP = 'uv_led';

export const WIPING_TEXT = {
  do_not_wipe: 'Výpotek po vytvrzení nestírej, pokud nebudeš pilovat.',
  wipe_if_filing: 'Pokud budeš pilovat, výpotek nejdřív setři.',
  remove_with_cleaner: 'Výpotek po vytvrzení odstraň cleanerem.',
  no_wipe: 'Top bez výpotku – po vytvrzení nic nestíráš.',
};

export function parseCuring(value) {
  if (typeof value === 'number' && value > 0) return { kind: 'fixed', seconds: value };
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return { kind: 'range', min: Number(m[1]), max: Number(m[2]) };
    if (/^\d+$/.test(value.trim())) return { kind: 'fixed', seconds: Number(value) };
  }
  return { kind: 'missing' };
}

export function productCuring(product, lamp) {
  const key = LAMP_KEYS[lamp];
  if (!product || !product.curing || !key) return { kind: 'missing' };
  return parseCuring(product.curing[key]);
}

// Čas pro krok z product.steps: krokový čas platí jen pro UV/LED lampu,
// pro jinou lampu se použije údaj z produktové stránky pro danou lampu (nebo nic).
export function stepCuring(product, step, lamp) {
  if (step.curing_seconds == null) {
    // Barva/TOP se vytvrzuje, jen čas určuje návod daného produktu.
    return /barva|top/i.test(step.name) ? { kind: 'missing' } : null;
  }
  if (lamp === STEP_TIMES_LAMP) return parseCuring(step.curing_seconds);
  return productCuring(product, lamp);
}

export function formatCuring(c) {
  if (!c) return '';
  if (c.kind === 'fixed') return `${c.seconds} s`;
  if (c.kind === 'range') return `${c.min}–${c.max} s`;
  return 'čas neuveden';
}

const LAMP_QUESTION = {
  id: 'lamp',
  text: 'Jakou máš lampu?',
  help: 'Typ najdeš na štítku lampy nebo v jejím návodu.',
  options: [
    { value: 'uv_led', label: 'UV/LED' },
    { value: 'led', label: 'LED' },
    { value: 'uv', label: 'UV' },
    { value: 'unknown', label: 'Nevím' },
  ],
};

export const FLOW_QUESTIONS = {
  flow_gel_lak: [
    LAMP_QUESTION,
    {
      id: 'finish',
      text: 'Jaký chceš výsledek?',
      options: [
        { value: 'NA-02-14', label: 'Lesklý' },
        { value: 'NA-02-15', label: 'Matný' },
      ],
    },
  ],
  flow_strengthening: [
    {
      id: 'state',
      text: 'Jaké máš nehty?',
      options: [
        { value: 'thin', label: 'Tenké a lámavé' },
        { value: 'damaged', label: 'Poškozené / problematické' },
      ],
    },
    {
      id: 'length',
      text: 'Jakou chceš délku?',
      options: [
        { value: 'natural', label: 'Vlastní délku' },
        { value: 'extend', label: 'Mírně prodloužit' },
      ],
    },
    LAMP_QUESTION,
  ],
  flow_modeling: [
    {
      id: 'base',
      text: 'Na čem budeš modelovat?',
      options: [
        { value: 'přírodní nehty', label: 'Přírodní nehet' },
        { value: 'tipy', label: 'Tip' },
        { value: 'šablony', label: 'Šablona' },
      ],
    },
    LAMP_QUESTION,
  ],
  flow_broken_nail: [
    {
      id: 'damage',
      text: 'Jak moc je nehet poškozený?',
      options: [
        { value: 'small', label: 'Prasklina / kousek ulomený' },
        { value: 'large', label: 'Ulomený celý okraj' },
      ],
    },
    LAMP_QUESTION,
  ],
};

const byId = (db, id) => db.products.find((p) => p.id === id);
const systemById = (db, id) => db.systems.find((s) => s.id === id);
const hasCase = (p, cases) => (p.use_cases || []).some((c) => cases.includes(c));

function prepStep(db, withEnii) {
  return {
    name: 'Příprava nehtu',
    hint: 'Uprav tvar a kůžičku, nehet jemně zdrsni a odmasti.',
    product: withEnii ? byId(db, 'EI-15-66') : null,
    curing: null,
  };
}

const oilStep = { name: 'Olej na kůžičku', hint: 'Na závěr vmasíruj olej.', product: null, curing: null };

function productLayer(db, product, lamp, name, hint) {
  return { name, hint, product, curing: productCuring(product, lamp) };
}

// Kroky z product.steps (Gummy Base, Nylon Fiber).
function stepsFromProduct(db, product, lamp) {
  return product.steps.map((s) => {
    const isPrep = /prep|příprava/i.test(s.name);
    // Barva/TOP a olej jsou jiné produkty, odkaz na hlavní produkt by mátl.
    const isOther = /olej|barva|top/i.test(s.name);
    return {
      name: s.name,
      hint: isPrep ? prepStep(db, true).hint : '',
      product: isPrep ? byId(db, 'EI-15-66') : isOther ? null : product,
      curing: stepCuring(product, s, lamp),
    };
  });
}

function planForProduct(db, product, lamp) {
  const notes = [];
  if (product.lamp_requirement) notes.push(`Potřebuješ lampu ${product.lamp_requirement}.`);
  if (product.note) notes.push(product.note);
  if (WIPING_TEXT[product.wiping]) notes.push(WIPING_TEXT[product.wiping]);

  let steps;
  if (product.steps) {
    steps = stepsFromProduct(db, product, lamp);
    if (!steps.some((s) => /olej/i.test(s.name))) steps.push(oilStep);
  } else if (product.category === 'polygel') {
    const sys = systemById(db, 'system_polygel_nailee');
    if (sys?.note && !notes.includes(sys.note)) notes.push(sys.note);
    steps = [
      prepStep(db, false),
      productLayer(db, product, lamp, 'Polygel', 'Nanes a vytvaruj polygel.'),
      { name: 'Odstranění výpotku', hint: 'Výpotek setři cleanerem.', product: null, curing: null },
      { name: 'Tvarování a dokončení', hint: 'Dopiluj do tvaru.', product: null, curing: null },
      oilStep,
    ];
  } else if (product.id === 'EI-01-E010') {
    steps = [
      prepStep(db, true),
      productLayer(db, product, lamp, 'Oprava gelem', 'Nanes gel na poškozené místo a vymodeluj.'),
      { name: 'Dopilování', hint: 'Dopiluj opravu do tvaru nehtu.', product: null, curing: null },
      oilStep,
    ];
  } else {
    steps = [
      prepStep(db, product.brand === 'ENII'),
      productLayer(db, product, lamp, product.name, 'Nanes tenkou vrstvu.'),
    ];
    if (product.top_required) {
      steps.push({
        name: 'Barva nebo TOP',
        hint: 'Zakonči barvou a topem podle jejich návodu.',
        product: null,
        curing: { kind: 'missing' },
      });
    }
    steps.push(oilStep);
  }
  return { title: product.name, product, notes, steps };
}

function gelLakPlan(db, answers) {
  const sys = systemById(db, 'system_nailee_gel_lak');
  const base = byId(db, 'NA-02-13');
  const top = byId(db, answers.finish) || byId(db, 'NA-02-14');
  const colorHint = 'Čas vytvrzení se u odstínů liší – řiď se návodem konkrétní barvy.';
  return {
    title: sys.name,
    product: null,
    notes: ['Každý produkt se vytvrzuje podle vlastního návodu – časy níže jsou převzaté z produktových stránek.'],
    steps: [
      prepStep(db, false),
      productLayer(db, base, answers.lamp, 'Báze', 'Nanes tenkou vrstvu báze.'),
      { name: 'Barva – 1. vrstva', hint: colorHint, product: null, curing: { kind: 'missing' } },
      { name: 'Barva – 2. vrstva', hint: 'Podle krytí. ' + colorHint, product: null, curing: { kind: 'missing' } },
      productLayer(db, top, answers.lamp, 'Top', WIPING_TEXT[top.wiping] || ''),
      oilStep,
    ],
  };
}

// Vrací { plans: [...], redirect?: flowId }.
export function buildPlans(db, flowId, answers) {
  const lamp = answers.lamp;
  if (flowId === 'flow_gel_lak') return { plans: [gelLakPlan(db, answers)] };

  if (flowId === 'flow_strengthening') {
    const stateCases =
      answers.state === 'damaged'
        ? ['poškozené nehty', 'problematické nehty']
        : ['tenké a lámavé nehty', 'všechny typy nehtů'];
    let products = db.products.filter((p) => p.category === 'zpevneni' && hasCase(p, stateCases));
    if (answers.length === 'extend') {
      products = products.filter((p) => hasCase(p, ['mírné prodloužení na šablony', 'modelace', 'builder']));
    }
    return { plans: sortByKnownTime(products, lamp).map((p) => planForProduct(db, p, lamp)) };
  }

  if (flowId === 'flow_modeling') {
    const products = db.products.filter(
      (p) => (p.category === 'modelaz' || p.category === 'polygel') && hasCase(p, [answers.base]),
    );
    return { plans: sortByKnownTime(products, lamp).map((p) => planForProduct(db, p, lamp)) };
  }

  if (flowId === 'flow_broken_nail') {
    if (answers.damage === 'large') return { plans: [], redirect: 'flow_modeling' };
    const products = db.products.filter((p) => hasCase(p, ['oprava zlomeného nehtu']));
    return { plans: products.map((p) => planForProduct(db, p, lamp)) };
  }

  return { plans: [] };
}

// Produkty se známým časem pro zvolenou lampu jdou první.
function sortByKnownTime(products, lamp) {
  const known = (p) => (productCuring(p, lamp).kind === 'missing' ? 1 : 0);
  return [...products].sort((a, b) => known(a) - known(b));
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Celodenní událost do kalendáře (.ics).
export function buildIcs(date, title, description) {
  const ymd = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const next = addDays(date, 1);
  const esc = (s) => s.replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dikos//Nehtik//CS',
    'BEGIN:VEVENT',
    `UID:nehtik-${ymd(date)}@dikos-kosmetika.cz`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
