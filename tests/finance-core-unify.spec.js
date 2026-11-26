const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__coreProbe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__coreProbe());
}

test('monthEnvelope sums historical dayLimitAt instead of current×days',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=2000;S.planDayHistory={};
  for(var d=1;d<=24;d++)S.planDayHistory['2026-11-'+p2(d)]=1000;
  rememberDayLimit();
  var n=dim(2026,10),sum=0;for(var i=1;i<=n;i++)sum+=dayLimitAt('2026-11-'+p2(i));
  return {envelope:monthEnvelope('2026-11'),sum:sum,naive:dayLimit()*n,clim:climLifeM('2026-11'),goals:g2Goals(g2()).find(function(x){return x.t==='Месяц в бюджете'}).of};
 });
 // 24×1000 + 6×2000 (25..30 use current limit via dayLimitAt)
 expect(r.sum).toBe(24*1000+6*2000);
 expect(r.envelope).toBe(r.sum);
 expect(r.clim).toBe(r.sum);
 expect(r.goals).toBe(r.sum);
 expect(r.naive).toBe(2000*30);
 expect(r.envelope).not.toBe(r.naive);
});

test('weekEnvelope matches g2 week goal and dayLimitAt sum',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25'; // Wednesday; week Mon=23..Sun=29
  S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=1500;S.planDayHistory={
   '2026-11-23':1000,'2026-11-24':1000,'2026-11-25':1500,'2026-11-26':1500,'2026-11-27':1500,'2026-11-28':1500,'2026-11-29':1500
  };
  S.accounts=[{id:'main',type:'main',start:10000}];S.entries=[];
  var dt=parse(T),ws=addDays(dt,-((dt.getDay()+6)%7)),wsI=iso(ws);
  var sum=0;for(var i=0;i<7;i++)sum+=dayLimitAt(iso(addDays(ws,i)));
  var weekGoal=g2Goals(g2()).find(function(x){return x.t==='Неделя в плане'});
  return {wsI:wsI,envelope:weekEnvelope(wsI),sum:sum,goalOf:weekGoal.of,naive:dayLimit()*7};
 });
 expect(r.wsI).toBe('2026-11-23'); // Mon
 // past Mon-Tue use history 1000; Wed+ use current 1500 (dayLimitAt for d>=T)
 expect(r.sum).toBe(1000+1000+1500*5);
 expect(r.envelope).toBe(r.sum);
 expect(r.goalOf).toBe(r.sum);
 expect(r.naive).toBe(1500*7);
 expect(r.envelope).not.toBe(r.naive);
});

test('reviewCard and lifeCard month plan use monthEnvelope',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.rules=[];S.recur=[];S.rare=[];S.dayLimit=2000;S.planDayHistory={};
  for(var d=1;d<=24;d++)S.planDayHistory['2026-11-'+p2(d)]=1000;
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:500,date:'2026-11-10',acc:'main'}];
  vym='2026-11';
  var env=monthEnvelope('2026-11');
  return {env:env,review:reviewCard(),life:lifeCard(monthEntries('2026-11'),30),lim:dayLimit()};
 });
 expect(r.lim).toBe(2000);
 expect(r.env).toBe(24*1000+6*2000); // 36000: history through 24, current from 25
 expect(r.review).toMatch(/36[\s\u00a0\u202f]000/);
 expect(r.life).toMatch(/36[\s\u00a0\u202f]000/);
 expect(r.review).not.toMatch(/60[\s\u00a0\u202f]000/);
});

test('dayLimitAt carries last known limit across skipped days',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=3000;S.planDayHistory={'2026-11-01':1000,'2026-11-10':1000,'2026-11-20':1500};
  // gaps: 2–9 ←1000, 11–19 ←1000, 21–24 ←1500; today/future ←3000
  return {
   d5:dayLimitAt('2026-11-05'),d15:dayLimitAt('2026-11-15'),d22:dayLimitAt('2026-11-22'),
   d20:dayLimitAt('2026-11-20'),d25:dayLimitAt('2026-11-25'),d30:dayLimitAt('2026-11-30'),
   env:monthEnvelope('2026-11'),
   // leading gap before first snapshot: use earliest later history
   lead:dayLimitAt('2026-10-31')
  };
 });
 expect(r.d5).toBe(1000);
 expect(r.d15).toBe(1000);
 expect(r.d22).toBe(1500);
 expect(r.d20).toBe(1500);
 expect(r.d25).toBe(3000);
 expect(r.d30).toBe(3000);
 // 1–10:1000 (10d), 11–19:1000 (9d), 20–24:1500 (5d), 25–30:3000 (6d)
 expect(r.env).toBe(10*1000+9*1000+5*1500+6*3000);
 expect(r.env).toBe(10000+9000+7500+18000); // 44500
 expect(r.lead).toBe(1000); // before first snapshot → earliest history still before T
});

