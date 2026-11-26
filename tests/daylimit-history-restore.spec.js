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
  T='2026-11-28';
  var h2={},a2={},h3={},a3={};
  // без даты и без маркера — эра неизвестна (не выводим по asOf внутри bareEval без day→form: day передаётся)
  var nodate={entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2500,planCalc:null};
  var old={dlForm:99,entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2500,planCalc:null};
  var ok={dlForm:DL_FORM,entries:[],accounts:[{id:'main',type:'main',start:10000}],simple:true,dayLimit:2500,planCalc:null};
  var packNodate={v:1,app:'schitalochka',data:nodate}; // нет savedAt → без asOf неизвестно
  var packOld={v:1,app:'schitalochka',dlForm:99,savedAt:Date.parse('2026-11-24T12:00:00Z'),data:old};
  var packOk={v:1,app:'schitalochka',dlForm:DL_FORM,savedAt:Date.parse('2026-11-24T12:00:00Z'),data:ok};
  planHistCollectFromState(h2,a2,packOld,planHistResolveAsOf(packOld,'2026-11-24',null));
  planHistCollectFromState(h3,a3,packOk,planHistResolveAsOf(packOk,'2026-11-24',null));
  var h0={},a0={};
  planHistCollectFromState(h0,a0,packNodate,null);
  return {
   nodateEval:planHistEvalDayLimit(nodate,'2026-11-24'), // day alone → PRE stable → ok
   noAsOfCan:planHistCanEval(packNodate),
   oldEval:planHistEvalDayLimit(old,'2026-11-24'),
   okEval:planHistEvalDayLimit(ok,'2026-11-24'),
   canOld:planHistCanEval(packOld),
   canOk:planHistCanEval(packOk),
   h0:h0,h2:h2,h3:h3,a3:a3,
   packHasForm:JSON.parse(ydPack(ok)).dlForm
  };
 });
 // day=2026-11-24 без маркера → PRE + simple → можно
 expect(r.nodateEval).toBe(2500);
 expect(r.noAsOfCan).toBe(false); // pack без savedAt и без asOf
 expect(r.oldEval).toBe(0);
 expect(r.okEval).toBe(2500);
 expect(r.canOld).toBe(false);
 expect(r.canOk).toBe(true);
 expect(r.h0['2026-11-24']).toBeUndefined();
 expect(r.h2['2026-11-24']).toBeUndefined();
 expect(r.h3['2026-11-24']).toBe(2500);
 expect(r.a3['2026-11-24']).toBe(1);
 expect(r.packHasForm).toBe(1);
});

