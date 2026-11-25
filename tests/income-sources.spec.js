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
 await page.locator('#is_advanced summary').click();
 await page.selectOption('#is_kind','tk');
 await page.selectOption('#is_basis','month');
 await page.fill('#is_amount','132000');
 await page.selectOption('#is_taxmode','gross');
 await expect(page.locator('#is_taxbox')).toBeVisible();
 await page.selectOption('#is_freq','twice');
 await expect(page.locator('#is_calcgroup')).toBeVisible();
 await page.selectOption('#is_link','final');
 await expect(page.locator('#is_second')).toHaveValue('10');
 await page.locator('#is_advanced summary').click();
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
 expect(res).toEqual({rejected:true,unchanged:true,kept:true,repeat:true,rows:[['a',57420],['b',63162],['b~2027-01-10',57420],['c',1000]],actual:51678});
});

test('JSON plan picker survives screen rerender and imports salary via real file change', async ({page})=>{
 await probe(page,()=>{
   S.incomes=[{id:'a',name:'Аванс',day:25,amt:57420},{id:'b',name:'Остаток',day:10,amt:57420}];
   S.demo=false;S.simple=false;S.setup=1;S.onb=1;S.entries=[];S.rules=[];S.recur=[];closeSheet();save();tab='plan';ptab='p';planMoreOpen=true;uiFold('plfile',false);render();
   window.__planPicker=document.getElementById('pl_file');
   window.__rerenderPlan=()=>render();
 });
 await expect(page.locator('#ov')).toBeHidden();
 await expect(page.locator('button[data-a="choosePlanFile"]')).toBeVisible();
 const [picked]=await Promise.all([page.waitForEvent('filechooser',{timeout:8000}),page.locator('button[data-a="choosePlanFile"]').click()]);
 await page.evaluate(()=>window.__rerenderPlan());
 expect(await page.evaluate(()=>window.__planPicker===document.getElementById('pl_file'))).toBe(true);
 const p={kind:'tk',freq:'twice',basis:'month',amount:132000,net:false,tax:13,start:'2026-11-01',dates:[25,10],days:[1,2,3,4,5],hours:8,method:'days',shift:true,share:50};
 const file={app:'schitalochka-income-update',v:1,sources:[{advanceId:'a',finalId:'b',advanceName:'Аванс',finalName:'Остаток',name:'Работа',source:p}]};
 await picked.setFiles({name:'income.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await expect(page.locator('.dlg .msg')).toContainText('Обновить только 1');
 await page.locator('.dlg .yes').click();
 await expect(page.locator('#toast')).toContainText('Настройки доходов обновлены');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('podkopka-v1')).incomes);
 expect(data.find(r=>r.id==='a').source.secondId).toBe('b');
 await page.locator('#pl_file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('broken')});
 await expect(page.locator('#pl_msg')).toContainText('Не удалось загрузить файл');
});

test('paste JSON fallback validates and applies the same salary update',async ({page})=>{
 await probe(page,()=>{
  S.incomes=[{id:'a',name:'Аванс',day:25,amt:57420},{id:'b',name:'Остаток',day:10,amt:57420}];
  S.demo=false;S.simple=false;S.setup=1;S.onb=1;S.entries=[];S.rules=[];S.recur=[];closeSheet();save();tab='plan';ptab='p';planMoreOpen=true;uiFold('plfile',false);render();
 });
 await expect(page.locator('#ov')).toBeHidden();
 await page.getByText('Или вставить JSON текстом',{exact:true}).click();
 const p={kind:'tk',freq:'twice',basis:'month',amount:132000,net:false,tax:13,start:'2026-11-01',dates:[25,10],days:[1,2,3,4,5],hours:8,method:'days',shift:true,share:50};
 const file={app:'schitalochka-income-update',v:1,sources:[{advanceId:'a',finalId:'b',advanceName:'Аванс',finalName:'Остаток',name:'Работа',source:p}]};
 await page.fill('#pl_text',JSON.stringify(file));
 await page.locator('[data-a="pastePlanJson"]').click();
 await expect(page.locator('.dlg .msg')).toContainText('Обновить только 1');
 await page.locator('.dlg .yes').click();
 await expect(page.locator('#toast')).toContainText('Настройки доходов обновлены');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('podkopka-v1')).incomes);
 expect(data.find(r=>r.id==='a').source.secondId).toBe('b');
});

