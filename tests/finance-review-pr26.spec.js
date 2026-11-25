const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__revProbe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__revProbe());
}

test('R1: refunds() sums pending split across all group-cheque parts',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:600,date:T,acc:'main',cat:'cafe',grp:'g1',note:'Чек',split:200},
   {id:'b',type:'e',amt:400,date:T,acc:'main',cat:'prod',grp:'g1',note:'Чек'},
   {id:'r',type:'i',cat:'refund',amt:100,date:T,acc:'main',for:'a'}
  ];
  const LK=refLinks();
  const me=monthEntries('2026-11');
  const exp=me.filter(x=>x.type==='e').reduce((a,x)=>a+x.amt,0);
  const ref=refunds(me);
  const home=viewHomeSimple();
  return {
   pendA:backOf(S.entries[0],LK).pend,
   pendB:backOf(S.entries[1],LK).pend,
   refunds:ref,
   life:lifeNet(me),
   day:dayNet(T).v,
   homeNet:exp-ref,
   homeShows800:/800/.test(home)
  };
 });
 // R=100, P=200 → pend parts 60+40=100; refunds = got 100 + pend 100 = 200
 // gross 1000 − refunds 200 = life 800; home exp−ref must match
 expect(r.pendA+r.pendB).toBeCloseTo(100,6);
 expect(r.refunds).toBeCloseTo(200,6);
 expect(r.life).toBeCloseTo(800,6);
 expect(r.day).toBeCloseTo(800,6);
 expect(r.homeNet).toBeCloseTo(800,6);
 expect(r.homeShows800).toBe(true);
});

test('R2: deleting original purchase does not note-relink refund to another expense',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'old',type:'e',amt:3000,date:T,acc:'main',cat:'cafe',note:'Ужин'},
   {id:'other',type:'e',amt:1500,date:T,acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:1000,date:T,acc:'main',for:'old',note:'Возврат: Ужин'}
  ];
  const before={linked:refLinks().linked.r,day:dayNet(T).v};
  S.entries=S.entries.filter(x=>x.id!=='old');
  const LK=refLinks();
  return {
   before,
   linked:LK.linked.r||null,
   day:dayNet(T).v,
   netOther:netOf(S.entries.find(x=>x.id==='other'),LK),
   cats:netByCat(S.entries),
   bal:balance()
  };
 });
 expect(r.before.linked).toBe('old');
 expect(r.linked).toBe(null);
 expect(r.netOther).toBe(1500);
 expect(r.day).toBe(1500);
 expect(r.cats.cafe).toBe(1500);
 expect(r.bal).toBe(9500); // 10000 − 1500 + 1000 (удалённая покупка больше не в балансе)
});

test('R3: orphan for=deleted with matching note on another expense stays unlinked',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  // старые данные: возврат с for на уже удалённую трату + похожая заметка у другой покупки
  S.entries=[
   {id:'other',type:'e',amt:1500,date:T,acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:1000,date:T,acc:'main',for:'gone',note:'Возврат: Ужин'}
  ];
  return {linked:refLinks().linked.r||null,day:dayNet(T).v,cats:netByCat(S.entries)};
 });
 expect(r.linked).toBe(null);
 expect(r.day).toBe(1500);
 expect(r.cats.cafe).toBe(1500);
});

test('R4: unlinked refund does not drive dayNet below sum of category nets',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.incomes=[{id:'i',day:10,amt:50000}];S.rules=[];S.recur=[{id:'sub',name:'Sub',amt:1000,day:1}];
  S.entries=[
   {id:'cafe',type:'e',amt:500,date:T,acc:'main',cat:'cafe'},
   {id:'pay',type:'e',amt:1000,date:T,acc:'main',cat:'subs',rid:'sub'},
   {id:'ref',type:'i',cat:'refund',amt:1000,date:T,acc:'main'} // непривязанный, экономически возврат rid
  ];
  const L=life(S.entries),cats=netByCat(L);
  const catSum=Object.keys(cats).reduce((a,c)=>a+cats[c],0);
  return {day:dayNet(T).v,life:lifeNet(S.entries),catSum,cats,bal:balance()};
 });
 expect(r.bal).toBe(9500);
 // согласованность day ↔ Σ категорий; не уходим в −500
 expect(r.day).toBe(r.catSum);
 expect(r.day).toBeGreaterThanOrEqual(0);
 expect(r.life).toBe(r.day);
});

test('R5: rare reserve not double-counted after partial rare payment',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;
  S.rare=[{id:'rare',cat:'tech',name:'Phone',amt:120000}];
  S.accounts=[{id:'main',type:'main',start:50000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:60000},{id:'next',day:10,amt:60000}];
  S.rules=[];S.recur=[];
  S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:60000,acc:'main',cat:'salary'}];
  plannedItems=()=>[{date:'2026-12-10',kind:'in',amt:60000}];
  const before=cycleDayPlan();
  S.entries.push({id:'buy',type:'e',amt:3000,date:T,acc:'main',cat:'tech',note:'Phone'});
  const after=cycleDayPlan();
  return {beforeFree:before.free,afterFree:after.free,beforeRare:before.rare,afterRare:after.rare};
 });
 expect(r.afterFree).toBeCloseTo(r.beforeFree,5);
 expect(r.afterRare).toBeCloseTo(r.beforeRare-3000,5);
});

test('R6: old splitDone without for still links (compat)',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  // как создаёт кнопка «Пришло»: splitDone=rid, у возврата нет поля for
  S.entries=[
   {id:'a',type:'e',amt:2000,split:800,splitDone:'r',date:T,acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:800,date:T,acc:'main',note:'Возврат: Ужин'}
  ];
  const LK=refLinks();
  return {linked:LK.linked.r,how:LK.byExp.a&&LK.byExp.a[0]&&LK.byExp.a[0].id,day:dayNet(T).v,pend:backOf(S.entries[0],LK).pend};
 });
 expect(r.linked).toBe('a');
 expect(r.day).toBe(1200);
 expect(r.pend).toBe(0);
});

test('R7: note-only refund without for still auto-links (compat)',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.planCalc=null;S.dayLimit=2000;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',amt:3000,date:T,acc:'main',cat:'cafe',note:'Ужин'},
   {id:'r',type:'i',cat:'refund',amt:1000,date:T,acc:'main',note:'Возврат: Ужин'}
  ];
  return {linked:refLinks().linked.r,day:dayNet(T).v};
 });
 expect(r.linked).toBe('a');
 expect(r.day).toBe(2000);
});
