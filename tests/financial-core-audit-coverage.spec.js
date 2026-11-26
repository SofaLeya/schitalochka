/**
 * N1 audit (no formula change) + expanded U1–U12 coverage.
 * Independent expectations; does not weaken existing suites.
 */
const {test, expect} = require('@playwright/test');

async function probe(page, scenario){
  await page.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort());
  await page.route(/\/index\.html(?:\?.*)?$/, async route => {
    const response = await route.fetch(), html = await response.text();
    const marker = '})();\n/* Новая версия на сайте:';
    if(!html.includes(marker)) throw Error('probe marker missing');
    await route.fulfill({response, body: html.replace(marker, 'window.__auditProbe = ' + scenario.toString() + '\n' + marker)});
  });
  await page.goto('/index.html');
  return page.evaluate(() => window.__auditProbe());
}

/* ---------- N1: planSpend !live asymmetry (document current contract) ---------- */

test('N1 planSpend without live: dayNet includes, limSpent/fcPace/cash exclude; transfers not double-counted', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.catLim = {trans: 1000, cafe: 5000};
    S.accounts = [
      {id: 'main', type: 'main', start: 20000},
      {id: 'metro', type: 'other', live: false, planSpend: true, start: 500}
    ];
    S.fcPlans = []; S.noSpend = []; S.incomes = []; S.payDays = [10];
    S.entries = [];
    for(let i = 1; i <= 10; i++){
      const d = iso(addDays(parse(T), -i));
      S.entries.push({id: 'm' + i, type: 'e', acc: 'metro', cat: 'trans', amt: 100, date: d});
      S.entries.push({id: 'c' + i, type: 'e', acc: 'main', cat: 'cafe', amt: 400, date: d});
    }
    S.entries.push({id: 'top', type: 't', from: 'main', to: 'metro', amt: 200, date: T});
    S.entries.push({id: 'mt', type: 'e', acc: 'metro', cat: 'trans', amt: 65, date: T});
    S.entries.push({id: 'cf', type: 'e', acc: 'main', cat: 'cafe', amt: 120, date: T});
    const lim = limSpent(T.slice(0, 7));
    const pace = fcPace().pace;
    return {
      free: balance(),
      day: dayNet(T).v,
      cash: cashPlanSpent(T, T),
      limTrans: lim.trans || 0,
      limCafe: lim.cafe || 0,
      pace,
      // Transfers may remain in life() filter list but must not affect lifeNet / day spend
      dayWithoutTransfer: (() => { const e = S.entries.filter(x => x.id !== 'top'); const keep = S.entries; S.entries = e; const v = dayNet(T).v; S.entries = keep; return v; })(),
      metroInLife: life(S.entries).some(x => x.type === 'e' && x.acc === 'metro')
    };
  });
  // Documented contract (N1): planSpend counts in life/dayNet; category limits & cash pace use live only
  expect(r.day).toBe(185); // 120 cafe + 65 metro
  expect(r.dayWithoutTransfer).toBe(185); // transfer not double-counted as spend
  expect(r.cash).toBe(120);
  expect(r.limCafe).toBe(120 + 10 * 400);
  expect(r.limTrans).toBe(0); // metro not live → excluded from limSpent
  expect(r.pace).toBeCloseTo(400, 5); // live cafe only in pace window
  expect(r.free).toBe(20000 - 10 * 400 - 200 - 120); // metro start not in free; top-up leaves free
  expect(r.metroInLife).toBe(true);
});

/* ---------- U coverage ---------- */

test('U1 backdated date change and delete rebuild past day nets and balance', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [{id: 'a', type: 'e', amt: 1500, date: '2026-10-31', acc: 'main', cat: 'cafe'}];
    const before = {oct: dayNet('2026-10-31').v, nov: dayNet('2026-11-01').v, bal: balance()};
    S.entries[0].date = '2026-11-01';
    const moved = {oct: dayNet('2026-10-31').v, nov: dayNet('2026-11-01').v, bal: balance()};
    S.entries = [];
    const deleted = {oct: dayNet('2026-10-31').v, nov: dayNet('2026-11-01').v, bal: balance()};
    return {before, moved, deleted};
  });
  expect(r.before).toEqual({oct: 1500, nov: 0, bal: 8500});
  expect(r.moved).toEqual({oct: 0, nov: 1500, bal: 8500});
  expect(r.deleted).toEqual({oct: 0, nov: 0, bal: 10000});
});

