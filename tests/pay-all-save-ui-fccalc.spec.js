const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__probe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__probe());
}

test('B1: fcCalc adds upcoming income so all-save payout does not drain free cash',async({page})=>{
 const r=await probe(page,()=>{
  // после зарплаты; план с 26-го — ноябрьская раскладка 5-го не висит просрочкой
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-11-26';S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000,name:'Зарплата'},
   {id:'small',day:5,amt:2736,name:'Мелочь'},
   {id:'next',day:10,amt:57000,name:'Аванс'}
  ];
  S.rules=[
   {id:'r25',day:25,acc:'save',amt:30000,name:'Копилка'},
   {id:'r5',day:5,acc:'save',amt:1987,name:'Часть'}
  ];
  S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},
   {id:'tr25',type:'t',rule:'r25',date:'2026-11-25',amt:30000,from:'main',to:'save',note:'Копилка'}
  ];
  S.payAllSave={5:'rules'};
  const bal=balance(),pd=perDay(),f=fcCalc();
  const withoutInc=bal-f.due;
  return {
   bal,fe:fcEnd(),pdNext:pd.nextIn,pdDue:pd.due,pdInc:pd.inc,
   fDue:f.due,fInc:f.inc,fAvail:f.avail,fNd:f.nd,withoutInc,
   pay10:payDateIn('2026-12',10),
   netAllSave:2736-(1987+749)
  };
 });
 expect(r.fe).toBe(r.pay10);
 expect(r.pdNext).toBe(r.pay10);
 expect(r.netAllSave).toBe(0);
 expect(r.fInc).toBe(2736);
 expect(r.fDue).toBe(1987+749);
 expect(r.fAvail).toBe(r.bal-r.fDue+r.fInc);
 // без +inc avail упал бы на всю раскладку; с доходом allSave-день не трогает накопленное
 expect(r.withoutInc).toBe(r.bal-(1987+749));
 expect(r.fAvail).toBe(r.bal);
});

test('B2: without income credit, avail would wrongly drop — regression guard via cashUntil',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-11-26';S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:15000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:50000},{id:'small',day:5,amt:5000},{id:'next',day:10,amt:40000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:2000}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:50000,acc:'main',cat:'salary'}];
  S.payAllSave={5:'rules'};
  const ev=plannedItems(T,40),next=payDateIn('2026-12',10);
  const nextPay={10:1},nextYm={'2026-12':1};
  const cf=cashUntil(ev,next,nextPay,nextYm,{});
  const wrong=balance()-cf.due; // баг: без +inc
  const right=balance()-cf.due+cf.inc;
  const f=fcCalc();
  return {cfDue:cf.due,cfInc:cf.inc,wrong,right,fAvail:f.avail,bal:balance(),extra:allSaveExtraDue(ev,next,nextPay,nextYm)};
 });
 expect(r.extra).toBe(3000); // 5000−2000
 expect(r.cfInc).toBe(5000);
 expect(r.cfDue).toBe(5000);
 expect(r.wrong).toBe(r.bal-5000);
 expect(r.right).toBe(r.bal);
 expect(r.fAvail).toBe(r.right);
});

test('B3: cashUntil unifies perDay and cycleDayPlan due/inc',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-11-26';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2736},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:1987},{id:'r25',day:25,acc:'save',amt:30000}];
  S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},
   {id:'tr25',type:'t',rule:'r25',date:'2026-11-25',amt:30000,from:'main',to:'save'}
  ];
  S.payAllSave={5:'rules'};
  const pd=perDay(),cp=cycleDayPlan();
  return {pdDue:pd.due,pdInc:pd.inc,cpDue:cp.due,cpInc:cp.inc,pdNext:pd.nextIn,cpNext:cp.next};
 });
 expect(r.pdNext).toBe(r.cpNext);
 expect(r.pdDue).toBe(r.cpDue);
 expect(r.pdInc).toBe(r.cpInc);
});

