/**
 * Confirmed financial-core defects found by independent audit on main@158693b.
 * Each case uses test.fail: red while the bug lives; turns into unexpected-pass when fixed.
 * Expectations are product/README-level, not copies of the buggy formula.
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

test.fail('D1 payDateIn keeps Jan-1 salary on a New Year holiday (README: prior workday)', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = false; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.incomes = [{id: 'sal', day: 1, amt: 50000, name: 'Salary'}];
    S.rules = []; S.recur = []; S.entries = [];
    const d = itemDate('i', incomeRows('2027-01')[0], '2027-01');
    return {d, work: isWorkday(d), cal: incomeCalendarMonth('2027-01')};
  });
  // Expected: nearest prior workday (e.g. 2026-12-30) — never a holiday
  expect(r.work).toBe(true);
  expect(r.d).not.toBe('2027-01-01');
});

test.fail('D2 payDays fallback vs income day=1 disagree for January holidays', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-12-28'; S.demo = false; S.simple = true; S.irreg = false;
    S.accounts = [{id: 'main', type: 'main', start: 1}]; S.entries = [];
    S.incomes = []; S.payDays = [1];
    const fallback = {jan: incomeCalendarMonth('2027-01'), dec: incomeCalendarMonth('2026-12')};
    S.incomes = [{id: 'sal', day: 1, amt: 50000}];
    const withIncome = {jan: incomeCalendarMonth('2027-01'), dec: incomeCalendarMonth('2026-12')};
    return {fallback, withIncome};
  });
  // Expected: both scheduling paths yield the same workday payday set for "1st"
  expect(r.fallback.jan).toEqual(r.withIncome.jan);
  expect(r.fallback.dec).toEqual(r.withIncome.dec);
});

test.fail('D3 prediction pace should match life-net days (pending «Делю с кем-то»)', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000; S.payDays = [10];
    S.accounts = [{id: 'main', type: 'main', start: 50000}]; S.fcPlans = []; S.noSpend = []; S.incomes = []; S.entries = [];
    for(let i = 1; i <= 14; i++){
      const d = iso(addDays(parse(T), -i));
      if(i === 3) S.entries.push({id: 'split', type: 'e', acc: 'main', cat: 'cafe', amt: 2000, split: 1000, date: d});
      else S.entries.push({id: 'e' + i, type: 'e', acc: 'main', cat: 'cafe', amt: 1000, date: d});
    }
    let sum = 0; for(let i = 1; i <= 14; i++) sum += dayNet(iso(addDays(parse(T), -i))).v;
    return {pace: fcPace().pace, lifeAvg: sum / 14};
  });
  // Home/history show life-net 1000/day; prediction «обычные траты» should not silently use gross 1071
  expect(r.pace).toBeCloseTo(r.lifeAvg, 5);
});

test.fail('D4 deleting a fully refunded expense must not inflate free money', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.planCalc = null; S.dayLimit = 2000;
    S.accounts = [{id: 'main', type: 'main', start: 10000}];
    S.entries = [
      {id: 'a', type: 'e', amt: 2000, date: '2026-11-10', acc: 'main', cat: 'cafe'},
      {id: 'r', type: 'i', cat: 'refund', amt: 2000, date: '2026-11-12', acc: 'main', for: 'a'}
    ];
    const before = balance();
    S.entries = S.entries.filter(x => x.id !== 'a');
    return {before, after: balance()};
  });
  // Wallet after purchase+full refund is still 10000; deleting the purchase alone must not create +2000
  expect(r.before).toBe(10000);
  expect(r.after).toBe(10000);
});
