/**
 * Independent financial-core audit (main @ audit branch).
 * Expected values are hand-derived from cash arithmetic and product rules
 * (README + domain meaning). App functions under test are never used as oracles.
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

/* ---------- 1. Balances, free money, piggies, debts, transfers ---------- */

test('A01 free money excludes piggy, debt and non-live cards', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [
      {id: 'main', type: 'main', start: 10000},
      {id: 'save', type: 'save', start: 8000},
      {id: 'debt', type: 'debt', start: -15000},
      {id: 'metro', type: 'other', live: false, planSpend: true, start: 400},
      {id: 'cash', type: 'other', live: true, planSpend: true, start: 1500}
    ];
    S.entries = [];
    return {free: balance(), save: accBalN(accById('save')), debt: accBalN(accById('debt')), metro: accBalN(accById('metro')), cash: accBalN(accById('cash'))};
  });
  // Independent: free = main 10000 + live cash 1500 = 11500. Piggy/debt/metro not free.
  expect(r).toEqual({free: 11500, save: 8000, debt: -15000, metro: 400, cash: 1500});
});

test('A02 transfers between own accounts move money without life spend', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [
      {id: 'main', type: 'main', start: 20000},
      {id: 'save', type: 'save', start: 0},
      {id: 'debt', type: 'debt', start: -5000},
      {id: 'card', type: 'other', live: true, start: 0}
    ];
    S.entries = [
      {id: 't1', type: 't', from: 'main', to: 'save', amt: 3000, date: T},
      {id: 't2', type: 't', from: 'main', to: 'debt', amt: 2000, date: T},
      {id: 't3', type: 't', from: 'main', to: 'card', amt: 500, date: T}
    ];
    return {free: balance(), save: accBalN(accById('save')), debt: accBalN(accById('debt')), card: accBalN(accById('card')), spent: dayNet(T).v};
  });
  // Independent cash: free live = (20000-3000-2000-500)+500 = 15000; save 3000; debt -3000; life spend 0
  expect(r).toEqual({free: 15000, save: 3000, debt: -3000, card: 500, spent: 0});
});

test('A03 archive removes account from free money but keeps history spend', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [
      {id: 'main', type: 'main', start: 10000},
      {id: 'side', type: 'other', live: true, planSpend: true, start: 0}
    ];
    S.entries = [
      {id: 'e1', type: 'e', acc: 'side', cat: 'cafe', amt: 700, date: '2026-11-20'},
      {id: 'top', type: 't', from: 'main', to: 'side', amt: 700, date: '2026-11-19'}
    ];
    const before = {free: balance(), day: dayNet('2026-11-20').v, month: lifeNet(monthEntries('2026-11'))};
    accById('side').archived = true; accById('side').archivedAt = T;
    const after = {free: balance(), day: dayNet('2026-11-20').v, month: lifeNet(monthEntries('2026-11')), can: canArchiveAccount(accById('side'))};
    return {before, after};
  });
  // Before: free = 10000-700+0 (side drained by spend after top-up) wait:
  // main start 10000 - transfer 700 = 9300; side start 0 +700 -700 = 0; free = 9300+0 = 9300
  // After archive: free = main only 9300; spend history still 700 if isPlan on archived
  expect(r.before.free).toBe(9300);
  expect(r.before.day).toBe(700);
  expect(r.before.month).toBe(700);
  expect(r.after.free).toBe(9300);
  expect(r.after.day).toBe(700);
  expect(r.after.month).toBe(700);
});

/* ---------- 2. Refunds: full / partial / expected / orphan / cross-day ---------- */

test('A10 partial expected split then received refund', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [{id: 'a', type: 'e', amt: 2500, split: 1000, date: T, acc: 'main', cat: 'cafe'}];
    const pending = {day: dayNet(T).v, bal: balance()};
    S.entries.push({id: 'r', type: 'i', cat: 'refund', amt: 400, date: T, acc: 'main', for: 'a'});
    const part = {day: dayNet(T).v, bal: balance()};
    S.entries[1].amt = 1000;
    const fullSplit = {day: dayNet(T).v, bal: balance()};
    return {pending, part, fullSplit};
  });
  // Independent life net: amt - received - max(0, split-received)
  // pending: 2500 - 0 - 1000 = 1500; bal 10000-2500 = 7500
  // part: 2500 - 400 - 600 = 1500; bal 7500+400 = 7900
  // full split received: 2500 - 1000 - 0 = 1500; bal 7500+1000 = 8500
  expect(r.pending).toEqual({day: 1500, bal: 7500});
  expect(r.part).toEqual({day: 1500, bal: 7900});
  expect(r.fullSplit).toEqual({day: 1500, bal: 8500});
});

