const { test, expect } = require('@playwright/test');

test('cycle plan includes leftover, ignores ordinary purchases and reserves allocation once', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(() => {
    T = '2026-11-25';
    S.accounts = [{id:'main', type:'main',start:7000.16},{id:'save',type:'save',start:0}];
    S.incomes = [{id:'salary',day:25,amt:55000},{id:'next',day:10,amt:57000},{id:'small',day:5,amt:2000}];
    S.rules = [{id:'r',day:25,acc:'save',amt:31995},{id:'smallRule',day:5,acc:'save',amt:2000}];
    S.entries = [{id:'income',type:'i',iid:'salary',date:T,amt:51678,acc:'main',cat:'salary'}];
    let pending = [
      {date:'2026-11-25',kind:'out',rule:1,amt:31995},
      {date:'2026-12-04',kind:'in',amt:2000},
      {date:'2026-12-04',kind:'out',rule:1,amt:2000},
      {date:'2026-12-10',kind:'in',amt:57000}
    ];
    plannedItems = () => pending;
    const read = () => cycleDayPlan();
    const before = read();
    S.entries.push({id:'buy',type:'e',date:T,amt:3000,acc:'main',cat:'prod'});
    const afterPurchase = read();
    S.entries.push({id:'alloc',type:'t',date:T,amt:31995,from:'main',to:'save',rule:'r'});
    pending = pending.slice(1);
    const afterAllocation = read();
    S.entries.push({id:'manual',type:'t',date:T,amt:7000,from:'main',to:'save'});
    const afterSaving = read();
    S.entries.push({id:'back',type:'t',date:T,amt:3000,from:'save',to:'main'});
    const afterReturn = read();
    T = '2026-12-04';
    S.entries.push({id:'minor',type:'i',date:T,amt:2000,acc:'main',iid:'small',cat:'salary'});
    S.entries.push({id:'minorAlloc',type:'t',date:T,amt:2000,from:'main',to:'save',rule:'smallRule'});
    pending = pending.slice(2);
    const afterMinor = read();
    return {before, afterPurchase, afterAllocation, afterSaving, afterReturn, afterMinor};
  });
  expect(result.before.days).toBe(15);
  expect(result.before.free).toBeCloseTo(26683.16, 2);
  expect(result.afterPurchase.v).toBeCloseTo(result.before.v, 8);
  expect(result.afterAllocation.v).toBeCloseTo(result.before.v, 8);
  expect(result.afterSaving.v).toBeCloseTo(19683.16 / 15, 8);
  expect(result.afterReturn.v).toBeCloseTo(22683.16 / 15, 8);
  expect(result.afterMinor.v).toBeCloseTo(result.afterReturn.v, 8);
  expect(result.afterMinor.start).toBe('2026-11-25');
});

test('saving before salary excludes old balance from cycle plan', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(() => {
    T = '2026-11-25';
    S.accounts = [{id:'main',type:'main',start:7000.16},{id:'save',type:'save',start:0}];
    S.incomes = [{id:'salary',day:25,amt:55000},{id:'next',day:10,amt:57000}];
    S.rules = [{id:'r',day:25,acc:'save',amt:31995}];
    S.entries = [
      {id:'old',type:'t',date:'2026-11-24',amt:7000.16,from:'main',to:'save'},
      {id:'income',type:'i',iid:'salary',date:T,amt:51678,acc:'main',cat:'salary'}
    ];
    plannedItems = () => [{date:T,kind:'out',rule:1,amt:31995},{date:'2026-12-10',kind:'in',amt:57000}];
    return cycleDayPlan();
  });
  expect(result.days).toBe(15);
  expect(result.free).toBeCloseTo(19683, 2);
  expect(result.v).toBeCloseTo(1312.2, 2);
});
