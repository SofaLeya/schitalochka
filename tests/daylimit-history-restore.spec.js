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

test('planHistEvalDayLimit uses real dayLimit formulas for simple/calc/irreg/full',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';
  var base={dlForm:DL_FORM,entries:[],accounts:[{id:'main',type:'main',start:50000}],rules:[],recur:[],rare:[],incomes:[],simple:true,irreg:false,planCalc:null,dayLimit:0};
  var simple=Object.assign({},base,{dayLimit:1200});
  var calc=Object.assign({},base,{dayLimit:0,planCalc:{inc:60000,fixed:10000,save:5000,irr:0}});
  var irreg=Object.assign({},base,{irreg:true,planCalc:{inc:40000,fixed:5000,save:0,irr:0}});
  var selfPay=Object.assign({},base,{irreg:true,planCalc:{inc:1,fixed:0,save:0,irr:0},selfPay:{amt:30000,every:'m',acc:'main'}});
  var full=Object.assign({},base,{simple:false,dayLimit:0,planCalc:null,incomes:[{id:'i',amt:90000,day:10}],recur:[{id:'r',amt:15000,day:1,name:'Rent'}],rules:[{id:'u',amt:10000,day:10,acc:'save',name:'Save'}],accounts:[{id:'main',type:'main',start:50000},{id:'save',type:'save',start:0}]});
  var none=Object.assign({},base,{simple:false,incomes:[]});
  return {
   simple:planHistEvalDayLimit(simple,'2026-11-24'),
   calc:planHistEvalDayLimit(calc,'2026-11-24'),
   irreg:planHistEvalDayLimit(irreg,'2026-11-24'),
   selfPay:planHistEvalDayLimit(selfPay,'2026-11-24'),
   full:planHistEvalDayLimit(full,'2026-11-24'),
   none:planHistEvalDayLimit(none,'2026-11-24'),
   calcExpect:planCalcVal({inc:60000,fixed:10000,save:5000,irr:0}),
   irregExpect:planCalcVal({inc:40000,fixed:5000,save:0,irr:0}),
   selfExpect:planCalcVal({inc:30000,fixed:0,save:0,irr:0})
  };
 });
 expect(r.simple).toBe(1200);
 expect(r.calc).toBe(r.calcExpect);
 expect(r.irreg).toBe(r.irregExpect);
 expect(r.selfPay).toBe(r.selfExpect);
 expect(r.full).toBeGreaterThan(0); // real planInfo/fullPlan path
 expect(r.none).toBe(0);
});

test('exact upgrades approx; exact never overwritten; date mismatch skips approx',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';
  var h={},approx={};
  // seed approx for 20
  planHistPut(h,approx,'2026-11-20',1111,true);
  // exact upgrades
  var up=planHistPut(h,approx,'2026-11-20',1500,false);
  // exact blocks exact
  var block=planHistPut(h,approx,'2026-11-20',9999,false);
  // approx cannot overwrite exact
  var noAp=planHistPut(h,approx,'2026-11-20',1,true);
  var badAsOf=planHistResolveAsOf({savedAt:Date.parse('2026-11-10T12:00:00Z')},'2026-11-24',null);
  var okAsOf=planHistResolveAsOf({savedAt:Date.parse('2026-11-24T12:00:00Z')},'2026-11-24',null);
  var pack={v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-23T15:00:00Z'),data:{
   dlForm:DL_FORM,entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2000,planCalc:null,planDayHistory:{'2026-11-21':1600}
  }};
  var c=planHistCollectFromState(h,approx,pack,planHistResolveAsOf(pack,'2026-11-23',null));
  return {h:h,approx:approx,up:up,block:block,noAp:noAp,badAsOf:badAsOf,okAsOf:okAsOf,c:c};
 });
 expect(r.up).toBe(true);
 expect(r.h['2026-11-20']).toBe(1500);
 expect(r.approx['2026-11-20']).toBeUndefined();
 expect(r.block).toBe(false);
 expect(r.noAp).toBe(false);
 expect(r.badAsOf).toBeNull();
 expect(r.okAsOf).toBe('2026-11-24');
 expect(r.h['2026-11-21']).toBe(1600);
 expect(r.h['2026-11-23']).toBe(2000);
 expect(r.approx['2026-11-23']).toBe(1);
});

