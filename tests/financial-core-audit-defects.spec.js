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

test('D3 prediction uses personal share; cash pace and actual balance stay unchanged', async ({page}) => {
  const r = await probe(page, () => {
    T = '2026-11-25'; S.demo = false; S.simple = true; S.irreg = false; S.planCalc = null; S.dayLimit = 2000; S.payDays = [10];
    S.accounts = [{id: 'main', type: 'main', start: 50000}]; S.fcPlans = []; S.noSpend = []; S.incomes = []; S.entries = [];
    for(let i = 1; i <= 14; i++){
      const d = iso(addDays(parse(T), -i));
      if(i === 3) S.entries.push({id: 'split', type: 'e', acc: 'main', cat: 'cafe', amt: 2000, split: 1000, date: d});
      else S.entries.push({id: 'e' + i, type: 'e', acc: 'main', cat: 'cafe', amt: 1000, date: d});
    }
    let lifeSum = 0; for(let i = 1; i <= 14; i++) lifeSum += dayNet(iso(addDays(parse(T), -i))).v;
    const pace = fcPace().pace, f = fcCalc(), bal = balance();
    fcSheet();
    const sheet = document.querySelector('.sheet');
    const txt = sheet ? sheet.textContent : '';
    return {pace, predictedPace:f.pace, pending:f.pending, avail:f.avail, bal, left:f.left, days:f.dl, lifeAvg: lifeSum / 14, cashAvg: (13 * 1000 + 2000) / 14, hasRefundNote: /ожидаемые возвраты/i.test(txt)};
  });
  expect(r.pace).toBeCloseTo(r.cashAvg, 5);
  expect(r.predictedPace).toBeCloseTo(r.lifeAvg, 5);
  expect(r.pending).toBe(1000);
  expect(r.bal).toBe(35000);
  expect(r.avail).toBe(36000);
  expect(r.left).toBeCloseTo(36000-1000*r.days,5);
  expect(r.hasRefundNote).toBe(true);
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

test('D3a forecast stays stable as expected refunds arrive; balance stays factual',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.cur='RUB';S.payDays=[10];S.incomes=[];S.rare=[];S.noSpend=[];S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:50000}];S.entries=[];
  for(let i=1;i<=14;i++)S.entries.push({id:'e'+i,type:'e',acc:'main',cat:'cafe',amt:i===3?2000:1000,split:i===3?1000:0,date:iso(addDays(parse(T),-i))});
  const snap=()=>{const f=fcCalc();return {bal:balance(),pace:f.pace,pending:f.pending,avail:f.avail,left:f.left,days:f.dl,day:dayNet('2026-11-22').v}};
  const before=snap();
  S.entries.push({id:'r1',type:'i',cat:'refund',amt:400,date:T,acc:'main',for:'e3'});
  const partial=snap();
  S.entries.push({id:'r2',type:'i',cat:'refund',amt:600,date:T,acc:'main',for:'e3'});
  const full=snap();
  return {before,partial,full,zero:fcResultText(-1),positive:fcResultText(100),negative:fcResultText(-100)};
 });
 expect(r.before.bal).toBe(35000);
 expect(r.partial.bal).toBe(35400);
 expect(r.full.bal).toBe(36000);
 expect([r.before.pending,r.partial.pending,r.full.pending]).toEqual([1000,600,0]);
 for(const v of [r.before,r.partial,r.full]){
  expect(v.pace).toBe(1000);
  expect(v.day).toBe(1000);
  expect(v.avail).toBe(36000);
  expect(v.left).toBe(36000-1000*v.days);
 }
 expect(r.zero).toBe('примерно в ноль');
 expect(r.positive).toContain('останется');
 expect(r.negative).toContain('не хватит');
});