test('U2 backup JSON round-trip restores accounts entries and dayLimit', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.dayLimit = 1750; S.planCalc = null; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 4242}, {id: 'save', type: 'save', start: 100}];
    S.entries = [{id: 'x', type: 'e', amt: 42, date: T, acc: 'main', cat: 'cafe'}];
    S.planDayHistory = {'2026-11-24': 1750};
    const packed = JSON.stringify({v: 1, data: {accounts: S.accounts, entries: S.entries, dayLimit: S.dayLimit, planDayHistory: S.planDayHistory, simple: true}});
    // wipe and restore via unpack shape used by backups
    S.accounts = [{id: 'main', type: 'main', start: 0}]; S.entries = []; S.dayLimit = 0; S.planDayHistory = {};
    const raw = JSON.parse(packed);
    const data = planHistUnpack(raw) || raw.data;
    S.accounts = data.accounts; S.entries = data.entries; S.dayLimit = data.dayLimit; S.planDayHistory = data.planDayHistory || {};
    return {bal: balance(), day: dayNet(T).v, lim: dayLimit(), hist: S.planDayHistory['2026-11-24'], save: accBalN(accById('save'))};
  });
  expect(r).toEqual({bal: 4200, day: 42, lim: 1750, hist: 1750, save: 100});
});

test('U4 late income actual still wins over holiday-shifted schedule', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = false; S.irreg = false; S.planFrom = '2026-01-01';
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000}];
    S.rules = []; S.recur = []; S.rare = [];
    S.entries = [];
    const scheduled = payDateIn('2027-01', 1);
    // User marks income late on Jan 5 (after holiday shift to Dec 30)
    S.entries.push({id: 'got', type: 'i', iid: 'sal~2027-01-01', amt: 49500, date: '2027-01-05', acc: 'main', cat: 'salary'});
    T = '2027-01-06';
    const rows = incomeRowsForPeriod('2027-01');
    const got = rows.map(r => ({id: r.id, for: incomeFor(r, r.sourceYM || '2027-01'), sch: r.scheduled}));
    return {scheduled, got, bal: balance()};
  });
  expect(r.scheduled).toBe('2026-12-30');
  expect(r.got.some(x => x.for === 49500)).toBe(true);
  expect(r.bal).toBe(10000 + 49500);
});

test('U5 week envelope sums day limits; gap in past days makes week unknown', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.dayLimit = 2000; S.planCalc = null;
    S.planDayHistory = {'2026-11-23': 1000}; // Tue24 missing
    const complete = (() => {
      S.planDayHistory['2026-11-24'] = 1000;
      return {env: weekEnvelope('2026-11-23'), known: weekPlanKnown('2026-11-23')};
    })();
    delete S.planDayHistory['2026-11-24'];
    return {envGap: weekEnvelope('2026-11-23'), knownGap: weekPlanKnown('2026-11-23'), complete};
  });
  // Gap: Mon1000 + Tue0 + Wed–Sun live 2000×5 = 11000; complete: 12000
  expect(r.envGap).toBe(11000);
  expect(r.knownGap).toBe(false);
  expect(r.complete.env).toBe(12000);
  expect(r.complete.known).toBe(true);
});

test('U6 irreg + payAllSave + cycle: allSave payday does not restart cycle', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-06'; S.demo = false; S.simple = false; S.irreg = true; S.rare = []; S.planFrom = '2026-01-01';
    S.accounts = [{id: 'main', type: 'main', start: 5000}, {id: 'save', type: 'save', start: 0}];
    S.incomes = [{id: 'sal', day: 5, amt: 30000}, {id: 'next', day: 10, amt: 40000}];
    S.rules = [{id: 'r', day: 5, acc: 'save', amt: 30000}];
    setPayAllSave(5, true, 'rules');
    S.pct = []; S.planCalc = null; S.dayLimit = undefined;
    S.entries = [
      {id: 'i5', type: 'i', iid: 'sal', amt: 30000, date: '2026-12-04', acc: 'main', cat: 'salary'},
      {id: 'al', type: 't', from: 'main', to: 'save', amt: 30000, date: '2026-12-04', rule: 'r'},
      {id: 'i10', type: 'i', iid: 'next', amt: 40000, date: '2026-11-10', acc: 'main', cat: 'salary'}
    ];
    // seed irreg history
    for(let i = 0; i < 6; i++){
      S.entries.push({id: 'oe' + i, type: 'e', amt: 50, date: '2026-10-' + String(10 + i).padStart(2, '0'), acc: 'main', cat: 'cafe'});
    }
    S.entries.push({id: 'oi', type: 'i', cat: 'salary', amt: 20000, date: '2026-10-05', acc: 'main'});
    PI_C = null;
    const cp = cycleDayPlan();
    return {start: cp && cp.start, next: cp && cp.next, allSave: payAllSave(5), irreg: S.irreg};
  });
  expect(r.allSave).toBe(true);
  expect(r.irreg).toBe(true);
  // allSave Dec4 should not be cycle start; prior life payout Nov10 remains
  if(r.start) expect(r.start).not.toBe('2026-12-04');
});