test('B4: Prediction excludes fcPlans from pace (no double-count) and keeps expected refund half',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:30000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:50000},{id:'next',day:10,amt:50000}];
  S.rules=[{id:'r25',day:25,acc:'save',amt:10000}];
  S.recur=[];
  // прошлый понедельник: продукты 4000; план fc тоже продукты по пн — не должны удвоить
  const mon=iso(addDays(parse(T),-((parse(T).getDay()+6)%7||7)));
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:T,amt:50000,acc:'main',cat:'salary'},
   {id:'food',type:'e',cat:'prod',amt:4000,date:mon,acc:'main'}
  ];
  S.fcPlans=[{id:'fp1',cat:'prod',amt:4000,wd:1,half:true}];
  const P=fcPace(),f=fcCalc();
  const wdMon=1;
  const planCost=f.prow.filter(o=>+o.q.wd===wdMon).reduce((a,o)=>a+o.c,0);
  return {pace:P.pace,kn:P.kn,pc:f.pc,planCost,half:f.prow[0]&&f.prow[0].q.half,avail:f.avail,due:f.due,inc:f.inc};
 });
 expect(r.kn).toBeGreaterThan(0);
 // трата prod в день плана не попала в pace (иначе pace≈4000)
 expect(r.pace).toBeLessThan(2000);
 expect(r.half).toBe(true);
 expect(r.pc).toBe(r.planCost);
 // half → в pc учтена половина суммы плана
 expect(r.planCost).toBeGreaterThan(0);
});

test('B5: rulesCard radios — life leftover copy and remainder destination',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000,name:'Карта'},{id:'save',type:'save',start:0,name:'Копилка'},{id:'fund',type:'save',start:0,name:'Фонд'}];
  S.incomes=[{id:'salary',day:25,amt:55000,name:'Зарплата'},{id:'small',day:5,amt:2736,name:'Мелочь'}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:1987,name:'Часть'},{id:'r25',day:25,acc:'save',amt:30000,name:'Большая'}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  delete S.payAllSave;
  uiFold('rules',false);
  const lifeHtml=rulesCard('rulesOnly');
  setPayAllSave(5,true,'rules');
  const allHtml=rulesCard('rulesOnly');
  setPayAllSave(5,true,'fund');
  const fundHtml=rulesCard('rulesOnly');
  setPayAllSave(5,false);
  return {
   hasMode:lifeHtml.indexOf('payAllSaveMode')>=0,
   hasLifeMode:lifeHtml.indexOf('value="life"')>=0,
   hasAllMode:lifeHtml.indexOf('value="all"')>=0,
   hasLeftover:lifeHtml.indexOf('на жизнь останется')>=0,
   lifeChecked:/value="life"[^>]*checked/.test(lifeHtml),
   allHasRest:allHtml.indexOf('pas_r5')>=0,
   allHasBudget:allHtml.indexOf('Дневной бюджет')>=0,
   fundSelected:/value="fund"[^>]*selected/.test(fundHtml),
   noCheckbox:lifeHtml.indexOf('data-a="payAllSave"')<0
  };
 });
 expect(r.hasMode).toBe(true);
 expect(r.hasLifeMode).toBe(true);
 expect(r.hasAllMode).toBe(true);
 expect(r.hasLeftover).toBe(true);
 expect(r.lifeChecked).toBe(true);
 expect(r.allHasRest).toBe(true);
 expect(r.allHasBudget).toBe(true);
 expect(r.fundSelected).toBe(true);
 expect(r.noCheckbox).toBe(true);
});

test('B5b: toggling radios via UI persists payAllSave',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';S.unameAsked=1;
  S.accounts=[{id:'main',type:'main',start:20000,name:'Карта'},{id:'save',type:'save',start:0,name:'Копилка'},{id:'fund',type:'save',start:0,name:'Фонд'}];
  S.incomes=[{id:'salary',day:25,amt:55000,name:'Зарплата'},{id:'small',day:5,amt:2736,name:'Мелочь'}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:1987,name:'Часть'},{id:'r25',day:25,acc:'save',amt:30000,name:'Большая'}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  delete S.payAllSave;save();
  uiFold('rules',false);tab='plan';ptab='p';planMoreOpen=true;render();
  function fire(sel,val){
   var el=document.querySelector(sel);if(!el)return false;
   if(val!=null){el.value=val;if(el.tagName==='SELECT'){/* native change */}else el.checked=true}
   else el.checked=true;
   el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }
  var lifeEl=document.querySelector('input[data-a=payAllSaveMode][data-id="5"][value=life]');
  var life0=!!(lifeEl&&lifeEl.checked);
  fire('input[data-a=payAllSaveMode][data-id="5"][value=all]');
  var onAll=payAllSave(5),hasRest=!!document.querySelector('#pas_r5');
  var sel=document.querySelector('#pas_r5');if(sel){sel.value='fund';sel.dispatchEvent(new Event('change',{bubbles:true}))}
  var rest=payAllSaveRest(5);
  fire('input[data-a=payAllSaveMode][data-id="5"][value=life]');
  return {life0:life0,onAll:onAll,hasRest:hasRest,rest:rest,off:payAllSave(5),found:!!lifeEl};
 });
 expect(r.found).toBe(true);
 expect(r.life0).toBe(true);
 expect(r.onAll).toBe(true);
 expect(r.hasRest).toBe(true);
 expect(r.rest).toBe('fund');
 expect(r.off).toBe(false);
});