test('pre-dlForm backups: infer form from release timeline and snapshot date',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-28';
  // Реальные формы копий: ydPack без dlForm; локальный snap.raw = JSON.stringify(S); файл = plain S.
  var simplePre={v:1,entries:[],accounts:[{id:'a1',name:'Основная карта',type:'main',start:50000}],
   rules:[],recur:[],incomes:[],simple:true,irreg:false,dayLimit:1800,planCalc:null};
  var calcPre={v:1,entries:[{id:'e1',type:'e',cat:'cafe',amt:100,date:'2026-11-20',acc:'a1'}],
   accounts:[{id:'a1',name:'Основная карта',type:'main',start:40000}],
   rules:[],simple:true,irreg:false,dayLimit:0,planCalc:{inc:60000,fixed:10000,save:5000,irr:0}};
  var fullPre={v:1,entries:[],accounts:[{id:'a1',type:'main',start:50000},{id:'save',type:'save',start:0}],
   simple:false,irreg:false,dayLimit:0,planCalc:null,
   incomes:[{id:'i',amt:90000,day:10}],recur:[{id:'r',amt:15000,day:1,name:'Rent'}],
   rules:[{id:'u',amt:10000,day:10,acc:'save',name:'Save'}]};
  var packSimple={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-20T15:00:00Z'),dev:'x',data:simplePre};
  var packCalc={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-22T10:00:00Z'),data:calcPre};
  var packFull={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-23T18:00:00Z'),data:fullPre};
  var packChurn={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-25T12:00:00Z'),data:Object.assign({},simplePre)};
  var packCur={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-26T08:00:00Z'),data:Object.assign({},fullPre)}; // после churn = текущие формулы
  var snapLocal={d:'2026-11-21',t:Date.parse('2026-11-21T09:30:00Z'),why:'day',n:1,raw:JSON.stringify(simplePre)};
  var hS={},aS={},hC={},aC={},hF={},aF={},hCh={},aCh={},hCur={},aCur={},hSnap={},aSnap={};
  planHistCollectFromState(hS,aS,packSimple,planHistResolveAsOf(packSimple,'2026-11-20',null));
  planHistCollectFromState(hC,aC,packCalc,planHistResolveAsOf(packCalc,'2026-11-22',null));
  planHistCollectFromState(hF,aF,packFull,planHistResolveAsOf(packFull,'2026-11-23',null));
  planHistCollectFromState(hCh,aCh,packChurn,planHistResolveAsOf(packChurn,'2026-11-25',null));
  planHistCollectFromState(hCur,aCur,packCur,planHistResolveAsOf(packCur,'2026-11-26',null));
  var st;try{st=JSON.parse(snapLocal.raw)}catch(e){st=null}
  planHistCollectFromState(hSnap,aSnap,st,planHistResolveAsOf(null,snapLocal.d,snapLocal.t));
  return {
   formPre:planHistFormOf(packSimple,'2026-11-20'),
   formChurn:planHistFormOf(packChurn,'2026-11-25'),
   formCur:planHistFormOf(packCur,'2026-11-26'),
   canSimple:planHistCanEval(packSimple,'2026-11-20'),
   canFullPre:planHistCanEval(packFull,'2026-11-23'),
   canChurn:planHistCanEval(packChurn,'2026-11-25'),
   canCurFull:planHistCanEval(packCur,'2026-11-26'),
   hS:hS,aS:aS,hC:hC,hF:hF,hCh:hCh,hCur:hCur,aCur:aCur,hSnap:hSnap,
   calcExpect:planCalcVal({inc:60000,fixed:10000,save:5000,irr:0}),
   curFull:hCur['2026-11-26']
  };
 });
 expect(r.formPre).toBe(2); // DL_FORM_PRE
 expect(r.formChurn).toBe(0);
 expect(r.formCur).toBe(1);
 expect(r.canSimple).toBe(true);
 expect(r.canFullPre).toBe(true); // проверенная формула полного режима до cycle
 expect(r.canChurn).toBe(false);
 expect(r.canCurFull).toBe(true); // с 26.11 полный = текущий cycle
 expect(r.hS['2026-11-20']).toBe(1800);
 expect(r.aS['2026-11-20']).toBe(1);
 expect(r.hC['2026-11-22']).toBe(r.calcExpect);
 expect(r.hF['2026-11-23']).toBe(2100);
 expect(r.hCh['2026-11-25']).toBeUndefined();
 expect(r.curFull).toBeGreaterThan(0);
 expect(r.aCur['2026-11-26']).toBe(1);
 expect(r.hSnap['2026-11-21']).toBe(1800);
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
 // 24-е могло заполниться ≈ из соседнего снимка (fillGaps), но phrCloud всё равно не ставим
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

test('legacy full snapshot uses actual income, covered payments and conditional savings',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';
  const st={simple:false,irreg:false,accounts:[{id:'main',type:'main',start:50000},{id:'save',type:'save',start:1000,goal:100000},{id:'later',type:'save',start:0}],entries:[{id:'paid',type:'i',iid:'salary',date:'2026-11-20',amt:60000,acc:'main',cat:'salary'}],incomes:[{id:'salary',day:20,amt:90000}],recur:[{id:'rent',amt:10000,acc:'save'},{id:'phone',amt:1000}],rules:[{id:'s',acc:'save',amt:12000,day:20},{id:'l',acc:'later',amt:20000,day:20,after:'save'}]};
  let h={},a={};planHistCollectFromState(h,a,st,'2026-11-21');
  return {h,a};
 });
 // (60000 - 1000 - max(10000,12000)) / 30.4, rounded down to 50.
 expect(r.h['2026-11-21']).toBe(1500);
 expect(r.a['2026-11-21']).toBe(1);
});
test('migration reopens completed restore and repairs bad transition-day limit in same payout cycle',async({page})=>{
 const r=await probe(page,async()=>{
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.rare=[];S.recur=[];S.planFrom='2026-01-01';S.skips=[];
  // Ноябрьская раскладка day=5 уже закрыта (ruleZero): иначе просроченное правило
  // смещается на from и занижает free на 2000 без парного дохода. В цикле остаётся
  // декабрьский wash 2000→копилка (net 0). Бюджет: (20000+55000-30000)/15 = 3000.
  S.ruleZero={'r5|2026-11':1};
  S.accounts=[{id:'main',type:'main',start:20000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'salary',day:25,amt:55000},{id:'next',day:10,amt:57000},{id:'small',day:5,amt:2000}];
  S.rules=[{id:'r25',day:25,acc:'save',amt:30000},{id:'r5',day:5,acc:'save',amt:2000}];
  S.entries=[{id:'income',type:'i',iid:'salary',date:'2026-11-25',amt:55000,acc:'main',cat:'salary'},{id:'alloc',type:'t',rule:'r25',date:'2026-11-25',amt:30000,from:'main',to:'save'},{id:'buy',type:'e',date:'2026-11-26',amt:700,acc:'main',cat:'prod'}];
  S.planDayHistory={'2026-11-24':1200,'2026-11-25':5000};S.planDayHistoryApprox={};delete S.planDayHistoryRepair;S.planHistRestored=1;delete S.planHistRestoreRev;
  SNAPS=[];YD.st='off';try{localStorage.removeItem(YD.key)}catch(e){}
  const before=JSON.stringify(S.entries),bal=balance(),cp=cycleDayPlan(),v=dayLimit(),candidate=planHistCycleRepair(S,T);
  await planHistRestore();
  const after=dayLimitAt('2026-11-25'),approx=dayLimitApprox('2026-11-25');
  const stale=JSON.parse(JSON.stringify(S));stale.planDayHistory['2026-11-25']=5000;delete stale.planDayHistoryRepair;delete stale.planDayHistoryApprox['2026-11-25'];
  ydAdopt({data:stale},'stale');
  return {candidate,v,after,approx,rev:S.planHistRestoreRev,old:dayLimitAt('2026-11-24'),afterSync:dayLimitAt('2026-11-25'),approxSync:dayLimitApprox('2026-11-25'),same:JSON.stringify(S.entries)===before&&balance()===bal,free:cp.free,days:cp.days,due:cp.due,inc:cp.inc};
 });
 // free/days: 45000/15; due+inc декабря day=5 взаимно гасятся.
 expect(r.free).toBe(45000);
 expect(r.days).toBe(15);
 expect(r.due).toBe(r.inc);
 expect(r.candidate).toBeCloseTo(3000,5);
 expect(r.v).toBeCloseTo(r.candidate,5);
 expect(r.after).toBeCloseTo(r.candidate,5);
 expect(r.approx).toBe(true);
 expect(r.rev).toBe(3);
 expect(r.old).toBe(1200);
 expect(r.afterSync).toBeCloseTo(r.candidate,5);
 expect(r.approxSync).toBe(true);
 expect(r.same).toBe(true);
});

test('fillGaps restores missing days between backups across full operation history as approx',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';
  // Два снимка с дырой 21–22; операции с planFrom — заполняем всю историю ≈.
  var early={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-20T12:00:00Z'),data:{
   simple:true,dayLimit:1600,dlForm:undefined,planFrom:'2026-11-18',planCalc:null,g2L:5,
   accounts:[{id:'main',type:'main',start:20000}],
   entries:[{id:'e1',type:'e',cat:'cafe',amt:100,date:'2026-11-18',acc:'main'},{id:'e2',type:'e',cat:'cafe',amt:100,date:'2026-11-19',acc:'main'}],
   incomes:[],rules:[],recur:[]
  }};
  var late={v:1,app:'schitalochka',savedAt:Date.parse('2026-11-23T12:00:00Z'),data:{
   simple:true,dayLimit:1800,dlForm:undefined,planFrom:'2026-11-18',planCalc:null,g2L:6,
   accounts:[{id:'main',type:'main',start:20000}],
   entries:early.data.entries.concat([
    {id:'e3',type:'e',cat:'cafe',amt:100,date:'2026-11-21',acc:'main'},
    {id:'e4',type:'e',cat:'cafe',amt:100,date:'2026-11-22',acc:'main'}
   ]),
   incomes:[],rules:[],recur:[]
  }};
  S=migrate(JSON.parse(JSON.stringify(late.data)));S.demo=false;S.dayLimit=2000;S.dlForm=DL_FORM;
  S.planDayHistory={};S.planDayHistoryApprox={};S.g2L=3;delete S.g2Stars;delete S.g2From;
  var h={},a={},sources=[];
  function take(pack,day){
   var asOf=planHistResolveAsOf(pack,day,null);
   planHistCollectFromState(h,a,pack,asOf);
   sources.push({state:pack,asOf:asOf});
   g2ProgressLift(g2ProgressFromState(pack));
  }
  take(early,'2026-11-20');take(late,'2026-11-23');
  var filled=planHistFillGaps(h,a,sources);
  planHistMergeIntoS(h,a);
  g2ProgressSeal();
  var g=g2();
  return {
   at18:h['2026-11-18'],at19:h['2026-11-19'],at20:h['2026-11-20'],at21:h['2026-11-21'],at22:h['2026-11-22'],at23:h['2026-11-23'],
   approx18:!!a['2026-11-18'],approx21:!!a['2026-11-21'],approx23:!!a['2026-11-23'],
   filled:filled.n,g2L:S.g2L,g2Stars:S.g2Stars,g2From:S.g2From,level:g.L,stars:g.stars,
   min6:g2MinStars(6)
  };
 });
 expect(r.at20).toBe(1600);
 expect(r.at23).toBe(1800);
 expect(r.at18).toBe(1600); // до первого бэкапа
 expect(r.at21).toBeGreaterThan(0); // дыра между бэкапами
 expect(r.at22).toBeGreaterThan(0);
 expect(r.approx18).toBe(true);
 expect(r.approx21).toBe(true);
 expect(r.approx23).toBe(true);
 expect(r.filled).toBeGreaterThan(0);
 expect(r.g2L).toBe(6); // из бэкапа, не 3
 expect(r.g2Stars).toBe(r.min6);
 expect(r.g2From).toBe('2026-11-26');
 expect(r.level).toBe(6);
 expect(r.stars).toBeGreaterThanOrEqual(r.min6);
});

