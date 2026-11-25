const { test, expect } = require('@playwright/test');
async function probe(page, scenario) {
  await page.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort());
  await page.route(/\/index\.html(?:\?.*)?$/, async route => {
    const response = await route.fetch(), html=await response.text();
    const marker='})();\n/* Новая версия на сайте:';
    if(!html.includes(marker)) throw Error('Income source probe marker not found');
    await route.fulfill({response,body:html.replace(marker,'window.__incomeProbe = '+scenario.toString()+';\n'+marker)});
  });
  await page.goto('/index.html');
  return page.evaluate(()=>window.__incomeProbe());
}
test('daily, weekly, 14-day, 45-day, monthly intervals, exact dates and irregular income', async ({page})=>{
  const result=await probe(page,()=>{
    T='2026-11-25'; S.rucal={}; S.entries=[]; S.rules=[]; S.recur=[];
    const def={kind:'other',basis:'payment',amount:1000,net:true,tax:0,start:'2026-11-01',interval:45,unit:'days',shift:false,dates:[5,20],quantity:1};
    const rows=(freq,ym,extra={})=>{S.incomes=[{id:'src',name:'Test',day:5,amt:1000,source:{...def,freq,...extra}}];return incomeRows(ym)};
    const daily=rows('daily','2026-11');
    const weekly=rows('weekly','2026-11');
    const bi=rows('biweekly','2026-11');
    const custom=rows('custom','2026-12');
    const months=rows('custom','2027-02',{start:'2026-11-30',interval:3,unit:'months'});
    const dates=rows('dates','2026-11');
    const once=rows('once','2026-11');
    const irregular=rows('irregular','2026-11');
    return {daily:daily.length,unique:new Set(daily.map(r=>r.id)).size,weekly:weekly.map(r=>r.scheduled),bi:bi.map(r=>r.scheduled),custom:custom.map(r=>r.scheduled),months:months.map(r=>r.scheduled),dates:dates.map(r=>r.scheduled),once:once.length,irregular:irregular.length};
  });
  expect(result).toEqual({daily:30,unique:30,weekly:['2026-11-01','2026-11-08','2026-11-15','2026-11-22','2026-11-29'],bi:['2026-11-01','2026-11-15','2026-11-29'],custom:['2026-12-16'],months:['2027-02-28'],dates:['2026-11-05','2026-11-20'],once:1,irregular:0});
});
test('single source handles salary gross and net, preserves existing pair IDs and shifts payments',async ({page})=>{
  const result=await probe(page,()=>{
    T='2026-11-25';S.rucal={};S.entries=[];S.rules=[];S.recur=[];
    const config={kind:'tk',freq:'twice',basis:'month',amount:132000,net:false,tax:13,start:'2026-11-01',dates:[25,10],days:[1,2,3,4,5],hours:8,method:'days',shift:true,share:50,secondId:'old-second'};
    S.incomes=[{id:'old-second',name:'old',amt:57420,day:10,sourceParent:'salary'},{id:'salary',name:'Employer',day:25,amt:114840,source:config}];
    const first=incomeRows('2026-11').find(r=>r.id==='salary'),second=incomeRows('2026-12').find(r=>r.id==='old-second');
    const owner=sourceOwner(second.id).id;
    S.entries.push({id:'paid',iid:'salary',type:'i',date:'2026-11-25',amt:51678});
    const outstanding=plannedItems(T,20).filter(r=>r.kind==='in').map(r=>[r.date,r.amt]);
    S.incomes[1].source={...config,amount:114840,net:true};
    const netFirst=incomeRows('2026-11').find(r=>r.id==='salary').amt;
    S.incomes[1].source={...config,dates:[20,5],amount:50000,days:[1,3],hours:2,method:'hours'};
    const otp=incomeRows('2026-12').find(r=>r.id==='old-second');
    return {first:first.amt,second:second.amt,owner,netFirst,otp:[otp.scheduled,otp.amt],outstanding};
  });
  expect(result).toEqual({first:51678,second:63162,owner:'salary',netFirst:51678,otp:['2026-12-04',2736],outstanding:[['2026-12-10',63162]]});
});
test('payment occurrences can be independently marked and retain history on relink',async ({page})=>{
 const result=await probe(page,()=>{
   T='2026-11-25';S.entries=[];S.recur=[];S.rules=[];S.rucal={};
   S.incomes=[{id:'daily',name:'Work',amt:100,day:25,source:{freq:'daily',basis:'payment',kind:'other',net:true,amount:100,start:'2026-11-25',shift:false}}];
   const rows=incomeRows('2026-11'),a=rows[0],b=rows[1];
   S.entries.push({id:'p',iid:a.id,type:'i',date:'2026-11-25',amt:120,note:'Work'});
   healLinks();
   return {first:incomeFor(a,'2026-11'),second:incomeFor(b,'2026-11'),firstDone:doneFor('iid',a.id,'2026-11'),secondDone:doneFor('iid',b.id,'2026-11'),link:S.entries[0].iid,remaining:plannedItems(T,4).filter(r=>r.kind==='in').length};
 });
 expect(result).toEqual({first:120,second:100,firstDone:true,secondDone:false,link:'daily~2026-11-25',remaining:4});
});