test('income calendar takes actual source dates in both modes, not obsolete manual days',async ({page})=>{
 const res=await probe(page,()=>{
  T='2026-11-25';S.rucal={};S.entries=[];S.rules=[];S.recur=[];S.payDays=[10,25];S.irreg=false;
  const p={kind:'other',basis:'payment',amount:1000,net:true,tax:0,start:'2026-11-01',freq:'twice',dates:[25,10],shift:true};
  S.incomes=[{id:'a',name:'Работа',source:p},{id:'b',name:'Банк',source:{...p,dates:[20,5]}}];
  S.simple=false;const full=nextPayDates(5),fullEnd=fcEnd();
  S.simple=true;const simple=nextPayDates(5),simpleEnd=fcEnd(),praise=isPayDay('2026-12-04'),nov=incomeCalendarMonth('2026-11');
  S.incomes=[{id:'w',name:'Weekly',source:{...p,freq:'weekly',start:'2026-11-29',shift:false}}];
  const weekly=nextPayDates(3);
  S.incomes=[{id:'c',name:'Irregular',source:{...p,freq:'irregular'}}];
  const irregular=nextPayDates(3);
  S.incomes=[];S.payDays=[5,25];const manual=nextPayDates(3),manualEnd=fcEnd();
  return {full,simple,fullEnd,simpleEnd,praise,nov,weekly,irregular,manual,manualEnd};
 });
 expect(res).toEqual({full:['2026-11-25','2026-12-04','2026-12-10','2026-12-18','2026-12-25'],simple:['2026-11-25','2026-12-04','2026-12-10','2026-12-18','2026-12-25'],fullEnd:'2026-12-04',simpleEnd:'2026-12-04',praise:true,nov:['2026-11-05','2026-11-10','2026-11-20','2026-11-25'],weekly:['2026-11-29','2026-12-06','2026-12-13'],irregular:[],manual:['2026-11-25','2026-12-04','2026-12-25'],manualEnd:'2026-12-04'});
});
test('simple mode can configure income sources without enabling payments tab',async ({page})=>{
 await probe(page,()=>{
   T='2026-11-25';S.demo=false;S.setup=1;S.onb=1;S.simple=true;S.incomes=[];S.entries=[];S.recur=[];S.rules=[];S.payDays=[10,25];closeSheet();save();tab='home';render();
 });
 await page.locator('#app [data-a="settings"]').click();
 await page.locator('#ov summary',{hasText:'График поступлений'}).click();
 await expect(page.locator('#pd_in')).toHaveValue('10, 25');
 await page.locator('[data-a="editIncomeCalendar"]').click();
 await page.locator('#ov [data-a="newPlan"][data-k="i"]').click();
 await page.fill('#is_name','Работа');
 await page.fill('#is_amount','1000');
 await page.selectOption('#is_freq','weekly');
 await page.locator('#fm button[type=submit]').click();
 await expect(page.locator('#ov h3')).toContainText('Источники дохода');
 await expect(page.locator('#ov')).toContainText('Работа');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('podkopka-v1')));
 expect(data.simple).toBe(true);expect(data.incomes[0].source.freq).toBe('weekly');
 await page.locator('#ov [data-a="settings"]').click();
 const schedule=page.locator('#ov summary',{hasText:'График поступлений'});
 if(await schedule.getAttribute('aria-expanded')!=='true' && !(await page.locator('#ov [data-a="editIncomeCalendar"]').isVisible()))await schedule.click();
 await expect(page.locator('#ov [data-a="editIncomeCalendar"]')).toBeVisible();
 await expect(page.locator('#pd_in')).toHaveCount(0);
 await expect(page.locator('#tabs [data-v="plan"]')).toHaveCount(0);
});
test('history removes automatic rule label, not rule or transaction data',async ({page})=>{
 const res=await probe(page,()=>{
  S.accounts.push({id:'save-test',name:'ИИ',type:'save',start:0});S.rules=[{id:'rule-test',name:'Claude',acc:'save-test',day:25,amt:1250}];
  const x={id:'transfer-test',type:'t',from:defAcc(),to:'save-test',amt:1250,note:'Claude · по плану',rule:'rule-test',date:T};
  S.entries=[x];const before=JSON.stringify([S.entries,S.rules]);const html=entryRow(x);
  return {html,manual:transferHistoryNote({note:'на отпуск'}),duplicate:transferHistoryNote({note:'Платежи · по плану'}),unchanged:before===JSON.stringify([S.entries,S.rules])};
 });
 expect(res.html).toContain('ИИ · по плану');expect(res.html).not.toContain('Claude');expect(res.manual).toBe('на отпуск');expect(res.duplicate).toBe('по плану');expect(res.unchanged).toBe(true);
});