test('game progress floor survives limit/mode change and sync without double award',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-26';S.demo=false;S.simple=true;S.irreg=false;S.planCalc=null;S.incomes=[];S.rules=[];
  S.dayLimit=1000;S.dlForm=DL_FORM;S.noSpend=[];
  S.planDayHistory={'2026-11-24':1000,'2026-11-25':1000};
  S.planDayHistoryApprox={};
  S.accounts=[{id:'main',type:'main',start:10000}];
  S.entries=[
   {id:'a',type:'e',cat:'cafe',amt:800,date:'2026-11-24',acc:'main'},
   {id:'b',type:'e',cat:'cafe',amt:900,date:'2026-11-25',acc:'main'}
  ];
  delete S.g2From;delete S.g2Stars;S.g2L=1;
  var before=g2();
  // смена лимита и режима не забирает пол
  S.g2Stars=1000;S.g2L=6;S.g2From='2026-11-26';
  S.dayLimit=100;S.simple=false;S.incomes=[{id:'i',amt:90000,day:10}];
  var afterChange=g2();
  // sync/adopt с меньшим прогрессом — max
  var keep={L:S.g2L,stars:S.g2Stars,from:S.g2From};
  g2ProgressLift({L:3,stars:160,from:null});
  g2ProgressLift(keep);
  ydAdopt({data:{
   entries:S.entries.slice(),accounts:S.accounts.slice(),simple:true,dayLimit:1000,dlForm:DL_FORM,
   planDayHistory:S.planDayHistory,planDayHistoryApprox:{},g2L:4,g2Stars:400
  }},'m');
  var afterSync={L:S.g2L,stars:S.g2Stars,from:S.g2From};
  var again=g2();
  return {
   beforeStars:before.stars,afterStars:afterChange.stars,afterL:afterChange.L,
   afterSync:afterSync,againStars:again.stars,againL:again.L,min6:g2MinStars(6)
  };
 });
 expect(r.beforeStars).toBe(20);
 expect(r.afterL).toBe(6);
 expect(r.afterStars).toBeGreaterThanOrEqual(r.min6);
 expect(r.afterSync.L).toBe(6); // не откатилось к 4
 expect(r.afterSync.stars).toBeGreaterThanOrEqual(r.min6);
 expect(r.againL).toBe(6);
 expect(r.againStars).toBe(r.afterStars); // без повторного начисления
});