test('A11 future-dated refund does not reduce today life net or balance', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [
      {id: 'a', type: 'e', amt: 3000, date: T, acc: 'main', cat: 'subs'},
      {id: 'r', type: 'i', cat: 'refund', amt: 1000, date: '2026-11-28', acc: 'main', for: 'a'}
    ];
    return {day: dayNet(T).v, bal: balance(), received: receivedNetOf(S.entries[0], refLinks())};
  });
  // Independent: future money not in wallet yet → bal 7000; life net still 3000; received cash face 3000
  expect(r).toEqual({day: 3000, bal: 7000, received: 3000});
});

test('A12 orphan refund after expense delete does not pull other days negative', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [
      {id: 'a', type: 'e', amt: 2000, date: '2026-11-20', acc: 'main', cat: 'cafe'},
      {id: 'b', type: 'e', amt: 500, date: T, acc: 'main', cat: 'prod'},
      {id: 'r', type: 'i', cat: 'refund', amt: 2000, date: T, acc: 'main', for: 'a'}
    ];
    const linked = {d20: dayNet('2026-11-20').v, today: dayNet(T).v, bal: balance()};
    S.entries = S.entries.filter(x => x.id !== 'a');
    const orphan = {d20: dayNet('2026-11-20').v, today: dayNet(T).v, bal: balance(), month: lifeNet(monthEntries('2026-11'))};
    return {linked, orphan};
  });
  // Linked: expense day 0 after full refund attributed; today 500; bal 10000-2000-500+2000=9500
  expect(r.linked).toEqual({d20: 0, today: 500, bal: 9500});
  // Orphan for=a gone: refund must NOT eat today's 500; bal still has +2000 refund cash
  // Independent product rule from prior audits: orphan stays unlinked → day stays ≥0
  expect(r.orphan.today).toBe(500);
  expect(r.orphan.d20).toBe(0);
  expect(r.orphan.bal).toBe(11500); // 10000 - 500 + 2000
  expect(r.orphan.month).toBe(500);
});

/* ---------- 3. Backdated edit / delete ---------- */

test('A20 backdated amount edit rebuilds past day and free money', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [
      {id: 'a', type: 'e', amt: 1500, date: '2026-11-10', acc: 'main', cat: 'cafe'},
      {id: 'b', type: 'e', amt: 400, date: T, acc: 'main', cat: 'prod'}
    ];
    const before = {past: dayNet('2026-11-10').v, today: dayNet(T).v, bal: balance(), month: lifeNet(monthEntries('2026-11'))};
    S.entries[0].amt = 900;
    const edited = {past: dayNet('2026-11-10').v, today: dayNet(T).v, bal: balance(), month: lifeNet(monthEntries('2026-11'))};
    S.entries[0].date = '2026-11-05';
    const moved = {past10: dayNet('2026-11-10').v, past5: dayNet('2026-11-05').v, bal: balance()};
    S.entries = S.entries.filter(x => x.id !== 'a');
    const deleted = {past5: dayNet('2026-11-05').v, today: dayNet(T).v, bal: balance(), month: lifeNet(monthEntries('2026-11'))};
    return {before, edited, moved, deleted};
  });
  expect(r.before).toEqual({past: 1500, today: 400, bal: 8100, month: 1900});
  expect(r.edited).toEqual({past: 900, today: 400, bal: 8700, month: 1300});
  expect(r.moved).toEqual({past10: 0, past5: 900, bal: 8700});
  expect(r.deleted).toEqual({past5: 0, today: 400, bal: 9600, month: 400});
});

/* ---------- 4. Day / week / month limits & history ---------- */

