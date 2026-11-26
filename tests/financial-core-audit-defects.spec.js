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