test('regression: backup g2L=6 restores level after update dropped it to 3',async({page})=>{
 const r=await probe(page,async()=>{
  T='2026-11-26';S.demo=false;S.simple=false;S.irreg=false;S.planCalc={inc:119330,fixed:49160,save:20000,irr:0};
  S.dlForm=DL_FORM;S.planFrom='2026-10-30';S.dayLimit=0;
  S.g2L=3;delete S.g2Stars;delete S.g2From;
  S.planDayHistory={'2026-11-26':1778};S.planDayHistoryApprox={};S.planHistRestored=1;delete S.planHistRestoreRev;
  S.accounts=[{id:'main',type:'main',start:10000},{id:'save',type:'save',start:0}];
  S.incomes=[{id:'i',amt:90000,day:10}];S.recur=[];S.rules=[{id:'u',amt:10000,day:10,acc:'save'}];
  S.entries=[{id:'e',type:'e',cat:'cafe',amt:500,date:'2026-11-20',acc:'main'}];
  SNAPS=[{d:'2026-11-23',t:Date.parse('2026-11-23T12:00:00Z'),why:'day',n:1,raw:JSON.stringify({
   simple:false,planCalc:{inc:119330,fixed:49160,save:20000,irr:0},planFrom:'2026-10-30',g2L:6,
   accounts:S.accounts,entries:S.entries,incomes:[{id:'i',amt:90000,day:10}],recur:[],rules:S.rules
  })}];
  YD.st='off';try{localStorage.removeItem(YD.key)}catch(e){}
  await planHistRestore();
  var g=g2();
  return {L:S.g2L,stars:S.g2Stars,from:S.g2From,rev:S.planHistRestoreRev,gL:g.L,gStars:g.stars,min6:g2MinStars(6),at20:dayLimitAt('2026-11-20'),approx20:dayLimitApprox('2026-11-20')};
 });
 expect(r.L).toBe(6);
 expect(r.stars).toBe(r.min6);
 expect(r.gL).toBe(6);
 expect(r.gStars).toBeGreaterThanOrEqual(r.min6);
 expect(r.rev).toBe(3);
 expect(r.at20).toBeGreaterThan(0);
 expect(r.approx20).toBe(true);
});