test('B6: payout sheet replans all-save extra when income changes',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-12-04';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000,name:'Карта'},{id:'save',type:'save',start:0,name:'Копилка'},{id:'fund',type:'save',start:0,name:'Фонд'}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2736},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5a',day:5,acc:'save',amt:1200,name:'A'},{id:'r5b',day:5,acc:'fund',amt:787,name:'B'}];
  S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},
   {id:'smallIn',type:'i',iid:'small',date:T,amt:2736,acc:'main',cat:'salary'}
  ];
  S.payAllSave={5:'rules'};
  payoutSheet(5,'2026-12');
  function sums(){var ins=[].slice.call(document.querySelectorAll('.po_in[data-rule]'));return {sum:ins.reduce(function(a,e){return a+(+e.value||0)},0),bases:ins.reduce(function(a,e){return a+(+e.dataset.base||0)},0)}}
  var before=sums();
  document.getElementById('po_inc').value='4000';
  poIncChanged();
  var up=sums();
  document.getElementById('po_inc').value='1500';
  poIncChanged();
  var down=sums();
  closeSheet();
  return {before:before,up:up,down:down};
 });
 expect(r.before.sum).toBe(2736);
 expect(r.up.sum).toBe(4000);
 expect(r.down.bases).toBe(1987);
 expect(r.down.sum).toBe(1987);
});

test('B7: simple mode — payAllSave data preserved; fcCalc due stays 0',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.rare=[];S.dayLimit=2000;S.planCalc={inc:60000,fixed:0,save:0,irr:0};
  S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:50000},{id:'small',day:5,amt:5000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:2000}];
  S.recur=[];S.entries=[];S.payAllSave={5:'rules'};S.fcPlans=[];
  const f=fcCalc();
  S.simple=false;
  const fFull=fcCalc();
  return {simpleDue:f&&f.due,simpleInc:f&&f.inc,fullDue:fFull&&fFull.due,fullInc:fFull&&fFull.inc,flag:payAllSave(5),map:S.payAllSave};
 });
 expect(r.flag).toBe(true);
 expect(r.map).toEqual({5:'rules'});
 expect(r.simpleDue).toBe(0);
 expect(r.simpleInc).toBe(0);
 expect(r.fullDue).toBeGreaterThan(0);
 expect(r.fullInc).toBeGreaterThan(0);
});

test('B8: life mode leftover shown; toggling all clears life leftover in lifePayoutLeft',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-01-01';
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'small',day:5,amt:2736},{id:'next',day:10,amt:57000}];
  S.rules=[{id:'r5',day:5,acc:'save',amt:1987}];
  S.recur=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:55000,acc:'main',cat:'salary'}];
  delete S.payAllSave;
  const d=payDateIn('2026-12',5),ev=plannedItems(T,40);
  const life=lifePayoutLeft(d,ev);
  setPayAllSave(5,true,'rules');
  const all=lifePayoutLeft(d,plannedItems(T,40));
  setPayAllSave(5,false);
  const back=lifePayoutLeft(d,plannedItems(T,40));
  return {life,all,back};
 });
 expect(r.life).toBe(749);
 expect(r.all).toBe(0);
 expect(r.back).toBe(749);
});

