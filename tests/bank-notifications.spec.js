const {test,expect}=require('@playwright/test');
async function probe(page, scenario){
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.route(/\/index\.html(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),html=await response.text();
  const marker='})();\n/* Новая версия на сайте:';
  if(!html.includes(marker))throw Error('probe marker missing');
  await route.fulfill({response,body:html.replace(marker,'window.__bankProbe = '+scenario.toString()+';\n'+marker)});
 });
 await page.goto('/index.html');
 return page.evaluate(()=>window.__bankProbe());
}

test('bankPkgOk: known bank apps allowed',async({page})=>{
 const r=await probe(page,()=>({
  sber:bankPkgOk('ru.sberbankmobile'),
  sberBiz:bankPkgOk('ru.sberbank_sbbol'),
  tbank:bankPkgOk('com.idamob.tinkoff.android'),
  tinkoffInvest:bankPkgOk('ru.tinkoff.investing'),
  alfa:bankPkgOk('ru.alfabank.mobile.android'),
  vtb:bankPkgOk('ru.vtb24.mobilebanking.android'),
  otp:bankPkgOk('ru.otpbank.mobile'),
  gazprom:bankPkgOk('ru.gazprombank.android.mobilebank.app'),
  raiff:bankPkgOk('ru.raiffeisennews'),
  open:bankPkgOk('com.openbank'),
  yoomoney:bankPkgOk('ru.yoo.money'),
  yandex:bankPkgOk('com.yandex.bank'),
  faktura:bankPkgOk('ru.ftc.faktura.absolutbank'),
  regional:bankPkgOk('com.bifit.mobile.citizen.moskb')
 }));
 for(const [k,v] of Object.entries(r))expect(v,{message:k}).toBe(true);
});

test('bankPkgOk: non-bank apps rejected (AI, messengers, mail)',async({page})=>{
 const r=await probe(page,()=>({
  empty:bankPkgOk(''),
  missing:bankPkgOk(null),
  chatgpt:bankPkgOk('com.openai.chatgpt'),
  claude:bankPkgOk('com.anthropic.claude'),
  cursor:bankPkgOk('com.todesktop.230313mzl4w4u92'),
  telegram:bankPkgOk('org.telegram.messenger'),
  whatsapp:bankPkgOk('com.whatsapp'),
  gmail:bankPkgOk('com.google.android.gm'),
  mailru:bankPkgOk('ru.mail.mailapp'),
  vk:bankPkgOk('com.vkontakte.android'),
  discord:bankPkgOk('com.discord'),
  system:bankPkgOk('com.android.systemui'),
  chrome:bankPkgOk('com.android.chrome'),
  // текст «как у банка», но package не банк
  fakeBankName:bankPkgOk('com.example.mybanking')
 }));
 for(const [k,v] of Object.entries(r))expect(v,{message:k}).toBe(false);
});

test('AI-style notification text is not ingested without bank package',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.bankQ=[];
  const aiText='Зачисление 4 000 ₽ на карту. Вот ответ ИИ: перевод от клиента прошёл успешно.';
  const parsed=bankParse(aiText);
  const added=bankIngest([{pkg:'com.openai.chatgpt',title:'ChatGPT',text:aiText,t:Date.now()}]);
  const qAfter=S.bankQ.length;
  const bankAdded=bankIngest([{pkg:'ru.sberbankmobile',title:'СберБанк',text:'Зачисление 4 000 ₽ от ООО Рога. Баланс 12 000 ₽',t:Date.now()}]);
  return {parsedType:parsed&&parsed.type,parsedAmt:parsed&&parsed.amt,added,qAfter,bankAdded,qFinal:S.bankQ.length,lastPkg:S.bankQ[0]&&S.bankQ[0].pkg};
 });
 // текст сам по себе похож на доход — но без банковского package не попадает в очередь
 expect(r.parsedType).toBe('i');
 expect(r.parsedAmt).toBe(4000);
 expect(r.added).toBe(0);
 expect(r.qAfter).toBe(0);
 expect(r.bankAdded).toBe(1);
 expect(r.qFinal).toBe(1);
 expect(r.lastPkg).toBe('ru.sberbankmobile');
});

test('bankIngest keeps existing bank purchase/refund parsing',async({page})=>{
 const r=await probe(page,()=>{
  T='2026-11-25';S.demo=false;S.bankQ=[];
  bankIngest([
   {pkg:'ru.sberbankmobile',title:'СберБанк Онлайн',text:'Покупка 369 ₽ в ПЯТЁРОЧКА. Баланс 15 279 ₽',t:Date.parse('2026-11-25T12:00:00')},
   {pkg:'com.idamob.tinkoff.android',title:'Т-Банк',text:'Возврат 300 ₽ ОЗОН',t:Date.parse('2026-11-25T13:00:00')},
   {pkg:'org.telegram.messenger',title:'Telegram',text:'Покупка 999 ₽ в Магазин',t:Date.parse('2026-11-25T14:00:00')},
   {pkg:'ru.alfabank.mobile.android',title:'Альфа-Банк',text:'Ваш код для входа 1234',t:Date.parse('2026-11-25T15:00:00')}
  ]);
  return S.bankQ.map(x=>({amt:x.amt,type:x.type,refund:!!x.refund,pkg:x.pkg,note:x.note}));
 });
 expect(r).toHaveLength(2);
 expect(r[0]).toMatchObject({amt:369,type:'e',pkg:'ru.sberbankmobile',note:'ПЯТЁРОЧКА'});
 expect(r[1]).toMatchObject({amt:300,type:'i',refund:true,pkg:'com.idamob.tinkoff.android'});
});

test('bankParse unchanged for classic bank SMS-like texts',async({page})=>{
 await page.route(u=>!/^(localhost|127\.0\.0\.1)$/.test(u.hostname),r=>r.abort());
 await page.goto('/index.html');
 const r=await page.evaluate(()=>({
  b1:window.bankParse('Покупка 369 ₽ в ПЯТЁРОЧКА. Баланс 15 279 ₽'),
  b2:window.bankParse('Зачисление 57 420,00 ₽ от ООО Рога. Доступно 70 000 ₽'),
  b3:window.bankParse('Ваш код для входа 1234'),
  b4:window.bankParse('Возврат 300 ₽ ОЗОН')
 }));
 expect(r.b1).toMatchObject({amt:369,type:'e',note:'ПЯТЁРОЧКА'});
 expect(r.b2).toMatchObject({amt:57420,type:'i'});
 expect(r.b3).toBeNull();
 expect(r.b4).toMatchObject({amt:300,type:'i',refund:true});
});
