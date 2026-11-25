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
