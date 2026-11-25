const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__payAllSave = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__payAllSave());
}

test('A1: real scenario — day5→Dec4, forecast 2736 vs rules 1987, payAllSave skips cycle end',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0},{id:'save2',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000,name:'Зарплата'},
   {id:'next',day:10,amt:57000,name:'Аванс'},
   {id:'small',day:5,amt:2736,name:'Мелочь'} // прогноз по часам
  ];
  S.rules=[
   {id:'r25',day:25,acc:'save',amt:30000,name:'Копилка'},
   {id:'r5a',day:5,acc:'save',amt:1200,name:'Часть A'},
   {id:'r5b',day:5,acc:'save2',amt:787,name:'Часть B'} // фиксированная раскладка 1987
  ];
  S.recur=[];
  S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  const off=cycleDayPlan(),offPd=perDay();
  const leftOff=lifePayoutLeft(payDateIn('2026-12',5),plannedItems(T,40));
  S.payAllSave={5:'rules'};
  const on=cycleDayPlan(),onPd=perDay();
  const leftOn=lifePayoutLeft(payDateIn('2026-12',5),plannedItems(T,40));
  const fp=fullPlan();
  const fe=fcEnd();
  return {
   pay5:payDateIn('2026-12',5),pay10:payDateIn('2026-12',10),
   leftOff,leftOn,
   offNext:off.next,onNext:on.next,pdOff:offPd.nextIn,pdOn:onPd.nextIn,
   fe,fpSave:fp.save,rulesOnly:1987
  };
 });
 expect(r.pay5).toBe('2026-12-04');
 expect(r.leftOff).toBe(749); // 2736 − 1987 без флага
 expect(r.offNext).toBe(r.pay5);
 expect(r.pdOff).toBe(r.pay5);
 expect(r.leftOn).toBe(0);
 expect(r.onNext).toBe(r.pay10);
 expect(r.pdOn).toBe(r.pay10);
 expect(r.fe).toBe(r.pay10);
 // fullPlan: правила 30000+1987 + остаток 749
 expect(r.fpSave).toBe(30000+1987+749);
});

test('A2: without flag — leftover still ends cycle (compat / default off)',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:5000},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:2000}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  // нет S.payAllSave
  const cp=cycleDayPlan(),pd=perDay();
  return {pay5:payDateIn('2026-12',5),cpNext:cp.next,pdNext:pd.nextIn,flag:payAllSave(5)};
 });
 expect(r.flag).toBe(false);
 expect(r.cpNext).toBe(r.pay5);
 expect(r.pdNext).toBe(r.pay5);
});

test('A3: only marked payday is all-save; other payday unchanged',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000},
   {id:'small',day:5,amt:2736},
   {id:'mid',day:15,amt:4000}
  ];
  S.rules=[
   {id:'r5',day:5,acc:'save',amt:1987},
   {id:'r15',day:15,acc:'save',amt:1000},
   {id:'r25',day:25,acc:'save',amt:30000}
  ];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  S.payAllSave={5:'rules'};
  const left5=lifePayoutLeft(payDateIn('2026-12',5),plannedItems(T,40));
  const left15=lifePayoutLeft(payDateIn('2026-12',15),plannedItems(T,40));
  const cp=cycleDayPlan();
  return {left5,left15,pay15:payDateIn('2026-12',15),cpNext:cp.next};
 });
 expect(r.left5).toBe(0);
 expect(r.left15).toBe(3000); // 4000 − 1000, флаг только на 5-е
 expect(r.cpNext).toBe(r.pay15);
});

test('A4: due reserves remainder once — no double-count of rules',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2736},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:1987},{id:'r25',day:25,acc:'save',amt:30000}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  S.payAllSave={5:'rules'};
  const ev=plannedItems(T,40);
  const rulesDec=ev.filter(e=>e.rule&&e.payDay===5&&e.ym==='2026-12').reduce((a,e)=>a+e.amt,0);
  const extra=allSaveExtraDue(ev,payDateIn('2026-12',10),{10:1},{'2026-12':1});
  const pd=perDay();
  // сколько раз правило 5-го входит в due до границы 10-го: не должно удвоить extra
  return {rulesDec,extra,pdDue:pd.due,pdNext:pd.nextIn,pay10:payDateIn('2026-12',10)};
 });
 expect(r.rulesDec).toBe(1987);
 expect(r.extra).toBe(749);
 expect(r.pdNext).toBe(r.pay10);
 expect(r.pdDue).toBeGreaterThanOrEqual(1987+749);
});

test('A5: migrate strips prototype income.allSave; payAllSave map kept',async({page})=>{
 const r=await probe(page,()=>{
  const raw={
   accounts:[{id:'main',type:'main',start:0},{id:'save',type:'save',start:0}],
   entries:[],incomes:[{id:'i1',day:5,amt:1000,allSave:true,allSaveRest:'save'}],
   rules:[{id:'r',day:5,acc:'save',amt:500}],recur:[],skips:[],
   payAllSave:{5:'rules',99:'x',bad:null},simple:false
  };
  S=migrate(raw);T='2026-11-25';
  return {incomeFlag:'allSave' in S.incomes[0],map:S.payAllSave,on5:payAllSave(5),on99:payAllSave(99),rest:payAllSaveRest(5)};
 });
 expect(r.incomeFlag).toBe(false);
 expect(r.map).toEqual({5:'rules'});
 expect(r.on5).toBe(true);
 expect(r.on99).toBe(false);
 expect(r.rest).toBe('rules');
});

test('A6: remainder to specific account — rest mode stored',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0},{id:'fund',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2736},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:1987}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  setPayAllSave(5,true,'fund');
  const cp=cycleDayPlan();
  return {rest:payAllSaveRest(5),on:payAllSave(5),next:cp.next,pay10:payDateIn('2026-12',10),left:lifePayoutLeft(payDateIn('2026-12',5),plannedItems(T,40))};
 });
 expect(r.on).toBe(true);
 expect(r.rest).toBe('fund');
 expect(r.left).toBe(0);
 expect(r.next).toBe(r.pay10);
});
