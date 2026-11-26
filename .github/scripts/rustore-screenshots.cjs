// Real mobile web UI (the Android app displays this same site in WebView).
// Synthetic demonstration data only; never read private exports.
const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const dir = path.resolve('rustore-screenshots');
fs.mkdirSync(dir, {recursive:true});
const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
async function main(){
  for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:8765/index.html')).ok)break;}catch{} await sleep(200);}
  browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH,args:['--no-sandbox']} : {});
  const context=await browser.newContext({viewport:{width:432,height:768},deviceScaleFactor:2.5,colorScheme:'dark',isMobile:true,hasTouch:true,locale:'ru-RU',timezoneId:'Europe/Moscow',reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());
  await page.clock.setFixedTime(new Date('2026-11-26T10:00:00+03:00'));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('#ob_bal').fill('40000');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('#ob_lim').fill('1500');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('[data-a=onbGo]').click();
  await page.evaluate(()=>{
    const d=JSON.parse(localStorage.getItem('podkopka-v1'));
    const iso=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
    const ago=n=>{let t=new Date();t.setDate(t.getDate()-n);return iso(t)};
    Object.assign(d,{demo:false,simple:false,irreg:false,unameAsked:1,cur:'RUB',planFrom:ago(0),payDays:[10,25],noSpend:[],rare:[],
      accounts:[{id:'a1',type:'main',name:'Основная карта',start:40000},{id:'a2',type:'save',name:'Отпуск',start:24000},{id:'a3',type:'save',name:'Подушка',start:35000}],
      incomes:[{id:'i1',name:'Аванс',day:10,amt:40000},{id:'i2',name:'Зарплата',day:25,amt:50000}],
      rules:[{id:'r1',name:'На отпуск',acc:'a2',amt:5000,day:10},{id:'r2',name:'Подушка',acc:'a3',amt:3000,day:25}],
      recur:[{id:'p1',name:'Интернет',amt:650,day:3,cat:'conn'},{id:'p2',name:'Подписка',amt:450,day:8,cat:'subs'}],
      fcPlans:[{id:'fp1',cat:'prod',amt:3000,wd:1,half:true}],
      entries:[]});
    const examples=[['prod','Продукты',780],['cafe','Кофе и обед',430],['trans','Транспорт',180],['home','Для дома',360],['cafe','Ужин',650],['prod','Продукты',920],['health','Аптека',410]];
    for(let i=0;i<14;i++){const [cat,note,amt]=examples[i%examples.length];d.entries.push({id:'e'+i,type:'e',amt,cat,note,date:ago(i+1),acc:'a1',cls:i%3===0?'mind':'need'});}
    d.entries.push({id:'gift',type:'e',cat:'gift',amt:2900,note:'Подарок',date:ago(3),acc:'a1',cls:'mind'},{id:'tech',type:'e',cat:'tech',amt:4800,note:'Наушники',date:ago(6),acc:'a1',cls:'mind'},{id:'today',type:'e',cat:'cafe',amt:280,note:'Кофе',date:ago(0),acc:'a1',cls:'mind'});
    d.pet=Object.assign({},d.pet,{kind:'fluff',theme:'fluff',bg:2,bgo:100,size:'m'});
    localStorage.setItem('sch-ydhide','1');
    localStorage.setItem('podkopka-v1',JSON.stringify(d));
  });
  await page.reload();
  const sheet=page.locator('#ov .sheet');
  async function shot(name){
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(x=>x.complete&&x.naturalWidth).map(x=>x.decode().catch(()=>{})));});
    // Let real transient app notices expire before taking store screenshots.
    await sleep(250);
    await page.locator('#toast').waitFor({state:'hidden',timeout:12000});
    await sleep(150);
    if(await page.locator('#toast').isVisible())throw Error('Transient notification visible: '+name);
    const file=path.join(dir,name+'.jpg');
    await page.screenshot({path:file,type:'jpeg',quality:94,animations:'disabled'});
    const size=fs.statSync(file).size;if(size>3000000)throw Error('Screenshot too large: '+name);
    console.log(name,size);
  }
  async function tab(v){await page.locator('#tabs [data-v="'+v+'"]').click();await page.evaluate(()=>window.scrollTo(0,0));}
  async function close(){await sheet.locator('[data-a=close]').first().click();await sheet.waitFor({state:'hidden'});}
  await page.locator('.hero').waitFor();
  const theme=await page.locator('html').getAttribute('data-pet');
  if(theme!=='fluff')throw Error('Expected violet fluff theme, got '+theme);
  const balance=await page.locator('.hero .big').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getClientRects().length});
  if(balance>1)throw Error('Wallet balance wraps: '+balance);
  await shot('01-wallet');
  await page.locator('[data-a=fcOpen]').click();
  const cards=sheet.locator('.fc-card');
  await cards.nth(1).waitFor();
  await shot('02-prediction-closed');
  await cards.nth(0).click();await cards.nth(1).click();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.fc-art')].map(x=>x.decode()));});
  await shot('03-prediction-revealed');await close();
  await tab('hist');await shot('04-history');
  await tab('an');await shot('05-analysis');
  await tab('plan');await shot('06-payments');
  await tab('home');await page.locator('.tabs .plus').click();
  await sheet.waitFor();await shot('07-add-expense');
  await page.reload();await tab('home');await page.locator('[data-a=petPick]').first().click();
  await sheet.waitFor();await shot('08-pets');
  await context.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.kill()});