test('D3b grouped pending refund counted once; excluded and future purchases do not inflate available cash',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.payDays=[10];S.incomes=[];S.rare=[];S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:50000},{id:'save',type:'save',start:10000},{id:'closed',type:'other',live:true,archived:true,start:10000}];
  const e=(id,amt,split,extra)=>Object.assign({id,type:'e',amt,split,cat:'cafe',date:'2026-11-20',acc:'main'},extra||{});
  S.entries=[e('a',600,500,{grp:'g'}),e('b',400,0,{grp:'g'}),
   {id:'r',type:'i',cat:'refund',amt:200,date:T,acc:'main',for:'a'},
   e('old',1000,300,{date:'2026-10-01'}),e('future',1000,500,{date:'2026-11-26'}),
   e('skip',1000,500,{skip:true}),e('other',1000,500,{acc:'save'}),
   e('nobal',1000,500,{nobal:true}),e('closed',1000,500,{acc:'closed'}),
   e('hist',1000,500,{hist:true})];
  const f=fcCalc();
  return {pending:f.pending,avail:f.avail,bal:balance()};
 });
 expect(r.pending).toBeCloseTo(600,5);
 expect(r.avail).toBeCloseTo(r.bal+600,5);
});

test('D3c two forecast scenarios share available cash and plans; large purchases affect only second scenario',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.cur='RUB';S.payDays=[10];S.incomes=[];S.rare=[];S.noSpend=[];S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:50000}];S.entries=[];
  for(let i=1;i<=14;i++)S.entries.push({id:'e'+i,type:'e',acc:'main',cat:'cafe',amt:1000,date:iso(addDays(parse(T),-i))});
  S.entries.push({id:'gift',type:'e',acc:'main',cat:'gift',amt:2800,date:'2026-11-22'},{id:'tech',type:'e',acc:'main',cat:'tech',amt:7000,date:'2026-11-23'});
  const f=fcCalc(),bal=balance();sh={id:'fc',fc:1};fcSheet();
  const html=document.getElementById('ov').innerHTML;
  return {bal,avail:f.avail,usual:f.usualPace,withLarge:f.withLargePace,days:f.dl,usualLeft:f.usualLeft,withLargeLeft:f.withLargeLeft,oldPace:fcPace().pace,slider:sh.fcWhatIf,ui:html.includes('Без крупных покупок')&&html.includes('Если продолжишь делать крупные покупки')&&html.includes('fcstars')};
 });
 expect(r.bal).toBe(26200);
 expect(r.avail).toBe(r.bal);
 expect(r.usual).toBe(1000);
 expect(r.withLarge).toBe(1700);
 expect(r.oldPace).toBe(1200);
 expect(r.usualLeft).toBe(r.bal-1000*r.days);
 expect(r.withLargeLeft).toBe(r.bal-1700*r.days);
 expect(r.slider).toBe(1000);
 expect(r.ui).toBe(true);
});

test('D3d no large purchases gives equal predictions; planned groceries are not duplicated',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.cur='RUB';S.payDays=[10];S.incomes=[];S.rare=[];S.noSpend=[];S.fcPlans=[{id:'p',cat:'prod',amt:4000,wd:1,half:true}];
  S.accounts=[{id:'main',type:'main',start:50000}];S.entries=[];
  for(let i=1;i<=14;i++)S.entries.push({id:'e'+i,type:'e',acc:'main',cat:'cafe',amt:500,date:iso(addDays(parse(T),-i))});
  S.entries.push({id:'food',type:'e',acc:'main',cat:'prod',amt:4000,date:'2026-11-23'});
  const f=fcCalc();return {pace:f.usualPace,withLarge:f.withLargePace,pc:f.pc,left:f.usualLeft,other:f.withLargeLeft,avail:f.avail,days:f.dl};
 });
 expect(r.pace).toBe(500);
 expect(r.withLarge).toBe(500);
 expect(r.pc).toBe(4000);
 expect(r.left).toBe(r.avail-500*r.days-4000);
 expect(r.other).toBe(r.left);
});
