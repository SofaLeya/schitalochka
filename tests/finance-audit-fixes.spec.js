const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__fixProbe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__fixProbe());
}

test('P1: partial split refund does not double-subtract',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;S.incomes=[];S.rare=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:2000,split:800,date:T,acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:500,date:T,acc:'main',for:'a'}
  ];
  const LK=refLinks(),b=backOf(S.entries[0],LK);
  return {day:dayNet(T).v,net:netOf(S.entries[0],LK),back:b.back,pend:b.pend,cats:netByCat(S.entries),refunds:refunds(S.entries),bal:balance()};
 });
 // Independent: 2000 - 500 received - max(0, 800-500) remaining expect = 1200
 expect(r).toEqual({day:1200,net:1200,back:500,pend:300,cats:{cafe:1200},refunds:800,bal:8500});
});

test('P1: split only, then full repayment, then overpay clamp',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;S.incomes=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[{id:'a',type:'e',amt:2000,split:800,date:T,acc:'main',cat:'cafe'}];
  const pending=dayNet(T).v;
  S.entries.push({id:'r1',type:'i',cat:'refund',amt:800,date:T,acc:'main',for:'a'});
  const full=dayNet(T).v;
  S.entries.push({id:'r2',type:'i',cat:'refund',amt:100,date:T,acc:'main',for:'a'});
  const over=dayNet(T).v;
  return {pending,full,over,bal:balance()};
 });
 // 10000 - 2000 + 800 + 100 = 8900
 expect(r).toEqual({pending:1200,full:1200,over:1100,bal:8900});
});

test('P1: grouped cheque shares refund and remaining split',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:600,date:T,acc:'main',cat:'cafe',grp:'g1',note:'Чек',split:200},
   {id:'b',type:'e',amt:400,date:T,acc:'main',cat:'prod',grp:'g1',note:'Чек'},
   {id:'r',type:'i',cat:'refund',amt:100,date:T,acc:'main',for:'a'}
  ];
  const LK=refLinks();
  return {day:dayNet(T).v,netA:netOf(S.entries[0],LK),netB:netOf(S.entries[1],LK),pendA:backOf(S.entries[0],LK).pend,cats:netByCat(S.entries)};
 });
 // R=100 across 600/400 → a:60 back, b:40 back. P=200 → a:120 raw, b:80 raw.
 // pendA=max(0,120-60)=60, pendB=max(0,80-40)=40
 // netA=600-60-60=480, netB=400-40-40=320, day=800
 expect(r.day).toBe(800);
 expect(r.netA).toBeCloseTo(480,6);
 expect(r.netB).toBeCloseTo(320,6);
 expect(r.pendA).toBeCloseTo(60,6);
 expect(r.cats.cafe).toBeCloseTo(480,6);
 expect(r.cats.prod).toBeCloseTo(320,6);
});

test('P2: refund of rid payment increases cycle free cash',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:50000},{id:'next',day:10,amt:50000}];
  S.rules=[{id:'r',day:25,acc:'save',amt:10000}];
  S.recur=[{id:'sub',name:'Netflix',amt:500,day:1,acc:''}];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:T,amt:50000,acc:'main',cat:'salary'},
   {id:'alloc',type:'t',date:T,amt:10000,from:'main',to:'save',rule:'r'},
   {id:'pay',type:'e',date:T,amt:500,acc:'main',cat:'subs',rid:'sub',note:'Netflix'}
  ];
  plannedItems=()=>[{date:'2026-12-10',kind:'in',amt:50000}];
  const before=cycleDayPlan();
  S.entries.push({id:'ref',type:'i',cat:'refund',amt:500,date:T,acc:'main',for:'pay'});
  const after=cycleDayPlan();
  return {beforeFree:before.free,afterFree:after.free,bal:balance(),spent:cashPlanSpent(T,T),day:dayNet(T).v};
 });
 // Independent: before free = 20000+50000-10000-500 = 59500; after refund to free = 60000
 expect(r.beforeFree).toBe(59500);
 expect(r.afterFree).toBe(60000);
 expect(r.bal).toBe(60000);
 expect(r.spent).toBe(0);
 expect(r.day).toBe(0);
});