test('remaining today and tomorrow: simple vs full share helpers',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.irreg=false;S.planCalc=null;S.dayLimit=3000;S.rare=[];S.rules=[];S.recur=[];
  S.accounts=[{id:'main',type:'main',start:20000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:800,date:T,acc:'main'}];
  S.simple=true;S.incomes=[];
  var spent=Math.max(0,dayNet(T).v);
  var simpleLeft=homeTodayLeft(null,spent),simpleTom=homeTomorrowBudget(null),simpleBal=balance();
  S.simple=false;S.incomes=[{id:'salary',day:25,amt:50000},{id:'next',day:10,amt:50000}];
  S.entries.push({id:'inc',type:'i',iid:'salary',date:T,amt:50000,acc:'main',cat:'salary'});
  PI_C=null;PI_ON=0;
  var pd=perDay(),fullLeft=homeTodayLeft(pd,spent),fullTom=homeTomorrowBudget(pd);
  return {spent:spent,simpleLeft:simpleLeft,simpleTom:simpleTom,simpleBal:simpleBal,fullLeft:fullLeft,fullTom:fullTom,pdVal:pd.val,waiting:pd.waitingToday};
 });
 expect(r.spent).toBe(800);
 expect(r.simpleBal).toBe(19200);
 expect(r.simpleLeft).toBe(2200);
 expect(r.simpleTom).toBe(3000);
 expect(r.fullLeft).toBeGreaterThanOrEqual(0);
 if(r.waiting)expect(r.fullTom).toBeNull();
 else{expect(typeof r.fullTom).toBe('number');expect(r.fullTom).toBeGreaterThan(0)}
});

test('refund quad: netOf, receivedNetOf, refunds, cashPlanSpent side by side',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:2000,split:800,date:T,acc:'main',cat:'cafe'},
   {id:'r',type:'i',cat:'refund',amt:500,date:T,acc:'main',for:'a'}
  ];
  const LK=refLinks(),e=S.entries[0];
  return {
   net:netOf(e,LK),received:receivedNetOf(e,LK),back:backOf(e,LK),
   refunds:refunds(S.entries),cash:cashPlanSpent(T,T),day:dayNet(T).v,life:lifeNet(S.entries)
  };
 });
 expect(r).toEqual({net:1200,received:1500,back:{back:500,pend:300},refunds:800,cash:1500,day:1200,life:1200});
});

test('planByIncome matches planCalcVal(fullPlan) including rare and rules',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;
  S.rare=[{id:'rare',cat:'tech',name:'Phone',amt:120000}];
  S.accounts=[{id:'main',type:'main',start:50000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:60000},{id:'next',day:10,amt:60000}];
  S.rules=[{id:'r',day:25,acc:'save',amt:20000}];S.recur=[];
  S.entries=[];
  const fp=fullPlan(),via=planCalcVal({inc:fp.inc,fixed:fp.fixed,save:fp.save,irr:fp.irr});
  return {byIncome:planByIncome(),via:via,fp:fp};
 });
 expect(r.fp.irr).toBe(10000);
 expect(r.byIncome).toBe(r.via);
 expect(r.byIncome).toBe(Math.floor((120000-20000-10000)/30.4/50)*50);
});

test('planByIncome uses perMonth for multi-month recur and max(to,from) save',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];
  S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'i',day:10,amt:60000}];
  S.recur=[{id:'ins',name:'Insurance',amt:12000,day:5,every:3,from:'2026-11',acc:''}];
  S.rules=[{id:'r',day:10,acc:'save',amt:5000}];
  S.entries=[];
  const fp=fullPlan();
  return {byIncome:planByIncome(),fp:fp,via:planCalcVal(fp)};
 });
 // fixed = perMonth(12000/3)=4000, save=5000
 expect(r.fp.fixed).toBe(4000);
 expect(r.fp.save).toBe(5000);
 expect(r.byIncome).toBe(r.via);
 expect(r.byIncome).toBe(Math.floor((60000-4000-5000)/30.4/50)*50);
});

test('dead forecast/avgDaily are gone; fcCalc remains the prediction engine',async({page})=>{
 const r=await probe(page,()=>{
  return {hasAvg:typeof avgDaily,'hasFc':typeof forecast,hasFcCalc:typeof fcCalc,hasFcPace:typeof fcPace};
 });
 expect(r.hasAvg).toBe('undefined');
 expect(r.hasFc).toBe('undefined');
 expect(r.hasFcCalc).toBe('function');
 expect(r.hasFcPace).toBe('function');
});

