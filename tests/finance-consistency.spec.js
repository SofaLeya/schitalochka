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