test('A30 manual day limit, envelopes from history, gaps are zero not backfilled', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.incomes = [];
    S.dayLimit = 1000; S.planDayHistory = {};
    // Fill Nov 1..24 selectively
    for(let d = 1; d <= 24; d++){
      const iso = '2026-11-' + String(d).padStart(2, '0');
      if(d <= 10 || d >= 20) S.planDayHistory[iso] = 1000;
    }
    S.planDayHistory['2026-11-25'] = 1500; // today snapshot may differ from live
    S.dayLimit = 2000; // live today/future
    const mon = '2026-11-23'; // Monday
    return {
      at5: dayLimitAt('2026-11-05'),
      at15: dayLimitAt('2026-11-15'), // gap
      at25: dayLimitAt('2026-11-25'),
      at26: dayLimitAt('2026-11-26'),
      month: monthEnvelope('2026-11'),
      week: weekEnvelope(mon),
      status: monthPlanStatus('2026-11')
    };
  });
  // Independent: known past days: 1-10 (10) + 20-24 (5) = 15×1000; gap 11-19 = 9×0;
  // today+future use live 2000: day 25..30 = 6×2000
  // month = 15*1000 + 0*9 + 6*2000 = 15000+12000 = 27000
  expect(r.at5).toBe(1000);
  expect(r.at15).toBe(0);
  expect(r.at25).toBe(2000);
  expect(r.at26).toBe(2000);
  expect(r.month).toBe(27000);
  // week Mon23..Sun29: hist 23,24 =1000; 25-29 live 2000 → 2000+5*2000=12000? 23,24 hist + 25..29 live
  // 1000+1000+2000*5 = 12000
  expect(r.week).toBe(12000);
  expect(r.status.complete).toBe(false);
  expect(r.status.incomplete).toBe(true);
});

test('A31 category limit uses live spend net of refunds; rid excluded', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.catLim = {cafe: 5000, prod: 3000};
    S.accounts = [
      {id: 'main', type: 'main', start: 20000},
      {id: 'metro', type: 'other', live: false, planSpend: true, start: 200}
    ];
    S.entries = [
      {id: 'c1', type: 'e', cat: 'cafe', amt: 2000, date: '2026-11-10', acc: 'main'},
      {id: 'r1', type: 'i', cat: 'refund', amt: 500, date: '2026-11-12', acc: 'main', for: 'c1'},
      {id: 'p1', type: 'e', cat: 'prod', amt: 800, date: '2026-11-15', acc: 'main'},
      {id: 'rid', type: 'e', cat: 'cafe', amt: 999, date: '2026-11-16', acc: 'main', rid: 'sub'},
      {id: 'tr', type: 'e', cat: 'cafe', amt: 65, date: '2026-11-18', acc: 'metro'}
    ];
    const lim = catLimits('2026-11');
    const spent = limSpent('2026-11');
    const lifeDay = dayNet('2026-11-18').v; // planSpend metro counts in life
    return {lim, spent, lifeDay, lifeCafe: netByCat(life(monthEntries('2026-11'))).cafe || 0};
  });
  // Independent limSpent: live only, no rid → cafe 2000-500=1500; prod 800; metro cafe ignored for lim
  expect(r.lim.cafe).toBe(5000);
  expect(r.spent.cafe).toBe(1500);
  expect(r.spent.prod).toBe(800);
  expect(r.spent.cafe === 1565).toBe(false);
  // life includes planSpend metro → cafe life = 1500+65 = 1565
  expect(r.lifeCafe).toBe(1565);
  expect(r.lifeDay).toBe(65);
});

/* ---------- 5. Regular income plan ÷30.4 and full-mode cycle ---------- */

test('A40 simple calc plan matches (inc-fixed-save-rare)/30.4 floored to 50', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.dayLimit = undefined;
    S.planCalc = {inc: 91200, fixed: 15000, save: 10000, irr: 3040};
    S.incomes = []; S.accounts = [{id: 'main', type: 'main', start: 10000}]; S.entries = [];
    PI_C = null; PI_ON = 0;
    return {v: dayLimit(), src: planInfo().src};
  });
  // Independent: free = 91200-15000-10000-3040 = 63160; 63160/30.4 = 2077.631... → floor to 50 = 2050
  expect(r.src).toBe('calc');
  expect(r.v).toBe(2050);
});