test('B9: fc how lists receipt dates/names; allSave shows 0 ₽ на жизнь',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-11-26';S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000,name:'Зарплата'},
   {id:'small',day:5,amt:2736,name:'Мелочь'},
   {id:'next',day:10,amt:57000,name:'Аванс'}
  ];
  S.rules=[{id:'r25',day:25,acc:'save',amt:30000,name:'Копилка'},{id:'r5',day:5,acc:'save',amt:1987,name:'Часть'}];
  S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},
   {id:'tr25',type:'t',rule:'r25',date:'2026-11-25',amt:30000,from:'main',to:'save',note:'Копилка'}
  ];
  S.payAllSave={5:'rules'};
  // seed pace
  for(var i=1;i<=10;i++)S.entries.push({id:'k'+i,type:'e',cat:'cafe',amt:500,date:iso(addDays(parse(T),-i)),acc:'main'});
  const f=fcCalc();
  sh={id:'fc',fc:1};fcSheet();
  const html=document.getElementById('ov').innerHTML;
  const howOpen=document.querySelector('#ov details.fold');
  // open «Как считается»
  var how=null;
  document.querySelectorAll('#ov details.fold').forEach(function(d){if(/Как считается/.test(d.textContent))how=d});
  if(how)how.open=true;
  const howHtml=how?how.innerHTML:'';
  return {
   nd:f&&f.nd,inc:f&&f.inc,incs:f&&f.incs,due:f&&f.due,
   sheetHasWhatIf:/id="fc_wif"/.test(html),
   sheetHasDue:/Платежи и копилки/.test(html),
   howHasDate:/5\s*дек|декабр/i.test(howHtml)||/05\.12|5\./.test(howHtml),
   howHasName:/Мелочь/.test(howHtml),
   howHasZero:/0\s*₽\s*на жизнь/.test(howHtml)||/0&nbsp;₽ на жизнь/.test(howHtml)||/0\s*₽/.test(howHtml)&&/на жизнь/.test(howHtml),
   howHtml:howHtml.slice(0,800)
  };
 });
 expect(r.incs.length).toBeGreaterThan(0);
 expect(r.incs.some(x=>x.allSave)).toBe(true);
 expect(r.incs.filter(x=>x.allSave).every(x=>x.life===0)).toBe(true);
 expect(r.sheetHasWhatIf).toBe(false);
 expect(r.sheetHasDue).toBe(true);
 expect(r.howHasName).toBe(true);
 expect(r.howHasZero).toBe(true);
});

test('B10: fcIncList matches fcCalc — no boundary payout on nd',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.planFrom='2026-11-26';S.fcPlans=[];
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[
   {id:'salary',day:25,amt:55000,name:'Зарплата'},
   {id:'small',day:5,amt:2736,name:'Мелочь'},
   {id:'next',day:10,amt:57000,name:'Аванс'}
  ];
  S.rules=[{id:'r25',day:25,acc:'save',amt:30000},{id:'r5',day:5,acc:'save',amt:1987}];
  S.recur=[];
  S.entries=[
   {id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},
   {id:'tr25',type:'t',rule:'r25',date:'2026-11-25',amt:30000,from:'main',to:'save'}
  ];
  S.payAllSave={5:'rules'};
  for(var i=1;i<=10;i++)S.entries.push({id:'k'+i,type:'e',cat:'cafe',amt:500,date:iso(addDays(parse(T),-i)),acc:'main'});
  var f=fcCalc(),list=fcIncList(f.nd);
  var onBoundary=list.filter(function(x){return x.date===f.nd});
  var sumAmt=list.reduce(function(a,x){return a+(+x.amt||0)},0);
  // cashUntil path for same window
  var ev=plannedItems(T,sourceForecastDays()),nextPay={},nextYm={};
  ev.forEach(function(e){if(e.kind==='in'&&e.date===f.nd){if(e.payDay!=null)nextPay[+e.payDay]=1;if(e.ym)nextYm[e.ym]=1}});
  var cf=cashUntil(ev,f.nd,nextPay,nextYm,{});
  return {
   nd:f.nd,fInc:f.inc,cfInc:cf.inc,list:list,onBoundary:onBoundary.length,
   sumAmt:sumAmt,names:list.map(function(x){return x.name}),
   hasAdvance:list.some(function(x){return /Аванс/.test(x.name)}),
   hasSmall:list.some(function(x){return /Мелочь/.test(x.name)})
  };
 });
 expect(r.nd).toBeTruthy();
 expect(r.onBoundary).toBe(0); // выплата на границе nd не в списке
 expect(r.hasAdvance).toBe(false); // Аванс = nd
 expect(r.hasSmall).toBe(true); // Мелочь до границы
 expect(r.fInc).toBe(r.cfInc);
 expect(r.sumAmt).toBe(r.fInc); // суммы списка = учтённый inc (allSave life=0, amt полный)
});