test('P2: refund of rare expense increases cycle free without double reserve',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;
  S.rare=[{id:'rare',cat:'tech',name:'Laptop',amt:120000}]; // 10000/mo
  S.accounts=[{id:'main',type:'main',start:100000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:50000},{id:'next',day:10,amt:50000}];
  S.rules=[];S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:T,amt:50000,acc:'main',cat:'salary'},
   {id:'buy',type:'e',date:T,amt:60000,acc:'main',cat:'tech',note:'Laptop'}
  ];
  plannedItems=()=>[{date:'2026-12-10',kind:'in',amt:50000}];
  const before=cycleDayPlan();
  S.entries.push({id:'ref',type:'i',cat:'refund',amt:10000,date:T,acc:'main',for:'buy',note:'Возврат: Laptop'});
  const after=cycleDayPlan();
  // days=15, rarePlan=10000*15/30.4, rarePaid before=60000 → reserve 0
  // after refund rarePaid=50000 still >> rarePlan → reserve 0
  // free before = bal 90000 + spent 0 - 0 = 90000
  // free after = bal 100000 = 100000
  return {beforeFree:before.free,afterFree:after.free,beforeRare:before.rare,afterRare:after.rare,days:before.days};
 });
 expect(r.days).toBe(15);
 expect(r.beforeRare).toBe(0);
 expect(r.afterRare).toBe(0);
 expect(r.beforeFree).toBe(90000);
 expect(r.afterFree).toBe(100000);
});

test('P3: rare reserved in cycle when not yet paid, and in planByIncome',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;
  S.rare=[{id:'rare',cat:'tech',name:'Phone',amt:120000}]; // 10000/mo
  S.accounts=[{id:'main',type:'main',start:50000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:60000},{id:'next',day:10,amt:60000}];
  S.rules=[{id:'r',day:25,acc:'save',amt:20000}];S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:T,amt:60000,acc:'main',cat:'salary'},
   {id:'alloc',type:'t',date:T,amt:20000,from:'main',to:'save',rule:'r'}
  ];
  plannedItems=()=>[{date:'2026-12-10',kind:'in',amt:60000}];
  const cp=cycleDayPlan();
  const byIncome=planByIncome();
  const fp=fullPlan();
  // bal=90000, spent=0, rarePlan=10000*15/30.4 ≈ 4934.21, free≈85065.79
  const rarePlan=10000*15/30.4;
  return {days:cp.days,rare:cp.rare,free:cp.free,v:cp.v,byIncome,fpIrr:fp.irr,expectedRare:rarePlan,expectedFree:90000-rarePlan};
 });
 expect(r.days).toBe(15);
 expect(r.fpIrr).toBe(10000);
 expect(r.rare).toBeCloseTo(r.expectedRare,6);
 expect(r.free).toBeCloseTo(r.expectedFree,6);
 expect(r.v).toBeCloseTo(r.expectedFree/15,6);
 // planByIncome считает оба поступления месяца: 60000+60000 - раскладка 20000 - rare 10000
 expect(r.byIncome).toBe(Math.floor((120000-20000-10000)/30.4/50)*50);
});

test('P4: balanceBefore uses FX native amounts',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.cur='RUB';S.mrate={USD:90};
  S.accounts=[{id:'main',type:'main',start:0},{id:'usd',type:'other',live:true,planSpend:true,cur:'USD',start:100}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:4500,date:T,acc:'usd',oc:'USD',oa:50,ca:50}];
  return {rate:rateOf('USD'),now:balance(),before:balanceBefore(T),balN:accBalN(accById('usd'))};
 });
 expect(r.rate).toBe(90);
 expect(r.balN).toBe(50);
 expect(r.now).toBe(4500);
 expect(r.before).toBe(9000); // 100 USD * 90
});

test('P5: orphan refund after expense delete does not make negative dayNet',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:2000,date:T,acc:'main',cat:'cafe'},
   {id:'r',type:'i',cat:'refund',amt:500,date:T,acc:'main',for:'a'}
  ];
  const withBoth={day:dayNet(T).v,bal:balance()};
  S.entries=S.entries.filter(x=>x.id!=='a');
  const orphan={day:dayNet(T).v,bal:balance(),linked:!!refLinks().linked.r,life:lifeNet(S.entries)};
  return {withBoth,orphan};
 });
 expect(r.withBoth).toEqual({day:1500,bal:8500});
 expect(r.orphan.bal).toBe(10500);
 expect(r.orphan.linked).toBe(false);
 expect(r.orphan.day).toBe(0);
 expect(r.orphan.life).toBe(0);
});