test('A41 zero and negative free plan yield day limit 0', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.dayLimit = undefined;
    S.accounts = [{id: 'main', type: 'main', start: 0}]; S.entries = []; S.incomes = [];
    S.planCalc = {inc: 10000, fixed: 8000, save: 3000, irr: 0};
    PI_C = null;
    const neg = dayLimit();
    S.planCalc = {inc: 0, fixed: 0, save: 0, irr: 0};
    PI_C = null;
    const zero = dayLimit();
    S.planCalc = null; S.dayLimit = undefined;
    PI_C = null;
    const none = {v: dayLimit(), src: planInfo().src};
    return {neg, zero, none};
  });
  // Independent: free -1000 → 0; free 0 → 0; no plan → 0/none
  expect(r.neg).toBe(0);
  expect(r.zero).toBe(0);
  expect(r.none).toEqual({v: 0, src: 'none'});
});

test('A42 full-mode cycle available/day ignores ordinary spends already done', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = false; S.irreg = false; S.rare = [];
    S.accounts = [{id: 'main', type: 'main', start: 30000}, {id: 'save', type: 'save', start: 0}];
    S.incomes = [{id: 'sal', day: 10, amt: 60000}, {id: 'adv', day: 25, amt: 40000}];
    S.rules = [{id: 'r', day: 10, acc: 'save', amt: 10000}];
    S.recur = [];
    S.entries = [
      {id: 'inc', type: 'i', iid: 'sal', amt: 60000, date: '2026-11-10', acc: 'main', cat: 'salary'},
      {id: 'alloc', type: 't', from: 'main', to: 'save', amt: 10000, date: '2026-11-10', rule: 'r'},
      {id: 'food', type: 'e', amt: 4500, date: '2026-11-20', acc: 'main', cat: 'cafe'}
    ];
    PI_C = null;
    const cp = cycleDayPlan();
    const afterMore = (() => {
      S.entries.push({id: 'food2', type: 'e', amt: 2000, date: T, acc: 'main', cat: 'prod'});
      PI_C = null;
      return cycleDayPlan();
    })();
    return {
      start: cp && cp.start, next: cp && cp.next, days: cp && cp.days,
      v: cp && cp.v, free: cp && cp.free,
      v2: afterMore && afterMore.v, free2: afterMore && afterMore.free
    };
  });
  // Independent cycle start Nov10 (life leftover after 10k rule on 60k).
  // Next life payout: Nov25 income 40k (assume no allSave) → days = 15 (10→25).
  // free = balance + spentLife - due + inc - rare
  // balance now = 30000+60000-10000-4500 = 75500; spent life from start = 4500; due until next excluding next payout rules
  // Without pending outs before 25: due≈0, inc≈0 (next income excluded as boundary)
  // free ≈ 75500+4500 = 80000; v = 80000/15
  // After +2000 spend: balance↓2000 spent↑2000 → free same, v same
  expect(r.start).toBe('2026-11-10');
  expect(r.next).toBe('2026-11-25');
  expect(r.days).toBe(15);
  expect(r.free).toBeCloseTo(80000, 5);
  expect(r.v).toBeCloseTo(80000 / 15, 5);
  expect(r.free2).toBeCloseTo(80000, 5);
  expect(r.v2).toBeCloseTo(r.v, 5);
});

/* ---------- 6. Irregular income ---------- */

test('A50 irreg uses poorest of last 3 months with ≥5 entries', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = true; S.dayLimit = undefined; S.planCalc = null;
    S.pct = [{acc: 'save', pct: 10}];
    S.accounts = [{id: 'main', type: 'main', start: 5000}, {id: 'save', type: 'save', start: 0}];
    S.rare = []; S.incomes = [];
    // Aug: skipped (<5 entries)
    // Sep: income 40000 (5+ entries)
    // Oct: income 25000
    // Nov current ignored
    const mk = (ym, income, nExtra) => {
      const ents = [{id: ym + 'i', type: 'i', cat: 'salary', amt: income, date: ym + '-05', acc: 'main'}];
      for(let i = 0; i < nExtra; i++) ents.push({id: ym + 'e' + i, type: 'e', cat: 'cafe', amt: 10, date: ym + '-' + String(10 + i).padStart(2, '0'), acc: 'main'});
      return ents;
    };
    S.entries = [].concat(mk('2026-08', 90000, 2), mk('2026-09', 40000, 5), mk('2026-10', 25000, 5));
    PI_C = null;
    return {ii: irregInc(), v: dayLimit(), src: planInfo().src, c: planInfo().c};
  });
  // Independent: poorest of Sep 40000 / Oct 25000 = 25000; save 10% = 2500; rare 0
  // free = 25000 - 0 - 2500 - 0 = 22500; 22500/30.4 = 740.131 → floor 50 = 700
  expect(r.ii).toBe(25000);
  expect(r.src).toBe('irreg');
  expect(r.c.inc).toBe(25000);
  expect(r.c.save).toBe(2500);
  expect(r.v).toBe(700);
});

