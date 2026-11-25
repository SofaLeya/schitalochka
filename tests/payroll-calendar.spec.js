const { test, expect } = require('@playwright/test');

async function probe(page, scenario) {
  await page.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort());
  await page.route(/\/index\.html(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const html = await response.text();
    const marker = '})();\n/* Новая версия на сайте:';
    if (!html.includes(marker)) throw new Error('Payroll probe insertion point not found');
    const hook = 'window.__payrollProbe = ' + scenario.toString() + ';\n';
    await route.fulfill({ response, body: html.replace(marker, hook + marker) });
  });
  await page.goto('/index.html');
  return page.evaluate(() => window.__payrollProbe());
}
test('payroll forecast: full salary by days, part time by hours and holiday shifts', async ({ page }) => {
  const x = await probe(page, () => {
    T='2026-11-25';
    S.rucal={};
    const a={id:'a',day:25,amt:57420,payroll:{gross:132000,tax:13,mode:'days',days:[1,2,3,4,5],hours:8,part:'first'}};
    const b={id:'b',day:20,amt:1977,payroll:{gross:50000,tax:13,mode:'hours',days:[1,3],hours:2,part:'first'}};
    const second=r=>({...r, payroll:{...r.payroll,part:'second'}});
    const fixed={amt:1234};
    return {fullFirst:payrollExpected(a,'2026-11'),fullSecond:payrollExpected(second(a),'2026-12'),otpFirst:payrollExpected(b,'2026-11'),otpSecond:payrollExpected(second(b),'2026-12'),otpDecFirst:payrollExpected(b,'2026-12'),fixed:payrollExpected(fixed,'2026-11'),shift:payDateIn('2026-12',5),shift2:payDateIn('2026-12',20)};
  });
  expect(x).toEqual({fullFirst:51678,fullSecond:63162,otpFirst:1642,otpSecond:2736,otpDecFirst:1977,fixed:1234,shift:'2026-12-04',shift2:'2026-12-18'});
});
test('payroll forecast feeds upcoming events and actual income wins', async ({ page }) => {
  const x = await probe(page, () => {
    T='2026-11-25'; S.rucal={}; S.demo=false; S.entries=[]; S.rules=[]; S.recur=[];
    const a={id:'a',name:'salary',day:10,amt:57420,payroll:{gross:132000,tax:13,mode:'days',days:[1,2,3,4,5],hours:8,part:'second'}};
    S.incomes=[a];
    const future=plannedItems(T,30).find(e=>e.id==='a');
    const before=incomeFor(a,'2026-12');
    S.entries.push({id:'x',iid:'a',type:'i',date:'2026-12-10',amt:63000,cat:'salary'});
    return {future:future.amt,before,actual:incomeFor(a,'2026-12'),remaining:plannedItems(T,30).filter(e=>e.id==='a').length};
  });
  expect(x).toEqual({future:63162,before:63162,actual:63000,remaining:0});
});