test('monthly completed payments are collapsed, and extra planning prioritizes savings',async ({page})=>{
 await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.setup=1;S.onb=1;S.simple=false;S.rucal={};
  S.incomes=[{id:'salary',name:'Работа',day:25,amt:1000}];S.recur=[];S.rules=[];S.entries=[{id:'income',type:'i',iid:'salary',date:T,amt:1000,cat:'salary',acc:defAcc()}];closeSheet();save();tab='plan';ptab='m';uiFold('markedMonth',true);render();
 });
 const marked=page.locator('[data-a=fold][data-v=markedMonth]');
 await expect(marked).toHaveAttribute('aria-expanded','false');
 // The same income can also appear in the previous-month reminders.
 const markedCard=page.locator('.card').filter({has:marked});
 const completedIncome=markedCard.locator('[data-a=editPlan][data-k=i][data-id=salary]');
 await expect(completedIncome).toHaveCount(0);
 await marked.click();
 await expect(marked).toHaveAttribute('aria-expanded','true');
 await expect(completedIncome).toBeVisible();
 await expect(completedIncome).toContainText('Работа');
 await expect(completedIncome).toContainText('пришло');
 await marked.click();
 await expect(marked).toHaveAttribute('aria-expanded','false');
 await expect(completedIncome).toHaveCount(0);
 await page.locator('[data-a=ptab][data-v=p]').click();
 await page.locator('[data-a=planMore]').click();
 const heads=await page.locator('.foldhead .h2like').allTextContents();
 expect(heads.indexOf('Автопополнение копилок')).toBeGreaterThanOrEqual(0);
 expect(heads.indexOf('Автопополнение копилок')).toBeLessThan(heads.indexOf('План по категориям'));
 expect(heads.indexOf('План по категориям')).toBeLessThan(heads.indexOf('Редкие и крупные траты'));
 await expect(page.getByText('План на 3 месяца',{exact:true})).toHaveCount(0);
});
test('new income form shows basic questions and keeps advanced options available',async ({page})=>{
 await probe(page,()=>{sh={id:null,k:'i',d:{name:'',day:'',amt:''}};incomeSourceSheet()});
 await expect(page.locator('#is_name')).toBeVisible();
 await expect(page.locator('#is_amount')).toBeVisible();
 await expect(page.locator('#is_freq')).toBeVisible();
 await expect(page.locator('#is_kind')).toBeHidden();
 await page.locator('#is_advanced summary').click();
 await expect(page.locator('#is_kind')).toBeVisible();
 await page.selectOption('#is_taxmode','gross');
 await expect(page.locator('label[for=is_amount]')).toContainText('До налогов');
 await page.selectOption('#is_freq','weekly');
 await expect(page.locator('#is_start')).toBeVisible();
});

for(const simpleMode of [true,false]) test('compact home details fit small screens and preserve state, simple='+simpleMode,async ({page})=>{
 await page.setViewportSize({width:320,height:640});
 await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.setup=1;S.onb=1;S.simple=true;S.irreg=false;S.incomes=[];S.rules=[];S.recur=[];S.entries=[];S.planCalc=null;S.dayLimit=500;
  S.accounts=[{id:'a1',name:'Основная карта',type:'main',start:10000},{id:'save-test',name:'Отпуск',type:'save',start:3000}];closeSheet();save();tab='home';render();
 });
 if(!simpleMode)await page.locator('[data-a=setMode][data-v=full]').click();
 const hero=page.locator('.hero').first(),details=hero.locator('#tip_h_can'),link=hero.locator('.home-detail-link');
 await expect(hero.locator('.stats > .stat')).toHaveCount(3);
 await expect(details).toBeHidden();
 // Measure the collapsed summary against the previous spacing, at the same viewport and data.
 const compactHeight=await hero.evaluate(el=>el.getBoundingClientRect().height);
 const oldSpacing=await page.addStyleTag({content:`
 .hero{padding:14px 12px;gap:6px}
 .hero .stats{margin-top:6px}
 .hero .stat{padding-block:6px}
 .hero .stats>.stat>.lbl,.hero .stats>.stat>.can-head{height:26px;min-height:26px}
 .hero .stats>.stat>b{margin-top:3px;line-height:22px;min-height:22px}
 .hero .stats>.stat>.pbar+.fine{margin-top:6px}
 .hero .home-detail-link{padding:5px 0;min-height:0}
 .hero .fcb{margin-top:12px;height:40px;min-height:0;padding:0}
 `});
 const previousHeight=await hero.evaluate(el=>el.getBoundingClientRect().height);
 await oldSpacing.evaluate(el=>el.remove());
 expect(previousHeight-compactHeight).toBeGreaterThanOrEqual(24);
 await expect(hero.locator('[data-a=fcOpen]')).toBeVisible();
 await expect(hero.locator('.stats > .stat b')).toHaveCount(3);
 const before=await page.evaluate(()=>localStorage.getItem('podkopka-v1'));
 await expect(link).toHaveText('Подробнее');
 await link.click();await expect(details).toBeVisible();
 const labels=await details.locator('.row .grow').allTextContents();
 expect(labels).toEqual(['План','Потрачено сегодня','Осталось','На завтра','В среднем за день','Потрачено за месяц']);
 await expect(details.locator('[data-a=planOpen]')).toBeVisible();
 await expect(hero.locator('.stats .fine, .stats .pbar, .stats [data-a]')).toHaveCount(0);
 await expect(details.locator('.budget-period')).toHaveCount(simpleMode?0:1);
 expect(await details.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(230);
 await link.click();await expect(details).toBeHidden();
 await hero.locator('[data-a=tip][data-v=h_bal]').click();
 await expect(hero.locator('#tip_h_bal')).toContainText('Отпуск');await expect(hero.locator('#tip_h_bal')).toContainText('не входит');
 expect(await page.evaluate(()=>localStorage.getItem('podkopka-v1'))).toBe(before);
 expect(await hero.locator('.stats').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});