test('A51 irreg with no qualifying history keeps base / yields 0 carefully', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = true; S.dayLimit = 1800; S.planCalc = null;
    S.accounts = [{id: 'main', type: 'main', start: 1000}]; S.entries = []; S.incomes = []; S.pct = [];
    PI_C = null;
    const manual = {v: dayLimit(), src: planInfo().src, ii: irregInc()};
    S.dayLimit = undefined; S.planCalc = {inc: 30000, fixed: 5000, save: 0, irr: 0};
    PI_C = null;
    const calcNoHist = {v: dayLimit(), src: planInfo().src, ii: irregInc()};
    return {manual, calcNoHist};
  });
  // Independent: manual dayLimit is sticky under irreg; ii=0
  expect(r.manual).toEqual({v: 1800, src: 'manual', ii: 0});
  // No irreg months → ii=0 → planInfo0 returns base calc plan
  // calc: (30000-5000)/30.4 = 822.368 → 800
  expect(r.calcNoHist.ii).toBe(0);
  expect(r.calcNoHist.src).toBe('calc');
  expect(r.calcNoHist.v).toBe(800);
});

/* ---------- 7. Payroll calendar shifts ---------- */

test('A60 payday holiday shifts earlier within month and across year for Jan-1', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false;
    return {
      dec5: payDateIn('2026-12', 5),   // Sat → Fri Dec 4
      dec20: payDateIn('2026-12', 20), // Sun → Fri Dec 18
      jan1: payDateIn('2027-01', 1),   // New Year holidays → prior workday in Dec
      jan1raw: payDate('2027-01', 1),
      workJan1: isWorkday('2027-01-01'),
      workPay: isWorkday(payDateIn('2027-01', 1)),
      workDec4: isWorkday('2026-12-04')
    };
  });
  expect(r.dec5).toBe('2026-12-04');
  expect(r.dec20).toBe('2026-12-18');
  expect(r.workDec4).toBe(true);
  expect(r.jan1).toBe(r.jan1raw);
  expect(r.jan1).toBe('2026-12-30');
  expect(r.workPay).toBe(true);
  expect(r.workJan1).toBe(false);
});

/* ---------- 8. FX accounts ---------- */

test('A70 FX balance converts with manual rate; spend reduces native then free', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000; S.cur = 'RUB';
    S.mrate = {USD: 90};
    S.accounts = [
      {id: 'main', type: 'main', start: 10000},
      {id: 'usd', type: 'other', live: true, planSpend: true, cur: 'USD', start: 100}
    ];
    S.entries = [];
    const before = {free: balance(), usdN: accBalN(accById('usd')), usdR: accBal(accById('usd'))};
    S.entries.push({id: 'e', type: 'e', acc: 'usd', cat: 'cafe', amt: 1800, ca: 20, date: T}); // 20$ at 90
    const after = {free: balance(), usdN: accBalN(accById('usd')), day: dayNet(T).v};
    return {before, after, rate: rateOf('USD')};
  });
  // Independent: before free = 10000 + 100*90 = 19000
  expect(r.rate).toBe(90);
  expect(r.before).toEqual({free: 19000, usdN: 100, usdR: 9000});
  // after: usd 80$, free = 10000 + 80*90 = 17200; life spend in base = 1800
  expect(r.after).toEqual({free: 17200, usdN: 80, day: 1800});
});

/* ---------- 9. Prediction ---------- */

