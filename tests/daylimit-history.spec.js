const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__dlhProbe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__dlhProbe());
}

test('incomplete history: history shows spend only; review hides month plan',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.rules=[];S.recur=[];S.rare=[];S.dayLimit=2000;S.planDayHistory={'2026-11-20':1500,'2026-11-24':1800};
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[
   {id:'e1',type:'e',cat:'cafe',amt:900,date:'2026-11-10',acc:'main'},
   {id:'e2',type:'e',cat:'cafe',amt:700,date:'2026-11-20',acc:'main'},
   {id:'e3',type:'e',cat:'cafe',amt:500,date:'2026-11-24',acc:'main'}
  ];
  vym='2026-11';hMonths=12;
  var hist=histList(),rev=reviewCard(),life=lifeCard(monthEntries('2026-11'),30);
  return {
   at10:dayLimitAt('2026-11-10'),known10:dayLimitKnown('2026-11-10'),
   at20:dayLimitAt('2026-11-20'),planOk:monthPlanKnown('2026-11'),
   hist:hist,rev:rev,life:life,env:monthEnvelope('2026-11')
  };
 });
 expect(r.at10).toBe(0);
 expect(r.known10).toBe(false);
 expect(r.at20).toBe(1500);
 expect(r.planOk).toBe(false);
 expect(r.hist).toMatch(/траты 900/);
 expect(r.hist).not.toMatch(/900[\s\S]{0,12}из/);
 expect(r.hist).toMatch(/700[\s\S]{0,12}из/);
 expect(r.rev).not.toMatch(/\|\s*план/);
 expect(r.rev).not.toMatch(/>План</);
 expect(r.life).not.toMatch(/из[\s\u00a0\u202f]*\d/);
});

test('complete history in both modes: month plan stays reliable; past snapshots unchanged',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.rules=[];S.recur=[];S.rare=[];S.dayLimit=2000;S.planDayHistory={};
  for(var d=1;d<=24;d++)S.planDayHistory['2026-11-'+p2(d)]=1000;
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:400,date:'2026-11-10',acc:'main'}];
  vym='2026-11';
  S.simple=true;PI_C=null;
  var simple={ok:monthPlanKnown('2026-11'),at10:dayLimitAt('2026-11-10'),rev:reviewCard(),goals:g2Goals(g2()).map(function(x){return x.t}),lim:dayLimit()};
  S.simple=false;S.incomes=[{id:'sal',day:10,amt:60000}];PI_C=null;
  var full={ok:monthPlanKnown('2026-11'),at10:dayLimitAt('2026-11-10'),rev:reviewCard(),goals:g2Goals(g2()).map(function(x){return x.t}),lim:dayLimit(),hist10:S.planDayHistory['2026-11-10']};
  return {simple:simple,full:full};
 });
 expect(r.simple.ok).toBe(true);
 expect(r.full.ok).toBe(true);
 expect(r.simple.at10).toBe(1000);
 expect(r.full.at10).toBe(1000);
 expect(r.full.hist10).toBe(1000);
 expect(r.simple.goals).toContain('Месяц в бюджете');
 expect(r.full.goals).toContain('Месяц в бюджете');
 expect(r.simple.rev).toMatch(/План/);
 expect(r.full.rev).toMatch(/План/);
});

test('changing daily plan does not rewrite past snapshots or g2 ratings',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.rules=[];S.noSpend=['2026-11-22'];S.dayLimit=1000;
  S.planDayHistory={'2026-11-22':1000,'2026-11-23':1000,'2026-11-24':1000};
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',cat:'cafe',amt:800,date:'2026-11-23',acc:'main'},
   {id:'b',type:'e',cat:'cafe',amt:1500,date:'2026-11-24',acc:'main'}
  ];
  var before=g2();
  S.dayLimit=400;rememberDayLimit();
  var after=g2();
  return {
   beforeStars:before.stars,afterStars:after.stars,
   days:after.days.map(function(x){return x.st}),
   at23:dayLimitAt('2026-11-23'),at24:dayLimitAt('2026-11-24'),at25:dayLimitAt(T),
   hist23:S.planDayHistory['2026-11-23'],hist25:S.planDayHistory[T]
  };
 });
 expect(r.at23).toBe(1000);
 expect(r.at24).toBe(1000);
 expect(r.at25).toBe(400);
 expect(r.hist23).toBe(1000);
 expect(r.hist25).toBe(400);
 // over may soften to oneoff when month net still within known budget — either way not "good"
 expect(r.days[0]).toBe('nospend');
 expect(r.days[1]).toBe('good');
 expect(['over','oneoff']).toContain(r.days[2]);
 expect(r.beforeStars).toBe(r.afterStars);
 expect(r.beforeStars).toBe(30); // nospend 20 + good 10
});