test('guided form links existing salary and previews upcoming payments before saving',async ({page})=>{
 await probe(page,()=>{
   T='2026-11-25';S.entries=[];S.rules=[];S.recur=[];S.rucal={};
   S.incomes=[{id:'advance',name:'ТК · аванс',day:25,amt:57420},{id:'final',name:'ТК · окончаловка',day:10,amt:57420}];
   sh={id:'advance',k:'i',d:{name:'ТК · аванс',day:25,amt:57420}};incomeSourceSheet();
 });
 await expect(page.locator('#is_calcgroup')).toBeHidden();
 await expect(page.locator('#is_taxbox')).toBeHidden();
 await page.fill('#is_name','ТК');
 await page.selectOption('#is_kind','tk');
 await page.selectOption('#is_basis','month');
 await page.fill('#is_amount','132000');
 await page.selectOption('#is_taxmode','gross');
 await expect(page.locator('#is_taxbox')).toBeVisible();
 await page.selectOption('#is_freq','twice');
 await expect(page.locator('#is_calcgroup')).toBeVisible();
 await page.selectOption('#is_link','final');
 await expect(page.locator('#is_second')).toHaveValue('10');
 await expect(page.locator('#is_start')).toBeHidden();
 await expect(page.locator('#is_preview')).toContainText(/51\s*678/);
 await expect(page.locator('#is_preview')).toContainText(/63\s*162/);
 await page.locator('#fm button[type=submit]').click();
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('podkopka-v1')).incomes);
 expect(data.find(r=>r.id==='advance').source.secondId).toBe('final');
 expect(data.find(r=>r.id==='final').sourceParent).toBe('advance');
});
test('simple weekly payment form hides payroll settings and previews the schedule',async ({page})=>{
 await probe(page,()=>{
   T='2026-11-25';S.incomes=[];S.entries=[];S.recur=[];S.rules=[];
   sh={id:null,k:'i',d:{name:'',day:'',amt:''}};incomeSourceSheet();
 });
 await page.fill('#is_name','Подработка');
 await page.fill('#is_amount','1500');
 await page.selectOption('#is_freq','weekly');
 await expect(page.locator('#is_start')).toBeVisible();
 await expect(page.locator('#is_datesbox')).toBeHidden();
 await expect(page.locator('#is_calcgroup')).toBeHidden();
 await expect(page.locator('#is_preview')).toContainText(/1\s*500/);
 await page.selectOption('#is_freq','irregular');
 await expect(page.locator('#is_start')).toBeHidden();
 await expect(page.locator('#is_preview')).toContainText('Без фиксированных дат');
});

test('targeted income file preserves current transactions, accounts and savings rules', async ({page})=>{
 const res=await probe(page,()=>{
   T='2026-11-25';S.rucal={};S.incomes=[{id:'a',name:'Аванс',day:25,amt:57420},{id:'b',name:'Остаток',day:10,amt:57420},{id:'c',name:'Пенсия',day:15,amt:1000}];
   S.entries=[{id:'today',iid:'a',type:'i',date:T,amt:51678}];S.recur=[{id:'r',name:'Платеж',amt:50,day:1}];S.rules=[{id:'rule',name:'Копилка',amt:100,day:25,acc:'a1'}];S.planFrom='2026-10-01';
   const keep=()=>JSON.stringify([S.entries,S.recur,S.rules,S.accounts,S.planFrom]);const before=keep();
   const p={kind:'tk',freq:'twice',basis:'month',amount:132000,net:false,tax:13,start:'2026-11-01',dates:[25,10],days:[1,2,3,4,5],hours:8,method:'days',shift:true,share:50};
   const file={app:'schitalochka-income-update',v:1,sources:[{advanceId:'a',finalId:'b',advanceName:'Аванс',finalName:'Остаток',name:'Работа',source:p}]};
   const invalid={...file,sources:[...file.sources,{...file.sources[0],advanceId:'missing'}]};
   const orig=JSON.stringify(S.incomes);let rejected=false;try{prepareIncomeUpdate(invalid)}catch(e){rejected=true}
   const unchanged=orig===JSON.stringify(S.incomes);
   S.incomes=prepareIncomeUpdate(file);
   const rows=incomeRows('2026-12');
   return {rejected,unchanged,kept:before===keep(),repeat:JSON.stringify(prepareIncomeUpdate(file))===JSON.stringify(S.incomes),rows:rows.map(r=>[r.id,r.amt]),actual:incomeFor(incomeRows('2026-11').find(r=>r.id==='a'),'2026-11')};
 });
 expect(res).toEqual({rejected:true,unchanged:true,kept:true,repeat:true,rows:[['a',57420],['b',63162],['c',1000]],actual:51678});
});