test('g2 and viewAn ignore approximate limits for stars and overspend',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.rules=[];S.noSpend=[];S.dayLimit=1000;S.dlForm=DL_FORM;
  S.planDayHistory={'2026-11-22':1000,'2026-11-23':1000,'2026-11-24':1000};
  S.planDayHistoryApprox={'2026-11-23':1};
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',cat:'cafe',amt:500,date:'2026-11-22',acc:'main'},
   {id:'b',type:'e',cat:'cafe',amt:500,date:'2026-11-23',acc:'main'},
   {id:'c',type:'e',cat:'cafe',amt:2000,date:'2026-11-24',acc:'main'}
  ];
  var g=g2();
  vym='2026-11';
  var an=viewAn();
  return {days:g.days.map(function(x){return x.st}),stars:g.stars,html:an,exact22:dayLimitExact('2026-11-22'),exact23:dayLimitExact('2026-11-23')};
 });
 expect(r.exact22).toBe(true);
 expect(r.exact23).toBe(false);
 expect(r.days).toEqual(['good','nolim','over']);
 expect(r.stars).toBe(10); // only exact good day; approx not scored; over no stars
 expect(r.html).toMatch(/var\(--muted\)/);
});

test('planHistRestore retries cloud after local done; local is one-shot',async({page})=>{
 const r=await probe(page,async()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];
  S.dayLimit=1800;S.dlForm=DL_FORM;S.planDayHistory={};S.planDayHistoryApprox={};S.planHistRestored=0;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:100,date:'2026-11-20',acc:'main'}];
  var entriesBefore=JSON.stringify(S.entries);
  SNAPS=[{d:'2026-11-21',t:Date.parse('2026-11-21T12:00:00Z'),why:'day',n:1,
   raw:JSON.stringify({dlForm:DL_FORM,entries:S.entries,accounts:S.accounts,dayLimit:1400,simple:true,planCalc:null})}];
  YD.st='off';try{localStorage.removeItem(YD.key)}catch(e){}
  await planHistRestore();
  var afterLocal={flag:S.planHistRestored,at21:dayLimitAt('2026-11-21'),approx21:!!S.planDayHistoryApprox['2026-11-21'],pending:planHistCloudPending()};
  // simulate later cloud connect without phrCloud
  ydSet({tok:'t',prov:'yd',phrCloud:undefined});YD.st='ok';
  var pending2=planHistCloudPending();
  // stub cloud downloads
  var calls={main:0,list:0,path:0};
  ydDownload=async function(){calls.main++;return {v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-22T10:00:00Z'),data:{dlForm:DL_FORM,entries:S.entries,accounts:S.accounts,simple:true,dayLimit:0,planDayHistory:{'2026-11-22':1100}}};};
  ydListDailies=async function(){calls.list++;return [{name:'schitalochka-2026-11-23.json',path:'app:/Копии/schitalochka-2026-11-23.json',day:'2026-11-23'}];};
  ydDownloadPath=async function(){calls.path++;return {v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-23T10:00:00Z'),data:{dlForm:DL_FORM,entries:S.entries,accounts:S.accounts,simple:true,dayLimit:1700,planCalc:null}};};
  await planHistRestore();
  var afterCloud={phrCloud:ydGet().phrCloud,at22:dayLimitAt('2026-11-22'),at23:dayLimitAt('2026-11-23'),approx23:dayLimitApprox('2026-11-23'),calls:calls,pending3:planHistCloudPending()};
  await planHistRestore(); // should no-op
  return {afterLocal:afterLocal,pending2:pending2,afterCloud:afterCloud,entriesSame:JSON.stringify(S.entries)===entriesBefore,n22:calls};
 });
 expect(r.afterLocal.flag).toBe(1);
 expect(r.afterLocal.at21).toBe(1400);
 expect(r.afterLocal.approx21).toBe(true);
 expect(r.afterLocal.pending).toBe(false);
 expect(r.pending2).toBe(true);
 expect(r.afterCloud.phrCloud).toBe(1);
 expect(r.afterCloud.at22).toBe(1100);
 expect(r.afterCloud.approx23).toBe(true);
 expect(r.afterCloud.at23).toBe(1700);
 expect(r.afterCloud.pending3).toBe(false);
 expect(r.afterCloud.calls.main).toBe(1);
 expect(r.entriesSame).toBe(true);
});