test('P5: unlinked refund of present rid expense does not create negative life spend',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.incomes=[{id:'i',day:10,amt:50000}];S.rules=[];S.recur=[{id:'sub',name:'Sub',amt:1000,day:1}];
  S.entries=[
   {id:'pay',type:'e',cat:'subs',amt:1000,date:T,acc:'main',rid:'sub'},
   {id:'ref',type:'i',cat:'refund',amt:1000,date:T,acc:'main'} // no for
  ];
  return {day:dayNet(T).v,life:lifeNet(S.entries),bal:balance()};
 });
 // rid excluded from life → в срезе нет life-трат, непривязанный возврат не уводит день в минус
 expect(r.bal).toBe(10000);
 expect(r.day).toBe(0);
 expect(r.life).toBe(0);
});

test('P6: explicit Возврат note links across months',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:3000,date:'2026-10-20',acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:1000,date:T,acc:'main',note:'Возврат: Ужин'}
  ];
  const LK=refLinks();
  return {linked:LK.linked.r,oct:dayNet('2026-10-20').v,nov:dayNet(T).v,life:lifeNet(S.entries)};
 });
 expect(r.linked).toBe('a');
 expect(r.oct).toBe(2000);
 expect(r.nov).toBe(0);
 expect(r.life).toBe(2000);
});

test('P6: bare note without Возврат prefix stays same-month only',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:3000,date:'2026-10-20',acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:1000,date:T,acc:'main',note:'Ужин'}
  ];
  return {linked:refLinks().linked.r||null,oct:dayNet('2026-10-20').v,nov:dayNet(T).v};
 });
 expect(r.linked).toBe(null);
 expect(r.oct).toBe(3000);
 expect(r.nov).toBe(0); // в ноябре нет life-трат в срезе — непривязанный возврат не даёт минус
});

test('P7: nobal does not reduce personal day budget but stays in history',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=1000;S.incomes=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[{id:'a',type:'e',amt:800,date:T,acc:'main',cat:'cafe',nobal:true}];
  const hist=histList();
  return {bal:balance(),day:dayNet(T).v,life:lifeNet(S.entries),inLife:life(S.entries).length,histHas:hist.indexOf('800')>=0||/800/.test(hist)};
 });
 expect(r).toEqual({bal:10000,day:0,life:0,inLife:0,histHas:true});
});

test('planSpend without live still counts in dayNet, not in free balance',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;S.incomes=[];
  S.accounts=[{id:'main',type:'main',start:10000},{id:'vtb',type:'other',start:1000,live:false,planSpend:true}];
  S.entries=[{id:'m',type:'e',cat:'trans',amt:300,date:T,acc:'vtb'}];
  return {bal:balance(),day:dayNet(T).v,cash:cashPlanSpent(T,T)};
 });
 expect(r).toEqual({bal:10000,day:300,cash:0});
});

test('sequence: purchase, split expect, partial refund, edit amount, delete refund',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];S.entries=[];
  const snap=()=>({bal:balance(),day:dayNet(T).v});
  S.entries.push({id:'a',type:'e',amt:2000,split:800,date:T,acc:'main',cat:'cafe'});
  const s1=snap();
  S.entries.push({id:'r',type:'i',cat:'refund',amt:500,date:T,acc:'main',for:'a'});
  const s2=snap();
  S.entries[0].amt=1800;S.entries[0].split=800;
  const s3=snap();
  S.entries=S.entries.filter(x=>x.id!=='r');
  const s4=snap();
  S.entries=[];
  return {s1,s2,s3,s4,empty:snap()};
 });
 expect(r.s1).toEqual({bal:8000,day:1200});
 expect(r.s2).toEqual({bal:8500,day:1200});
 // 1800 - 500 - max(0,800-500) = 1000
 expect(r.s3).toEqual({bal:8700,day:1000});
 expect(r.s4).toEqual({bal:8200,day:1000});
 expect(r.empty).toEqual({bal:10000,day:0});
});

test('review month spent matches lifeNet with partial split refund',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:2000,split:800,date:T,acc:'main',cat:'cafe'},
   {id:'r',type:'i',cat:'refund',amt:500,date:T,acc:'main',for:'a'}
  ];
  const me=monthEntries('2026-11');
  return {life:lifeNet(me),day:dayNet(T).v,cats:netByCat(me)};
 });
 expect(r.life).toBe(1200);
 expect(r.day).toBe(1200);
 expect(r.cats).toEqual({cafe:1200});
});