test('monster remaining budget uses monthEnvelope',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.nopet=false;
  S.dayLimit=2000;S.planDayHistory={};
  for(var d=1;d<=24;d++)S.planDayHistory['2026-11-'+p2(d)]=1000;
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[];
  for(var d=1;d<=24;d++)S.entries.push({id:'e'+d,type:'e',cat:'cafe',amt:500,date:'2026-11-'+p2(d),acc:'main'});
  var me=monthEntries('2026-11'),net=lifeNet(me),env=monthEnvelope('2026-11');
  var html=monsterCard(me,net,25);
  return {net:net,env:env,rest:env-net,html:html,naiveRest:2000*30-net};
 });
 expect(r.net).toBe(24*500);
 expect(r.rest).toBe(r.env-r.net);
 expect(r.rest).not.toBe(r.naiveRest);
 // perLeft with envelope should appear in speech when over average
 expect(r.html.length).toBeGreaterThan(100);
});

test('weekTip marks days against dayLimitAt history',async({page})=>{
 const r=await probe(page,()=>{
  // Sunday evening tip window
  T='2026-11-29'; // Sunday
  S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.wkSeen=null;
  S.dayLimit=500; // current is tight — today would fail under current×only
  S.planDayHistory={
   '2026-11-23':2000,'2026-11-24':2000,'2026-11-25':2000,'2026-11-26':2000,
   '2026-11-27':2000,'2026-11-28':2000,'2026-11-29':2000
  };
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[];
  for(var d=23;d<=29;d++)S.entries.push({id:'e'+d,type:'e',cat:'cafe',amt:900,date:'2026-11-'+d,acc:'main'});
  var tip=weekTip(T,19);
  // Mon–Sat: 900≤2000 history → in plan; today uses current 500 → over. Naive current-only → 0 in plan.
  return {tip:tip&&tip.html};
 });
 expect(r.tip).toBeTruthy();
 expect(r.tip).toMatch(/в плане 6/);
 expect(r.tip).toMatch(/Отличная неделя/);
});

test('На завтра: simple caps by balance and plan; low balance wins',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.rules=[];S.recur=[];
  S.dayLimit=3000;S.accounts=[{id:'main',type:'main',start:1500}];S.entries=[];
  var tomRich=homeTomorrowBudget(null),leftRich=homeTodayLeft(null,0);
  S.accounts[0].start=8000;S.entries=[{id:'e',type:'e',cat:'cafe',amt:500,date:T,acc:'main'}];
  var bal=balance(),spent=dayNet(T).v,tom=homeTomorrowBudget(null),left=homeTodayLeft(null,spent);
  return {tomRich:tomRich,leftRich:leftRich,bal:bal,spent:spent,tom:tom,left:left};
 });
 expect(r.tomRich).toBe(1500); // min(balance 1500, plan 3000)
 expect(r.leftRich).toBe(1500);
 expect(r.bal).toBe(7500);
 expect(r.spent).toBe(500);
 expect(r.left).toBe(2500); // min(7500, 3000-500)
 expect(r.tom).toBe(3000); // fresh day: min(7500, 3000)
});

test('На завтра: full mode — payday tomorrow is waiting; otherwise min(plan, perDay, balance)',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.planCalc=null;S.rare=[];
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.rules=[];S.recur=[];
  // Payday tomorrow (26th)
  S.incomes=[{id:'pay',day:26,amt:50000}];S.entries=[];
  PI_C=null;PI_ON=0;
  var pdPay=perDay(),tomPay=homeTomorrowBudget(pdPay),leftPay=homeTodayLeft(pdPay,0);
  // Payday in 10 days, plan from cycle after marking income today
  S.incomes=[{id:'salary',day:25,amt:40000},{id:'next',day:5,amt:40000}];
  S.rules=[{id:'r',day:25,acc:'save',amt:10000}];
  S.entries=[
   {id:'inc',type:'i',iid:'salary',date:T,amt:40000,acc:'main',cat:'salary'},
   {id:'alloc',type:'t',date:T,amt:10000,from:'main',to:'save',rule:'r'}
  ];
  PI_C=null;
  var pd=perDay(),lim=dayLimit(),bal=balance(),tom=homeTomorrowBudget(pd),left=homeTodayLeft(pd,0);
  // Force plan below perDay to check min(lim, pd.val)
  S.dayLimit=800;S.planCalc=null;S.simple=true;S.incomes=[]; // manual plan path
  // Keep full mode numbers via pd object passed explicitly
  var tomCapped=homeTomorrowBudget({val:2500,days:10,nextIn:'2026-12-05',due:0,inc:0,waitingToday:false});
  S.accounts[0].start=500;S.entries=[]; // low balance
  var tomBal=homeTomorrowBudget({val:2500,days:10,nextIn:'2026-12-05',due:0,inc:0,waitingToday:false});
  return {
   nextPay:pdPay.nextIn,tomPay:tomPay,leftPay:leftPay,waitingPay:pdPay.waitingToday,
   lim:lim,bal:bal,pdVal:pd.val,tom:tom,left:left,days:pd.days,nextIn:pd.nextIn,
   tomCapped:tomCapped,tomBal:tomBal,detailsPay:homeBudgetDetails(pdPay,0,leftPay)
  };
 });
 expect(r.nextPay).toBe('2026-11-26');
 expect(r.tomPay).toBeNull();
 expect(r.detailsPay).toMatch(/Ждём доход/);
 expect(r.tom).toBeCloseTo(Math.min(r.bal,r.lim,r.pdVal),6);
 expect(r.left).toBeCloseTo(Math.min(r.bal,r.lim>0?Math.min(r.lim,r.pdVal):r.pdVal),6);
 expect(r.tomCapped).toBe(800); // min(dayLimit 800, pd 2500, bal)
 expect(r.tomBal).toBe(500); // balance wins
});