test('history shows ≈ muted; merge3 keeps maps',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.dayLimit=2000;S.dlForm=DL_FORM;
  S.planDayHistory={'2026-11-20':1500,'2026-11-24':1800};
  S.planDayHistoryApprox={'2026-11-20':1};
  S.accounts=[{id:'main',type:'main',start:50000}];
  S.entries=[
   {id:'e1',type:'e',cat:'cafe',amt:900,date:'2026-11-20',acc:'main'},
   {id:'e2',type:'e',cat:'cafe',amt:500,date:'2026-11-24',acc:'main'}
  ];
  hMonths=12;
  var hist=histList();
  var merged=merge3(
   {planDayHistory:{'2026-11-20':1000},planDayHistoryApprox:{},planHistRestored:0},
   {planDayHistory:{'2026-11-20':1000,'2026-11-21':1100},planDayHistoryApprox:{'2026-11-21':1},planHistRestored:1},
   {planDayHistory:{'2026-11-20':1000,'2026-11-22':1200},planDayHistoryApprox:{},planHistRestored:1}
  );
  return {hist:hist,merged:merged};
 });
 expect(r.hist).toMatch(/≈/);
 expect(r.hist).toMatch(/var\(--muted\)/);
 expect(r.merged.planDayHistory).toEqual({'2026-11-20':1000,'2026-11-21':1100,'2026-11-22':1200});
 expect(r.merged.planDayHistoryApprox['2026-11-21']).toBe(1);
});

test('unreliable eval leaves day unknown',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';
  var v=planHistEvalDayLimit({dlForm:DL_FORM,simple:false,dayLimit:0,planCalc:null,incomes:[],entries:[],accounts:[{id:'main',type:'main',start:0}]},'2026-11-24');
  var h={},a={};
  planHistCollectFromState(h,a,{dlForm:DL_FORM,simple:false,dayLimit:0,planCalc:null,incomes:[],entries:[],accounts:[{id:'main',type:'main',start:0}]},'2026-11-24');
  return {v:v,h:h,known:Object.prototype.hasOwnProperty.call(h,'2026-11-24')};
 });
 expect(r.v).toBe(0);
 expect(r.known).toBe(false);
});

test('unknown or foreign dlForm skips eval restore; matching form allows it',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';
  var h1={},a1={},h2={},a2={},h3={},a3={};
  var bare={entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2500,planCalc:null};
  var old={dlForm:99,entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2500,planCalc:null};
  var ok={dlForm:DL_FORM,entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2500,planCalc:null};
  var packBare={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-24T12:00:00Z'),data:bare};
  var packOld={v:1,app:'schitalochka',dlForm:99,savedAt:Date.parse('2026-11-24T12:00:00Z'),data:old};
  var packOk={v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-24T12:00:00Z'),data:ok};
  planHistCollectFromState(h1,a1,packBare,planHistResolveAsOf(packBare,'2026-11-24',null));
  planHistCollectFromState(h2,a2,packOld,planHistResolveAsOf(packOld,'2026-11-24',null));
  planHistCollectFromState(h3,a3,packOk,planHistResolveAsOf(packOk,'2026-11-24',null));
  return {
   bareEval:planHistEvalDayLimit(bare,'2026-11-24'),
   oldEval:planHistEvalDayLimit(old,'2026-11-24'),
   okEval:planHistEvalDayLimit(ok,'2026-11-24'),
   canBare:planHistCanEval(packBare),
   canOld:planHistCanEval(packOld),
   canOk:planHistCanEval(packOk),
   h1:h1,h2:h2,h3:h3,a3:a3,
   packHasForm:JSON.parse(ydPack(ok)).dlForm
  };
 });
 expect(r.bareEval).toBe(0);
 expect(r.oldEval).toBe(0);
 expect(r.okEval).toBe(2500);
 expect(r.canBare).toBe(false);
 expect(r.canOld).toBe(false);
 expect(r.canOk).toBe(true);
 expect(r.h1['2026-11-24']).toBeUndefined();
 expect(r.h2['2026-11-24']).toBeUndefined();
 expect(r.h3['2026-11-24']).toBe(2500);
 expect(r.a3['2026-11-24']).toBe(1);
 expect(r.packHasForm).toBe(1);
});