test('compact mode switch and help use the same names on small screens',async ({page})=>{
 await page.setViewportSize({width:320,height:640});
 await probe(page,()=>{S.demo=false;S.setup=1;S.onb=1;S.simple=true;closeSheet();save();tab='home';render()});
 const modes=page.locator('.mode-switch');
 await expect(modes.locator('[data-v=simple]')).toHaveText('Учёт трат');
 await expect(modes.locator('[data-v=full]')).toHaveText('Планирование');
 expect(await modes.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.locator('[data-a=tip][data-v=mode]').click();
 await expect(page.locator('#tip_mode')).toBeVisible();
 await expect(page.locator('#tip_mode')).toContainText('Планирование');
 await page.locator('.top [data-a=help]').click();
 const help=page.locator('#ov');
 const summary=help.locator('summary',{hasText:'Режимы приложения'});
 const section=summary.locator('..');
 await expect(summary).toBeVisible();
 await summary.click();
 await expect(section).toHaveJSProperty('open',true);
 await expect(section.locator('.hb')).toBeVisible();
 await expect(section.locator('.hb')).toContainText('Автопополнение копилок',{ignoreCase:true});
 await expect(help).not.toContainText('Простой и полный режим');
});

test('compact budget details retain nonzero payments, waiting income and shortage warnings',async ({page})=>{
 const result=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;
  const before=JSON.stringify(S);
  const regular=homeBudgetDetails({val:500,days:9,nextIn:'2026-12-04',due:1200,waitingToday:false},257,243);
  const waiting=homeBudgetDetails({val:500,days:1,nextIn:T,due:0,waitingToday:true},257,243);
  const shortage=homeBudgetDetails({val:-100,days:3,nextIn:'2026-11-28',due:1200,waitingToday:false},257,0);
  return {regular,waiting,shortage,unchanged:JSON.stringify(S)===before};
 });
 expect(result.regular).toContain('Будущие платежи');
 expect(result.regular).toContain('До 4 декабря · 9 дней');
 expect(result.waiting).toContain('Ждём доход');
 expect(result.waiting).not.toContain('Будущие платежи');
 expect(result.shortage).toContain('Может не хватить');
 expect(result.unchanged).toBe(true);
});

test('minimal wallet tiles keep separate spending and plan editing in details',async ({page})=>{
 const result=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.simple=false;
  const before=JSON.stringify(S);
  const html=homeBudgetDetails({val:500,days:9,nextIn:'2026-12-04',due:0,waitingToday:false},257,243,{avg:1428,total:35711,extra:62500,irrNote:'Хватит при этом темпе'});
  return {html,unchanged:JSON.stringify(S)===before};
 });
 expect(result.html).toContain('В среднем за день');
 expect(result.html).toContain('Потрачено за месяц');
 expect(result.html).toContain('Отдельные траты');
 expect(result.html).toMatch(/62\s500/);
 expect(result.html).toContain('data-a="planOpen"');
 expect(result.html).toContain('Хватит при этом темпе');
 expect(result.unchanged).toBe(true);
});
