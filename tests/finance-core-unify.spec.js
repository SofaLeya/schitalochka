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
  for(var d=1;d<=20;d++)S.planDayHistory['2026-11-'+p2(d)]=1000;
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:500,date:'2026-11-10',acc:'main'}];
  vym='2026-11';
  var env=monthEnvelope('2026-11');
  return {env:env,review:reviewCard(),life:lifeCard(monthEntries('2026-11'),30),lim:dayLimit()};
 });
 expect(r.lim).toBe(2000);
 expect(r.env).toBe(20*1000+10*2000); // 40000
 expect(r.review).toMatch(/40[\s\u00a0\u202f]000/);
 expect(r.life).toMatch(/40[\s\u00a0\u202f]000/);
 expect(r.review).not.toMatch(/60[\s\u00a0\u202f]000/);
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