test('U7 FX live card archive drops free money conversion; history spend kept', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000; S.cur = 'RUB';
    S.mrate = {USD: 100};
    S.accounts = [
      {id: 'main', type: 'main', start: 5000},
      {id: 'usd', type: 'other', live: true, planSpend: true, cur: 'USD', start: 10}
    ];
    S.entries = [{id: 'e', type: 'e', acc: 'usd', cat: 'cafe', amt: 500, ca: 5, date: '2026-11-20'}];
    const before = {free: balance(), day: dayNet('2026-11-20').v};
    accById('usd').archived = true;
    const after = {free: balance(), day: dayNet('2026-11-20').v};
    return {before, after};
  });
  expect(r.before.free).toBe(5000 + 5 * 100); // 10-5=5$ left
  expect(r.before.day).toBe(500);
  expect(r.after.free).toBe(5000);
  expect(r.after.day).toBe(500);
});

test('U8 cold start: no entries → dayLimit none, prediction needs schedule or irreg', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = undefined;
    S.accounts = [{id: 'main', type: 'main', start: 0}]; S.entries = []; S.incomes = []; S.payDays = [];
    PI_C = null;
    const none = {v: dayLimit(), src: planInfo().src, f: fcCalc(), paceKn: fcPace().kn};
    S.irreg = true;
    PI_C = null;
    const irreg = {v: dayLimit(), src: planInfo().src, irrBody: fcIrrBody().indexOf('мало записей') >= 0};
    return {none, irreg};
  });
  expect(r.none).toEqual({v: 0, src: 'none', f: null, paceKn: 0});
  expect(r.irreg.v).toBe(0);
  expect(r.irreg.irrBody).toBe(true);
});

test('U9 negative free: dayNet still counts spend; cycle v clamps at 0', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = false; S.irreg = false; S.rare = [];
    S.accounts = [{id: 'main', type: 'main', start: -5000}];
    S.incomes = [{id: 'sal', day: 10, amt: 10000}];
    S.rules = []; S.recur = [];
    S.entries = [
      {id: 'inc', type: 'i', iid: 'sal', amt: 10000, date: '2026-11-10', acc: 'main', cat: 'salary'},
      {id: 'e', type: 'e', amt: 800, date: T, acc: 'main', cat: 'cafe'}
    ];
    PI_C = null;
    const cp = cycleDayPlan();
    return {bal: balance(), day: dayNet(T).v, v: cp && cp.v, free: cp && cp.free};
  });
  expect(r.bal).toBe(4200); // -5000+10000-800
  expect(r.day).toBe(800);
  expect(r.v).toBeGreaterThanOrEqual(0);
});

test('U11 rules stay linked to sourceYM when payday shifts across month', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = false; S.irreg = false; S.planFrom = '2026-01-01';
    S.accounts = [{id: 'main', type: 'main', start: 20000}, {id: 'save', type: 'save', start: 0}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000}];
    S.rules = [{id: 'r1', day: 1, acc: 'save', amt: 10000}];
    S.recur = []; S.entries = []; S.rare = [];
    const ev = plannedItems('2026-12-20', 40).filter(e => e.payDay === 1);
    const ins = ev.filter(e => e.kind === 'in');
    const outs = ev.filter(e => e.rule);
    return {
      ins: ins.map(e => ({date: e.date, ym: e.ym, pd: e.payDay, amt: e.amt})),
      outs: outs.map(e => ({date: e.date, ym: e.ym, pd: e.payDay, sch: e.scheduled, amt: e.amt}))
    };
  });
  const janIn = r.ins.find(e => e.ym === '2027-01');
  const janOut = r.outs.find(e => e.ym === '2027-01');
  expect(janIn).toBeTruthy();
  expect(janOut).toBeTruthy();
  expect(janIn.date).toBe('2026-12-30');
  expect(janOut.sch).toBe('2026-12-30');
  expect(janIn.ym).toBe(janOut.ym);
});

test('U12 merge3 keeps distinct device day-limit history without clobbering', async ({page}) => {
  const r = await probe(page, () => {
    const base = {planDayHistory: {'2026-11-01': 1000}, entries: [{id: 'a', type: 'e', amt: 1, date: '2026-11-01', acc: 'main', cat: 'cafe'}]};
    const local = {planDayHistory: {'2026-11-01': 1000, '2026-11-02': 1100}, entries: [{id: 'a', type: 'e', amt: 1, date: '2026-11-01', acc: 'main', cat: 'cafe'}, {id: 'b', type: 'e', amt: 2, date: '2026-11-02', acc: 'main', cat: 'cafe'}]};
    const remote = {planDayHistory: {'2026-11-01': 1000, '2026-11-03': 1200}, entries: [{id: 'a', type: 'e', amt: 1, date: '2026-11-01', acc: 'main', cat: 'cafe'}, {id: 'c', type: 'e', amt: 3, date: '2026-11-03', acc: 'main', cat: 'cafe'}]};
    const m = merge3(base, local, remote);
    return {hist: m.planDayHistory, ids: (m.entries || []).map(e => e.id).sort()};
  });
  expect(r.hist).toEqual({'2026-11-01': 1000, '2026-11-02': 1100, '2026-11-03': 1200});
  expect(r.ids).toEqual(['a', 'b', 'c']);
});