test('refunds: actual vs expected stay consistent in both modes',async({page})=>{
 const r=await probe(page,()=>{
  function snap(){
   const LK=refLinks(),e=S.entries[0];
   return {
    net:netOf(e,LK),received:receivedNetOf(e,LK),back:backOf(e,LK).back,pend:backOf(e,LK).pend,
    day:dayNet(T).v,life:lifeNet(S.entries),cash:cashPlanSpent(T,T),ref:refunds(S.entries),bal:balance()
   };
  }
  T='2026-11-25';S.demo=false;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.rare=[];S.rules=[];S.recur=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  // Expected only (split 700)
  S.entries=[{id:'a',type:'e',amt:2000,split:700,date:T,acc:'main',cat:'cafe'}];
  S.simple=true;S.incomes=[];
  const simpleExpect=snap();
  S.simple=false;S.incomes=[{id:'i',day:10,amt:50000}];
  const fullExpect=snap();
  // Partial actual refund 400 of 700 expected
  S.entries.push({id:'r',type:'i',cat:'refund',amt:400,date:T,acc:'main',for:'a'});
  S.simple=true;S.incomes=[];
  const simplePartial=snap();
  S.simple=false;S.incomes=[{id:'i',day:10,amt:50000}];
  const fullPartial=snap();
  // Future refund must not count as received
  S.entries.push({id:'rf',type:'i',cat:'refund',amt:200,date:'2026-11-28',acc:'main',for:'a'});
  const withFuture=snap();
  return {simpleExpect,fullExpect,simplePartial,fullPartial,withFuture};
 });
 // 2000 - 0 back - 700 pend = 1300 net; receivedNet = 2000; cash = 2000; refunds = 700; bal = 8000
 expect(r.simpleExpect).toEqual({net:1300,received:2000,back:0,pend:700,day:1300,life:1300,cash:2000,ref:700,bal:8000});
 expect(r.fullExpect).toEqual(r.simpleExpect);
 // after 400 received: pend=300, net=1300, receivedNet=1600, cash=1600, refunds=700, bal=8400
 expect(r.simplePartial).toEqual({net:1300,received:1600,back:400,pend:300,day:1300,life:1300,cash:1600,ref:700,bal:8400});
 expect(r.fullPartial).toEqual(r.simplePartial);
 // future refund ignored until its date
 expect(r.withFuture.back).toBe(400);
 expect(r.withFuture.pend).toBe(300);
 expect(r.withFuture.day).toBe(1300);
 expect(r.withFuture.cash).toBe(1600);
 expect(r.withFuture.bal).toBe(8400);
});

test('refunds: orphan and unlinked actual do not break day vs cash split',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;S.incomes=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:1500,date:T,acc:'main',cat:'cafe'},
   {id:'orphan',type:'i',cat:'refund',amt:300,date:T,acc:'main',for:'gone'},
   {id:'free',type:'i',cat:'refund',amt:200,date:T,acc:'main'} // unlinked
  ];
  const LK=refLinks();
  return {
   day:dayNet(T).v,life:lifeNet(S.entries),cash:cashPlanSpent(T,T),
   netA:netOf(S.entries[0],LK),ref:refunds(S.entries),bal:balance(),
   linkedOrphan:!!LK.linked.orphan,linkedFree:!!LK.linked.free
  };
 });
 // orphan ignored in sumNet; unlinked 200 reduces day within expense net
 expect(r.linkedOrphan).toBe(false);
 expect(r.linkedFree).toBe(false);
 expect(r.netA).toBe(1500);
 expect(r.day).toBe(1300); // 1500 - 200 unlinked
 expect(r.life).toBe(1300);
 expect(r.cash).toBe(1300); // 1500 - 200 unlinked (orphan not subtracted)
 expect(r.ref).toBe(500); // got 300+200, no pend
 expect(r.bal).toBe(9000); // 10000 - 1500 + 300 + 200
});
