const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{const response=await route.fetch(),html=await response.text(),marker='})();\n/* Новая версия на сайте:';if(!html.includes(marker))throw Error('probe marker missing');await route.fulfill({response,body:html.replace(marker,'window.__financeProbe = '+scenario.toString()+';\n'+marker)});});
 await page.goto('/index.html');return page.evaluate(()=>window.__financeProbe());
}
test('shared net spending: linked refund, transport card, savings and regular payment',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=3000;S.incomes=[];S.rare=[];
 S.accounts=[{id:'main',type:'main',start:20000},{id:'vtb',type:'other',start:500,live:false,planSpend:true},{id:'save',type:'save',start:5000}];
 S.entries=[{id:'sub',type:'e',cat:'subs',amt:3499,date:T,acc:'main'},{id:'r',type:'i',cat:'refund',amt:2000,date:T,acc:'main',for:'sub'},{id:'food',type:'e',cat:'cafe',amt:857,date:T,acc:'main'},{id:'r2',type:'i',cat:'refund',amt:600,date:T,acc:'main',for:'food'},{id:'metro',type:'e',cat:'trans',amt:65,date:T,acc:'vtb'},{id:'fund',type:'e',cat:'gift',amt:1000,date:T,acc:'save'},{id:'regular',type:'e',cat:'subs',amt:100,date:T,acc:'main',rid:'scheduled'},{id:'transfer',type:'t',amt:100,date:T,from:'main',to:'save'}];
 return {daily:dayNet(T).v,month:lifeNet(S.entries),cash:cashPlanSpent(T,T),balance:balance()};
 });
 expect(r.daily).toBe(1821);expect(r.month).toBe(r.daily);expect(r.cash).toBe(1756);expect(r.balance).toBe(18044);
});
test('refund on another day or account is attributed once to original expense',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=3000;S.incomes=[];S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',start:0}];
 S.entries=[{id:'a',type:'e',cat:'subs',amt:3500,date:'2026-11-24',acc:'main'},{id:'b',type:'i',cat:'refund',amt:2000,date:T,acc:'save',for:'a'}];
 return {prior:dayNet('2026-11-24').v,today:dayNet(T).v,month:lifeNet(S.entries),cash:cashPlanSpent('2026-11-24',T)};
 });
 expect(r.prior).toBe(1500);expect(r.today).toBe(0);expect(r.month).toBe(1500);expect(r.cash).toBe(3500);
});

test('full mode ordinary subscription is not a rare expense merely because of category',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.incomes=[{id:'i',day:10,amt:50000}];S.rare=[{id:'rare',cat:'subs',name:'Annual license',amt:12000}];S.accounts=[{id:'main',type:'main',start:10000}];S.entries=[{id:'normal',type:'e',cat:'subs',note:'AI',amt:3499,date:T,acc:'main'},{id:'refund',type:'i',cat:'refund',amt:2000,date:T,acc:'main',for:'normal'},{id:'rarePay',type:'e',cat:'subs',note:'Annual license',amt:1000,date:T,acc:'main'}];return dayNet(T).v;
 });expect(r).toBe(1499);
});
test('explicit cross-month refund is linked, future refund and expected cash are not received',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=3000;S.incomes=[];S.accounts=[{id:'main',type:'main',start:10000}];S.entries=[{id:'a',type:'e',cat:'subs',amt:3000,date:'2026-10-31',acc:'main'},{id:'b',type:'i',cat:'refund',amt:1000,date:T,acc:'main',for:'a'},{id:'c',type:'i',cat:'refund',amt:500,date:'2026-11-26',acc:'main',for:'a'},{id:'d',type:'e',cat:'cafe',amt:900,split:600,date:T,acc:'main'}];return {old:dayNet('2026-10-31').v,today:dayNet(T).v,received:receivedNetOf(S.entries[3],refLinks())};
 });expect(r).toEqual({old:2000,today:300,received:900});
});
test('historical limit snapshots preserve completed day thresholds',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-24';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.dayLimit=1000;S.planDayHistory={};rememberDayLimit();T='2026-11-25';S.dayLimit=2000;rememberDayLimit();return [dayLimitAt('2026-11-24'),dayLimitAt(T)];
 });expect(r).toEqual([1000,2000]);
});

