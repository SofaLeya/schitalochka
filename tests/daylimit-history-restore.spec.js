const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__phrProbe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(async()=>await window.__phrProbe());
}

test('approxDayLimitFromState covers simple, calc, irreg and full without cycle',async({page})=>{
 const r=await probe(page,()=>{
  var simple=approxDayLimitFromState({simple:true,dayLimit:1200,planCalc:null,incomes:[]});
  var calc=approxDayLimitFromState({simple:true,dayLimit:0,planCalc:{inc:60000,fixed:10000,save:5000,irr:0}});
  var irreg=approxDayLimitFromState({simple:true,irreg:true,dayLimit:0,planCalc:{inc:40000,fixed:5000,save:0,irr:0},selfPay:null});
  var selfPay=approxDayLimitFromState({simple:true,irreg:true,dayLimit:0,planCalc:{inc:1,fixed:0,save:0,irr:0},selfPay:{amt:30000,every:'m',acc:'main'},accounts:[{id:'main',type:'main'}]});
  var full=approxDayLimitFromState({simple:false,dayLimit:0,planCalc:null,incomes:[{id:'i',amt:90000,day:10}],recur:[{amt:15000,day:1}],rules:[{amt:10000,day:10}],rare:[{amt:12000}]});
  var none=approxDayLimitFromState({simple:false,dayLimit:0,planCalc:null,incomes:[]});
  return {
   simple:simple,calc:calc,irreg:irreg,selfPay:selfPay,full:full,none:none,
   calcExpect:planCalcVal({inc:60000,fixed:10000,save:5000,irr:0}),
   irregExpect:planCalcVal({inc:40000,fixed:5000,save:0,irr:0}),
   selfExpect:planCalcVal({inc:30000,fixed:0,save:0,irr:0}),
   fullExpect:planCalcVal({inc:90000,fixed:15000,save:10000,irr:1000})
  };
 });
 expect(r.simple).toBe(1200);
 expect(r.calc).toBe(r.calcExpect);
 expect(r.irreg).toBe(r.irregExpect);
 expect(r.selfPay).toBe(r.selfExpect);
 expect(r.full).toBe(r.fullExpect);
 expect(r.none).toBe(0);
});

test('planHistCollectFromState keeps existing keys and marks only new approx',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';
  var h={'2026-11-20':1000},approx={};
  var pack={v:1,app:'schitalochka',data:{
   entries:[],planDayHistory:{'2026-11-20':9999,'2026-11-21':1500,'2026-11-22':1600},
   planDayHistoryApprox:{'2026-11-22':1},
   dayLimit:2000,planCalc:null,simple:true
  }};
  var c1=planHistCollectFromState(h,approx,pack,'2026-11-23');
  // second pass must not overwrite
  var c2=planHistCollectFromState(h,approx,{entries:[],planDayHistory:{'2026-11-21':1},dayLimit:5000,simple:true},'2026-11-23');
  S.planDayHistory=h;S.planDayHistoryApprox=approx;
  return {h:h,approx:approx,c1:c1,c2:c2,at23:dayLimitAt('2026-11-23'),isApprox23:dayLimitApprox('2026-11-23'),isApprox21:dayLimitApprox('2026-11-21')};
 });
 expect(r.h['2026-11-20']).toBe(1000); // not overwritten by 9999
 expect(r.h['2026-11-21']).toBe(1500);
 expect(r.h['2026-11-22']).toBe(1600);
 expect(r.approx['2026-11-22']).toBe(1);
 expect(r.h['2026-11-23']).toBe(2000); // approx from dayLimit of pack
 expect(r.approx['2026-11-23']).toBe(1);
 expect(r.isApprox23).toBe(true);
 expect(r.isApprox21).toBe(false);
 expect(r.c1.n).toBe(3); // 21,22 exact/flagged + 23 approx
 expect(r.c2.n).toBe(0);
});