test('A80 fcCalc leftover = avail - pace*daysLeft - planned weekday spends', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-20'; // Friday
    S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000;
    S.payDays = [25];
    S.accounts = [{id: 'main', type: 'main', start: 20000}];
    S.fcPlans = [{id: 'p1', cat: 'prod', amt: 4000, wd: 1, half: false}]; // Mondays
    S.noSpend = [];
    // Seed 14 days of steady 1000/day life spend so pace is known
    S.entries = [];
    for(let i = 1; i <= 14; i++){
      const d = iso(addDays(parse(T), -i));
      S.entries.push({id: 'e' + i, type: 'e', acc: 'main', cat: 'cafe', amt: 1000, date: d});
    }
    S.incomes = [];
    const f = fcCalc();
    return f ? {nd: f.nd, dl: f.dl, avail: f.avail, pace: f.pace, pc: f.pc, left: f.left, bal: balance()} : null;
  });
  expect(r).not.toBeNull();
  // Independent: next pay Nov25; dl = diffDays(20,25)-1 = 4
  // Days j=1..4 from Fri20: Sat21, Sun22, Mon23, Tue24 → one Monday → pc = 4000
  // bal = 20000 - 14*1000 = 6000; avail = 6000; pace = 1000
  // left = 6000 - 1000*4 - 4000 = -2000
  expect(r.nd).toBe('2026-11-25');
  expect(r.dl).toBe(4);
  expect(r.bal).toBe(6000);
  expect(r.avail).toBe(6000);
  expect(r.pace).toBeCloseTo(1000, 5);
  expect(r.pc).toBe(4000);
  expect(r.left).toBeCloseTo(-2000, 5);
});

test('A81 irregular prediction runs out of cash by walking days', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = true; S.planCalc = null; S.dayLimit = 1000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = []; S.fcPlans = []; S.incomes = [];
    for(let i = 1; i <= 10; i++){
      S.entries.push({id: 'e' + i, type: 'e', acc: 'main', cat: 'cafe', amt: 500, date: iso(addDays(parse(T), -i))});
    }
    const run = fcRun(500);
    return {days: run.days, date: run.date, bal: balance()};
  });
  // Independent: free = 10000 - 10*500 = 5000; pace 500/day
  // fcRun subtracts until m<0: after 10 days m=0, day 11 m=-500 → days:10
  expect(r.bal).toBe(5000);
  expect(r.days).toBe(10);
});

/* ---------- 10. Negative balance, large amounts, month boundary ---------- */

test('A90 negative free money and large amounts stay numerically stable', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: -2500}];
    S.entries = [{id: 'e', type: 'e', amt: 100, date: T, acc: 'main', cat: 'cafe'}];
    const neg = {bal: balance(), day: dayNet(T).v};
    S.accounts = [{id: 'main', type: 'main', start: 1e12}];
    S.entries = [
      {id: 'e1', type: 'e', amt: 123456789.12, date: T, acc: 'main', cat: 'tech'},
      {id: 'r1', type: 'i', cat: 'refund', amt: 23456789.12, date: T, acc: 'main', for: 'e1'}
    ];
    const big = {bal: balance(), day: dayNet(T).v};
    return {neg, big};
  });
  expect(r.neg).toEqual({bal: -2600, day: 100});
  // Independent: 1e12 - 123456789.12 + 23456789.12 = 1e12 - 100000000 = 999900000000
  expect(r.big.day).toBeCloseTo(100000000, 2);
  expect(r.big.bal).toBeCloseTo(1e12 - 100000000, 2);
});

test('A91 Dec→Jan month change: envelopes and month nets isolated', async ({page}) => {
  const r = await probe(page, () => {
    T = '2027-01-05'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 1000;
    S.planDayHistory = {};
    for(let d = 1; d <= 31; d++) S.planDayHistory['2026-12-' + String(d).padStart(2, '0')] = 1000;
    for(let d = 1; d <= 4; d++) S.planDayHistory['2027-01-' + String(d).padStart(2, '0')] = 1200;
    S.accounts = [{id: 'main', type: 'main', start: 50000}];
    S.entries = [
      {id: 'd1', type: 'e', amt: 800, date: '2026-12-31', acc: 'main', cat: 'cafe'},
      {id: 'j1', type: 'e', amt: 300, date: '2027-01-02', acc: 'main', cat: 'cafe'},
      {id: 'j2', type: 'e', amt: 500, date: T, acc: 'main', cat: 'prod'}
    ];
    return {
      decEnv: monthEnvelope('2026-12'),
      janEnv: monthEnvelope('2027-01'),
      decNet: lifeNet(monthEntries('2026-12')),
      janNet: lifeNet(monthEntries('2027-01')),
      bal: balance()
    };
  });
  // Independent: Dec envelope 31*1000; Jan: hist 1-4 =1200, day5+ future live dayLimit 1000 → 4*1200 + 27*1000
  expect(r.decEnv).toBe(31000);
  expect(r.janEnv).toBe(4 * 1200 + 27 * 1000);
  expect(r.decNet).toBe(800);
  expect(r.janNet).toBe(800);
  expect(r.bal).toBe(50000 - 800 - 300 - 500);
});