test('g2: unknown-limit days are not good/over; nospend still rewarded',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.rules=[];S.noSpend=['2026-11-21'];S.dayLimit=1000;
  // only 23–24 known; 21 nospend without limit snapshot; 22 spend without limit
  S.planDayHistory={'2026-11-23':1000,'2026-11-24':1000};
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',cat:'cafe',amt:500,date:'2026-11-22',acc:'main'},
   {id:'b',type:'e',cat:'cafe',amt:800,date:'2026-11-23',acc:'main'},
   {id:'c',type:'e',cat:'cafe',amt:2000,date:'2026-11-24',acc:'main'}
  ];
  var g=g2();
  return {days:g.days.map(function(x){return x.st}),stars:g.stars,saved:g.saved,goals:g2Goals(g).map(function(x){return x.t})};
 });
 expect(r.days).toEqual(['nospend','nolim','good','over']);
 expect(r.stars).toBe(30); // nospend+good; nolim/over neither
 expect(r.goals).not.toContain('Месяц в бюджете'); // incomplete history
});

test('viewAn uses neutral color for unknown-limit days',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=2000;S.planDayHistory={'2026-11-24':1500};
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[
   {id:'e1',type:'e',cat:'cafe',amt:900,date:'2026-11-10',acc:'main'},
   {id:'e2',type:'e',cat:'cafe',amt:700,date:'2026-11-24',acc:'main'}
  ];
  vym='2026-11';
  var html=viewAn();
  return {html:html,planOk:monthPlanKnown('2026-11')};
 });
 expect(r.planOk).toBe(false);
 expect(r.html).toMatch(/var\(--muted\)/);
 expect(r.html).toMatch(/без плана|Серый/);
});

test('monster compares yesterday spend to yesterday limit, not today',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.nopet=false;
  S.unameAsked=1;S.uname='Тест';S.onb=true;S.setup=true;
  S.dayLimit=500; // today tight — must NOT be used for yesterday
  S.planDayHistory={};
  for(var d=1;d<=24;d++)S.planDayHistory['2026-11-'+p2(d)]=2000;
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[{id:'y',type:'e',cat:'cafe',amt:1500,date:'2026-11-24',acc:'main'}];
  var Y='2026-11-24',yLim=dayLimitAt(Y),todayLim=dayLimit();
  var _gh=Date.prototype.getHours;Date.prototype.getHours=function(){return 10};
  var me=monthEntries('2026-11'),html=monsterCard(me,lifeNet(me),25);
  Date.prototype.getHours=_gh;
  return {yLim:yLim,todayLim:todayLim,html:html,inPlanVsY:1500<=yLim,overVsToday:1500>todayLim,yd:dayNet(Y)};
 });
 expect(r.yLim).toBe(2000);
 expect(r.todayLim).toBe(500);
 expect(r.inPlanVsY).toBe(true);
 expect(r.overVsToday).toBe(true);
 expect(r.yd.v).toBe(1500);
 expect(r.html).toMatch(/1[\s\u00a0\u202f]?500/);
 expect(r.html).toMatch(/2[\s\u00a0\u202f]?000|в плане|с запасом/);
 expect(r.html).not.toMatch(/из 500/);
});

test('rememberDayLimit and merge3 keep history sync across devices',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-24';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=1000;S.planDayHistory={};rememberDayLimit();
  T='2026-11-25';S.dayLimit=2000;rememberDayLimit();
  var base={planDayHistory:{'2026-11-24':1000,'2026-11-25':2000}};
  var local={planDayHistory:{'2026-11-24':1000,'2026-11-25':2000,'2026-11-23':900}};
  var remote={planDayHistory:{'2026-11-24':1000,'2026-11-25':2000,'2026-11-22':800}};
  return {
   at24:dayLimitAt('2026-11-24'),at25:dayLimitAt(T),at23:dayLimitAt('2026-11-23'),
   merged:merge3(base,local,remote).planDayHistory
  };
 });
 expect(r.at24).toBe(1000);
 expect(r.at25).toBe(2000);
 expect(r.at23).toBe(0); // not in this device's history → unknown, no backfill
 expect(r.merged).toEqual({'2026-11-22':800,'2026-11-23':900,'2026-11-24':1000,'2026-11-25':2000});
});