test('completed day stars do not change when a new daily limit is set',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.rules=[];S.noSpend=[];S.dayLimit=1000;S.planDayHistory={'2026-11-23':1000,'2026-11-24':1000};S.accounts=[{id:'main',type:'main',start:10000}];S.entries=[{id:'a',type:'e',cat:'cafe',amt:800,date:'2026-11-23',acc:'main'},{id:'b',type:'e',cat:'cafe',amt:900,date:'2026-11-24',acc:'main'}];const before=g2();S.dayLimit=500;const after=g2();return {before:before.stars,after:after.stars,days:after.days.map(x=>x.st)};
 });expect(r).toEqual({before:20,after:20,days:['good','good']});
});
test('cloud three-way merge preserves historical limits recorded on different devices',async({page})=>{
 const r=await probe(page,()=>{
 const base={planDayHistory:{'2026-11-23':1000}},local={planDayHistory:{'2026-11-23':1000,'2026-11-24':1200}},remote={planDayHistory:{'2026-11-23':1000,'2026-11-25':1400}};
 return merge3(base,local,remote).planDayHistory;
 });expect(r).toEqual({'2026-11-23':1000,'2026-11-24':1200,'2026-11-25':1400});
});
test('subscription and food refunds: history, wallet and daily totals agree in both modes',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=3000;S.incomes=[];S.rare=[];S.rules=[];S.recur=[];S.accounts=[{id:'main',name:'Main',type:'main',start:26683.16}];S.entries=[{id:'sub',type:'e',cat:'subs',note:'AI',amt:3499,date:T,acc:'main'},{id:'r',type:'i',cat:'refund',amt:2000,date:T,acc:'main',for:'sub'},{id:'food',type:'e',cat:'cafe',note:'Food',amt:857,date:T,acc:'main'},{id:'r2',type:'i',cat:'refund',amt:600,date:T,acc:'main',for:'food'}];const simple={daily:dayNet(T).v,month:lifeNet(S.entries),history:histList(),home:viewHomeSimple()};S.simple=false;S.incomes=[{id:'i',day:10,amt:91200}];const full={daily:dayNet(T).v,month:lifeNet(S.entries),history:histList(),home:viewHome()};return {simple,full,balance:balance()};
 });
 expect(r.balance).toBeCloseTo(24927.16,2);for(const mode of [r.simple,r.full]){expect(mode.daily).toBe(1756);expect(mode.month).toBe(1756);expect(mode.history).toMatch(/1[\s\u00a0\u202f]756/);expect(mode.home).toMatch(/1[\s\u00a0\u202f]756/);}
});
test('export distinguishes savings from transport and debt accounts',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=3000;S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',name:'Fund',start:1000},{id:'vtb',type:'other',name:'Transport',start:500,live:false,planSpend:true},{id:'debt',type:'debt',name:'Credit',start:0}];S.entries=[{id:'a',type:'e',cat:'cafe',amt:100,date:T,acc:'main'},{id:'b',type:'e',cat:'gift',amt:200,date:T,acc:'save'},{id:'c',type:'e',cat:'trans',amt:65,date:T,acc:'vtb'},{id:'d',type:'e',cat:'tech',amt:300,date:T,acc:'debt'}];return exportText('all');
 });expect(r).toContain('со свободных денег 100, из копилок 200, с других счетов 365');expect(r).toContain('возвратов): 165.');
});