/* ---------- 11. Sync merge & backup restore shape ---------- */

test('A100 merge3 unions planDayHistory from devices; restore JSON round-trip fields', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25';
    const base = {planDayHistory: {'2026-11-20': 1000}, dayLimit: 1000, entries: [], accounts: [{id: 'main', type: 'main', start: 1}]};
    const local = {planDayHistory: {'2026-11-20': 1000, '2026-11-21': 1100}, dayLimit: 1200, entries: [{id: 'a', type: 'e', amt: 1, date: T, acc: 'main', cat: 'cafe'}], accounts: [{id: 'main', type: 'main', start: 1}]};
    const remote = {planDayHistory: {'2026-11-20': 1000, '2026-11-22': 1300}, dayLimit: 1000, entries: [{id: 'b', type: 'e', amt: 2, date: T, acc: 'main', cat: 'prod'}], accounts: [{id: 'main', type: 'main', start: 1}]};
    const m = merge3(base, local, remote);
    // Backup pack/unpack
    S.demo = false; S.simple = true; S.dayLimit = 1500; S.planCalc = null; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 7777}];
    S.entries = [{id: 'x', type: 'e', amt: 50, date: T, acc: 'main', cat: 'cafe'}];
    S.planDayHistory = {'2026-11-24': 1500};
    const packed = JSON.parse(JSON.stringify({data: {entries: S.entries, accounts: S.accounts, dayLimit: S.dayLimit, planDayHistory: S.planDayHistory}}));
    const unpacked = planHistUnpack(packed);
    return {
      hist: m.planDayHistory,
      unpackDays: unpacked && unpacked.planDayHistory,
      unpackBalStart: unpacked && unpacked.accounts[0].start,
      unpackEntry: unpacked && unpacked.entries[0].amt
    };
  });
  expect(r.hist).toEqual({'2026-11-20': 1000, '2026-11-21': 1100, '2026-11-22': 1300});
  expect(r.unpackDays).toEqual({'2026-11-24': 1500});
  expect(r.unpackBalStart).toBe(7777);
  expect(r.unpackEntry).toBe(50);
});

/* ---------- 12. Combinations ---------- */

test('A110 combo: irreg + FX live card + partial refund + backdated delete', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = true; S.dayLimit = undefined; S.planCalc = null;
    S.cur = 'RUB'; S.mrate = {EUR: 100}; S.pct = []; S.rare = [];
    S.accounts = [
      {id: 'main', type: 'main', start: 20000},
      {id: 'eur', type: 'other', live: true, planSpend: true, cur: 'EUR', start: 50}
    ];
    S.entries = [];
    // September: income 50000 + 5 small spends (≥5 entries)
    S.entries.push({id: 'si', type: 'i', cat: 'salary', amt: 50000, date: '2026-09-05', acc: 'main'});
    for(let i = 1; i <= 5; i++) S.entries.push({id: 'se' + i, type: 'e', cat: 'cafe', amt: 50, date: '2026-09-' + String(10 + i).padStart(2, '0'), acc: 'main'});
    // October: income 30000 + 5 small spends (poorest)
    S.entries.push({id: 'oi', type: 'i', cat: 'salary', amt: 30000, date: '2026-10-05', acc: 'main'});
    for(let i = 1; i <= 5; i++) S.entries.push({id: 'oe' + i, type: 'e', cat: 'cafe', amt: 100, date: '2026-10-' + String(10 + i).padStart(2, '0'), acc: 'main'});
    S.entries.push({id: 'buy', type: 'e', amt: 5000, ca: 50, split: 2000, date: '2026-11-10', acc: 'eur', cat: 'tech'});
    S.entries.push({id: 'ref', type: 'i', cat: 'refund', amt: 1000, date: '2026-11-12', acc: 'main', for: 'buy'});
    PI_C = null;
    const mid = {
      ii: irregInc(), lim: dayLimit(),
      day10: dayNet('2026-11-10').v,
      free: balance(),
      eur: accBalN(accById('eur'))
    };
    S.entries = S.entries.filter(x => x.id !== 'buy');
    const afterDel = {
      day10: dayNet('2026-11-10').v,
      free: balance(),
      eur: accBalN(accById('eur')),
      orphanDay: dayNet('2026-11-12').v
    };
    return {mid, afterDel};
  });
  // Independent irreg: Sep 50000, Oct 30000 → ii=30000; 30000/30.4 = 986.84 → floor 50 = 950
  expect(r.mid.ii).toBe(30000);
  expect(r.mid.lim).toBe(950);
  // buy 50€ booked as 5000₽, split 2000, refund 1000 → net = 5000-1000-1000 = 3000
  expect(r.mid.day10).toBe(3000);
  expect(r.mid.eur).toBe(0);
  // free: 20000+50*100 +50000 -5*50 +30000 -5*100 -5000 +1000 = 20000+5000+50000-250+30000-500-5000+1000 = 100250
  expect(r.mid.free).toBe(100250);
  expect(r.afterDel.eur).toBe(50);
  expect(r.afterDel.day10).toBe(0);
  expect(r.afterDel.orphanDay).toBeGreaterThanOrEqual(0);
  // After delete buy: +5000₽ equiv back on EUR (50€*100) and orphan refund still on main → free +5000 vs mid? mid had eur 0 (= -5000 from start 50€), after eur 50
  expect(r.afterDel.free).toBe(r.mid.free + 5000);
});