test('failed daily download does not mark phrCloud complete',async({page})=>{
 const r=await probe(page,async()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.dayLimit=1000;S.dlForm=DL_FORM;
  S.planDayHistory={};S.planDayHistoryApprox={};S.planHistRestored=1;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:50,date:'2026-11-20',acc:'main'}];
  ydSet({tok:'t',prov:'yd',phrCloud:undefined});YD.st='ok';
  ydDownload=async function(){return {v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-22T10:00:00Z'),data:{dlForm:DL_FORM,entries:S.entries,accounts:S.accounts,simple:true,dayLimit:0,planDayHistory:{'2026-11-22':900}}};};
  ydListDailies=async function(){return [
   {name:'schitalochka-2026-11-23.json',path:'app:/Копии/schitalochka-2026-11-23.json',day:'2026-11-23'},
   {name:'schitalochka-2026-11-24.json',path:'app:/Копии/schitalochka-2026-11-24.json',day:'2026-11-24'}
  ];};
  ydDownloadPath=async function(path){
   if(/2026-11-24/.test(path))throw {code:500,message:'fail'};
   return {v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-23T10:00:00Z'),data:{dlForm:DL_FORM,entries:S.entries,accounts:S.accounts,simple:true,dayLimit:1600}};
  };
  await planHistRestore();
  return {
   phrCloud:ydGet().phrCloud,
   pending:planHistCloudPending(),
   at22:dayLimitAt('2026-11-22'),
   at23:dayLimitAt('2026-11-23'),
   at24:Object.prototype.hasOwnProperty.call(S.planDayHistory||{},'2026-11-24')
  };
 });
 expect(r.phrCloud).toBeUndefined();
 expect(r.pending).toBe(true);
 expect(r.at22).toBe(900);
 expect(r.at23).toBe(1600);
 expect(r.at24).toBe(false);
});

test('restored history survives ydAdopt and phrBusy blocks ydSync',async({page})=>{
 const r=await probe(page,async()=>{
  T='2026-11-25';S.demo=false;S.simple=true;S.dayLimit=1000;S.dlForm=DL_FORM;
  S.planDayHistory={'2026-11-20':1400,'2026-11-21':1500};
  S.planDayHistoryApprox={'2026-11-21':1};
  S.planHistRestored=1;
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:50,date:'2026-11-20',acc:'main'}];
  // adopt cloud without history — local restored maps must remain
  ydAdopt({data:{
   entries:S.entries.slice(),
   accounts:[{id:'main',type:'main',start:10000}],
   simple:true,dayLimit:1000,dlForm:DL_FORM,
   planDayHistory:{},planDayHistoryApprox:{}
  }},'mod-x');
  var afterAdopt={
   at20:S.planDayHistory['2026-11-20'],
   at21:S.planDayHistory['2026-11-21'],
   approx21:!!S.planDayHistoryApprox['2026-11-21'],
   flag:S.planHistRestored
  };
  // mutual exclusion: sync while restore busy defers
  ydSet({tok:'t',prov:'yd'});YD.st='ok';
  YD.phrBusy=true;YD.again=false;YD.phrNeedSync=false;
  ydChanged();
  var need=!!YD.phrNeedSync;
  await ydSync();
  var again=!!YD.again;
  YD.phrBusy=false;YD.again=false;YD.phrNeedSync=false;
  // mid-restore S replace: finally merge still re-applies collected maps
  S.planDayHistory={};S.planDayHistoryApprox={};S.planHistRestored=0;
  SNAPS=[{d:'2026-11-22',t:Date.parse('2026-11-22T12:00:00Z'),why:'day',n:1,
   raw:JSON.stringify({dlForm:DL_FORM,entries:S.entries,accounts:S.accounts,dayLimit:1700,simple:true,planCalc:null,planDayHistory:{'2026-11-19':1300}})}];
  YD.st='off';try{localStorage.removeItem(YD.key)}catch(e){}
  var origMerge=planHistMergeIntoS;
  var hijacked=false;
  planHistMergeIntoS=function(hist,approxMap){
   if(!hijacked){
    hijacked=true;
    // имитация параллельного adopt: S без истории
    S={demo:false,simple:true,dayLimit:1000,dlForm:DL_FORM,planDayHistory:{},planDayHistoryApprox:{},
     accounts:[{id:'main',type:'main',start:10000}],entries:S.entries.slice(),planHistRestored:0};
   }
   return origMerge(hist,approxMap);
  };
  await planHistRestore();
  planHistMergeIntoS=origMerge;
  return {
   afterAdopt:afterAdopt,need:need,again:again,
   afterRace:{at19:S.planDayHistory['2026-11-19'],at22:S.planDayHistory['2026-11-22'],flag:S.planHistRestored}
  };
 });
 expect(r.afterAdopt.at20).toBe(1400);
 expect(r.afterAdopt.at21).toBe(1500);
 expect(r.afterAdopt.approx21).toBe(true);
 expect(r.afterAdopt.flag).toBe(1);
 expect(r.need).toBe(true);
 expect(r.again).toBe(true);
 expect(r.afterRace.at19).toBe(1300);
 expect(r.afterRace.at22).toBe(1700);
 expect(r.afterRace.flag).toBe(1);
});
