/**
 * Regression tests for financial-core audit defects (fixed on this branch).
 * Expectations are product/README-level, not copies of buggy formulas.
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

test('D1 payDateIn shifts Jan-1 salary to prior workday across year boundary', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = false; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000, name: 'Salary'}];
    S.rules = []; S.recur = []; S.entries = [];
    const d = payDateIn('2027-01', 1);
    const periodRows = incomeRowsForPeriod('2027-01');
    const calDec = incomeCalendarMonth('2026-12');
    const calJan = incomeCalendarMonth('2027-01');
    return {
      d, work: isWorkday(d),
      periodScheduled: periodRows.map(x => x.scheduled),
      periodSourceYM: periodRows.map(x => x.sourceYM),
      calDec, calJan,
      next: nextPayDates(3, '2026-12-28')
    };
  });
  expect(r.work).toBe(true);
  expect(r.d).toBe('2026-12-30');
  expect(r.calDec).toContain('2026-12-30');
  expect(r.calJan).not.toContain('2027-01-01');
  expect(r.periodScheduled).toContain('2026-12-30');
  expect(r.periodSourceYM).toContain('2027-01');
  expect(r.next[0]).toBe('2026-12-30');
});

test('D2 payDays fallback and income day=1 agree for January holidays', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = true; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 1}]; S.entries = [];
    S.incomes = []; S.payDays = [1];
    const fallback = {jan: incomeCalendarMonth('2027-01'), dec: incomeCalendarMonth('2026-12')};
    S.incomes = [{id: 'sal', day: 1, amt: 50000}];
    const withIncome = {jan: incomeCalendarMonth('2027-01'), dec: incomeCalendarMonth('2026-12')};
    return {fallback, withIncome};
  });
  expect(r.fallback.jan).toEqual(r.withIncome.jan);
  expect(r.withIncome.dec).toContain('2026-12-30');
  expect(r.fallback.dec).toContain('2026-12-30');
  expect(r.fallback.jan).toEqual([]);
  expect(r.withIncome.jan).toEqual([]);
});

test('D1/D2 source.shift false keeps holiday payday; true shifts into prior month', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = false; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 1}]; S.entries = []; S.rules = []; S.recur = [];
    const base = {kind: 'other', freq: 'monthly', basis: 'payment', amount: 50000, net: true, tax: 0, start: '2026-01-01', dates: [1]};
    S.incomes = [{id: 'sal', name: 'Salary', day: 1, amt: 50000, source: Object.assign({}, base, {shift: false})}];
    const off = {jan: incomeCalendarMonth('2027-01'), dec: incomeCalendarMonth('2026-12'), rows: incomeRowsForPeriod('2027-01').map(x => x.scheduled)};
    S.incomes[0].source.shift = true;
    const on = {jan: incomeCalendarMonth('2027-01'), dec: incomeCalendarMonth('2026-12'), rows: incomeRowsForPeriod('2027-01').map(x => x.scheduled)};
    return {off, on};
  });
  expect(r.off.jan).toContain('2027-01-01');
  expect(r.off.dec).not.toContain('2026-12-30');
  expect(r.off.rows).toContain('2027-01-01');
  expect(r.on.dec).toContain('2026-12-30');
  expect(r.on.jan).not.toContain('2027-01-01');
  expect(r.on.rows).toContain('2026-12-30');
});

test('D1/D2 pendingPayouts includes next period shifted into current month', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-30'; S.demo = false; S.simple = false; S.irreg = false; S.planFrom = '2026-01-01';
    S.accounts = [{id: 'main', type: 'main', start: 20000}, {id: 'save', type: 'save', start: 0}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000}];
    S.rules = [{id: 'r1', day: 1, acc: 'save', amt: 10000, name: 'Копилка'}];
    S.recur = []; S.entries = []; S.skips = []; S.ruleZero = {};
    const pend = pendingPayouts();
    const jan = pend.filter(p => p.ym === '2027-01' && p.day === 1);
    return {dates: pend.map(p => p.date), jan: jan.map(p => ({ym: p.ym, date: p.date, sum: p.sum}))};
  });
  expect(r.jan.length).toBe(1);
  expect(r.jan[0].date).toBe('2026-12-30');
  expect(r.jan[0].sum).toBe(10000);
});

test('D1/D2 incomeReceived and doneFor do not credit one receipt to two periods', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-30'; S.demo = false; S.simple = false;
    S.accounts = [{id: 'main', type: 'main', start: 1}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000}];
    S.rules = []; S.recur = [];
    const janRow = incomeRowsForPeriod('2027-01').find(x => +x.day === 1);
    const decRow = incomeRows('2026-12').find(x => x.sourceYM === '2026-12' && +x.day === 1);
    S.entries = [{id: 'in1', type: 'i', amt: 50000, date: '2026-12-30', iid: 'sal', payYm: '2027-01', cat: 'salary'}];
    const bare = {id: 'in2', type: 'i', amt: 50000, date: '2026-12-30', iid: 'sal', cat: 'salary'};
    const withPayYm = {
      janGot: incomeReceived(janRow, '2027-01').reduce((a, x) => a + x.amt, 0),
      decGot: decRow ? incomeReceived(decRow, '2026-12').reduce((a, x) => a + x.amt, 0) : 0,
      doneJan: doneFor('iid', janRow.id, '2027-01') || incomeReceived(janRow, '2027-01').length > 0,
      doneDec: decRow ? (doneFor('iid', decRow.id, '2026-12') || incomeReceived(decRow, '2026-12').length > 0) : false
    };
    S.entries = [bare];
    const loose = {
      janGot: incomeReceived(janRow, '2027-01').reduce((a, x) => a + x.amt, 0),
      decGot: decRow ? incomeReceived(decRow, '2026-12').reduce((a, x) => a + x.amt, 0) : 0
    };
    return {janRow: !!janRow, decRow: !!decRow, sch: janRow && janRow.scheduled, withPayYm, loose};
  });
  expect(r.janRow).toBe(true);
  expect(r.sch).toBe('2026-12-30');
  expect(r.withPayYm.janGot).toBe(50000);
  expect(r.withPayYm.decGot).toBe(0);
  expect(r.withPayYm.doneJan).toBe(true);
  expect(r.withPayYm.doneDec).toBe(false);
  expect(r.loose.janGot).toBe(50000);
  expect(r.loose.decGot).toBe(0);
});

test('D1/D2 full flow: shift, receive, save rules, month flip without double credit', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-30'; S.demo = false; S.simple = false; S.irreg = false; S.planFrom = '2026-01-01';
    S.accounts = [{id: 'main', type: 'main', start: 20000}, {id: 'save', type: 'save', start: 0}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000, name: 'Зарплата'}];
    S.rules = [{id: 'r1', day: 1, acc: 'save', amt: 10000, name: 'Копилка'}];
    S.recur = []; S.entries = []; S.skips = []; S.ruleZero = {}; S.carry = [];
    const pay = payDateIn('2027-01', 1);
    const pendBefore = pendingPayouts().filter(p => p.ym === '2027-01');
    const janRow = incomeRowsForPeriod('2027-01').find(x => +x.day === 1);
    S.entries.push({id: 'in1', type: 'i', amt: 50000, date: pay, iid: 'sal', payYm: '2027-01', cat: 'salary'});
    S.entries.push({id: 't1', type: 't', amt: 10000, date: pay, payYm: '2027-01', rule: 'r1', from: 'main', to: 'save', note: 'Копилка · по плану'});
    const pendAfter = pendingPayouts().filter(p => p.ym === '2027-01');
    const plannedDec = plannedItems('2026-12-30', 5).filter(e => e.kind === 'in' && e.ym === '2027-01');
    const plannedJanEarly = plannedItems('2027-01-01', 5).filter(e => e.kind === 'in' && e.ym === '2027-01');
    T = '2027-01-05';
    const pendJan = pendingPayouts().filter(p => p.ym === '2027-01');
    const janRows = incomeRowsForPeriod('2027-01');
    const gotJan = janRows.reduce((a, row) => a + incomeReceived(row, '2027-01').reduce((s, x) => s + x.amt, 0), 0);
    const gotDec = incomeRows('2026-12').filter(x => x.sourceYM === '2026-12').reduce((a, row) => a + incomeReceived(row, '2026-12').reduce((s, x) => s + x.amt, 0), 0);
    const ruleAgain = ruleDone(S.rules[0], '2027-01');
    const plannedAfterFlip = plannedItems('2027-01-01', 10).filter(e => e.kind === 'in' && e.ym === '2027-01');
    return {
      pay, pendBefore: pendBefore.length, pendAfter: pendAfter.length, pendJan: pendJan.length,
      plannedDec: plannedDec.length, plannedJanEarly: plannedJanEarly.length, plannedAfterFlip: plannedAfterFlip.length,
      gotJan, gotDec, ruleAgain, saveBal: accBal(accById('save')), free: balance()
    };
  });
  expect(r.pay).toBe('2026-12-30');
  expect(r.pendBefore).toBe(1);
  expect(r.pendAfter).toBe(0);
  expect(r.pendJan).toBe(0);
  expect(r.plannedDec).toBe(0);
  expect(r.plannedJanEarly).toBe(0);
  expect(r.plannedAfterFlip).toBe(0);
  expect(r.gotJan).toBe(50000);
  expect(r.gotDec).toBe(0);
  expect(r.ruleAgain).toBe(true);
  expect(r.saveBal).toBe(10000);
  expect(r.free).toBe(60000); // 20000 start + 50000 income - 10000 to save
});

test('D3 prediction keeps cash pace; UI explains pending split refunds', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000; S.payDays = [10];
    S.accounts = [{id: 'main', type: 'main', start: 50000}]; S.fcPlans = []; S.noSpend = []; S.incomes = []; S.entries = [];
    for(let i = 1; i <= 14; i++){
      const d = iso(addDays(parse(T), -i));
      if(i === 3) S.entries.push({id: 'split', type: 'e', acc: 'main', cat: 'cafe', amt: 2000, split: 1000, date: d});
      else S.entries.push({id: 'e' + i, type: 'e', acc: 'main', cat: 'cafe', amt: 1000, date: d});
    }
    let lifeSum = 0; for(let i = 1; i <= 14; i++) lifeSum += dayNet(iso(addDays(parse(T), -i))).v;
    const pace = fcPace().pace;
    fcSheet();
    const sheet = document.querySelector('.sheet');
    const txt = sheet ? sheet.textContent : '';
    return {pace, lifeAvg: lifeSum / 14, cashAvg: (13 * 1000 + 2000) / 14, hasCashNote: /касс|полученн|ожидаем/i.test(txt)};
  });
  expect(r.pace).toBeCloseTo(r.cashAvg, 5);
  expect(r.pace).not.toBeCloseTo(r.lifeAvg, 5);
  expect(r.hasCashNote).toBe(true);
});

test('D4 delete purchase with refunds: delete-all keeps free money; keep-refunds is explicit', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [
      {id: 'a', type: 'e', amt: 2000, date: '2026-11-10', acc: 'main', cat: 'cafe'},
      {id: 'r', type: 'i', cat: 'refund', amt: 2000, date: '2026-11-12', acc: 'main', for: 'a'}
    ];
    const before = balance();
    const refs = linkedRefundsOf('a');
    const all = delBalancePreview(['a', 'r']);
    const only = delBalancePreview(['a']);
    S.entries = S.entries.filter(x => x.id !== 'a' && x.id !== 'r');
    const afterAll = balance();
    S.entries = [
      {id: 'a', type: 'e', amt: 2000, date: '2026-11-10', acc: 'main', cat: 'cafe'},
      {id: 'r', type: 'i', cat: 'refund', amt: 2000, date: '2026-11-12', acc: 'main', for: 'a'}
    ];
    S.entries = S.entries.filter(x => x.id !== 'a');
    const afterKeep = balance();
    return {before, refs: refs.length, all, only, afterAll, afterKeep, htmlHas: typeof delEntryConfirmHtml === 'function'};
  });
  expect(r.before).toBe(10000);
  expect(r.refs).toBe(1);
  expect(r.all.after).toBe(10000);
  expect(r.afterAll).toBe(10000);
  expect(r.only.after).toBe(12000);
  expect(r.afterKeep).toBe(12000);
  expect(r.htmlHas).toBe(true);
});
