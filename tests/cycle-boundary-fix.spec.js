const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__cycleBound = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__cycleBound());
}

function baseFull(S,T){
 // helper inlined in scenarios — left for readability in comments only
}

test('C1: fully allocated Dec4 (day5→weekend) does not end cycle; next is Dec10',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000,name:'Зарплата'},
   {id:'next',day:10,amt:57000,name:'Аванс'},
   {id:'small',day:5,amt:2000,name:'Мелочь'}
  ];
  S.rules=[
   {id:'r25',day:25,acc:'save',amt:30000,name:'Копилка'},
   {id:'r5',day:5,acc:'save',amt:2000,name:'Мелочь в копилку'}
  ];
  S.recur=[];
  S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const cp=cycleDayPlan(),pd=perDay(),lim=dayLimit();
  const spent=Math.max(0,dayNet(T).v);
  const left=Math.max(0,Math.min(balance(),(pd.waitingToday?pd.val:lim>0?Math.min(lim,pd.val):pd.val)-spent));
  const tomorrow=pd.waitingToday?null:Math.max(0,Math.min(balance(),pd.val));
  return {
   pay5:payDateIn('2026-12',5),pay10:payDateIn('2026-12',10),
   cpNext:cp.next,pdNext:pd.nextIn,cpDays:cp.days,pdDays:pd.days,
   lim,pdVal:pd.val,left,tomorrow,bal:balance()
  };
 });
 expect(r.pay5).toBe('2026-12-04');
 expect(r.cpNext).toBe(r.pay10);
 expect(r.pdNext).toBe(r.pay10);
 expect(r.cpDays).toBe(r.pdDays);
 // План (cycle) и «Доступно в день» (perDay) на одной границе и при нулевых тратах совпадают
 expect(r.lim).toBeCloseTo(r.pdVal,6);
 expect(r.left).toBeCloseTo(Math.min(r.bal,r.lim),6);
 expect(r.tomorrow).toBeCloseTo(Math.min(r.bal,r.pdVal),6);
});

test('C2: scheduled income date ≠ rule payDateIn — full alloc still skips',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000},
   {id:'next',day:10,amt:57000},
   {id:'small',day:5,amt:2000,scheduled:'2026-12-05'}
  ];
  S.rules=[{id:'r5',day:5,acc:'save',amt:2000}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const cp=cycleDayPlan(),pd=perDay();
  return {ruleDate:payDateIn('2026-12',5),incomeDate:itemDate('i',incomeRows('2026-12').find(x=>x.id==='small'),'2026-12'),
   cpNext:cp.next,pdNext:pd.nextIn,pay10:payDateIn('2026-12',10)};
 });
 expect(r.ruleDate).toBe('2026-12-04');
 expect(r.incomeDate).toBe('2026-12-05');
 expect(r.cpNext).toBe(r.pay10);
 expect(r.pdNext).toBe(r.pay10);
});

test('C3: partial allocation on shifted day ends cycle there',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:5000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:2000}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const cp=cycleDayPlan(),pd=perDay();
  return {pay5:payDateIn('2026-12',5),cpNext:cp.next,pdNext:pd.nextIn};
 });
 expect(r.cpNext).toBe(r.pay5);
 expect(r.pdNext).toBe(r.pay5);
});

test('C4: over-reserved rules (sum > income) skip the day',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0},{id:'save2',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2000},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5a',day:5,acc:'save',amt:1500},{id:'r5b',day:5,acc:'save2',amt:1500}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const cp=cycleDayPlan(),pd=perDay();
  return {pay10:payDateIn('2026-12',10),cpNext:cp.next,pdNext:pd.nextIn};
 });
 expect(r.cpNext).toBe(r.pay10);
 expect(r.pdNext).toBe(r.pay10);
});

test('C5: inactive after-rule does not reserve — free payout starts new cycle',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-12-04';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[
   {id:'main',type:'main',start:10000},
   {id:'goal',type:'save',start:0,goal:100000},
   {id:'s2',type:'save',start:0}
  ];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2000},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'s2',amt:2000,after:'goal'}];
  S.recur=[];
  S.entries=[
   {id:'nov',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},
   {id:'sm',type:'i',iid:'small',date:'2026-12-04',amt:2000,acc:'main',cat:'salary'}
  ];
  const cp=cycleDayPlan();
  return {on:ruleOn(S.rules[0]),cap:ruleCap(S.rules[0]),start:cp&&cp.start,next:cp&&cp.next};
 });
 expect(r.on).toBe(false);
 expect(r.cap).toBe(0);
 expect(r.start).toBe('2026-12-04');
});

test('C6: coalesced holiday incomes — rules by payDay cover both',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  // 5→4, 6→4 декабря
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'a',day:5,amt:2000},{id:'b',day:6,amt:3000},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:2000},{id:'r6',day:6,acc:'save',amt:3000}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const cp=cycleDayPlan(),pd=perDay();
  return {pay5:payDateIn('2026-12',5),pay6:payDateIn('2026-12',6),pay10:payDateIn('2026-12',10),
   left:lifePayoutLeft('2026-12-04',plannedItems(T,40)),cpNext:cp.next,pdNext:pd.nextIn};
 });
 expect(r.pay5).toBe(r.pay6);
 expect(r.left).toBeLessThanOrEqual(0);
 expect(r.cpNext).toBe(r.pay10);
 expect(r.pdNext).toBe(r.pay10);
});

test('C7: ruleCap stop-at-goal — only remaining to goal reserves',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:9000,goal:10000}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:5000},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:5000,stop:true}]; // до цели осталось 1000
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const cap=ruleCap(S.rules[0]);
  const left=lifePayoutLeft(payDateIn('2026-12',5),plannedItems(T,40));
  const cp=cycleDayPlan(),pd=perDay();
  return {cap,left,pay5:payDateIn('2026-12',5),cpNext:cp.next,pdNext:pd.nextIn};
 });
 expect(r.cap).toBe(1000);
 expect(r.left).toBe(4000); // 5000 − 1000
 expect(r.cpNext).toBe(r.pay5);
 expect(r.pdNext).toBe(r.pay5);
});