test('debt payment, savings deposits and withdrawals are transfers, not purchases',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.incomes=[];S.rare=[];S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',name:'Goal',start:2000},{id:'debt',type:'debt',start:-5000},{id:'card',type:'other',live:true,planSpend:true,start:1000}];S.entries=[];
 const read=()=>({free:balance(),fund:accBalN(accById('save')),debt:accBalN(accById('debt')),spent:dayNet(T).v});
 const before=read();
 S.entries.push({id:'a',type:'t',from:'main',to:'save',amt:4000,date:T},{id:'b',type:'t',from:'main',to:'debt',amt:3000,date:T},{id:'c',type:'t',from:'main',to:'card',amt:500,date:T});
 const allocated=read();
 S.entries.push({id:'d',type:'t',from:'save',to:'main',amt:1500,date:T},{id:'e',type:'e',acc:'save',cat:'gift',amt:500,date:T},{id:'f',type:'e',acc:'card',cat:'prod',amt:700,date:T},{id:'g',type:'e',acc:'debt',cat:'tech',amt:800,date:T});
 return {before,allocated,after:read(),gross:sum(S.entries,'e')};
 });expect(r).toEqual({before:{free:21000,fund:2000,debt:-5000,spent:0},allocated:{free:14000,fund:6000,debt:-2000,spent:0},after:{free:14800,fund:4000,debt:-2800,spent:700},gross:2000});
});
test('two months of operations retain balances and attributed spending when switching modes',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.incomes=[];S.rare=[];S.recur=[];S.rules=[];S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',name:'Goal',start:0},{id:'debt',type:'debt',start:-6000},{id:'vtb',type:'other',live:false,planSpend:true,start:500}];
 S.entries=[{id:'i',type:'i',cat:'salary',acc:'main',amt:20000,date:'2026-10-25'},{id:'s',type:'t',from:'main',to:'save',amt:5000,date:'2026-10-25'},{id:'d',type:'t',from:'main',to:'debt',amt:2000,date:'2026-10-26'},{id:'p',type:'e',acc:'main',cat:'prod',amt:3000,date:'2026-10-30'},{id:'r',type:'i',cat:'refund',acc:'main',for:'p',amt:1000,date:'2026-11-01'},{id:'i2',type:'i',cat:'salary',acc:'main',amt:15000,date:'2026-11-10'},{id:'s2',type:'t',from:'main',to:'save',amt:4000,date:'2026-11-10'},{id:'d2',type:'t',from:'main',to:'debt',amt:4000,date:'2026-11-10'},{id:'w',type:'t',from:'save',to:'main',amt:1000,date:'2026-11-15'},{id:'f',type:'e',acc:'save',cat:'gift',amt:2000,date:'2026-11-16'},{id:'v',type:'e',acc:'vtb',cat:'trans',amt:130,date:'2026-11-21'},{id:'p2',type:'e',acc:'main',cat:'cafe',amt:857,date:T},{id:'r2',type:'i',cat:'refund',acc:'main',for:'p2',amt:600,date:T}];
 const read=()=>({free:balance(),fund:accBalN(accById('save')),debt:accBalN(accById('debt')),transport:accBalN(accById('vtb')),oct:lifeNet(monthEntries('2026-10')),nov:lifeNet(monthEntries('2026-11')),today:dayNet(T).v});
 const simple=read(),original=JSON.stringify(S.entries);S.simple=false;S.incomes=[{id:'salary',day:10,amt:30000}];const full=read();S.simple=true;return {simple,full,back:read(),unchanged:original===JSON.stringify(S.entries)};
 });
 const expected={free:28743,fund:6000,debt:0,transport:370,oct:2000,nov:387,today:257};expect(r.simple).toEqual(expected);expect(r.full).toEqual(expected);expect(r.back).toEqual(expected);expect(r.unchanged).toBe(true);
});
test('refund and editing or deleting a purchase reconstruct the original balance and spending',async({page})=>{
 const r=await probe(page,()=>{
 T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.dayLimit=2000;S.incomes=[];S.accounts=[{id:'main',type:'main',start:10000}];S.entries=[];
 const read=()=>({balance:balance(),spent:dayNet(T).v});
 S.entries.push({id:'a',type:'e',acc:'main',cat:'prod',amt:1500,date:T});const purchase=read();
 S.entries.push({id:'r',type:'i',acc:'main',cat:'refund',for:'a',amt:500,date:T});const refund=read();
 S.entries[0].amt=1200;const edit=read();S.entries=S.entries.filter(x=>x.id!=='r');const deleteRefund=read();S.entries=[];return {purchase,refund,edit,deleteRefund,deletePurchase:read()};
 });expect(r).toEqual({purchase:{balance:8500,spent:1500},refund:{balance:9000,spent:1000},edit:{balance:9300,spent:700},deleteRefund:{balance:8800,spent:1200},deletePurchase:{balance:10000,spent:0}});
});