test('A111 combo: full mode mandatory payment + rare + debt transfer + prediction due', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-20';
    S.demo = false; S.simple = false; S.irreg = false;
    S.accounts = [
      {id: 'main', type: 'main', start: 40000},
      {id: 'save', type: 'save', start: 5000},
      {id: 'debt', type: 'debt', start: -20000}
    ];
    S.incomes = [{id: 'sal', day: 25, amt: 80000}];
    S.rules = [{id: 'sv', day: 25, acc: 'save', amt: 15000}];
    S.recur = [{id: 'rent', name: 'Rent', amt: 25000, day: 1, acc: ''}];
    S.rare = [{id: 'vac', cat: 'trip', name: 'Vacation', amt: 120000}];
    S.entries = [
      {id: 'inc', type: 'i', iid: 'sal', amt: 80000, date: '2026-10-25', acc: 'main', cat: 'salary'},
      {id: 'al', type: 't', from: 'main', to: 'save', amt: 15000, date: '2026-10-25', rule: 'sv'},
      {id: 'rent', type: 'e', amt: 25000, date: '2026-11-01', acc: 'main', cat: 'rent', rid: 'rent'},
      {id: 'debtpay', type: 't', from: 'main', to: 'debt', amt: 5000, date: '2026-11-05'},
      {id: 'food', type: 'e', amt: 3000, date: '2026-11-18', acc: 'main', cat: 'cafe'}
    ];
    S.fcPlans = [];
    for(let i = 1; i <= 10; i++){
      S.entries.push({id: 'pace' + i, type: 'e', amt: 800, date: iso(addDays(parse(T), -i)), acc: 'main', cat: 'prod'});
    }
    PI_C = null;
    const cp = cycleDayPlan();
    const f = fcCalc();
    return {
      free: balance(),
      debt: accBalN(accById('debt')),
      save: accBalN(accById('save')),
      lifeM: lifeNet(monthEntries('2026-11')),
      cycleV: cp && cp.v,
      cycleFree: cp && cp.free,
      cycleRare: cp && cp.rare,
      fcDue: f && f.due,
      fcInc: f && f.inc,
      fcNd: f && f.nd,
      fcAvail: f && f.avail,
      foodInLife: life(S.entries).some(x => x.id === 'food'),
      rentInLife: life(S.entries).some(x => x.id === 'rent')
    };
  });
  expect(r.rentInLife).toBe(false);
  expect(r.foodInLife).toBe(true);
  expect(r.debt).toBe(-15000);
  expect(r.save).toBe(20000);
  // free: 40000+80000-15000-25000-5000-3000-8000 = 64000
  expect(r.free).toBe(64000);
  expect(r.fcNd).toBe('2026-11-25');
  // Independent: save rule ON the payday is excluded from pre-payday due; boundary income not in inc
  expect(r.fcDue).toBe(0);
  expect(r.fcInc).toBe(0);
  expect(r.fcAvail).toBe(r.free); // leftover of current free money until payday, not post-salary
  // Rare reserve in cycle: 120000/12=10000/mo; days Oct25→Nov25 = 31
  expect(r.cycleRare).toBeCloseTo(10000 * 31 / 30.4, 5);
});