test('planHistRestore from snaps is one-shot and does not touch entries',async({page})=>{
 const r=await probe(page,async()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=1800;S.planDayHistory={};S.planDayHistoryApprox={};S.planHistRestored=0;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:100,date:'2026-11-20',acc:'main'}];
  var entriesBefore=JSON.stringify(S.entries),balBefore=balance();
  // local snap with history + older snap with only dayLimit
  SNAPS=[
   {d:'2026-11-24',t:1,why:'day',n:1,raw:JSON.stringify({entries:S.entries,accounts:S.accounts,planDayHistory:{'2026-11-22':1100,'2026-11-23':1200},dayLimit:1300,simple:true})},
   {d:'2026-11-21',t:2,why:'day',n:1,raw:JSON.stringify({entries:S.entries,accounts:S.accounts,dayLimit:1400,simple:true,planCalc:null})}
  ];
  // force offline path
  YD.st='off';
  try{localStorage.removeItem(YD.key)}catch(e){}
  await planHistRestore();
  var after1={hist:Object.assign({},S.planDayHistory),approx:Object.assign({},S.planDayHistoryApprox),flag:S.planHistRestored,n:Object.keys(S.planDayHistory).length};
  await planHistRestore(); // second call must no-op
  return {
   after1:after1,flag2:S.planHistRestored,
   hist2:Object.assign({},S.planDayHistory),
   entriesSame:JSON.stringify(S.entries)===entriesBefore,
   balSame:balance()===balBefore,
   at22:dayLimitAt('2026-11-22'),at21:dayLimitAt('2026-11-21'),approx21:dayLimitApprox('2026-11-21')
  };
 });
 expect(r.after1.flag).toBe(1);
 expect(r.flag2).toBe(1);
 expect(r.after1.hist['2026-11-22']).toBe(1100);
 expect(r.after1.hist['2026-11-23']).toBe(1200);
 expect(r.at21).toBe(1400);
 expect(r.approx21).toBe(true);
 expect(r.hist2).toEqual(r.after1.hist);
 expect(r.entriesSame).toBe(true);
 expect(r.balSame).toBe(true);
});

test('history UI marks approximate restored limits with ≈',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=2000;S.planDayHistory={'2026-11-20':1500,'2026-11-24':1800};
  S.planDayHistoryApprox={'2026-11-20':1};
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[
   {id:'e1',type:'e',cat:'cafe',amt:900,date:'2026-11-20',acc:'main'},
   {id:'e2',type:'e',cat:'cafe',amt:500,date:'2026-11-24',acc:'main'}
  ];
  hMonths=12;
  return histList();
 });
 expect(r).toMatch(/≈1[\s\u00a0\u202f]?500|≈[\s\u00a0\u202f]*1[\s\u00a0\u202f]?500/);
 expect(r).toMatch(/500[\s\S]{0,12}из/);
 expect(r).not.toMatch(/≈1[\s\u00a0\u202f]?800|≈[\s\u00a0\u202f]*1[\s\u00a0\u202f]?800/);
});

test('merge3 unions planDayHistory and approx flags across devices',async({page})=>{
 const r=await probe(page,()=>{
  var base={planDayHistory:{'2026-11-20':1000},planDayHistoryApprox:{},planHistRestored:0};
  var local={planDayHistory:{'2026-11-20':1000,'2026-11-21':1100},planDayHistoryApprox:{'2026-11-21':1},planHistRestored:1};
  var remote={planDayHistory:{'2026-11-20':1000,'2026-11-22':1200},planDayHistoryApprox:{},planHistRestored:1};
  return merge3(base,local,remote);
 });
 expect(r.planDayHistory).toEqual({'2026-11-20':1000,'2026-11-21':1100,'2026-11-22':1200});
 expect(r.planDayHistoryApprox['2026-11-21']).toBe(1);
 expect(r.planHistRestored).toBe(1);
});

test('unreliable full cycle state stays unknown without history',async({page})=>{
 const r=await probe(page,()=>{
  // full mode with only cycle-like live deps missing from snapshot → dayLimit 0, no planCalc
  // incomes empty → cannot reconstruct → 0
  var v=approxDayLimitFromState({simple:false,dayLimit:0,planCalc:null,incomes:[],recur:[],rules:[]});
  T='2026-11-25';S.planDayHistory={};S.planDayHistoryApprox={};
  var h={},a={};
  planHistCollectFromState(h,a,{simple:false,dayLimit:0,planCalc:null,incomes:[],entries:[]},'2026-11-24');
  return {v:v,h:h,known:dayLimitKnown('2026-11-24')};
 });
 expect(r.v).toBe(0);
 expect(r.h['2026-11-24']).toBeUndefined();
 expect(r.known).toBe(false);
});