test('mode switch: planOut categories do not hide ordinary spends (257 vs 1756 regression)',async({page})=>{
 const r=await probe(page,()=>{
  // Repro: with planCalc+planOut(FIXCATS), simple used to drop subs → 257; full kept them → 1756
  T='2026-11-25';S.demo=false;S.irreg=false;S.rare=[];S.rules=[];S.recur=[];
  S.planCalc={inc:90000,fixed:15000,save:5000,irr:3000};
  S.planOut=FIXCATS.concat(IRRCATS);
  S.dayLimit=undefined;
  S.accounts=[{id:'main',type:'main',start:30000}];
  S.entries=[
   {id:'sub',type:'e',cat:'subs',note:'AI',amt:3499,date:'2026-11-24',acc:'main'},
   {id:'r',type:'i',cat:'refund',amt:2000,date:'2026-11-24',acc:'main',for:'sub'},
   {id:'food',type:'e',cat:'cafe',note:'Food',amt:857,date:'2026-11-24',acc:'main'},
   {id:'r2',type:'i',cat:'refund',amt:600,date:'2026-11-24',acc:'main',for:'food'},
   {id:'health',type:'e',cat:'health',note:'Pharmacy',amt:800,date:'2026-11-10',acc:'main'},
   {id:'gift',type:'e',cat:'gift',note:'Present',amt:1068,date:'2026-11-05',acc:'main'},
   {id:'pay',type:'e',cat:'subs',note:'Scheduled',amt:500,date:'2026-11-01',acc:'main',rid:'rule1'},
   {id:'rarePay',type:'e',cat:'tech',note:'Annual license',amt:12000,date:'2026-11-03',acc:'main'}
  ];
  S.rare=[{id:'rare',cat:'tech',name:'Annual license',amt:12000}];
  function snap(){
   var y='2026-11-24',me=monthEntries('2026-11');
   var cats=netByCat(life(me));
   var g=g2();
   return {
    y:dayNet(y).v,month:lifeNet(me),
    lifeIds:life(S.entries).filter(function(x){return x.type==='e'}).map(function(x){return x.id}).sort(),
    hasSubs:!!cats.subs,hasHealth:!!cats.health,hasGift:!!cats.gift,
    review:Math.max(0,lifeNet(me)),
    stars:g.stars,good:g.good
   };
  }
  S.simple=true;S.incomes=[];
  PI_C=null;PI_ON=0;
  var simple=snap();
  S.simple=false;S.incomes=[{id:'i',day:10,amt:90000}];
  PI_C=null;
  var full=snap();
  S.simple=true;S.incomes=[];
  PI_C=null;
  var back=snap();
  return {simple:simple,full:full,back:back};
 });
 // food net 257 + sub net 1499 = 1756; health 800 + gift 1068 also in month; rid+rare excluded
 expect(r.simple.y).toBe(1756);
 expect(r.full.y).toBe(1756);
 expect(r.back.y).toBe(1756);
 expect(r.simple.month).toBe(1756+800+1068);
 expect(r.full.month).toBe(r.simple.month);
 expect(r.back.month).toBe(r.simple.month);
 expect(r.simple.lifeIds).toEqual(r.full.lifeIds);
 expect(r.simple.lifeIds).toEqual(['food','gift','health','sub']);
 expect(r.simple.hasSubs).toBe(true);
 expect(r.simple.hasHealth).toBe(true);
 expect(r.simple.hasGift).toBe(true);
 expect(r.simple.review).toBe(r.full.review);
 expect(r.simple.stars).toBe(r.full.stars);
 expect(r.simple.good).toBe(r.full.good);
});

test('mode switch keeps past planDayHistory; rid and rare stay out of life in both modes',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-24';S.demo=false;S.simple=true;S.irreg=false;S.incomes=[];
  S.planCalc={inc:60000,fixed:10000,save:0,irr:2000};S.planOut=FIXCATS.concat(IRRCATS);
  S.planDayHistory={};rememberDayLimit();
  var limSimple=dayLimit(),hist24=S.planDayHistory['2026-11-24'];
  T='2026-11-25';
  S.accounts=[{id:'main',type:'main',start:20000}];
  S.entries=[
   {id:'cafe',type:'e',cat:'cafe',amt:400,date:T,acc:'main'},
   {id:'rent',type:'e',cat:'rent',amt:3000,date:T,acc:'main',rid:'r-rent'},
   {id:'rare',type:'e',cat:'trip',note:'Bali',amt:50000,date:T,acc:'main'}
  ];
  S.rare=[{id:'rr',cat:'trip',name:'Bali',amt:50000}];
  S.rules=[];S.recur=[];
  var simpleDay=dayNet(T).v,simpleLife=life(S.entries).map(function(x){return x.id}).sort();
  S.simple=false;S.incomes=[{id:'sal',day:10,amt:60000}];
  PI_C=null;
  var fullDay=dayNet(T).v,fullLife=life(S.entries).map(function(x){return x.id}).sort();
  rememberDayLimit();
  var limFull=dayLimit(),hist25=S.planDayHistory['2026-11-25'],hist24after=S.planDayHistory['2026-11-24'];
  return {
   limSimple:limSimple,hist24:hist24,hist24after:hist24after,
   limFull:limFull,hist25:hist25,
   simpleDay:simpleDay,fullDay:fullDay,simpleLife:simpleLife,fullLife:fullLife,
   at24:dayLimitAt('2026-11-24')
  };
 });
 expect(r.hist24).toBe(r.limSimple);
 expect(r.hist24after).toBe(r.limSimple); // past day not overwritten by mode switch
 expect(r.at24).toBe(r.limSimple);
 expect(r.hist25).toBe(r.limFull); // today may record the active mode's limit
 expect(r.simpleDay).toBe(400);
 expect(r.fullDay).toBe(400);
 expect(r.simpleLife).toEqual(['cafe']);
 expect(r.fullLife).toEqual(['cafe']);
});
